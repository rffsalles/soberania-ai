import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createPlan: vi.fn(),
  listPlansForTeacher: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/teaching/services/teaching-plan-service', () => ({
  createPlan: mocks.createPlan,
  listPlansForTeacher: mocks.listPlansForTeacher,
}));

import { POST } from '../route';

const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };

function post(body: unknown) {
  return new Request('http://x/api/v1/teacher/plans', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/v1/teacher/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacherUser);
  });

  it('devolve 400 em pt-BR sem subjectId e não chama createPlan', async () => {
    const res = await POST(post({ syllabus: 'x' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Selecione a oferta' });
    expect(mocks.createPlan).not.toHaveBeenCalled();
  });

  it('descarta academicPeriodId e delega a createPlan', async () => {
    const plan = { id: 'p1' };
    mocks.createPlan.mockResolvedValue(plan);
    const res = await POST(post({ subjectId: 's1', syllabus: 'x', academicPeriodId: 'ap1', totalHours: 80, theoryHours: 60, practiceHours: 20 }));
    expect(await res.json()).toEqual({ success: true, plan });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.createPlan.mock.calls[0][0]).toBe(teacherUser);
    expect(mocks.createPlan.mock.calls[0][1]).not.toHaveProperty('academicPeriodId');
    expect(mocks.createPlan.mock.calls[0][1]).not.toHaveProperty('totalHours');
    expect(mocks.createPlan.mock.calls[0][1]).toMatchObject({ subjectId: 's1', theoryHours: 60, practiceHours: 20 });
  });
});
