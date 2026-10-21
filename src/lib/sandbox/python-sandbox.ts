import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DomainError } from '@/lib/api/domain-error';
import { ENV } from '@/lib/constants/env';

export const PYTHON_SANDBOX_TIMEOUT_MS = 5000;
export const PYTHON_SANDBOX_MEMORY_KB = 262144;
export const PYTHON_SANDBOX_MAX_OUTPUT_BYTES = 8192;
export const PYTHON_SANDBOX_MAX_CODE_CHARS = 4000;

const ENABLED_VALUE = 'true';
const TEMP_DIR_PREFIX = 'soberania-pysandbox-';
const SHELL = 'sh';
const WINDOWS_PLATFORM = 'win32';
const PYTHON_UNIX = 'python3';
const PYTHON_WINDOWS = 'python';
const KILL_SIGNAL = 'SIGKILL';
/** SIGKILL por estouro de memória não deve ser reportado como timeout. */
const TIMEOUT_TOLERANCE_MS = 100;

export const SANDBOX_DISABLED_MESSAGE = 'Sandbox Python desabilitado.';
export const SANDBOX_CODE_TOO_LONG_MESSAGE = `O código excede o limite de ${PYTHON_SANDBOX_MAX_CODE_CHARS} caracteres.`;

export interface PythonRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  /** false quando `ulimit -v` não é suportado pelo shell (ex.: macOS) e o limite de memória não foi aplicado. */
  memoryLimited: boolean;
}

/** `$0` recebe o código como argumento: nunca é concatenado na string do shell. */
const SH_WITH_ULIMIT = `ulimit -v ${PYTHON_SANDBOX_MEMORY_KB} && exec ${PYTHON_UNIX} -I -S -c "$0"`;
const SH_WITHOUT_ULIMIT = `exec ${PYTHON_UNIX} -I -S -c "$0"`;

let ulimitSupported: boolean | undefined;

function supportsUlimit(): boolean {
  if (ulimitSupported === undefined) {
    ulimitSupported = spawnSync(SHELL, ['-c', `ulimit -v ${PYTHON_SANDBOX_MEMORY_KB}`]).status === 0;
  }
  return ulimitSupported;
}

function createCollector() {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    push(chunk: Buffer) {
      const room = PYTHON_SANDBOX_MAX_OUTPUT_BYTES - size;
      if (room <= 0) return;
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(slice);
      size += slice.length;
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

/** Executa código Python com tempo, memória (quando suportada) e saída limitados. Exige ENABLE_PYTHON_SANDBOX=true. */
export async function runPython(code: string): Promise<PythonRunResult> {
  if (process.env[ENV.ENABLE_PYTHON_SANDBOX] !== ENABLED_VALUE) {
    throw new DomainError(503, SANDBOX_DISABLED_MESSAGE);
  }
  if (code.length > PYTHON_SANDBOX_MAX_CODE_CHARS) {
    throw new DomainError(400, SANDBOX_CODE_TOO_LONG_MESSAGE);
  }

  const cwd = await mkdtemp(join(tmpdir(), TEMP_DIR_PREFIX));
  try {
    const isWindows = process.platform === WINDOWS_PLATFORM;
    const memoryLimited = !isWindows && supportsUlimit();
    const command = isWindows ? PYTHON_WINDOWS : SHELL;
    const args = isWindows
      ? ['-I', '-S', '-c', code]
      : ['-c', memoryLimited ? SH_WITH_ULIMIT : SH_WITHOUT_ULIMIT, code];

    return await new Promise<PythonRunResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '', PYTHONDONTWRITEBYTECODE: '1' } as unknown as NodeJS.ProcessEnv,
        timeout: PYTHON_SANDBOX_TIMEOUT_MS,
        killSignal: KILL_SIGNAL,
      });
      const startedAt = Date.now();
      const out = createCollector();
      const err = createCollector();
      child.stdout.on('data', (c: Buffer) => out.push(c));
      child.stderr.on('data', (c: Buffer) => err.push(c));
      child.on('error', reject);
      child.on('close', (exitCode, signal) => {
        resolve({
          stdout: out.text(),
          stderr: err.text(),
          exitCode: exitCode ?? -1,
          timedOut: signal === KILL_SIGNAL && Date.now() - startedAt >= PYTHON_SANDBOX_TIMEOUT_MS - TIMEOUT_TOLERANCE_MS,
          memoryLimited,
        });
      });
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
