import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { ENV } from '@/lib/constants/env';
import { runPython, PYTHON_SANDBOX_MAX_OUTPUT_BYTES, PYTHON_SANDBOX_MAX_CODE_CHARS } from '../python-sandbox';

const hasPython3 = spawnSync('python3', ['--version']).status === 0;

vi.setConfig({ testTimeout: 10000 });

describe('runPython', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('desabilitado por padrão resulta em 503', async () => {
    vi.stubEnv(ENV.ENABLE_PYTHON_SANDBOX, 'false');
    await expect(runPython('print(1)')).rejects.toMatchObject({ status: 503 });
  });

  describe.skipIf(!hasPython3)('com python3', () => {
    it('executa código simples', async () => {
      vi.stubEnv(ENV.ENABLE_PYTHON_SANDBOX, 'true');
      const res = await runPython('print(2**10)');
      expect(res.stdout).toBe('1024\n');
      expect(res.exitCode).toBe(0);
      expect(res.timedOut).toBe(false);
    });

    it('encerra loop infinito por timeout', async () => {
      vi.stubEnv(ENV.ENABLE_PYTHON_SANDBOX, 'true');
      const start = Date.now();
      const res = await runPython('while True: pass');
      expect(res.timedOut).toBe(true);
      expect(Date.now() - start).toBeLessThanOrEqual(6000);
    });

    it('trunca a saída em 8192 bytes', async () => {
      vi.stubEnv(ENV.ENABLE_PYTHON_SANDBOX, 'true');
      const res = await runPython("print('a'*20000)");
      expect(Buffer.byteLength(res.stdout)).toBeLessThanOrEqual(PYTHON_SANDBOX_MAX_OUTPUT_BYTES);
      expect(res.stdout.length).toBeGreaterThan(0);
    });

    it('rejeita código acima do limite (400)', async () => {
      vi.stubEnv(ENV.ENABLE_PYTHON_SANDBOX, 'true');
      await expect(runPython('#'.repeat(PYTHON_SANDBOX_MAX_CODE_CHARS + 1))).rejects.toMatchObject({ status: 400 });
    });
  });
});
