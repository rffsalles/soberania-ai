import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type InferenceLogInput = Prisma.InferenceLogUncheckedCreateInput;

export function createInferenceLog(data: InferenceLogInput) {
  return db.inferenceLog.create({ data });
}

export type InferenceStatsRow = {
  calls: number;
  avgTtftMs: number | null;
  avgTokensPerSecond: number | null;
  avgLatencyMs: number | null;
  externalTrafficBytes: number;
  fallbackCount: number;
};

/** Agregados dos logs de inferência desde `since`. Médias são null quando não há chamadas. */
export async function getInferenceStats(since: Date): Promise<InferenceStatsRow> {
  const where = { createdAt: { gte: since } };
  const [agg, fallbackCount] = await Promise.all([
    db.inferenceLog.aggregate({
      where,
      _count: { _all: true },
      _avg: { ttftMs: true, tokensPerSecond: true, totalLatencyMs: true },
      _sum: { externalTrafficBytes: true },
    }),
    db.inferenceLog.count({ where: { ...where, fallback: true } }),
  ]);
  return {
    calls: agg._count._all,
    avgTtftMs: agg._avg.ttftMs,
    avgTokensPerSecond: agg._avg.tokensPerSecond,
    avgLatencyMs: agg._avg.totalLatencyMs,
    externalTrafficBytes: agg._sum.externalTrafficBytes ?? 0,
    fallbackCount,
  };
}
