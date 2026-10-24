import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/academic/services/subject-service', () => ({
  listSubjects: mocks.listSubjects,
  createSubject: mocks.createSubject,
  updateSubject: mocks.updateSubject,
}));

import { GET, POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const teacherUser = { id: 't1', role: Role.TEACHER, classId: null };
const subject = { id: 's1', disciplineId: 'cdisc0000001', classId: 'cclass000001' };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/subjects', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/subjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('GET aceita TEACHER e ADMIN e lista conforme o usuário', async () => {
    mocks.requireUser.mockResolvedValue(teacherUser);
    mocks.listSubjects.mockResolvedValue([subject]);
    const res = await GET(new Request('http://x/api/v1/admin/subjects'));
    expect(await res.json()).toEqual({ success: true, subjects: [subject] });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.TEACHER, Role.ADMIN]);
    expect(mocks.listSubjects).toHaveBeenCalledWith(teacherUser);
  });
  it('POST exige ADMIN e cria a oferta com teacherIds vazio por padrão', async () => {
    mocks.createSubject.mockResolvedValue(subject);
    const res = await POST(req('POST', { classId: 'cclass000001', disciplineId: 'cdisc0000001' }));
    expect(await res.json()).toEqual({ success: true, subject });
    expect(mocks.createSubject).toHaveBeenCalledWith({ classId: 'cclass000001', disciplineId: 'cdisc0000001', teacherIds: [] });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
  it('POST sem disciplineId devolve 400', async () => {
    const res = await POST(req('POST', { classId: 'cclass000001' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Selecione a disciplina' });
    expect(mocks.createSubject).not.toHaveBeenCalled();
  });
  it('PUT exige ADMIN, separa o id e descarta classId', async () => {
    mocks.updateSubject.mockResolvedValue(subject);
    const res = await PUT(req('PUT', { id: 's1', classId: 'cclass000001', teacherIds: ['t1'] }));
    expect(await res.json()).toEqual({ success: true, subject });
    expect(mocks.updateSubject).toHaveBeenCalledWith('s1', { teacherIds: ['t1'] });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });
});
