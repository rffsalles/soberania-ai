import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  appendTeacherEvent: vi.fn(),
  listEventsAfter: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-event-service', () => ({
  appendTeacherEvent: mocks.appendTeacherEvent,
  listEventsAfter: mocks.listEventsAfter,
}));

import { GET, POST } from '../route';

const user = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'ag1' }) };

function post(body: unknown) {
  return POST(
    new Request('http://x/api/v1/agendas/ag1/events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    ctx
  );
}

function get(query = '') {
  return GET(new Request(`http://x/api/v1/agendas/ag1/events${query}`), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('POST /api/v1/agendas/:id/events', () => {
  it('exige professor/admin e repassa type, stepIndex e payload', async () => {
    mocks.appendTeacherEvent.mockResolvedValue([{ seq: 1 }]);
    const res = await post({ type: 'STEP_CHANGED', stepIndex: 2, payload: { a: 1 } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, events: [{ seq: 1 }] });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(Request), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.appendTeacherEvent).toHaveBeenCalledWith(user, 'ag1', {
      type: 'STEP_CHANGED',
      stepIndex: 2,
      payload: { a: 1 },
    });
  });

  it('DomainError 409 vira 409 com details.code', async () => {
    mocks.appendTeacherEvent.mockRejectedValue(
      new DomainError(409, 'Aula encerrada', { code: 'CLASS_ENDED' })
    );
    const res = await post({ type: 'STEP_CHANGED' });
    expect(res.status).toBe(409);
    expect((await res.json()).details.code).toBe('CLASS_ENDED');
  });

  it('body sem type devolve 400', async () => {
    const res = await post({ stepIndex: 1 });
    expect(res.status).toBe(400);
    expect(mocks.appendTeacherEvent).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/agendas/:id/events', () => {
  it('usa requireUser sem papéis e after inválido vira 0', async () => {
    mocks.listEventsAfter.mockResolvedValue({ events: [], lastSeq: 0, closed: true });
    const res = await get('?after=abc');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, events: [], lastSeq: 0, closed: true });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.listEventsAfter).toHaveBeenCalledWith(user, 'ag1', 0);
  });

  it('after=12 é repassado como 12', async () => {
    mocks.listEventsAfter.mockResolvedValue({ events: [], lastSeq: 12 });
    await get('?after=12');
    expect(mocks.listEventsAfter).toHaveBeenCalledWith(user, 'ag1', 12);
  });

  it('sem after usa 0', async () => {
    mocks.listEventsAfter.mockResolvedValue({ events: [], lastSeq: 0 });
    await get();
    expect(mocks.listEventsAfter).toHaveBeenCalledWith(user, 'ag1', 0);
  });
});
