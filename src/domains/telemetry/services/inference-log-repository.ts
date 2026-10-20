import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type InferenceLogInput = Prisma.InferenceLogUncheckedCreateInput;

export function createInferenceLog(data: InferenceLogInput) {
  return db.inferenceLog.create({ data });
}
