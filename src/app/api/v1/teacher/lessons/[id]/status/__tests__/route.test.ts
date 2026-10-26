import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), setLessonStatus: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/teaching/services/lesson-service', () => ({ setLessonStatus: mocks.setLessonStatus }));

import { PUT } from '../route';

const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'l1' }) };
const put = (body: unknown) =>
  new Request('http://x/api/v1/teacher/lessons/l1/status', { method: 'PUT', body: JSON.stringify(body) });

describe('PUT /api/v1/teacher/lessons/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacherUser);
  });

  it('PUT status com valor desconhecido devolve 400 "Status inválido."', async () => {
    const res = await PUT(put({ status: 'ARCHIVED' }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Status inválido.' });
    expect(mocks.setLessonStatus).not.toHaveBeenCalled();
  });

  it('PUT status delega a setLessonStatus', async () => {
    const lesson = { id: 'l1', status: 'PUBLISHED' };
    mocks.setLessonStatus.mockResolvedValue(lesson);
    const res = await PUT(put({ status: 'PUBLISHED' }), ctx);
    expect(await res.json()).toEqual({ success: true, lesson });
    expect(mocks.setLessonStatus).toHaveBeenCalledWith('l1', teacherUser, 'PUBLISHED');
  });
});
