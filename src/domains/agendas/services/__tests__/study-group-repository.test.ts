import { beforeEach, describe, expect, it, vi } from 'vitest';

const created = { id: 'new1', agendaId: 'a1', authorId: 'u1', content: 'oi', isAi: false };
const msgCreate = vi.fn();
const msgFindFirst = vi.fn();
const tx = { studyGroupMessage: { create: (a: unknown) => msgCreate(a), findFirst: (a: unknown) => msgFindFirst(a) } };

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/domains/classroom/class-event-repository', () => ({
  appendEventsWith: vi.fn(async (_id: string, work: (t: typeof tx, ctx: unknown) => Promise<{ value: unknown; events: unknown[] }>) => {
    const { value, events } = await work(tx, {});
    return { value, rows: events };
  }),
}));

import { appendEventsWith } from '@/domains/classroom/class-event-repository';
import { createMessage, createMessageIfLast } from '../study-group-repository';

const data = { agendaId: 'a1', authorId: 'u1', content: 'oi', isAi: false };

beforeEach(() => {
  vi.clearAllMocks();
  msgCreate.mockResolvedValue(created);
  msgFindFirst.mockResolvedValue(null);
});

describe('createMessage', () => {
  it('mensagem de aluno: evento GROUP_MESSAGE para todos, createdBy SYSTEM', async () => {
    const out = await createMessage(data);
    expect(out).toBe(created);
    expect(appendEventsWith).toHaveBeenCalledWith('a1', expect.any(Function));
    const work = vi.mocked(appendEventsWith).mock.calls[0][1];
    const res = await work(tx as never, {} as never);
    expect(res.events).toEqual([
      { type: 'GROUP_MESSAGE', stepIndex: null, payload: { messageId: 'new1' }, audience: 'ALL', createdBy: 'SYSTEM' },
    ]);
  });

  it('mensagem da IA: createdBy TUTOR', async () => {
    const work = async () => {
      await createMessage({ ...data, authorId: null, isAi: true });
      return vi.mocked(appendEventsWith).mock.calls[0][1];
    };
    const w = await work();
    const res = await w(tx as never, {} as never);
    expect(res.events[0]).toMatchObject({ type: 'GROUP_MESSAGE', createdBy: 'TUTOR', audience: 'ALL' });
  });
});

describe('createMessageIfLast', () => {
  it('outra última mensagem: não grava e não emite evento', async () => {
    msgFindFirst.mockResolvedValue({ id: 'm2' });
    const out = await createMessageIfLast(data, 'm1');
    expect(out).toBeNull();
    expect(msgCreate).not.toHaveBeenCalled();
    expect(msgFindFirst).toHaveBeenCalledWith({
      where: { agendaId: 'a1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const work = vi.mocked(appendEventsWith).mock.calls[0][1];
    msgFindFirst.mockResolvedValue({ id: 'm2' });
    expect((await work(tx as never, {} as never)).events).toEqual([]);
  });

  it('sem mensagens: não grava', async () => {
    expect(await createMessageIfLast(data, 'm1')).toBeNull();
    expect(msgCreate).not.toHaveBeenCalled();
  });

  it('última é a esperada: grava mensagem e evento', async () => {
    msgFindFirst.mockResolvedValue({ id: 'm1' });
    const out = await createMessageIfLast(data, 'm1');
    expect(out).toBe(created);
    const work = vi.mocked(appendEventsWith).mock.calls[0][1];
    const res = await work(tx as never, {} as never);
    expect(res.events).toEqual([
      { type: 'GROUP_MESSAGE', stepIndex: null, payload: { messageId: 'new1' }, audience: 'ALL', createdBy: 'SYSTEM' },
    ]);
  });
});
