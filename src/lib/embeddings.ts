/**
 * Provedor de embeddings - Soberania AI
 *
 * `mock` usa hashing determinístico de tokens (sem rede); os demais provedores
 * chamam `POST {AI_BASE_URL}/embeddings` (API compatível com OpenAI).
 */

import { ENV } from './constants/env';

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_BATCH_SIZE = 32;
export const EMBEDDING_TIMEOUT_MS = 15_000;

const MOCK_PROVIDER = 'mock';
const DEFAULT_PROVIDER = MOCK_PROVIDER;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECONDARY_BUCKET_WEIGHT = 0.5;
const SECONDARY_BUCKET_SHIFT = 8;
const TOKEN_SPLIT_PATTERN = /[^\p{L}\p{N}]+/u;

export class EmbeddingUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmbeddingUnavailableError';
  }
}

export interface EmbeddingDeps {
  fetch?: typeof fetch;
}

function fnv1a(token: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function hashEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(TOKEN_SPLIT_PATTERN).filter(Boolean);
  for (const token of tokens) {
    const hash = fnv1a(token);
    vector[hash % EMBEDDING_DIMENSIONS] += 1;
    vector[(hash >>> SECONDARY_BUCKET_SHIFT) % EMBEDDING_DIMENSIONS] += SECONDARY_BUCKET_WEIGHT;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return vector;
  return vector.map((x) => x / norm);
}

interface EmbeddingConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

function readConfig(): EmbeddingConfig {
  const model = process.env[ENV.AI_EMBEDDING_MODEL]?.trim();
  const baseUrl = process.env[ENV.AI_BASE_URL]?.trim();
  if (!model) {
    throw new EmbeddingUnavailableError(
      `Modelo de embeddings não configurado (${ENV.AI_EMBEDDING_MODEL})`,
    );
  }
  if (!baseUrl) {
    throw new EmbeddingUnavailableError(
      `URL do provedor de IA não configurada (${ENV.AI_BASE_URL})`,
    );
  }
  return {
    model,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: process.env[ENV.AI_API_KEY] || undefined,
  };
}

async function embedBatch(
  batch: string[],
  fetchImpl: typeof fetch,
  config: EmbeddingConfig,
): Promise<number[][]> {
  const { baseUrl, apiKey, model } = config;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: batch }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new EmbeddingUnavailableError('Falha de rede ao gerar embeddings', { cause });
  }
  if (!response.ok) {
    throw new EmbeddingUnavailableError(`Provedor de embeddings respondeu HTTP ${response.status}`);
  }

  let payload: { data?: Array<{ embedding?: unknown }> };
  try {
    payload = await response.json();
  } catch (cause) {
    throw new EmbeddingUnavailableError('Resposta de embeddings inválida', { cause });
  }
  const data = payload.data;
  if (!Array.isArray(data) || data.length !== batch.length) {
    throw new EmbeddingUnavailableError('Quantidade de embeddings retornada difere da enviada');
  }
  return data.map((item) => {
    const embedding = item.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingUnavailableError(
        `Embedding com dimensão diferente de ${EMBEDDING_DIMENSIONS}`,
      );
    }
    return embedding as number[];
  });
}

export async function embedTexts(texts: string[], deps: EmbeddingDeps = {}): Promise<number[][]> {
  const provider = process.env[ENV.AI_PROVIDER] ?? DEFAULT_PROVIDER;
  if (provider === MOCK_PROVIDER) return texts.map(hashEmbedding);

  const config = readConfig();
  const fetchImpl = deps.fetch ?? fetch;
  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    result.push(...(await embedBatch(texts.slice(i, i + EMBEDDING_BATCH_SIZE), fetchImpl, config)));
  }
  return result;
}
