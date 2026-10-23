import { AgendaStatus, InteractionType } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaSession } from '@/domains/agendas/types';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import { createInteraction, findLastInteraction } from '@/domains/pedagogy/services/interaction-repository';
import type { InteractionInput, LastInteraction } from '@/domains/pedagogy/services/interaction-repository';
import { createInferenceLog } from '@/domains/telemetry/services/inference-log-repository';
import type { InferenceLogInput } from '@/domains/telemetry/services/inference-log-repository';
import { aiProvider, type AICompletionOptions, type AIProviderType, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import { TUTOR_UNAVAILABLE_MESSAGE } from '@/lib/constants/tutor';
import { isSyntheticChapter } from '@/domains/rag/constants';
import { startTutorPipeline } from '../tutor-pipeline';
import { isSocraticChallengeText, judgeAnswer } from '../answer-judge';

export const MAX_HISTORY_MESSAGES = 10;
export const MAX_HISTORY_CHARS = 4000;

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

export type ChatInput = {
  agendaId: string;
  message: string;
  history?: ChatHistoryMessage[];
  videoTimestampSeconds?: number;
  /** Quando false, não grava StudentInteraction (ex.: intervenção automática da tutora). Padrão: true. */
  persistInteraction?: boolean;
};

export type ChatResult = {
  reply: string;
  citations: string[];
  isSocraticChallenge: boolean;
  blockedByExamGuardrail: boolean;
  latencyMs: number;
  /** true = o provedor não respondeu; `reply` é o aviso de indisponibilidade e nada foi gravado como interação. */
  fallback: boolean;
  interactionId: string | null;
  /** Veredito do juiz sobre a resposta do aluno ao desafio anterior; null quando não houve desafio ou juiz. */
  wasCorrect: boolean | null;
};

export type ChatDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  createInteraction(data: InteractionInput): Promise<{ id: string }>;
  createInferenceLog(data: InferenceLogInput): Promise<unknown>;
  /** Última interação persistida do aluno na agenda; o desafio julgado vem daqui, nunca do history do cliente. */
  findLastInteraction(agendaId: string, studentId: string): Promise<LastInteraction | null>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
  /** Provedor ativo (o juiz não roda no mock). */
  provider: AIProviderType;
  search?(query: RAGSearchQuery): Promise<RAGSearchResult>;
  now?: () => Date;
};

const defaultDeps: ChatDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  createInteraction,
  createInferenceLog,
  findLastInteraction,
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
  get provider() {
    return aiProvider.getProviderConfig().provider;
  },
};

export function truncateHistory(history: ChatHistoryMessage[] = []): ChatHistoryMessage[] {
  const kept = history.slice(-MAX_HISTORY_MESSAGES);
  let total = kept.reduce((n, m) => n + m.content.length, 0);
  while (kept.length > 0 && total > MAX_HISTORY_CHARS) {
    total -= kept.shift()!.content.length;
  }
  return kept;
}

export type ChatSession = {
  run(onToken?: (token: string) => void): Promise<ChatResult>;
};

/**
 * Valida agenda, escopo e janela de horário. Lança DomainError antes de qualquer streaming.
 */
export async function startChat(
  user: AgendaActor,
  input: ChatInput,
  deps: ChatDeps = defaultDeps
): Promise<ChatSession> {
  const agenda = await deps.getAgenda(input.agendaId, user);
  if (agenda.status === AgendaStatus.CANCELLED) {
    throw new DomainError(422, 'Esta sessão foi cancelada pela coordenação pedagógica.');
  }
  const window = validateAgendaTimeWindow(agenda as unknown as AgendaSession,(deps.now ?? (() => new Date()))());
  if (!window.isWithinWindow) throw new DomainError(422, window.message);

  const history = truncateHistory(input.history);
  return { run: (onToken) => runChat(user, agenda, input, history, deps, onToken) };
}

export async function chatWithTutor(
  user: AgendaActor,
  input: ChatInput,
  deps: ChatDeps = defaultDeps
): Promise<ChatResult> {
  return (await startChat(user, input, deps)).run();
}

