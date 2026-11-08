import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getClassPulse: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/classroom/class-answer-service', () => ({ getClassPulse: mocks.getClassPulse }));

import { GET } from '../route';

const ctx = { params: Promise.resolve({ id: 'ag1' }) };
const user = { id: 't1', role: Role.TEACHER, classId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('GET /api/v1/agendas/:id/pulse', () => {
  it('exige TEACHER/ADMIN e devolve o pulso', async () => {
    const pulse = [{ seq: 4, stepIndex: 1, kind: 'MULTIPLE_CHOICE', answered: 3, correct: 2 }];
    mocks.getClassPulse.mockResolvedValue(pulse);
    const res = await GET(new Request('http://x/api/v1/agendas/ag1/pulse'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, pulse });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.any(Request), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.getClassPulse).toHaveBeenCalledWith(user, 'ag1');
  });

  it('papel não permitido: o erro do requireUser vira resposta', async () => {
    const { AuthError } = await import('@/lib/auth/request-user');
    mocks.requireUser.mockRejectedValue(new AuthError(403, 'Acesso negado'));
    const res = await GET(new Request('http://x/api/v1/agendas/ag1/pulse'), ctx);
    expect(res.status).toBe(403);
    expect(mocks.getClassPulse).not.toHaveBeenCalled();
  });
});
