import { db } from '@/lib/db';
import { DEFAULT_PERIODS } from '../default-periods';

export function listPeriods() {
  return db.academicPeriod.findMany({
    where: { isActive: true },
    orderBy: [{ year: 'desc' }, { semester: 'desc' }, { createdAt: 'desc' }],
  });
}

export function findPeriodByCode(code: string) {
  return db.academicPeriod.findUnique({ where: { code } });
}

export function createPeriod(data: {
  name: string;
  code: string;
  year: number;
  semester: number | null;
  type: string;
}) {
  return db.academicPeriod.create({ data: { ...data, isActive: true } });
}

export async function ensureDefaultPeriods(): Promise<void> {
  for (const p of DEFAULT_PERIODS) {
    await db.academicPeriod.upsert({ where: { code: p.code }, update: {}, create: p });
  }
}
