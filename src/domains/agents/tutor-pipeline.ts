import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import type { AgendaType } from '@/domains/agendas/types';
import {
  CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS_SYSTEM_PROMPT,
} from './prompts/socratic-prompts';
import { EXAM_PROCTOR_SYSTEM_PROMPT, checkExamGuardrail } from './prompts/exam-guardrails';

// Módulo sem acesso a banco: pode ser importado por componentes de cliente.

export type PipelineHistoryMessage = { role: 'user' | 'assistant'; content: string };

export type TutorPipelineRequest = {
  message: string;
  agendaType: AgendaType;
  history?: PipelineHistoryMessage[];
};

export type TutorPipelineDeps = {
  search?(query: RAGSearchQuery): Promise<RAGSearchResult>;
  streamChat?(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;
};

export type TutorPipelineStart =
  | { kind: 'blocked'; refusalMessage: string }
  | {
      kind: 'stream';
      stream: AsyncGenerator<StreamChunk, void, unknown>;
      citation?: string;
      topChunk?: DidacticChunk;
    };

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
 * Pipeline único: guardrail (EXAM) -> RAG híbrido -> prompt enriquecido -> stream do provider.
 * Em violação do guardrail (mensagem atual ou turno do aluno no history), nem RAG nem provider são acionados.
 */
export async function startTutorPipeline(
  request: TutorPipelineRequest,
  deps: TutorPipelineDeps = {}
): Promise<TutorPipelineStart> {
  const { message, agendaType, history = [] } = request;

  if (agendaType === 'EXAM') {
    // O history vem do cliente: todo turno do aluno passa pelo guardrail, não só a mensagem atual.
    const userTurns = [message, ...history.filter((h) => h.role === 'user').map((h) => h.content)];
    const violation = userTurns.map(checkExamGuardrail).find((g) => g.isViolation);
    if (violation) {
      return { kind: 'blocked', refusalMessage: violation.refusalMessage ?? '' };
    }
  }

  const rag = await (deps.search ?? executeHybridSearch)({ query: message, topK: 2 });
  const ragContext = rag.chunks
    .map((c) => `[FONTE: ${c.bookTitle} - ${c.chapter}, pág. ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');
  const systemPrompt = `${getSystemPromptForAgenda(agendaType)}\n\nMATERIAL DIDÁTICO RELEVANTE (RAG HÍBRIDO):\n${ragContext}`;

  const streamChat = deps.streamChat ?? ((m, o) => aiProvider.streamChat(m, o));
  const stream = streamChat(
    [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
    { citation: rag.primaryCitation }
  );
  return { kind: 'stream', stream, citation: rag.primaryCitation, topChunk: rag.chunks[0] };
}
