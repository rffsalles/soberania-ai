import { describe, it, expect } from 'vitest';
import { listDisciplines, createDiscipline, updateDiscipline, type DisciplineDeps } from '../discipline-service';

const courses = [
  { id: 'co1', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' as const },
  { id: 'co2', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' as const },
];
const d1 = { id: 'd1', courseId: 'co1', code: 'BD101', name: 'Banco de Dados I', description: null, workloadHours: 80 };
const d2 = { id: 'd2', courseId: 'co1', code: 'ED101', name: 'Estruturas de Dados', description: null, workloadHours: 80 };

function makeDeps(rows = [d1, d2]) {
  const calls: { op: string; id?: string; data: unknown }[] = [];
  const deps: DisciplineDeps = {
    repo: {
      listDisciplines: async (filter) => {
        calls.push({ op: 'list', data: filter });
        return rows.map((r) => ({ ...r, course: { id: r.courseId, name: 'Curso', code: 'C' }, _count: { offerings: 0 } }));
      },
      findDisciplineById: async (id) => rows.find((r) => r.id === id) ?? null,
      findDisciplineByCourseAndCode: async (courseId, code) => rows.find((r) => r.courseId === courseId && r.code === code) ?? null,
      createDiscipline: async (data) => { calls.push({ op: 'create', data }); return { id: 'new', description: null, ...data }; },
      updateDiscipline: async (id, data) => { calls.push({ op: 'update', id, data }); return { id, courseId: 'co1', description: null, ...data }; },
    },
    courses: { findCourseById: async (id) => courses.find((c) => c.id === id) ?? null },
  };
  return { deps, calls };
}

const input = { courseId: 'co1', code: 'POO101', name: 'Programação OO', workloadHours: 60 };
const upd = { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 };

describe('discipline-service', () => {
  it('cria disciplina no curso', async () => {
    const { deps, calls } = makeDeps();
    await createDiscipline(input, deps);
    expect(calls[0]).toEqual({ op: 'create', data: input });
  });
  it('rejeita curso inexistente com 404', async () => {
    const { deps, calls } = makeDeps();
    await expect(createDiscipline({ ...input, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
    expect(calls).toHaveLength(0);
  });
  it('rejeita mesmo código no mesmo curso com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(createDiscipline({ ...input, code: 'BD101' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe uma disciplina com este código neste curso.' });
    expect(calls).toHaveLength(0);
  });
  it('aceita o mesmo código em outro curso', async () => {
    const { deps, calls } = makeDeps();
    await createDiscipline({ ...input, courseId: 'co2', code: 'BD101' }, deps);
    expect(calls[0]).toMatchObject({ op: 'create', data: { courseId: 'co2', code: 'BD101' } });
  });
  it('update mantém o próprio código e nunca envia courseId', async () => {
    const { deps, calls } = makeDeps();
    await updateDiscipline('d1', { ...upd, courseId: 'co2' } as never, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'd1' });
    expect(calls[0].data).not.toHaveProperty('courseId');
  });
  it('update rejeita código de outra disciplina do curso com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateDiscipline('d1', { ...upd, code: 'ED101' }, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });
  it('update de disciplina inexistente: 404', async () => {
    const { deps } = makeDeps();
    await expect(updateDiscipline('nope', upd, deps)).rejects.toMatchObject({ status: 404, message: 'Disciplina não encontrada.' });
  });
  it('repassa o filtro courseId ao repositório', async () => {
    const { deps, calls } = makeDeps();
    await listDisciplines({ courseId: 'co1' }, deps);
    expect(calls[0]).toEqual({ op: 'list', data: { courseId: 'co1' } });
  });
});
