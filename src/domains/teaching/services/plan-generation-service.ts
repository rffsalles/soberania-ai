import { DomainError } from '@/lib/api/domain-error';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import { executeHybridSearch, formatCitation } from '@/domains/rag/hybrid-search';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from '@/domains/rag/types';
import {
  buildTeachingPlanMessages,
  parseTeachingPlanText,
  type TeachingPlanText,
} from '@/domains/agents/prompts/teaching-plan-prompt';

export type PlanGenerationReference = {
  /** Id do material no acervo; quando presente restringe a busca RAG a ele. */
  id?: string;
  title: string;
  author: string;
  category?: string;
};

export type GeneratePlanInput = {
  subjectName: string;
  courseName?: string;
  academicPeriod?: string;
  references: PlanGenerationReference[];
};

export type GeneratedPlan = TeachingPlanText & {
  /** Citações reais dos trechos recuperados, no formato `[Título · Capítulo, pág. N]`. */
  citations: string[];
};

export type PlanGenerationDeps = {
  search(query: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
};

const defaultDeps: PlanGenerationDeps = {
  search: executeHybridSearch,
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
};

const PLAN_TEMPERATURE = 0.3;
const PLAN_MAX_TOKENS = 900;
const CHUNKS_PER_QUERY = 3;
export const AI_UNAVAILABLE_MESSAGE =
  'A IA não está disponível para gerar a sugestão agora. Verifique o provedor de inferência ou redija a ementa manualmente.';

function searchQueries(subjectName: string): string[] {
  return [
    `${subjectName} fundamentos conceitos`,
    `${subjectName} metodologia de ensino aprendizagem ativa`,
    `${subjectName} competências diretrizes curriculares`,
  ];
}

async function retrieveChunks(input: GeneratePlanInput, deps: PlanGenerationDeps): Promise<DidacticChunk[]> {
  const materialIds = input.references.map((r) => r.id).filter((id): id is string => Boolean(id));
  const results = await Promise.all(
    searchQueries(input.subjectName).map((query) =>
      deps.search({
        query,
        subjectName: input.subjectName,
        allowedMaterialIds: materialIds.length > 0 ? materialIds : undefined,
        topK: CHUNKS_PER_QUERY,
      })
    )
  );
  const seen = new Set<string>();
  return results.flatMap((r) => r.chunks).filter((c) => !seen.has(c.id) && seen.add(c.id));
}

async function askModel(messages: AIMessage[], deps: PlanGenerationDeps): Promise<TeachingPlanText | null> {
  try {
    let text = '';
    let fallback = false;
    for await (const chunk of deps.streamChat(messages, {
      temperature: PLAN_TEMPERATURE,
      maxTokens: PLAN_MAX_TOKENS,
    })) {
      text += chunk.token;
      if (chunk.fallback) fallback = true;
    }
    return fallback ? null : parseTeachingPlanText(text);
  } catch (err) {
    console.warn('[teaching-plan] falha ao gerar sugestão com a IA', err);
    return null;
  }
}

/**
 * Gera a sugestão de ementa/objetivos/metodologia com o LLM, fundamentada nos trechos RAG
 * das referências selecionadas. Sem IA real (provider mock, falha ou resposta inválida) lança 503:
 * um texto de modelo apresentado como sugestão da IA seria pior do que nenhuma sugestão.
 */
export async function generatePlanSuggestion(
  input: GeneratePlanInput,
  deps: PlanGenerationDeps = defaultDeps
): Promise<GeneratedPlan> {
  const chunks = await retrieveChunks(input, deps);
  const messages = buildTeachingPlanMessages({
    subjectName: input.subjectName,
    courseName: input.courseName,
    academicPeriod: input.academicPeriod,
    references: input.references.map(({ title, author }) => ({ title, author })),
    chunks,
  });
  const text = await askModel(messages, deps);
  if (!text) throw new DomainError(503, AI_UNAVAILABLE_MESSAGE);
  return { ...text, citations: Array.from(new Set(chunks.map(formatCitation))) };
}
