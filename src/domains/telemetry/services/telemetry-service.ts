import { aiProvider } from '@/lib/ai-provider';
import { readGpuStats, type GpuStats } from '@/lib/gpu-stats';
import { getInferenceStats } from './inference-log-repository';

export type InferenceStats = {
  calls: number;
  avgTtftMs: number | null;
  avgTokensPerSecond: number | null;
  avgLatencyMs: number | null;
  externalTrafficBytes: number;
  fallbackCount: number;
};

export type ApplianceStatus = {
  provider: string;
  model: string;
  /** Host interno do provedor: só exposto ao ADMIN. */
  baseUrl?: string;
  healthy: boolean;
  windows: { last15m: InferenceStats; last24h: InferenceStats };
  gpu: GpuStats | null;
};

type ProviderConfig = { provider: string; model: string; baseUrl: string; apiKey: string };

export type TelemetryDeps = {
  getProviderConfig(): ProviderConfig;
  getStats(since: Date): Promise<InferenceStats>;
  checkHealth(baseUrl: string, apiKey: string): Promise<boolean>;
  readGpu(): Promise<GpuStats | null>;
  now?: () => Date;
};

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const TWENTY_FOUR_HOURS_MS = 24 * 3_600_000;
const HEALTH_TIMEOUT_MS = 2000;
/** Cada poll do badge sondaria o provedor e rodaria nvidia-smi; 15 s de cache bastam para o painel. */
export const PROBE_CACHE_TTL_MS = 15_000;

type Probes = Pick<TelemetryDeps, 'checkHealth' | 'readGpu'>;

/** Envolve as sondas (health do provedor e GPU) com cache em memória por PROBE_CACHE_TTL_MS. */
export function createCachedProbes(probes: Probes & { now?: () => number }): Probes {
  const now = probes.now ?? Date.now;
  const entries = new Map<string, { at: number; value: Promise<unknown> }>();
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && now() - hit.at < PROBE_CACHE_TTL_MS) return hit.value as Promise<T>;
    const value = load();
    entries.set(key, { at: now(), value });
    return value;
  }
  return {
    checkHealth: (baseUrl, apiKey) => cached(`health|${baseUrl}|${apiKey}`, () => probes.checkHealth(baseUrl, apiKey)),
    readGpu: () => cached('gpu', () => probes.readGpu()),
  };
}

const defaultDeps: TelemetryDeps = {
  getProviderConfig: () => aiProvider.getProviderConfig(),
  getStats: getInferenceStats,
  ...createCachedProbes({
    checkHealth: (baseUrl, apiKey) => checkProviderHealth(baseUrl, apiKey),
    readGpu: () => readGpuStats(),
  }),
};

/** GET {baseUrl}/models; saudável somente se responder 2xx dentro do timeout. */
export async function checkProviderHealth(
  baseUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getApplianceStatus(
  view: { includeBaseUrl: boolean },
  deps: TelemetryDeps = defaultDeps,
): Promise<ApplianceStatus> {
  const { provider, model, baseUrl, apiKey } = deps.getProviderConfig();
  const nowMs = (deps.now?.() ?? new Date()).getTime();

  const [last15m, last24h, healthy, gpu] = await Promise.all([
    deps.getStats(new Date(nowMs - FIFTEEN_MINUTES_MS)),
    deps.getStats(new Date(nowMs - TWENTY_FOUR_HOURS_MS)),
    // Provider mock não tem servidor para sondar.
    provider === 'mock' ? Promise.resolve(true) : deps.checkHealth(baseUrl, apiKey),
    deps.readGpu(),
  ]);

  return {
    provider,
    model,
    ...(view.includeBaseUrl ? { baseUrl } : {}),
    healthy,
    windows: { last15m, last24h },
    gpu,
  };
}
