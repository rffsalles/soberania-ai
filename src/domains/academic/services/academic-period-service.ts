import { DomainError } from '@/lib/api/domain-error';
import { formatPeriodName } from '../period-label';
import * as realRepo from './academic-period-repository';

export type PeriodDeps = {
  repo: Pick<typeof realRepo, 'listPeriods' | 'findPeriodByCode' | 'createPeriod'>;
};

export function listPeriods(deps: PeriodDeps = { repo: realRepo }) {
  return deps.repo.listPeriods();
}

export async function createPeriod(
  input: { code: string; year: number; semester?: number | null; type: string },
  deps: PeriodDeps = { repo: realRepo }
) {
  if (await deps.repo.findPeriodByCode(input.code)) {
    throw new DomainError(409, `Já existe um período letivo com o código ${input.code}.`);
  }
  const semester = input.semester ?? null;
  return deps.repo.createPeriod({ ...input, semester, name: formatPeriodName({ ...input, semester }) });
}
