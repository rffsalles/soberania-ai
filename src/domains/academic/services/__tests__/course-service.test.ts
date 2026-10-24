import { describe, it, expect } from 'vitest';
import { listCourses, createCourse, updateCourse, type CourseDeps } from '../course-service';

const ads = { id: 'co1', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' as const };
const em = { id: 'co2', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' as const };
const input = { name: 'Engenharia de Software', code: 'ES', academicLevel: 'HIGHER_EDUCATION' as const };

function makeDeps(rows = [ads, em]) {
  const calls: { op: string; id?: string; data: unknown }[] = [];
  const deps: CourseDeps = {
    repo: {
      listCourses: async () => rows.map((r, i) => ({ ...r, _count: { disciplines: i + 3, classes: i + 1 } })),
      findCourseById: async (id) => rows.find((r) => r.id === id) ?? null,
      findCourseByCode: async (code) => rows.find((r) => r.code === code) ?? null,
      createCourse: async (data) => { calls.push({ op: 'create', data }); return { id: 'new', ...data }; },
      updateCourse: async (id, data) => { calls.push({ op: 'update', id, data }); return { id, ...data }; },
    },
  };
  return { deps, calls };
}

describe('course-service', () => {
  it('lista com contagens', async () => {
    const result = await listCourses(makeDeps().deps);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c._count)).toEqual([
      { disciplines: 3, classes: 1 },
      { disciplines: 4, classes: 2 },
    ]);
  });
  it('cria curso com código inédito', async () => {
    const { deps, calls } = makeDeps();
    await createCourse(input, deps);
    expect(calls[0]).toEqual({ op: 'create', data: input });
  });
  it('rejeita código duplicado com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(createCourse({ ...input, code: 'ADS' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe um curso com este código.' });
    expect(calls).toHaveLength(0);
  });
  it('atualiza mantendo o próprio código', async () => {
    const { deps, calls } = makeDeps();
    await updateCourse('co1', { ...input, code: 'ADS' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'co1', data: { code: 'ADS' } });
  });
  it('rejeita no update o código de outro curso com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateCourse('co1', { ...input, code: 'EM' }, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });
  it('rejeita update de curso inexistente com 404', async () => {
    const { deps } = makeDeps();
    await expect(updateCourse('nope', input, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
  });
});
