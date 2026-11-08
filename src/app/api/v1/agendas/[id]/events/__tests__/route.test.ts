import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  appendTeacherEvent: vi.fn(),
  listEventsAfter: vi.fn(),
  stalledTutorStepFor: vi.fn(),
  runTutorForStepSafely: vi.fn(),
  after: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/domains/classroom/tutor-step-worker', () => ({
  runTutorForStepSafely: mocks.runTutorForStepSafely,
}));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-event-service', () => ({
  appendTeacherEvent: mocks.appendTeacherEvent,
  listEventsAfter: mocks.listEventsAfter,
  stalledTutorStepFor: mocks.stalledTutorStepFor,
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
  mocks.stalledTutorStepFor.mockResolvedValue(null);
  mocks.after.mockImplementation((cb: () => unknown) => void cb());
});

describe('POST /api/v1/agendas/:id/events', () => {
  it('exige professor/admin e repassa type, stepIndex e payload', async () => {
    mocks.appendTeacherEvent.mockResolvedValue({ events: [{ seq: 1, type: 'TEACHER_NOTE', stepIndex: null, payload: {} }], warning: null });
    const res = await post({ type: 'STEP_CHANGED', stepIndex: 2, payload: { a: 1 } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      events: [{ seq: 1, type: 'TEACHER_NOTE', stepIndex: null, payload: {} }],
      warning: null,
    });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(Request), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.appendTeacherEvent).toHaveBeenCalledWith(user, 'ag1', {
      type: 'STEP_CHANGED',
      stepIndex: 2,
      payload: { a: 1 },
    });
  });

  it('STEP_CHANGED agenda o worker no passo escrito', async () => {
    mocks.appendTeacherEvent.mockResolvedValue({
      events: [{ seq: 5, type: 'STEP_CHANGED', stepIndex: 0, payload: {} }],
      warning: null,
    });
    await post({ type: 'SESSION_STARTED' });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runTutorForStepSafely).toHaveBeenCalledWith('ag1', 0);
  });

  it('MUTE não agenda o worker e o warning vai no corpo', async () => {
    mocks.appendTeacherEvent.mockResolvedValue({
      events: [{ seq: 6, type: 'TEACHER_NOTE', stepIndex: 0, payload: { tutor: 'MUTE' } }],
      warning: 'aviso',
    });
    const res = await post({ type: 'TEACHER_NOTE' });
    expect(mocks.after).not.toHaveBeenCalled();
    expect((await res.json()).warning).toBe('aviso');
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

describe('GET /events: disparo sob demanda', () => {
  beforeEach(() => mocks.listEventsAfter.mockResolvedValue({ events: [], lastSeq: 0, closed: false }));

  it('passo parado agenda o worker', async () => {
    mocks.stalledTutorStepFor.mockResolvedValue(2);
    await get();
    expect(mocks.stalledTutorStepFor).toHaveBeenCalledWith(user, 'ag1', expect.any(Number));
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runTutorForStepSafely).toHaveBeenCalledWith('ag1', 2);
  });

  it('sem passo parado não agenda', async () => {
    await get();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('aula encerrada (closed) nem checa passo parado', async () => {
    mocks.listEventsAfter.mockResolvedValue({ events: [], lastSeq: 0, closed: true });
    mocks.stalledTutorStepFor.mockResolvedValue(2);
    await get();
    expect(mocks.stalledTutorStepFor).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
