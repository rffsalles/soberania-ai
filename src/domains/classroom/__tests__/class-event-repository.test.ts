import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const calls: string[] = [];
const queryRaw = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const findMany = vi.fn();
const txFindMany = vi.fn();
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
    findMany: (a: unknown) => txFindMany(a),
    create: (a: { data: { seq: number } }) => {
      calls.push(`insert:${a.data.seq}`);
      return create(a);
    },
  },
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx));
vi.mock('@/lib/db', () => ({
  db: { $transaction: (fn: never) => $transaction(fn), classEvent: { findMany: (a: never) => findMany(a), findFirst: (a: never) => findFirst(a) } },
}));

import {
  appendEvents,
  appendEventsWith,
  appendStalemateFailure,
  appendTutorEvents,
  findEventBySeq,
  findEventsAfter,
  findLastStalemateFailureAt,
  hasEvent,
} from '../class-event-repository';

const ev = { type: 'TEACHER_NOTE', stepIndex: null, payload: {}, audience: 'TEACHER', createdBy: 'TEACHER' } as const;
const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  queryRaw.mockImplementation(async (sql: string) => (sql.includes('FOR UPDATE') ? [{ id: 'a1' }] : [{ next: 5 }]));
  findFirst.mockResolvedValue(null);
  txFindMany.mockResolvedValue([]);
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
    expect(build).toHaveBeenCalledWith({ phase: 'RUNNING', currentStepIndex: 3, audienceStepIndex: null });
  });

  it('sem eventos: NOT_STARTED e passo null', async () => {
    const build = vi.fn(() => []);
    await appendEvents('a1', build);
    expect(build).toHaveBeenCalledWith({ phase: 'NOT_STARTED', currentStepIndex: null, audienceStepIndex: null });
  });

  it('stepAudience: lê o passo do aluno dentro da trava, filtrando a audiência', async () => {
    findFirst.mockImplementation(async (a: { where: { audience: string; type: unknown } }) =>
      a.where.audience === 's1' ? { stepIndex: 2 } : a.where.type === 'STEP_CHANGED' ? { stepIndex: 0 } : null,
    );
    const build = vi.fn(() => []);
    await appendEvents('a1', build, { stepAudience: 's1' });
    expect(build).toHaveBeenCalledWith({ phase: 'NOT_STARTED', currentStepIndex: 0, audienceStepIndex: 2 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agendaId: 'a1', audience: 's1', type: 'STEP_CHANGED' } }),
    );
    expect(calls.slice(0, 4)).toEqual(['lock', 'read', 'read', 'read']);
  });

  it('sem stepAudience: audienceStepIndex null e sem consulta extra', async () => {
    await appendEvents('a1', () => []);
    expect(findFirst).toHaveBeenCalledTimes(2);
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

describe('appendTutorEvents', () => {
  const concept = (title: string) => ({
    title,
    explanation: 'Explicação',
    citation: { chunkId: 'k1', label: 'Livro, p. 1', page: 1 },
  });
  const card = {
    type: 'TUTOR_CARD',
    payload: { concepts: [concept('A'), concept('B')], objectiveLink: 'Liga', source: 'GENERATED' },
    audience: 'ALL',
  } as const;
  const skip = { type: 'TUTOR_SKIPPED', payload: { reason: 'NO_MATERIAL', kind: 'CARD' }, audience: 'TEACHER' } as const;

  it('payload inválido: lança DomainError 400 sem abrir transação', async () => {
    running();
    const bad = { type: 'TUTOR_CARD', payload: { concepts: [] }, audience: 'ALL' } as const;
    await expect(appendTutorEvents('a1', 0, [skip, bad])).rejects.toMatchObject({
      status: 400,
      details: { code: 'INVALID_TUTOR_EVENT' },
    });
    expect($transaction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  const running = () =>
    findFirst.mockImplementation(async (a: { where: { type: unknown } }) =>
      a.where.type === 'STEP_CHANGED' ? { stepIndex: 0 } : { type: 'SESSION_STARTED' },
    );

  it('insere os tipos ausentes com createdBy TUTOR e stepIndex', async () => {
    running();
    const rows = await appendTutorEvents('a1', 0, [card, skip]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data).toMatchObject({ seq: 5, type: 'TUTOR_CARD', stepIndex: 0, createdBy: 'TUTOR' });
    expect(rows.map((r) => r.type)).toEqual(['TUTOR_CARD', 'TUTOR_SKIPPED']);
  });

  it('tipo já existente não é reinserido e volta a linha antiga', async () => {
    running();
    const old = { seq: 2, type: 'TUTOR_CARD', stepIndex: 0, payload: { old: true }, audience: 'ALL', createdBy: 'TUTOR' };
    txFindMany.mockResolvedValue([old]);
    const rows = await appendTutorEvents('a1', 0, [card]);
    expect(create).not.toHaveBeenCalled();
    expect(rows).toEqual([old]);
  });

  it('fase ENDED: não insere', async () => {
    findFirst.mockResolvedValue({ type: 'SESSION_ENDED' });
    expect(await appendTutorEvents('a1', 0, [card])).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('P2002 no create: resolve com as linhas relidas', async () => {
    running();
    create.mockRejectedValueOnce(p2002());
    const winner = { seq: 3, type: 'TUTOR_CARD', stepIndex: 0, payload: {}, audience: 'ALL', createdBy: 'TUTOR' };
    findMany.mockResolvedValue([winner, { ...winner, seq: 4, type: 'TUTOR_QUESTION' }]);
    const rows = await appendTutorEvents('a1', 0, [card]);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([winner]);
  });
});

describe('findEventBySeq', () => {
  it('filtra por agenda, seq e audiência', async () => {
    findFirst.mockResolvedValue(null);
    await findEventBySeq('a1', 9, ['ALL']);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agendaId: 'a1', seq: 9, audience: { in: ['ALL'] } } }),
    );
  });
});

describe('hasEvent', () => {
  it('consulta sem limite de seq e devolve true/false', async () => {
    findFirst.mockResolvedValueOnce({ seq: 7 });
    await expect(hasEvent('a1', 'SESSION_ENDED')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { agendaId: 'a1', type: 'SESSION_ENDED', audience: 'ALL' },
      select: { seq: true },
    });
    expect(findFirst.mock.calls[0][0].where).not.toHaveProperty('seq');
    findFirst.mockResolvedValueOnce(null);
    await expect(hasEvent('a1', 'SESSION_ENDED')).resolves.toBe(false);
  });
});

describe('appendEventsWith', () => {
  it('roda work depois do lock e grava os eventos devolvidos a partir de MAX+1', async () => {
    const work = vi.fn(async () => {
      calls.push('work');
      return { value: 'v', events: [ev, ev] };
    });
    const out = await appendEventsWith('a1', work);
    expect(calls).toEqual(['lock', 'read', 'read', 'work', 'max', 'insert:5', 'insert:6']);
    expect(out.value).toBe('v');
    expect(out.rows.map((r) => r.seq)).toEqual([5, 6]);
    expect(work).toHaveBeenCalledWith(tx, { phase: 'NOT_STARTED', currentStepIndex: null, audienceStepIndex: null });
  });

  it('events vazio: não insere', async () => {
    const out = await appendEventsWith('a1', async () => ({ value: 1, events: [] }));
    expect(out).toEqual({ value: 1, rows: [] });
    expect(calls.some((c) => c.startsWith('insert') || c === 'max')).toBe(false);
  });

  it('P2002 na primeira tentativa repete a transação inteira (work roda duas vezes)', async () => {
    create.mockRejectedValueOnce(p2002());
    const work = vi.fn(async () => ({ value: null, events: [ev] }));
    const out = await appendEventsWith('a1', work);
    expect(work).toHaveBeenCalledTimes(2);
    expect($transaction).toHaveBeenCalledTimes(2);
    expect(out.rows).toHaveLength(1);
  });
});

describe('findLastStalemateFailureAt', () => {
  it('consulta o reason no JSON e devolve createdAt', async () => {
    const at = new Date('2026-11-08T10:00:00Z');
    findFirst.mockResolvedValue({ createdAt: at });
    await expect(findLastStalemateFailureAt('a1')).resolves.toBe(at);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        agendaId: 'a1',
        type: 'TUTOR_SKIPPED',
        stepIndex: null,
        payload: { path: ['reason'], equals: 'STALEMATE_FAILED' },
      },
      orderBy: { seq: 'desc' },
      select: { createdAt: true },
    });
  });

  it('sem falha: null', async () => {
    await expect(findLastStalemateFailureAt('a1')).resolves.toBeNull();
  });
});

describe('appendStalemateFailure', () => {
  it('insere TUTOR_SKIPPED STALEMATE_FAILED para o professor', async () => {
    await appendStalemateFailure('a1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          agendaId: 'a1',
          seq: 5,
          type: 'TUTOR_SKIPPED',
          stepIndex: null,
          payload: { reason: 'STALEMATE_FAILED' },
          audience: 'TEACHER',
          createdBy: 'TUTOR',
        },
      }),
    );
  });
});
