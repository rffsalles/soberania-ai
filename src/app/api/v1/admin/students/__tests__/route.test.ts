import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listStudents: vi.fn(),
  listStudentsByClass: vi.fn(),
  createStudent: vi.fn(),
  setStudentClass: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({
  requireUser: mocks.requireUser,
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));
vi.mock('@/domains/academic/services/student-service', () => ({
  listStudents: mocks.listStudents,
  listStudentsByClass: mocks.listStudentsByClass,
  createStudent: mocks.createStudent,
  setStudentClass: mocks.setStudentClass,
}));

import { GET, POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const CLASS_ID = 'cjld2cjxh0000qzrmn831i7rn';
const student = { id: 's1', name: 'Ana Souza', email: 'ana@x.com', enrollment: '2026001', classId: CLASS_ID };
const payload = { name: 'Ana Souza', email: 'ana@x.com', enrollment: '2026001', password: '12345678', classId: CLASS_ID };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/students', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/students', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('GET sem classId lista todos', async () => {
    mocks.listStudents.mockResolvedValue([student]);
    const res = await GET(new Request('http://x/api/v1/admin/students'));
    expect(await res.json()).toEqual({ success: true, students: [student] });
    expect(mocks.listStudentsByClass).not.toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });

  it('GET com classId filtra pela turma', async () => {
    mocks.listStudentsByClass.mockResolvedValue([student]);
    const res = await GET(new Request(`http://x/api/v1/admin/students?classId=${CLASS_ID}`));
    expect(await res.json()).toEqual({ success: true, students: [student] });
    expect(mocks.listStudentsByClass).toHaveBeenCalledWith(CLASS_ID);
    expect(mocks.listStudents).not.toHaveBeenCalled();
  });

  it('GET propaga 404 de turma', async () => {
    mocks.listStudentsByClass.mockRejectedValue(new DomainError(404, 'Turma não encontrada.'));
    const res = await GET(new Request('http://x/api/v1/admin/students?classId=zzz'));
    expect(res.status).toBe(404);
  });

  it('POST cria o aluno', async () => {
    mocks.createStudent.mockResolvedValue(student);
    const res = await POST(req('POST', payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, student });
    expect(mocks.createStudent).toHaveBeenCalledWith(payload);
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });

  it('POST inválido devolve 400 com a mensagem', async () => {
    const res = await POST(req('POST', { ...payload, password: '123' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'A senha deve ter no mínimo 8 caracteres' });
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it('POST propaga 409', async () => {
    mocks.createStudent.mockRejectedValue(new DomainError(409, 'Já existe um usuário com este e-mail.'));
    const res = await POST(req('POST', payload));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'Já existe um usuário com este e-mail.' });
  });

  it('PUT matricula o aluno', async () => {
    mocks.setStudentClass.mockResolvedValue(student);
    const res = await PUT(req('PUT', { id: 's1', classId: CLASS_ID }));
    expect(await res.json()).toEqual({ success: true, student });
    expect(mocks.setStudentClass).toHaveBeenCalledWith('s1', CLASS_ID);
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });

  it('PUT com classId null desvincula', async () => {
    mocks.setStudentClass.mockResolvedValue({ ...student, classId: null });
    const res = await PUT(req('PUT', { id: 's1', classId: null }));
    expect(res.status).toBe(200);
    expect(mocks.setStudentClass).toHaveBeenCalledWith('s1', null);
  });

  it('PUT inválido devolve 400 e 404 é propagado', async () => {
    const bad = await PUT(req('PUT', { id: '', classId: null }));
    expect(bad.status).toBe(400);
    mocks.setStudentClass.mockRejectedValue(new DomainError(404, 'Aluno não encontrado.'));
    const res = await PUT(req('PUT', { id: 's9', classId: null }));
    expect(res.status).toBe(404);
  });
});
