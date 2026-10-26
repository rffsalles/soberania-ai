import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), generateLessonContent: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/teaching/services/lesson-generation-service', () => ({
  generateLessonContent: mocks.generateLessonContent,
}));

import { POST } from '../route';

const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'l1' }) };
const post = () => new Request('http://x/api/v1/teacher/lessons/l1/generate', { method: 'POST' });

describe('POST /api/v1/teacher/lessons/[id]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacherUser);
  });

  it('generate devolve data do service', async () => {
    const data = { dailyObjective: 'Objetivo', timeScript: [], citations: [] };
    mocks.generateLessonContent.mockResolvedValue(data);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data });
    expect(mocks.generateLessonContent).toHaveBeenCalledWith('l1', teacherUser);
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.TEACHER, Role.ADMIN]);
  });

  it('422 do service vira 422', async () => {
    mocks.generateLessonContent.mockRejectedValue(new DomainError(422, 'sem conteúdo'));
    const res = await POST(post(), ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ success: false, error: 'sem conteúdo' });
  });
});
