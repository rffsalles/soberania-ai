import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type GpuStats = { usedGb: number; totalGb: number };

type ExecFn = (file: string, args: string[]) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile) as unknown as ExecFn;

const MIB_PER_GB = 1024;
const toGb = (mib: number) => Math.round((mib / MIB_PER_GB) * 10) / 10;

/** Interpreta a primeira linha "used, total" (MiB) do nvidia-smi; null se inválida. */
export function parseGpuCsv(stdout: string): GpuStats | null {
  const firstLine = stdout.trim().split('\n')[0] ?? '';
  const [used, total] = firstLine.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(used) || !Number.isFinite(total) || !total) return null;
  return { usedGb: toGb(used), totalGb: toGb(total) };
}

/** Lê o uso de VRAM via nvidia-smi; null quando não há GPU NVIDIA/binário ou a leitura falha. */
export async function readGpuStats(exec: ExecFn = execFileAsync): Promise<GpuStats | null> {
  try {
    const { stdout } = await exec('nvidia-smi', [
      '--query-gpu=memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ]);
    return parseGpuCsv(String(stdout));
  } catch {
    return null;
  }
}
