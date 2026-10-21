import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EmbeddingUnavailableError,
  embedTexts,
  hashEmbedding,
} from '../embeddings';

const OLLAMA_PROVIDER = 'ollama';

const BASE_URL = 'http://localhost:11434/v1';
const MODEL = 'bge-m3';
const API_KEY = 'secret-key';

function vectorFor(text: string, size: number): number[] {
  const v = new Array<number>(size).fill(0);
  v[0] = Number(text.replace(/\D/g, ''));
  return v;
}

function fakeFetch(dimension = EMBEDDING_DIMENSIONS) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    return new Response(
      JSON.stringify({ data: body.input.map((t) => ({ embedding: vectorFor(t, dimension) })) }),
      { status: 200 },
    );
  });
}

function stubProvider(apiKey = '') {
  vi.stubEnv('AI_PROVIDER', OLLAMA_PROVIDER);
  vi.stubEnv('AI_BASE_URL', BASE_URL);
  vi.stubEnv('AI_EMBEDDING_MODEL', MODEL);
  vi.stubEnv('AI_API_KEY', apiKey);
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

  it('batches 70 texts in order with sizes 32/32/6 and correct request shape', async () => {
    stubProvider(API_KEY);
    const f = fakeFetch();
    const texts = Array.from({ length: 70 }, (_, i) => `texto ${i}`);
    const out = await embedTexts(texts, { fetch: f as unknown as typeof fetch });
    expect(EMBEDDING_BATCH_SIZE).toBe(32);
    expect(f).toHaveBeenCalledTimes(3);
    const sizes = f.mock.calls.map(
      ([, init]) => (JSON.parse(String(init?.body)).input as string[]).length,
    );
    expect(sizes).toEqual([32, 32, 6]);
    expect(out.map((v) => v[0])).toEqual(texts.map((_, i) => i));
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/embeddings`);
    expect(JSON.parse(String(init?.body)).model).toBe(MODEL);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('omits bearer header without API key and normalizes trailing slash', async () => {
    stubProvider();
    vi.stubEnv('AI_BASE_URL', `${BASE_URL}/`);
    const f = fakeFetch();
    await embedTexts(['a 1'], { fetch: f as unknown as typeof fetch });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/embeddings`);
    expect(init?.headers as Record<string, string>).not.toHaveProperty('Authorization');
  });

  it('throws EmbeddingUnavailableError on HTTP 500', async () => {
    stubProvider();
    const f = vi.fn(async () => new Response('x', { status: 500 }));
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('throws EmbeddingUnavailableError on network failure', async () => {
    stubProvider();
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('throws EmbeddingUnavailableError on wrong dimension', async () => {
    stubProvider();
    const f = fakeFetch(768);
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('fails without calling fetch when model or base URL is missing', async () => {
    const f = fakeFetch();
    stubProvider();
    vi.stubEnv('AI_EMBEDDING_MODEL', '');
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
    stubProvider();
    vi.stubEnv('AI_BASE_URL', '');
    await expect(embedTexts(['a'], { fetch: f as unknown as typeof fetch })).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
    expect(f).not.toHaveBeenCalled();
  });
});