async function logInference(
  deps: ChatDeps,
  telemetry: StreamChunk['telemetry'],
  fallback: boolean,
  agendaType: AgendaDTO['type']
) {
  if (!telemetry) return;
  // Interação já salva: falha no log de inferência não pode derrubar o chat.
  try {
    await deps.createInferenceLog({
      provider: telemetry.provider,
      model: telemetry.model,
      ttftMs: Math.round(telemetry.ttftMs),
      totalLatencyMs: Math.round(telemetry.totalLatencyMs),
      tokensPerSecond: telemetry.tokensPerSecond,
      promptTokens: telemetry.promptTokens,
      completionTokens: telemetry.completionTokens,
      externalTrafficBytes: Math.round(telemetry.externalTrafficBytes),
      fallback,
      agendaType,
    });
  } catch (err) {
    console.warn('[chat] falha ao gravar InferenceLog', err);
  }
}

async function runChat(
  user: AgendaActor,
  agenda: AgendaDTO,
  input: ChatInput,
  history: ChatHistoryMessage[],
  deps: ChatDeps,
  onToken?: (token: string) => void
): Promise<ChatResult> {
  const startedAt = Date.now();
  const base = {
    agendaId: agenda.id,
    studentId: user.id,
    agendaType: agenda.type,
    questionText: input.message,
    timestampInVideo:
      input.videoTimestampSeconds === undefined ? null : Math.round(input.videoTimestampSeconds),
  };

  // Lida antes de gravar o turno atual: é a interação imediatamente anterior a esta resposta.
  const previous = await deps.findLastInteraction(agenda.id, user.id);

  const start = await startTutorPipeline(
    { message: input.message, agendaType: agenda.type, history },
    { search: deps.search, streamChat: deps.streamChat }
  );

  if (start.kind === 'blocked') {
    onToken?.(start.refusalMessage);
    const latencyMs = Date.now() - startedAt;
    const interaction = input.persistInteraction === false ? null : await deps.createInteraction({
      ...base,
      type: InteractionType.QUESTION,
      responseText: start.refusalMessage,
      isSocraticChallenge: false,
      guardrailBlocked: true,
      latencyMs,
    });
    return {
      reply: start.refusalMessage,
      citations: [],
      isSocraticChallenge: false,
      blockedByExamGuardrail: true,
      latencyMs,
      fallback: false,
      interactionId: interaction?.id ?? null,
      wasCorrect: null,
    };
  }

  let reply = '';
  let fallback = false;
  let telemetry: StreamChunk['telemetry'];
  for await (const chunk of start.stream) {
    if (chunk.fallback) fallback = true;
    // Tokens do stream determinístico nunca chegam ao aluno como se fossem da tutora.
    if (chunk.token && !chunk.fallback) {
      reply += chunk.token;
      onToken?.(chunk.token);
    }
    if (chunk.telemetry) telemetry = chunk.telemetry;
  }
  reply = reply.trim();

  if (fallback) {
    await logInference(deps, telemetry, true, agenda.type);
    return {
      reply: TUTOR_UNAVAILABLE_MESSAGE,
      citations: [],
      isSocraticChallenge: false,
      blockedByExamGuardrail: false,
      latencyMs: Date.now() - startedAt,
      fallback: true,
      interactionId: null,
      wasCorrect: null,
    };
  }

  const isSocraticChallenge = isSocraticChallengeText(reply);
  const wasCorrect = previous?.isSocraticChallenge
    ? await judgeAnswer(
        { challenge: previous.responseText, answer: input.message, agendaType: agenda.type },
        { streamChat: deps.streamChat, provider: deps.provider }
      )
    : null;
  const topChunk = start.topChunk;
  const latencyMs = Date.now() - startedAt;
  const interaction = input.persistInteraction === false ? null : await deps.createInteraction({
    ...base,
    type: isSocraticChallenge ? InteractionType.SOCRATIC_CHALLENGE : InteractionType.QUESTION,
    responseText: reply,
    isSocraticChallenge,
    guardrailBlocked: false,
    ragSourceBook: topChunk?.bookTitle ?? null,
    // Trechos sintéticos (DOCX/TXT/MD) não têm página real: nada de "pág. N" nos relatórios.
    ragSourcePage: topChunk && !isSyntheticChapter(topChunk.chapter) ? topChunk.pageNumber : null,
    wasCorrect,
    latencyMs,
  });
  await logInference(deps, telemetry, fallback, agenda.type);

  return {
    reply,
    citations: start.citation ? [start.citation] : [],
    isSocraticChallenge,
    blockedByExamGuardrail: false,
    latencyMs,
    fallback,
    interactionId: interaction?.id ?? null,
    wasCorrect,
  };
}
