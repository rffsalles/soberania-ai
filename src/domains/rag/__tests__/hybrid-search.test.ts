import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingUnavailableError, EmbeddingsDisabledError } from '@/lib/embeddings';
import { executeHybridSearch, formatCitation, resetEmbeddingNoticeForTests, rrfMerge, RRF_K, type HybridSearchDeps } from '../hybrid-search';
import { RAG_MAX_TOP_K } from '../constants';
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

beforeEach(() => resetEmbeddingNoticeForTests());

describe('rrfMerge', () => {
  it('uses k = 60 by default', () => {
    expect(RRF_K).toBe(60);
  });

  it('ranks ids present in both lists above ids present in only one (distinct scores)', () => {
    // b: 1/62 + 1/61, a: 1/61, d: 1/62, c: 1/63 — all distinct
    const merged = rrfMerge(['a', 'b', 'c'], ['b', 'd']);
    expect(merged.map((m) => m.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(merged[0].score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(merged[1].score).toBeCloseTo(1 / 61, 10);
    expect(merged[2].score).toBeCloseTo(1 / 62, 10);
    expect(merged[3].score).toBeCloseTo(1 / 63, 10);
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

  it('avisa só uma vez por processo em buscas repetidas com embeddings indisponíveis', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = makeDeps({
      embed: vi.fn(async () => {
        throw new EmbeddingUnavailableError('offline');
      }),
    });
    await executeHybridSearch({ query: 'join' }, deps);
    await executeHybridSearch({ query: 'join' }, deps);
    await executeHybridSearch({ query: 'join' }, deps);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(deps.search).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('embeddings desligados por config: uma linha console.info, sem warning, busca léxica funciona', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const deps = makeDeps({
      embed: vi.fn(async () => {
        throw new EmbeddingsDisabledError();
      }),
    });
    const r1 = await executeHybridSearch({ query: 'join' }, deps);
    await executeHybridSearch({ query: 'join' }, deps);
    expect(r1.chunks).toHaveLength(1);
    expect(deps.search).toHaveBeenCalledWith(expect.objectContaining({ embedding: null }));
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    info.mockRestore();
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

  it('repassa allowedChapterIds como chapterIds e omite quando vazio', async () => {
    const deps = makeDeps();
    await executeHybridSearch({ query: 'q', allowedChapterIds: ['ch1'] }, deps);
    expect(deps.search).toHaveBeenLastCalledWith(expect.objectContaining({ chapterIds: ['ch1'] }));
    await executeHybridSearch({ query: 'q', allowedChapterIds: [] }, deps);
    const calls = vi.mocked(deps.search).mock.calls;
    expect(calls[calls.length - 1][0].chapterIds).toBeUndefined();
  });

  it('fails closed when none of the requested categories exist', async () => {
    const deps = makeDeps({ findCategoryByName: vi.fn(async () => null) });
    const result = await executeHybridSearch(
      { query: 'x', categories: ['Inexistente', 'Outra'] },
      deps
    );
    expect(result.chunks).toEqual([]);
    expect(result.primaryCitation).toBeUndefined();
    expect(deps.search).not.toHaveBeenCalled();
    expect(deps.embed).not.toHaveBeenCalled();
  });

  it.each([
    [0, 1],
    [-5, 1],
    [500, RAG_MAX_TOP_K],
    [Number.NaN, 3],
    [undefined, 3],
  ])('clamps topK %s to %s', async (topK, expected) => {
    const deps = makeDeps();
    await executeHybridSearch({ query: 'x', topK }, deps);
    expect(deps.search).toHaveBeenCalledWith(expect.objectContaining({ topK: expected }));
  });

  it('returns no citation when nothing matches', async () => {
    const deps = makeDeps({ search: vi.fn(async () => []) });
    const result = await executeHybridSearch({ query: 'nada' }, deps);
    expect(result.chunks).toEqual([]);
    expect(result.primaryCitation).toBeUndefined();
  });

  it('formatCitation omite "pág." para trechos sintéticos de DOCX/TXT/MD', () => {
    expect(formatCitation({ bookTitle: 'Apostila', chapter: 'Cap. 2: ER', pageNumber: 31 })).toBe('[Apostila · Cap. 2, pág. 31]');
    expect(formatCitation({ bookTitle: 'Apostila', chapter: 'Trecho 3', pageNumber: 3 })).toBe('[Apostila · Trecho 3]');
  });
});
