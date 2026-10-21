import { embedTexts, EmbeddingUnavailableError } from '@/lib/embeddings';
import { DEFAULT_TOP_K, RRF_K } from './constants';
import * as chunkRepo from './services/chunk-repository';
import * as categoryRepo from './services/category-repository';
import type { DidacticChunk, RAGSearchQuery, RAGSearchResult } from './types';

export { RRF_K };

export interface HybridSearchDeps {
  embed(texts: string[]): Promise<number[][]>;
  search(params: chunkRepo.HybridSearchParams): Promise<DidacticChunk[]>;
  findCategoryByName(name: string): Promise<{ id: string } | null>;
}

const defaultDeps: HybridSearchDeps = {
  embed: (texts) => embedTexts(texts),
  search: chunkRepo.searchHybrid,
  findCategoryByName: categoryRepo.findCategoryByName,
};

/**
 * Reciprocal Rank Fusion of two ranked id lists: score(id) = Σ 1 / (k + rank), rank starting at 1.
 *
 * Reference implementation only: in production the fusion runs inside Postgres
 * (`chunk-repository.searchHybrid`), which applies the same formula with the same k.
 */
export function rrfMerge(vecIds: string[], lexIds: string[], k = RRF_K): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of [vecIds, lexIds]) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return Array.from(scores, ([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

/** Formats the standard RAG citation `[Título · Capítulo, pág. N]` (chapter text before ':'). */
export function formatCitation(chunk: Pick<DidacticChunk, 'bookTitle' | 'chapter' | 'pageNumber'>): string {
  const chapterName = chunk.chapter.split(':')[0];
  return `[${chunk.bookTitle} · ${chapterName}, pág. ${chunk.pageNumber}]`;
}

async function embedQuery(query: string, deps: HybridSearchDeps): Promise<number[] | null> {
  try {
    const [embedding] = await deps.embed([query]);
    return embedding ?? null;
  } catch (err) {
    if (!(err instanceof EmbeddingUnavailableError)) throw err;
    console.warn('[HybridSearch] Embeddings indisponíveis, usando apenas busca léxica:', err.message);
    return null;
  }
}

async function resolveCategoryIds(
  names: string[] | undefined,
  deps: HybridSearchDeps
): Promise<string[] | undefined> {
  if (!names || names.length === 0) return undefined;
  const found = await Promise.all(names.map((name) => deps.findCategoryByName(name)));
  const ids = found.filter((c): c is { id: string } => Boolean(c)).map((c) => c.id);
  return ids.length > 0 ? ids : undefined;
}

/**
 * Hybrid search (pgvector + Portuguese full-text, fused by RRF in SQL) over the persisted library.
 */
export async function executeHybridSearch(
  searchQuery: RAGSearchQuery,
  deps: HybridSearchDeps = defaultDeps
): Promise<RAGSearchResult> {
  const startTime = Date.now();
  const { query, topK = DEFAULT_TOP_K, categories, allowedMaterialIds, subject } = searchQuery;

  const [embedding, categoryIds] = await Promise.all([
    embedQuery(query, deps),
    resolveCategoryIds(categories, deps),
  ]);

  const chunks = await deps.search({
    query,
    embedding,
    topK,
    categoryIds,
    materialIds: allowedMaterialIds && allowedMaterialIds.length > 0 ? allowedMaterialIds : undefined,
    subjectId: subject,
  });

  return {
    query,
    chunks,
    primaryCitation: chunks[0] ? formatCitation(chunks[0]) : undefined,
    latencyMs: Date.now() - startTime,
  };
}
