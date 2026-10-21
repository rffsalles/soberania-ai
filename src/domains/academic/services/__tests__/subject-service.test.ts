import { describe, it, expect } from 'vitest';
import { createSubject, updateSubject, type SubjectDeps } from '../subject-service';

const base = {
  name: 'Cálculo',
  code: 'MAT01',
  courseName: 'Engenharia',
  academicLevel: 'HIGHER_EDUCATION',
  academicYear: 2026,
  teacherIds: ['t1'],
};

function makeDeps(existingClassIds: string[] = ['c1']) {
  const calls: { op: string; id?: string; data: Record<string, unknown>; teacherIds: string[] }[] = [];
  const deps: SubjectDeps = {
    repo: {
      listSubjects: async () => [],
      createSubjectWithTeachers: async (data, teacherIds) => {
        calls.push({ op: 'create', data: data as Record<string, unknown>, teacherIds });
        return { id: 's1' } as never;
      },
      replaceSubjectTeachers: async (id, data, teacherIds) => {
        calls.push({ op: 'update', id, data: data as Record<string, unknown>, teacherIds });
        return { id } as never;
      },
    },
    classes: {
      findClassById: async (id) =>
        existingClassIds.includes(id) ? { id, name: 'Turma', code: 'T1', semester: 1, year: 2026 } : null,
    },
  };
  return { deps, calls };
}

describe('createSubject', () => {
  it('vincula a disciplina à turma informada', async () => {
    const { deps, calls } = makeDeps();
    await createSubject({ ...base, classId: 'c1' }, deps);
    expect(calls[0].data.class).toEqual({ connect: { id: 'c1' } });
    expect(calls[0].data).not.toHaveProperty('classId');
    expect(calls[0].teacherIds).toEqual(['t1']);
  });

  it('cria sem turma quando classId não é informado', async () => {
    const { deps, calls } = makeDeps();
    await createSubject(base, deps);
    expect(calls[0].data).not.toHaveProperty('class');
  });

  it('rejeita turma inexistente com 404', async () => {
    const { deps, calls } = makeDeps([]);
    await expect(createSubject({ ...base, classId: 'nope' }, deps)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });
});

describe('updateSubject', () => {
  it('troca a turma quando classId é informado', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { ...base, classId: 'c1' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 's1', data: { class: { connect: { id: 'c1' } } } });
  });

  it('desvincula a turma quando classId é null', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { ...base, classId: null }, deps);
    expect(calls[0].data.class).toEqual({ disconnect: true });
  });

  it('mantém a turma quando classId é omitido', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', base, deps);
    expect(calls[0].data).not.toHaveProperty('class');
  });
});
