import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EmbeddingUnavailableError,
  embedTexts,
  hashEmbedding,
} from '../embeddings';

const OLLAMA_PROVIDER = 'ollama';

function vectorOf(size: number): number[] {
  return Array.from({ length: size }, () => 0.1);
}

function fakeFetch(dimension = EMBEDDING_DIMENSIONS) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    return new Response(
      JSON.stringify({ data: body.input.map(() => ({ embedding: vectorOf(dimension) })) }),
      { status: 200 },
    );
  });
}

describe('hashEmbedding', () => {
  it('has 1024 positions and unit norm', () => {
    const v = hashEmbedding('o estudante aprende fotossíntese');
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-6);
  });

  it('is deterministic and discriminates texts', () => {
    expect(hashEmbedding('abc def')).toEqual(hashEmbedding('abc def'));
    expect(hashEmbedding('abc def')).not.toEqual(hashEmbedding('xyz uvw'));
  });

  it('returns zeros for empty text', () => {
    expect(hashEmbedding('   ').every((x) => x === 0)).toBe(true);
  });
});

describe('embedTexts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses hashing for the mock provider', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    const f = vi.fn();
    const out = await embedTexts(['a b'], { fetch: f as unknown as typeof fetch });
    expect(f).not.toHaveBeenCalled();
    expect(out[0]).toEqual(hashEmbedding('a b'));
  });

  it('batches 70 texts into 3 requests', async () => {
    vi.stubEnv('AI_PROVIDER', OLLAMA_PROVIDER);
    vi.stubEnv('AI_BASE_URL', 'http://localhost:11434/v1');
    const f = fakeFetch();
    const texts = Array.from({ length: 70 }, (_, i) => `texto ${i}`);
    const out = await embedTexts(texts, { fetch: f as unknown as typeof fetch });
    expect(EMBEDDING_BATCH_SIZE).toBe(32);
    expect(f).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(70);
  });

  it('throws EmbeddingUnavailableError on HTTP 500', async () => {
    vi.stubEnv('AI_PROVIDER', OLLAMA_PROVIDER);
    const f = vi.fn(async () => new Response('x', { status: 500 }));
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('throws EmbeddingUnavailableError on wrong dimension', async () => {
    vi.stubEnv('AI_PROVIDER', OLLAMA_PROVIDER);
    const f = fakeFetch(768);
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });
});
