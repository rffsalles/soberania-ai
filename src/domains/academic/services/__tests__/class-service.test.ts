import { describe, it, expect } from 'vitest';
import { listClasses, createClass, updateClass, type ClassDeps } from '../class-service';

const c1 = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 };
const c2 = { id: 'c2', name: '1º Semestre · ADS', code: 'ADS-2026-1A', semester: 1, year: 2026 };

function makeDeps(rows = [c1, c2]) {
  const calls: { op: string; id?: string; data: Record<string, unknown> }[] = [];
  const deps: ClassDeps = {
    repo: {
      listClasses: async () => rows.map((r) => ({ ...r, _count: { students: 0, subjects: 0 } })),
      findClassById: async (id) => rows.find((r) => r.id === id) ?? null,
      findClassByCode: async (code) => rows.find((r) => r.code === code) ?? null,
      createClass: async (data) => {
        calls.push({ op: 'create', data });
        return { id: 'new', ...data };
      },
      updateClass: async (id, data) => {
        calls.push({ op: 'update', id, data });
        return { id, ...data };
      },
    },
  };
  return { deps, calls };
}

const input = { name: 'Turma Nova', code: 'NOVA-2026-1', year: 2026, semester: 1 };

describe('listClasses', () => {
  it('devolve as turmas do repositório com contagens', async () => {
    const { deps } = makeDeps();
    expect(await listClasses(deps)).toHaveLength(2);
  });
});

describe('createClass', () => {
  it('cria quando o código é inédito', async () => {
    const { deps, calls } = makeDeps();
    expect(await createClass(input, deps)).toMatchObject({ id: 'new', code: 'NOVA-2026-1' });
    expect(calls[0]).toMatchObject({ op: 'create', data: input });
  });
  it('rejeita código já usado com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(createClass({ ...input, code: 'ADS-2026-3A' }, deps)).rejects.toMatchObject({
      status: 409,
      message: 'Já existe uma turma com este código.',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('updateClass', () => {
  it('atualiza mantendo o próprio código', async () => {
    const { deps, calls } = makeDeps();
    await updateClass('c1', { ...input, code: 'ADS-2026-3A' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c1', data: { code: 'ADS-2026-3A' } });
  });
  it('rejeita código de outra turma com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateClass('c1', { ...input, code: 'ADS-2026-1A' }, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });
  it('rejeita turma inexistente com 404', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateClass('nope', input, deps)).rejects.toMatchObject({
      status: 404,
      message: 'Turma não encontrada.',
    });
    expect(calls).toHaveLength(0);
  });
});
