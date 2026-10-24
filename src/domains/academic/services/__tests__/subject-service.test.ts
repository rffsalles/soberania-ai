import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { createSubject, updateSubject, listSubjects, getOfferingContext, assertTeacherAssigned, type SubjectDeps } from '../subject-service';

const teacher = { id: 't1', role: Role.TEACHER };
const otherTeacher = { id: 't2', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };
const disc = (id: string, courseId: string) => ({ id, courseId, code: id, name: id, description: null, workloadHours: 80 });
const disciplines: Record<string, ReturnType<typeof disc>> = { d1: disc('d1', 'co1'), d2: disc('d2', 'co2'), d3: disc('d3', 'co1') };
const ctxRow = {
  discipline: { name: 'Banco de Dados I', workloadHours: 80 },
  class: { course: { name: 'Análise e Desenvolvimento de Sistemas' }, academicPeriod: { name: '1º Semestre / 2026 (2026.1)' } },
};

function makeDeps() {
  const calls: { op: string; id?: string; data?: unknown; teacherIds?: string[] }[] = [];
  const offerings = [{ id: 's1', disciplineId: 'd1', classId: 'c1' }];
  const deps: SubjectDeps = {
    repo: {
      listSubjects: async (where) => { calls.push({ op: 'list', data: where }); return []; },
      findSubjectById: async (id) => offerings.find((o) => o.id === id) ?? null,
      findSubjectByDisciplineAndClass: async (d, c) => offerings.find((o) => o.disciplineId === d && o.classId === c) ?? null,
      findOfferingContext: async (id) => (id === 's1' ? ctxRow : null),
      createSubjectWithTeachers: async (data, teacherIds) => { calls.push({ op: 'create', data, teacherIds }); return { id: 'new' } as never; },
      replaceSubjectTeachers: async (id, teacherIds) => { calls.push({ op: 'update', id, teacherIds }); return { id } as never; },
    },
    classes: { findClassById: async (id) => (id === 'c1' ? ({ id: 'c1', courseId: 'co1' } as never) : null) },
    disciplines: { findDisciplineById: async (id) => disciplines[id] ?? null },
    assignments: { isTeacherAssigned: async (t, s) => t === 't1' && s === 's1' },
  };
  return { deps, calls };
}

describe('createSubject (oferta)', () => {
  it('cria a oferta só com disciplina, turma e professores', async () => {
    const { deps, calls } = makeDeps();
    await createSubject({ classId: 'c1', disciplineId: 'd3', teacherIds: ['t1'] }, deps);
    expect(calls[0]).toEqual({ op: 'create', data: { disciplineId: 'd3', classId: 'c1' }, teacherIds: ['t1'] });
  });
  it('400 para disciplina de outro curso', async () => {
    const { deps, calls } = makeDeps();
    await expect(createSubject({ classId: 'c1', disciplineId: 'd2', teacherIds: [] }, deps))
      .rejects.toMatchObject({ status: 400, message: 'A disciplina não pertence ao curso da turma.' });
    expect(calls).toHaveLength(0);
  });
  it('409 para oferta duplicada', async () => {
    const { deps } = makeDeps();
    await expect(createSubject({ classId: 'c1', disciplineId: 'd1', teacherIds: [] }, deps))
      .rejects.toMatchObject({ status: 409, message: 'Esta disciplina já é ofertada nesta turma.' });
  });
  it('404 para turma ou disciplina inexistente', async () => {
    const { deps } = makeDeps();
    await expect(createSubject({ classId: 'nope', disciplineId: 'd1', teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
    await expect(createSubject({ classId: 'c1', disciplineId: 'nope', teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Disciplina não encontrada.' });
  });
});

describe('updateSubject (oferta)', () => {
  it('só sincroniza professores, ignorando turma e disciplina', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { teacherIds: ['t2'], classId: 'c9', disciplineId: 'd9' } as never, deps);
    expect(calls).toEqual([{ op: 'update', id: 's1', teacherIds: ['t2'] }]);
  });
  it('404 para oferta inexistente', async () => {
    const { deps } = makeDeps();
    await expect(updateSubject('nope', { teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
  });
});

describe('listSubjects', () => {
  it('TEACHER recebe só as ofertas em que está alocado', async () => {
    const { deps, calls } = makeDeps();
    await listSubjects(teacher, deps);
    expect(calls[0].data).toEqual({ teacherAssignments: { some: { teacherId: 't1' } } });
  });
  it('ADMIN recebe todas', async () => {
    const { deps, calls } = makeDeps();
    await listSubjects(admin, deps);
    expect(calls[0].data).toEqual({});
  });
});

describe('assertTeacherAssigned', () => {
  it('passa para professor alocado e para ADMIN', async () => {
    const { deps } = makeDeps();
    await expect(assertTeacherAssigned(teacher, 's1', deps)).resolves.toBeUndefined();
    await expect(assertTeacherAssigned(admin, 's1', deps)).resolves.toBeUndefined();
  });
  it('403 para professor não alocado', async () => {
    const { deps } = makeDeps();
    await expect(assertTeacherAssigned(otherTeacher, 's1', deps)).rejects.toMatchObject({ status: 403, message: 'Você não está alocado a esta oferta.' });
  });
});

describe('getOfferingContext', () => {
  const expected = { subjectName: 'Banco de Dados I', courseName: 'Análise e Desenvolvimento de Sistemas', academicPeriod: '1º Semestre / 2026 (2026.1)', workloadHours: 80 };
  it('devolve disciplina, curso, período e carga horária para o professor alocado e para o ADMIN', async () => {
    const { deps } = makeDeps();
    expect(await getOfferingContext('s1', teacher, deps)).toEqual(expected);
    expect(await getOfferingContext('s1', admin, deps)).toEqual(expected);
  });
  it('403 para professor não alocado; 404 para oferta inexistente', async () => {
    const { deps } = makeDeps();
    await expect(getOfferingContext('s1', otherTeacher, deps)).rejects.toMatchObject({ status: 403, message: 'Você não está alocado a esta oferta.' });
    await expect(getOfferingContext('nope', teacher, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
  });
});
