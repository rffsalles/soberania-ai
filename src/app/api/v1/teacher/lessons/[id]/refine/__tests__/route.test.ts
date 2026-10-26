import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), refineLessonField: vi.fn() }));

vi.mock('@/lib/auth/request-user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/request-user')>()),
  requireUser: mocks.requireUser,
}));
vi.mock('@/domains/teaching/services/lesson-generation-service', () => ({
  refineLessonField: mocks.refineLessonField,
}));

import { POST } from '../route';

const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };
const ctx = { params: Promise.resolve({ id: 'l1' }) };
const post = (body: unknown) =>
  new Request('http://x/api/v1/teacher/lessons/l1/refine', { method: 'POST', body: JSON.stringify(body) });

describe('POST /api/v1/teacher/lessons/[id]/refine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(teacherUser);
  });

  it('refine sem stepIndex para timeScript devolve 400 "Pedido de refino inválido."', async () => {
    const res = await POST(post({ field: 'timeScript', instruction: 'x', current: 'y' }), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Pedido de refino inválido.' });
    expect(mocks.refineLessonField).not.toHaveBeenCalled();
  });

  it('refine com stepIndex em campo que não é timeScript, campo desconhecido ou corpo ausente → 400', async () => {
    for (const body of [
      { field: 'methodology', stepIndex: 0, instruction: 'x', current: 'y' },
      { field: 'resourcesNeeded', instruction: 'x', current: 'y' },
      { field: 'methodology', instruction: '   ', current: 'y' },
      null,
    ]) {
      const res = await POST(post(body), ctx);
      expect(res.status).toBe(400);
    }
    expect(mocks.refineLessonField).not.toHaveBeenCalled();
  });

  it('refine válido delega ao service e devolve text', async () => {
    mocks.refineLessonField.mockResolvedValue({ text: 'Novo texto' });
    const body = { field: 'timeScript', stepIndex: 1, instruction: 'mais curta', current: 'Antiga' };
    const res = await POST(post(body), ctx);
    expect(await res.json()).toEqual({ success: true, text: 'Novo texto' });
    expect(mocks.refineLessonField).toHaveBeenCalledWith('l1', teacherUser, body);
  });

  it('erro do service é propagado', async () => {
    mocks.refineLessonField.mockRejectedValue(new DomainError(503, 'indisponível'));
    const res = await POST(post({ field: 'methodology', instruction: 'x', current: 'y' }), ctx);
    expect(res.status).toBe(503);
  });
});
