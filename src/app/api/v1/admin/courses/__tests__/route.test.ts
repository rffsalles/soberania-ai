import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/academic/services/course-service', () => ({
  listCourses: mocks.listCourses,
  createCourse: mocks.createCourse,
  updateCourse: mocks.updateCourse,
}));

import { GET, POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const course = { id: 'co1', name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/courses', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/courses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('GET exige ADMIN e devolve os cursos', async () => {
    mocks.listCourses.mockResolvedValue([course]);
    const res = await GET(new Request('http://x/api/v1/admin/courses'));
    expect(await res.json()).toEqual({ success: true, courses: [course] });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
  it('POST exige ADMIN e aplica o nível padrão', async () => {
    mocks.createCourse.mockResolvedValue(course);
    const res = await POST(req('POST', { name: 'Engenharia', code: 'ES' }));
    expect(await res.json()).toEqual({ success: true, course });
    expect(mocks.createCourse).toHaveBeenCalledWith({ name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
  it('POST devolve 400 com a primeira mensagem do zod', async () => {
    const res = await POST(req('POST', { name: 'Engenharia', code: 'E' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Informe o código do curso' });
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });
  it('PUT exige ADMIN e separa o id', async () => {
    mocks.updateCourse.mockResolvedValue(course);
    const res = await PUT(req('PUT', { id: 'co1', name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' }));
    expect(await res.json()).toEqual({ success: true, course });
    expect(mocks.updateCourse).toHaveBeenCalledWith('co1', { name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
});
