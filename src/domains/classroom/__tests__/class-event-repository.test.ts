import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const calls: string[] = [];
const queryRaw = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const tx = {
  $queryRaw: (strings: TemplateStringsArray) => {
    calls.push(strings.join('?').includes('FOR UPDATE') ? 'lock' : 'max');
    return queryRaw(strings.join('?'));
  },
  classEvent: {
    findFirst: (a: unknown) => {
      calls.push('read');
      return findFirst(a);
    },
    create: (a: { data: { seq: number } }) => {
      calls.push(`insert:${a.data.seq}`);
      return create(a);
    },
  },
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
vi.mock('@/lib/db', () => ({
  db: { $transaction: (fn: never) => $transaction(fn), classEvent: { findMany: (a: never) => findMany(a) } },
}));

import { appendEvents, findEventsAfter } from '../class-event-repository';

const ev = { type: 'TEACHER_NOTE', stepIndex: null, payload: {}, audience: 'TEACHER', createdBy: 'TEACHER' } as const;
const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  queryRaw.mockImplementation(async (sql: string) => (sql.includes('FOR UPDATE') ? [{ id: 'a1' }] : [{ next: 5 }]));
  findFirst.mockResolvedValue(null);
  create.mockImplementation(async ({ data }: { data: { seq: number } }) => ({ ...data }));
});

describe('appendEvents', () => {
  it('trava, lê fase, calcula MAX e insere com seq consecutivos', async () => {
    const rows = await appendEvents('a1', () => [ev, ev]);
    expect(calls).toEqual(['lock', 'read', 'read', 'max', 'insert:5', 'insert:6']);
    expect(rows.map((r) => r.seq)).toEqual([5, 6]);
  });

  it('deriva fase e passo atual dos últimos eventos', async () => {
    findFirst.mockImplementation(async (a: { where: { type: unknown } }) =>
      a.where.type === 'STEP_CHANGED' ? { stepIndex: 3 } : { type: 'SESSION_STARTED' },
    );
    const build = vi.fn(() => [ev]);
    await appendEvents('a1', build);
    expect(build).toHaveBeenCalledWith({ phase: 'RUNNING', currentStepIndex: 3 });
  });

  it('sem eventos: NOT_STARTED e passo null', async () => {
    const build = vi.fn(() => []);
    await appendEvents('a1', build);
    expect(build).toHaveBeenCalledWith({ phase: 'NOT_STARTED', currentStepIndex: null });
  });

  it('build lança 409: nada é inserido e o erro propaga', async () => {
    const err = new DomainError(409, 'x', { code: 'CLASS_ALREADY_STARTED' });
    await expect(appendEvents('a1', () => { throw err; })).rejects.toBe(err);
    expect(create).not.toHaveBeenCalled();
  });

  it('agenda inexistente: 404', async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(appendEvents('x', () => [ev])).rejects.toMatchObject({ status: 404, message: 'Agenda não encontrada.' });
    expect(create).not.toHaveBeenCalled();
  });

  it('P2002 uma vez: repete a transação inteira', async () => {
    create.mockRejectedValueOnce(p2002());
    const rows = await appendEvents('a1', () => [ev]);
    expect($transaction).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(1);
  });

  it('P2002 duas vezes: propaga', async () => {
    create.mockRejectedValue(p2002());
    await expect(appendEvents('a1', () => [ev])).rejects.toMatchObject({ code: 'P2002' });
    expect($transaction).toHaveBeenCalledTimes(2);
  });
});

describe('findEventsAfter', () => {
  it('filtra por agenda, seq e audiência, ordenado e limitado', async () => {
    findMany.mockResolvedValue([]);
    await findEventsAfter('a1', 7, ['ALL', 's1'], 50);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agendaId: 'a1', seq: { gt: 7 }, audience: { in: ['ALL', 's1'] } },
        orderBy: { seq: 'asc' },
        take: 50,
      }),
    );
  });
});
