import { DomainError } from '@/lib/api/domain-error';
import type { AICompletionOptions, AIMessage, StreamChunk } from '@/lib/ai-provider';
import { loggedStreamChat } from '@/domains/telemetry/services/logged-stream-chat';
import { executeHybridSearch, formatCitation } from '@/domains/rag/hybrid-search';
import { sampleChunksByMaterial } from '@/domains/rag/services/chunk-repository';
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
  workloadHours?: number;
  references: PlanGenerationReference[];
};

export type GeneratedPlan = TeachingPlanText & {
  /** Citações reais dos trechos recuperados, no formato `[Título · Capítulo, pág. N]`. */
  citations: string[];
};

export type PlanGenerationDeps = {
  search(query: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  /** Primeiros trechos de um material, usados quando a busca léxica não alcança um material pertinente. */
  listChunks(materialId: string, limit: number): Promise<DidacticChunk[]>;
  streamChat(messages: AIMessage[], options?: AICompletionOptions): AsyncGenerator<StreamChunk>;
};

const defaultDeps: PlanGenerationDeps = {
  search: executeHybridSearch,
  listChunks: sampleChunksByMaterial,
  streamChat: loggedStreamChat,
};

const PLAN_TEMPERATURE = 0.3;
const PLAN_MAX_TOKENS = 900;
const CHUNKS_PER_QUERY = 3;
/** Trechos amostrados por material pertinente que a busca não alcançou (sem embeddings a busca é só léxica). */
const SAMPLE_PER_MATERIAL = 3;
const MIN_TOKEN_LENGTH = 3;
/** Conectivos e numerais de disciplina ("Banco de Dados I") que não distinguem área. */
const IGNORED_TOKENS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'ii', 'iii', 'iv']);

function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !IGNORED_TOKENS.has(t));
}

/**
 * Uma referência é da área da disciplina quando título ou categoria contêm todas as palavras significativas
 * do nome da disciplina (por prefixo: "estrutura" casa "estruturas"). "Dados" sozinho não torna um livro de
 * algoritmos pertinente a Banco de Dados.
 */
export function isReferencePertinent(subjectName: string, ref: Pick<PlanGenerationReference, 'title' | 'category'>): boolean {
  const needed = tokens(subjectName);
  if (needed.length === 0) return false;
  const matchesAll = (text: string) => {
    const have = tokens(text);
    return needed.every((n) => have.some((h) => h.startsWith(n)));
  };
  return matchesAll(ref.title) || (ref.category ? matchesAll(ref.category) : false);
}
export function noSourcesMessage(subjectName: string): string {
  return `Nenhum trecho das referências selecionadas trata de ${subjectName}. Vincule material pertinente ou redija a ementa manualmente.`;
}
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
  const found = results.flatMap((r) => r.chunks).filter((c) => !seen.has(c.id) && seen.add(c.id));

  // Material da área da disciplina que a busca não alcançou: usa seus primeiros trechos como base.
  const reached = new Set(found.map((c) => c.materialId));
  const unreached = input.references.filter(
    (r): r is PlanGenerationReference & { id: string } =>
      Boolean(r.id) && !reached.has(r.id as string) && isReferencePertinent(input.subjectName, r)
  );
  const sampled = await Promise.all(unreached.map((r) => deps.listChunks(r.id, SAMPLE_PER_MATERIAL)));
  return [...found, ...sampled.flat().filter((c) => !seen.has(c.id) && seen.add(c.id))];
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
 * das referências selecionadas. Sem trechos pertinentes lança 422. Sem IA real (provider mock, falha ou resposta inválida) lança 503:
 * um texto de modelo apresentado como sugestão da IA seria pior do que nenhuma sugestão.
 */
export async function generatePlanSuggestion(
  input: GeneratePlanInput,
  deps: PlanGenerationDeps = defaultDeps
): Promise<GeneratedPlan> {
  const chunks = await retrieveChunks(input, deps);
  // Sem base no acervo não há "sugestão da IA": a ementa sairia da memória do modelo, não das referências.
  if (chunks.length === 0) throw new DomainError(422, noSourcesMessage(input.subjectName));
  const messages = buildTeachingPlanMessages({
    subjectName: input.subjectName,
    courseName: input.courseName,
    academicPeriod: input.academicPeriod,
    workloadHours: input.workloadHours,
    references: input.references.map(({ title, author }) => ({ title, author })),
    chunks,
  });
  const text = await askModel(messages, deps);
  if (!text) throw new DomainError(503, AI_UNAVAILABLE_MESSAGE);
  return { ...text, citations: Array.from(new Set(chunks.map(formatCitation))) };
}
