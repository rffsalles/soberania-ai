import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { createStudent, listStudents, listStudentsByClass, setStudentClass, type StudentDeps } from '../student-service';

const klass = { id: 'c1', name: 'Turma 1', code: 'T1' };
const stu = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Aluno ${id}`, email: `${id}@x.com`, enrollment: `M${id}`, classId: null as string | null, createdAt: new Date(0), ...over,
});

function makeDeps() {
  const calls: { op: string; data: unknown }[] = [];
  const users = [stu('s1', { classId: 'c1' }), stu('s2')];
  const hash = vi.fn(async (p: string) => `hash:${p}`);
  const deps: StudentDeps = {
    repo: {
      listStudentsByClass: async (classId) => users.filter((u) => u.classId === classId),
      listStudents: async () => users.map((u) => ({ ...u, class: null })),
      findStudentById: async (id) => {
        const u = users.find((x) => x.id === id);
        return u ? { ...u, role: id === 'teacher' ? Role.TEACHER : Role.STUDENT } : null;
      },
      findUserByEmailOrEnrollment: async (email, enrollment) =>
        users.find((u) => u.email === email || u.enrollment === enrollment) ?? null,
      createStudent: async (data) => { calls.push({ op: 'create', data }); return stu('new', { name: data.name, classId: data.classId }); },
      setStudentClass: async (id, classId) => { calls.push({ op: 'set', data: { id, classId } }); return stu(id, { classId }); },
    },
    classes: { findClassById: (async (id: string) => (id === 'c1' ? klass : null)) as unknown as StudentDeps['classes']['findClassById'] },
    hash,
  };
  return { deps, calls, hash, users };
}

const input = { name: 'Novo', email: 'novo@x.com', enrollment: 'N100', password: 'segredo123', classId: 'c1' };

describe('listStudentsByClass', () => {
  it('lista os alunos da turma', async () => {
    const { deps } = makeDeps();
    expect(await listStudentsByClass('c1', deps)).toHaveLength(1);
  });
  it('404 para turma inexistente', async () => {
    const { deps } = makeDeps();
    await expect(listStudentsByClass('nope', deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
  });
});

describe('listStudents', () => {
  it('lista todos', async () => {
    const { deps } = makeDeps();
    expect(await listStudents(deps)).toHaveLength(2);
  });
});

describe('createStudent', () => {
  it('cria com hash e sem vazar passwordHash', async () => {
    const { deps, calls, hash } = makeDeps();
    const res = await createStudent(input, deps);
    expect(hash).toHaveBeenCalledWith('segredo123');
    expect(calls).toEqual([{ op: 'create', data: { name: 'Novo', email: 'novo@x.com', enrollment: 'N100', passwordHash: 'hash:segredo123', classId: 'c1' } }]);
    expect(res).not.toHaveProperty('passwordHash');
  });
  it('404 turma', async () => {
    const { deps, calls } = makeDeps();
    await expect(createStudent({ ...input, classId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
    expect(calls).toHaveLength(0);
  });
  it('409 e-mail duplicado', async () => {
    const { deps, calls, hash } = makeDeps();
    await expect(createStudent({ ...input, email: 's1@x.com' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe um usuário com este e-mail.' });
    expect(calls).toHaveLength(0);
    expect(hash).not.toHaveBeenCalled();
  });
  it('409 matrícula duplicada', async () => {
    const { deps } = makeDeps();
    await expect(createStudent({ ...input, enrollment: 'Ms2' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe um usuário com esta matrícula.' });
  });
});

describe('setStudentClass', () => {
  it('matricula na turma', async () => {
    const { deps, calls } = makeDeps();
    const res = await setStudentClass('s2', 'c1', deps);
    expect(calls).toEqual([{ op: 'set', data: { id: 's2', classId: 'c1' } }]);
    expect(res.classId).toBe('c1');
    expect(res).not.toHaveProperty('passwordHash');
  });
  it('desvincula com null sem consultar turma', async () => {
    const { deps, calls } = makeDeps();
    await setStudentClass('s1', null, deps);
    expect(calls).toEqual([{ op: 'set', data: { id: 's1', classId: null } }]);
  });
  it('404 aluno inexistente ou não aluno', async () => {
    const { deps } = makeDeps();
    await expect(setStudentClass('nope', 'c1', deps)).rejects.toMatchObject({ status: 404, message: 'Aluno não encontrado.' });
  });
  it('404 turma inexistente', async () => {
    const { deps, calls } = makeDeps();
    await expect(setStudentClass('s2', 'nope', deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
    expect(calls).toHaveLength(0);
  });
});
