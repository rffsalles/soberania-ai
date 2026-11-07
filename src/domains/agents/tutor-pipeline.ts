import { formatCitation, executeHybridSearch } from '@/domains/rag/hybrid-search';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import type { AgendaType } from '@/domains/agendas/types';
import { TUTOR_MAX_TOKENS } from '@/lib/constants/tutor';
import {
  CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS_SYSTEM_PROMPT,
} from './prompts/socratic-prompts';
import { EXAM_PROCTOR_SYSTEM_PROMPT, checkExamGuardrail } from './prompts/exam-guardrails';
import { buildNoMaterialReply, shouldRefuseWithoutMaterial } from './no-material';

// Módulo sem acesso a banco: pode ser importado por componentes de cliente.

export type PipelineHistoryMessage = { role: 'user' | 'assistant'; content: string };

export type TutorScope = {
  allowedChapterIds?: string[];
  allowedMaterialIds?: string[];
  chapterLabels?: string[];
};

export type TutorPipelineRequest = {
  message: string;
  agendaType: AgendaType;
  history?: PipelineHistoryMessage[];
  scope?: TutorScope;
};

export type TutorPipelineDeps = {
  search?(query: RAGSearchQuery): Promise<RAGSearchResult>;
  streamChat?(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
};

export type TutorPipelineStart =
  | { kind: 'blocked'; refusalMessage: string }
  /** Nada recuperado em modo preso ao material: recusa determinística, sem chamar o modelo. */
  | { kind: 'no_material'; reply: string }
  | {
      kind: 'stream';
      stream: AsyncGenerator<StreamChunk, void, unknown>;
      citation?: string;
      topChunk?: DidacticChunk;
      /** Trechos entregues ao modelo: as únicas fontes que a resposta pode citar. */
      chunks: DidacticChunk[];
    };

/** Seção de material quando a busca não trouxe nada: explícita para o modelo não citar nem inventar fonte. */
export const NO_CHUNKS_CONTEXT = '(nenhum trecho do material foi encontrado para esta mensagem; não há fonte para citar)';

export function getSystemPromptForAgenda(agendaType: AgendaType): string {
  switch (agendaType) {
    case 'CLASSROOM':
      return CLASSROOM_SOCRATIC_SYSTEM_PROMPT;
    case 'STUDY_GROUP':
      return STUDY_GROUP_SYSTEM_PROMPT;
    case 'DRAFT_REVIEW':
      return DRAFT_MENTOR_SYSTEM_PROMPT;
    case 'OFFICE_HOURS':
      return OFFICE_HOURS_SYSTEM_PROMPT;
    case 'EXAM':
      return EXAM_PROCTOR_SYSTEM_PROMPT;
    default:
      return CLASSROOM_SOCRATIC_SYSTEM_PROMPT;
  }
}

/**
 * Pipeline único: guardrail (EXAM) -> RAG híbrido -> (sem trecho em sala/plantão: recusa) -> prompt enriquecido -> stream do provider.
 * Em violação do guardrail (mensagem atual ou turno do aluno no history), nem RAG nem provider são acionados.
 */
export async function startTutorPipeline(
  request: TutorPipelineRequest,
  deps: TutorPipelineDeps = {}
): Promise<TutorPipelineStart> {
  const { message, agendaType, history = [], scope } = request;

  if (agendaType === 'EXAM') {
    // O history vem do cliente: todo turno do aluno passa pelo guardrail, não só a mensagem atual.
    const userTurns = [message, ...history.filter((h) => h.role === 'user').map((h) => h.content)];
    const violation = userTurns.map(checkExamGuardrail).find((g) => g.isViolation);
    if (violation) {
      return { kind: 'blocked', refusalMessage: violation.refusalMessage ?? '' };
    }
  }

  const rag = await (deps.search ?? executeHybridSearch)({
    query: message,
    topK: 2,
    ...(scope?.allowedChapterIds ? { allowedChapterIds: scope.allowedChapterIds } : {}),
    ...(scope?.allowedMaterialIds ? { allowedMaterialIds: scope.allowedMaterialIds } : {}),
  });
  if (shouldRefuseWithoutMaterial({ agendaType, chunkCount: rag.chunks.length, historyLength: history.length, message })) {
    return { kind: 'no_material', reply: buildNoMaterialReply(agendaType, scope) };
  }

  const ragContext =
    rag.chunks.length > 0
      ? rag.chunks.map((c) => `[FONTE: ${formatCitation(c)}]\n${c.content}`).join('\n\n')
      : NO_CHUNKS_CONTEXT;
  const scopeLine = scope?.chapterLabels?.length ? `\n\nEsta aula cobre: ${scope.chapterLabels.join('; ')}.` : '';
  const systemPrompt = `${getSystemPromptForAgenda(agendaType)}${scopeLine}\n\nMATERIAL DIDÁTICO RELEVANTE (RAG HÍBRIDO):\n${ragContext}`;

  const streamChat = deps.streamChat ?? ((m, o) => aiProvider.streamChat(m, o));
  const stream = streamChat(
    [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
    { citation: rag.primaryCitation, maxTokens: TUTOR_MAX_TOKENS }
  );
  return { kind: 'stream', stream, citation: rag.primaryCitation, topChunk: rag.chunks[0], chunks: rag.chunks };
}
