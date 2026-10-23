import { describe, expect, it, vi } from 'vitest';
import { checkProviderHealth, createCachedProbes, getApplianceStatus, type InferenceStats } from '../telemetry-service';
import { parseGpuCsv, readGpuStats } from '@/lib/gpu-stats';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const ADMIN_VIEW = { includeBaseUrl: true };

const stats = (over: Partial<InferenceStats> = {}): InferenceStats => ({
  calls: 3,
  avgTtftMs: 200,
  avgTokensPerSecond: 40,
  avgLatencyMs: 1500,
  externalTrafficBytes: 0,
  fallbackCount: 1,
  ...over,
});

function makeDeps(over: Record<string, unknown> = {}) {
  const getStats = vi.fn(async (since: Date) =>
    since.getTime() === NOW.getTime() - 15 * 60_000 ? stats() : stats({ calls: 10, fallbackCount: 4 }),
  );
  const deps = {
    getProviderConfig: () => ({ provider: 'vllm', model: 'm', baseUrl: 'http://x/v1', apiKey: 'secret-key' }),
    getStats,
    checkHealth: vi.fn(async () => true),
    readGpu: vi.fn(async () => ({ usedGb: 10.5, totalGb: 24 })),
    now: () => NOW,
    ...over,
  };
  return { deps, getStats };
}

describe('getApplianceStatus', () => {
  it('consulta janelas de 15 min e 24 h e devolve as médias', async () => {
    const f = makeDeps();
    const res = await getApplianceStatus(ADMIN_VIEW, f.deps);
    expect(f.getStats).toHaveBeenCalledWith(new Date(NOW.getTime() - 15 * 60_000));
    expect(f.getStats).toHaveBeenCalledWith(new Date(NOW.getTime() - 24 * 3_600_000));
    expect(res.windows.last15m.avgTtftMs).toBe(200);
    expect(res.windows.last24h.calls).toBe(10);
    expect(res).toMatchObject({ provider: 'vllm', model: 'm', baseUrl: 'http://x/v1', healthy: true });
    expect(res.gpu).toEqual({ usedGb: 10.5, totalGb: 24 });
    expect(JSON.stringify(res)).not.toContain('secret-key');
  });

  it('omite baseUrl quando o leitor não é ADMIN', async () => {
    const f = makeDeps();
    const res = await getApplianceStatus({ includeBaseUrl: false }, f.deps);
    expect(res).not.toHaveProperty('baseUrl');
    expect(res.provider).toBe('vllm');
  });

  it('janela sem chamadas mantém médias nulas', async () => {
    const empty = stats({ calls: 0, avgTtftMs: null, avgTokensPerSecond: null, avgLatencyMs: null, fallbackCount: 0 });
    const f = makeDeps({ getStats: vi.fn(async () => empty) });
    const res = await getApplianceStatus(ADMIN_VIEW, f.deps);
    expect(res.windows.last15m.avgTtftMs).toBeNull();
    expect(res.windows.last15m.calls).toBe(0);
  });

  it('provider mock não é saudável (não há inferência real) e não sonda a rede', async () => {
    const f = makeDeps({ getProviderConfig: () => ({ provider: 'mock', model: 'm', baseUrl: 'u', apiKey: '' }) });
    const res = await getApplianceStatus(ADMIN_VIEW, f.deps);
    expect(res.healthy).toBe(false);
    expect(f.deps.checkHealth).not.toHaveBeenCalled();
  });

  it('gpu indisponível vira null', async () => {
    const f = makeDeps({ readGpu: vi.fn(async () => null) });
    expect((await getApplianceStatus(ADMIN_VIEW, f.deps)).gpu).toBeNull();
  });
});

describe('createCachedProbes', () => {
  it('reaproveita health e GPU por 15 s e consulta de novo depois', async () => {
    let nowMs = NOW.getTime();
    const checkHealth = vi.fn(async () => true);
    const readGpu = vi.fn(async () => ({ usedGb: 1, totalGb: 2 }));
    const probes = createCachedProbes({ checkHealth, readGpu, now: () => nowMs });

    await probes.checkHealth('http://x/v1', 'k');
    await probes.checkHealth('http://x/v1', 'k');
    await probes.readGpu();
    await probes.readGpu();
    expect(checkHealth).toHaveBeenCalledTimes(1);
    expect(readGpu).toHaveBeenCalledTimes(1);

    nowMs += 14_999;
    await probes.checkHealth('http://x/v1', 'k');
    expect(checkHealth).toHaveBeenCalledTimes(1);

    nowMs += 1;
    await probes.checkHealth('http://x/v1', 'k');
    await probes.readGpu();
    expect(checkHealth).toHaveBeenCalledTimes(2);
    expect(readGpu).toHaveBeenCalledTimes(2);
  });

  it('outro baseUrl não usa o cache do anterior', async () => {
    const checkHealth = vi.fn(async (baseUrl: string) => baseUrl.includes('ok'));
    const probes = createCachedProbes({ checkHealth, readGpu: async () => null, now: () => 0 });
    expect(await probes.checkHealth('http://ok/v1', '')).toBe(true);
    expect(await probes.checkHealth('http://down/v1', '')).toBe(false);
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });
});

describe('checkProviderHealth', () => {
  it('false quando o fetch rejeita', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    expect(await checkProviderHealth('http://x/v1', 'k', fetchFn)).toBe(false);
  });

  it('true quando /models responde ok, com Bearer só se houver apiKey', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    expect(await checkProviderHealth('http://x/v1', 'k', fetchFn)).toBe(true);
    expect(fetchFn.mock.calls[0][0]).toBe('http://x/v1/models');
    expect(fetchFn.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer k' });
    await checkProviderHealth('http://x/v1', '', fetchFn);
    expect(fetchFn.mock.calls[1][1].headers).toEqual({});
  });

  it('false quando a resposta não é ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    expect(await checkProviderHealth('http://x/v1', '', fetchFn)).toBe(false);
  });
});

describe('readGpuStats', () => {
  it('null quando o exec falha', async () => {
    const exec = vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    expect(await readGpuStats(exec)).toBeNull();
  });

  it('converte MiB em GB a partir da primeira linha', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: '12288, 24576\n1, 2\n' });
    expect(await readGpuStats(exec)).toEqual({ usedGb: 12, totalGb: 24 });
    expect(exec).toHaveBeenCalledWith('nvidia-smi', [
      '--query-gpu=memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ]);
  });

  it('parseGpuCsv rejeita saída inválida', () => {
    expect(parseGpuCsv('garbage')).toBeNull();
  });
});
