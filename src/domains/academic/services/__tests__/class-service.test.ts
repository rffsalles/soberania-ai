import { describe, it, expect } from 'vitest';
import { createClass, updateClass, type ClassDeps } from '../class-service';

const course = (id: string) => ({ id, name: 'ADS', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' as const });
const period = (id: string) => ({ id, name: `Período ${id}`, code: id, year: 2026 });
const klass = (id: string, code: string, courseId = 'co1', academicPeriodId = 'p1') => ({
  id, name: `Turma ${id}`, code, semester: 3, courseId, academicPeriodId, course: course(courseId), academicPeriod: period(academicPeriodId),
});
const c1 = klass('c1', 'ADS-2026-3A');
const c2 = klass('c2', 'ADS-2026-1A');

function makeDeps(offerings: Record<string, number> = { c1: 2 }) {
  const calls: { op: string; id?: string; data: Record<string, unknown> }[] = [];
  const deps: ClassDeps = {
    repo: {
      listClasses: async () => [c1, c2].map((r) => ({ ...r, _count: { students: 0, subjects: 0 } })),
      findClassById: async (id) => [c1, c2].find((r) => r.id === id) ?? null,
      findClassByCode: async (code) => [c1, c2].find((r) => r.code === code) ?? null,
      createClass: async (data) => { calls.push({ op: 'create', data }); return { ...klass('new', data.code), ...data }; },
      updateClass: async (id, data) => { calls.push({ op: 'update', id, data }); return { ...klass(id, data.code), ...data }; },
      countOfferings: async (id) => offerings[id] ?? 0,
    },
    courses: { findCourseById: async (id) => (['co1', 'co2'].includes(id) ? course(id) : null) },
    periods: { findPeriodById: ((id: string) => Promise.resolve(['p1', 'p2'].includes(id) ? period(id) : null)) as unknown as ClassDeps['periods']['findPeriodById'] },
  };
  return { deps, calls };
}

const input = { name: 'Turma Nova', code: 'NOVA-2026-1', courseId: 'co1', academicPeriodId: 'p1', semester: 1 };

describe('createClass', () => {
  it('cria com curso e período existentes', async () => {
    const { deps, calls } = makeDeps();
    await createClass(input, deps);
    expect(calls).toEqual([{ op: 'create', data: input }]);
  });
  it('404 para curso inexistente', async () => {
    const { deps } = makeDeps();
    await expect(createClass({ ...input, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
  });
  it('404 para período inexistente', async () => {
    const { deps } = makeDeps();
    await expect(createClass({ ...input, academicPeriodId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Período letivo não encontrado.' });
  });
  it('409 para código duplicado', async () => {
    const { deps, calls } = makeDeps();
    await expect(createClass({ ...input, code: 'ADS-2026-3A' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe uma turma com este código.' });
    expect(calls).toHaveLength(0);
  });
});

describe('updateClass', () => {
  const same = { name: 'Turma c1', code: 'ADS-2026-3A', courseId: 'co1', academicPeriodId: 'p1', semester: 3 };
  it('404 para turma inexistente', async () => {
    const { deps } = makeDeps();
    await expect(updateClass('nope', input, deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
  });
  it('409 para código de outra turma', async () => {
    const { deps } = makeDeps();
    await expect(updateClass('c1', { ...same, code: 'ADS-2026-1A' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe uma turma com este código.' });
  });
  it('409 ao trocar o curso de turma com ofertas', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateClass('c1', { ...same, courseId: 'co2' }, deps)).rejects.toMatchObject({
      status: 409, message: 'A turma tem ofertas; não é possível trocar o curso.',
    });
    expect(calls).toHaveLength(0);
  });
  it('aceita troca de período em turma com ofertas', async () => {
    const { deps, calls } = makeDeps();
    await updateClass('c1', { ...same, academicPeriodId: 'p2' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c1', data: { academicPeriodId: 'p2' } });
  });
  it('aceita editar turma com ofertas mantendo o curso', async () => {
    const { deps, calls } = makeDeps();
    await updateClass('c1', { ...same, name: 'Novo nome' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', data: { name: 'Novo nome', courseId: 'co1' } });
  });
  it('aceita trocar o curso de turma sem ofertas', async () => {
    const { deps, calls } = makeDeps();
    await updateClass('c2', { ...same, code: 'ADS-2026-1A', courseId: 'co2' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c2', data: { courseId: 'co2' } });
  });
  it('404 para curso ou período inexistente no update', async () => {
    const { deps } = makeDeps();
    await expect(updateClass('c1', { ...same, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
    await expect(updateClass('c1', { ...same, academicPeriodId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Período letivo não encontrado.' });
  });
});
