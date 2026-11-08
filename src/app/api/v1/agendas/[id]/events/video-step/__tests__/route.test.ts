import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  appendVideoStep: vi.fn(),
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
  appendVideoStep: mocks.appendVideoStep,
}));

import { POST } from '../route';

const user = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const ctx = { params: Promise.resolve({ id: 'ag1' }) };

function post(body: unknown) {
  return POST(
    new Request('http://x/api/v1/agendas/ag1/events/video-step', { method: 'POST', body: JSON.stringify(body) }),
    ctx,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.after.mockImplementation((cb: () => unknown) => void cb());
});

describe('POST /api/v1/agendas/:id/events/video-step', () => {
  it('201 com o evento e agenda a tutora do passo', async () => {
    mocks.appendVideoStep.mockResolvedValue([{ seq: 3, type: 'STEP_CHANGED', stepIndex: 2 }]);
    const res = await post({ videoSeconds: 700 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, events: [{ seq: 3, type: 'STEP_CHANGED', stepIndex: 2 }] });
    expect(mocks.appendVideoStep).toHaveBeenCalledWith(user, 'ag1', 700);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runTutorForStepSafely).toHaveBeenCalledWith('ag1', 2);
  });

  it('sem evento novo: 201 e nada agendado', async () => {
    mocks.appendVideoStep.mockResolvedValue([]);
    const res = await post({ videoSeconds: 700 });
    expect(res.status).toBe(201);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each([{ videoSeconds: -1 }, { videoSeconds: 1.5 }, { videoSeconds: 'x' }, {}])(
    'corpo inválido %j: 400',
    async (body) => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(mocks.appendVideoStep).not.toHaveBeenCalled();
    },
  );
});
