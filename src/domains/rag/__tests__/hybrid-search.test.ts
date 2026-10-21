import { describe, it, expect, vi } from 'vitest';
import { EmbeddingUnavailableError } from '@/lib/embeddings';
import { executeHybridSearch, rrfMerge, RRF_K, type HybridSearchDeps } from '../hybrid-search';
import type { DidacticChunk } from '../types';

const chunk = (over: Partial<DidacticChunk> = {}): DidacticChunk => ({
  id: 'c1',
  materialId: 'm1',
  bookTitle: 'Sistemas de Banco de Dados',
  author: 'Elmasri & Navathe',
  chapter: 'Capítulo 15: Normalização',
  pageNumber: 512,
  content: 'A terceira forma normal (3FN) elimina dependências transitivas.',
  category: 'Banco de Dados',
  ...over,
});

function makeDeps(over: Partial<HybridSearchDeps> = {}): HybridSearchDeps {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2])),
    search: vi.fn(async () => [chunk()]),
    findCategoryByName: vi.fn(async (name: string) =>
      name.toLowerCase() === 'banco de dados' ? { id: 'cat-bd' } : null
    ),
    ...over,
  };
}

describe('rrfMerge', () => {
  it('uses k = 60 by default', () => {
    expect(RRF_K).toBe(60);
  });

  it('ranks ids present in both lists above ids present in only one', () => {
    const merged = rrfMerge(['a', 'b', 'c'], ['c', 'd', 'a']);
    expect(merged.map((m) => m.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(merged[0].score).toBeCloseTo(1 / 61 + 1 / 63, 10);
    expect(merged[1].score).toBeCloseTo(1 / 63 + 1 / 61, 10);
    expect(merged[2].score).toBeCloseTo(1 / 62, 10);
    expect(merged[3].score).toBeCloseTo(1 / 62, 10);
  });

  it('works with an empty vector list (lexical only)', () => {
    expect(rrfMerge([], ['x', 'y']).map((m) => m.id)).toEqual(['x', 'y']);
  });

  it('honours a custom k', () => {
    expect(rrfMerge(['a'], [], 0)[0].score).toBe(1);
  });
});

describe('executeHybridSearch', () => {
  it('embeds the query, searches and formats the primary citation', async () => {
    const deps = makeDeps();
    const result = await executeHybridSearch({ query: '3FN', topK: 2 }, deps);

    expect(deps.embed).toHaveBeenCalledWith(['3FN']);
    expect(deps.search).toHaveBeenCalledWith({
      query: '3FN',
      embedding: [0.1, 0.2],
      topK: 2,
      categoryIds: undefined,
      materialIds: undefined,
      subjectId: undefined,
    });
    expect(result.chunks).toHaveLength(1);
    expect(result.primaryCitation).toBe('[Sistemas de Banco de Dados · Capítulo 15, pág. 512]');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to lexical-only search when embeddings are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      embed: vi.fn(async () => {
        throw new EmbeddingUnavailableError('offline');
      }),
    });
    await executeHybridSearch({ query: 'join' }, deps);
    expect(deps.search).toHaveBeenCalledWith(expect.objectContaining({ embedding: null }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('propagates unexpected embedding errors', async () => {
    const deps = makeDeps({
      embed: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(executeHybridSearch({ query: 'join' }, deps)).rejects.toThrow('boom');
  });

  it('resolves category names to ids (case-insensitive) and passes material ids', async () => {
    const deps = makeDeps();
    await executeHybridSearch(
      { query: 'x', categories: ['BANCO DE DADOS', 'Inexistente'], allowedMaterialIds: ['m9'] },
      deps
    );
    expect(deps.search).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: ['cat-bd'], materialIds: ['m9'] })
    );
  });

  it('returns no citation when nothing matches', async () => {
    const deps = makeDeps({ search: vi.fn(async () => []) });
    const result = await executeHybridSearch({ query: 'nada' }, deps);
    expect(result.chunks).toEqual([]);
    expect(result.primaryCitation).toBeUndefined();
  });
});
