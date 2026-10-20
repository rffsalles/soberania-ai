import { DomainError } from '@/lib/api/domain-error';
import * as periodRepo from './academic-period-repository';

/** Lists active periods, seeding the defaults when none exist (temporary until the seed script owns it). */
export async function listPeriodsEnsuringDefaults() {
  const periods = await periodRepo.listPeriods();
  if (periods.length > 0) return periods;
  await periodRepo.ensureDefaultPeriods();
  return periodRepo.listPeriods();
}

export async function createPeriod(input: {
  name: string;
  code: string;
  year: number;
  semester?: number | null;
  type: string;
}) {
  if (await periodRepo.findPeriodByCode(input.code)) {
    throw new DomainError(409, `Já existe um período letivo com o código ${input.code}.`);
  }
  return periodRepo.createPeriod({ ...input, semester: input.semester ?? null });
}
