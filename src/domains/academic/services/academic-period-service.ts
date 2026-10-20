import { DomainError } from '@/lib/api/domain-error';
import * as realRepo from './academic-period-repository';

export type PeriodDeps = {
  repo: Pick<typeof realRepo, 'listPeriods' | 'ensureDefaultPeriods' | 'findPeriodByCode' | 'createPeriod'>;
};

/** Lists active periods, seeding the defaults when none exist (temporary until the seed script owns it). */
export async function listPeriodsEnsuringDefaults(deps: PeriodDeps = { repo: realRepo }) {
  const periods = await deps.repo.listPeriods();
  if (periods.length > 0) return periods;
  await deps.repo.ensureDefaultPeriods();
  return deps.repo.listPeriods();
}

export async function createPeriod(
  input: { name: string; code: string; year: number; semester?: number | null; type: string },
  deps: PeriodDeps = { repo: realRepo }
) {
  if (await deps.repo.findPeriodByCode(input.code)) {
    throw new DomainError(409, `Já existe um período letivo com o código ${input.code}.`);
  }
  return deps.repo.createPeriod({ ...input, semester: input.semester ?? null });
}
