import { AgendaStatus, AgendaType, InteractionType } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaSession } from '@/domains/agendas/types';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import { getAgendaForUser, type AgendaActor, type AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import { createInteraction } from '@/domains/pedagogy/services/interaction-repository';
import type { InteractionInput } from '@/domains/pedagogy/services/interaction-repository';
import { createInferenceLog } from '@/domains/telemetry/services/inference-log-repository';
import type { InferenceLogInput } from '@/domains/telemetry/services/inference-log-repository';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import { checkExamGuardrail } from '../prompts/exam-guardrails';
import { getSystemPromptForAgenda } from '../agent-orchestrator';

export const MAX_HISTORY_MESSAGES = 10;
export const MAX_HISTORY_CHARS = 4000;

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

export type ChatInput = {
  agendaId: string;
  message: string;
  history?: ChatHistoryMessage[];
  videoTimestampSeconds?: number;
};

export type ChatResult = {
  reply: string;
  citations: string[];
  isSocraticChallenge: boolean;
  blockedByExamGuardrail: boolean;
  latencyMs: number;
  fallback: boolean;
  interactionId: string;
};

export type ChatDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  createInteraction(data: InteractionInput): Promise<{ id: string }>;
  createInferenceLog(data: InferenceLogInput): Promise<unknown>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
  now?: () => Date;
};

const defaultDeps: ChatDeps = {
  getAgenda: (id, user) => getAgendaForUser(id, user),
  createInteraction,
  createInferenceLog,
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
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

  if (agenda.type === AgendaType.EXAM) {
    const guardrail = checkExamGuardrail(input.message);
    if (guardrail.isViolation) {
      const reply = guardrail.refusalMessage ?? '';
      onToken?.(reply);
      const latencyMs = Date.now() - startedAt;
      const interaction = await deps.createInteraction({
        ...base,
        type: InteractionType.QUESTION,
        responseText: reply,
        isSocraticChallenge: false,
        guardrailBlocked: true,
        latencyMs,
      });
      return {
        reply,
        citations: [],
        isSocraticChallenge: false,
        blockedByExamGuardrail: true,
        latencyMs,
        fallback: false,
        interactionId: interaction.id,
      };
    }
  }

  const rag = await executeHybridSearch({ query: input.message, topK: 2 });
  const ragContext = rag.chunks
    .map((c) => `[FONTE: ${c.bookTitle} - ${c.chapter}, pág. ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');
  const systemPrompt = `${getSystemPromptForAgenda(agenda.type)}\n\nMATERIAL DIDÁTICO RELEVANTE (RAG HÍBRIDO):\n${ragContext}`;

  let reply = '';
  let fallback = false;
  let telemetry: StreamChunk['telemetry'];
  const stream = deps.streamChat(
    [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: input.message }],
    { citation: rag.primaryCitation }
  );
  for await (const chunk of stream) {
    if (chunk.token) {
      reply += chunk.token;
      onToken?.(chunk.token);
    }
    if (chunk.fallback) fallback = true;
    if (chunk.telemetry) telemetry = chunk.telemetry;
  }
  reply = reply.trim();

  const isSocraticChallenge = reply.endsWith('?');
  const topChunk = rag.chunks[0];
  const latencyMs = Date.now() - startedAt;
  const interaction = await deps.createInteraction({
    ...base,
    type: isSocraticChallenge ? InteractionType.SOCRATIC_CHALLENGE : InteractionType.QUESTION,
    responseText: reply,
    isSocraticChallenge,
    guardrailBlocked: false,
    ragSourceBook: topChunk?.bookTitle ?? null,
    ragSourcePage: topChunk?.pageNumber ?? null,
    latencyMs,
  });
  if (telemetry) {
    await deps.createInferenceLog({
      provider: telemetry.provider,
      model: telemetry.model,
      ttftMs: Math.round(telemetry.ttftMs),
      totalLatencyMs: Math.round(telemetry.totalLatencyMs),
      tokensPerSecond: telemetry.tokensPerSecond,
      promptTokens: telemetry.promptTokens,
      completionTokens: telemetry.completionTokens,
      externalTrafficBytes: Math.round(telemetry.externalTrafficBytes),
      agendaType: agenda.type,
    });
  }

  return {
    reply,
    citations: rag.primaryCitation ? [rag.primaryCitation] : [],
    isSocraticChallenge,
    blockedByExamGuardrail: false,
    latencyMs,
    fallback,
    interactionId: interaction.id,
  };
}
