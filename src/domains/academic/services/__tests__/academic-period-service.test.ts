import { describe, it, expect, vi } from 'vitest';
import { createPeriod } from '../academic-period-service';

function makeDeps(existing: unknown = null) {
  const repo = {
    listPeriods: vi.fn(),
    findPeriodByCode: vi.fn(async () => existing),
    createPeriod: vi.fn(async (data: unknown) => ({ id: 'p1', ...(data as object) })),
  };
  return { repo: repo as never, mocks: repo };
}

describe('createPeriod', () => {
  it('deriva o nome de código, ano, semestre e tipo', async () => {
    const { repo, mocks } = makeDeps();
    await createPeriod({ code: '2027.1', year: 2027, semester: 1, type: 'SEMESTER' }, { repo });
    expect(mocks.createPeriod).toHaveBeenCalledWith({
      name: '2027.1 · 1º Semestre / 2027', code: '2027.1', year: 2027, semester: 1, type: 'SEMESTER',
    });
  });

  it('semestre ausente vira null e omite o ordinal', async () => {
    const { repo, mocks } = makeDeps();
    await createPeriod({ code: '2027.ANUAL', year: 2027, type: 'ANNUAL' }, { repo });
    expect(mocks.createPeriod).toHaveBeenCalledWith({
      name: '2027.ANUAL · Anual / 2027', code: '2027.ANUAL', year: 2027, semester: null, type: 'ANNUAL',
    });
  });

  it('rejeita código duplicado com 409', async () => {
    const { repo, mocks } = makeDeps({ id: 'x' });
    await expect(createPeriod({ code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' }, { repo }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.createPeriod).not.toHaveBeenCalled();
  });
});
