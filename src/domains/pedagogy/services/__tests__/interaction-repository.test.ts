import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    studentInteraction: { findFirst: mocks.findFirst, findMany: mocks.findMany, create: mocks.create },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  countClassAnswers,
  findLastInteraction,
  insertClassAnswer,
  listInteractionsByAgenda,
  listRecentInteractions,
} from '../interaction-repository';

beforeEach(() => vi.clearAllMocks());

describe('consultas do chat ignoram respostas a eventos', () => {
  it('findLastInteraction filtra classEventSeq: null', async () => {
    mocks.findFirst.mockResolvedValue(null);
    await findLastInteraction('ag1', 's1');
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ agendaId: 'ag1', studentId: 's1', classEventSeq: null });
  });

  it('listRecentInteractions filtra classEventSeq: null', async () => {
    mocks.findMany.mockResolvedValue([]);
    await listRecentInteractions('ag1', 's1', 5);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ classEventSeq: null });
  });

  it('listInteractionsByAgenda (FAQ) filtra classEventSeq: null', async () => {
    mocks.findMany.mockResolvedValue([]);
    await listInteractionsByAgenda('ag1');
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ agendaId: 'ag1', classEventSeq: null });
  });
});

describe('insertClassAnswer', () => {
  const data = {
    agendaId: 'ag1',
    studentId: 's1',
    type: 'SOCRATIC_CHALLENGE' as const,
    questionText: 'q',
    responseText: 'r',
    classEventSeq: 4,
  };

  it('CREATED quando grava', async () => {
    mocks.create.mockResolvedValue({});
    expect(await insertClassAnswer(data)).toBe('CREATED');
  });

  it('P2002 vira DUPLICATE', async () => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect(await insertClassAnswer(data)).toBe('DUPLICATE');
  });

  it('outros erros propagam', async () => {
    mocks.create.mockRejectedValue(new Error('boom'));
    await expect(insertClassAnswer(data)).rejects.toThrow('boom');
  });
});

describe('countClassAnswers', () => {
  it('sem seqs não consulta', async () => {
    expect(await countClassAnswers('ag1', [])).toEqual([]);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it('devolve as linhas da consulta', async () => {
    mocks.queryRaw.mockResolvedValue([{ seq: 4, answered: 3, correct: 2 }]);
    expect(await countClassAnswers('ag1', [4, 9])).toEqual([{ seq: 4, answered: 3, correct: 2 }]);
  });
});
