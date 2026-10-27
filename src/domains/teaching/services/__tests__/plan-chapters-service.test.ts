import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { listPlanChapters, planChapterIds, normalizeChapterSelection, type PlanChapterBook } from '../plan-chapters-service';

const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [{ id: 'c1', order: 1, title: 'Intro', startPage: 1, endPage: 10, parentId: null, depth: 0, number: '1' }, { id: 'c2', order: 2, title: 'Fim', startPage: 11, endPage: null, parentId: null, depth: 0, number: '2' }],
  },
  { materialId: 'm2', title: 'Livro B', author: 'Outro', kind: 'COMPLEMENTARY', chapters: [{ id: 'c3', order: 1, title: 'X', startPage: 1, endPage: 5, parentId: null, depth: 0, number: '1' }] },
];

function deps(owner: { teacherId: string } | null) {
  return { findPlanOwner: vi.fn().mockResolvedValue(owner), listPlanChapters: vi.fn().mockResolvedValue(books) };
}

describe('plan-chapters-service', () => {
  it('404 quando o plano não existe', async () => {
    await expect(listPlanChapters('p1', { id: 't1', role: Role.TEACHER }, deps(null))).rejects.toMatchObject({ status: 404, message: 'Plano de ensino não encontrado.' });
  });
  it('403 para outro professor', async () => {
    await expect(listPlanChapters('p1', { id: 't2', role: Role.TEACHER }, deps({ teacherId: 't1' }))).rejects.toMatchObject({ status: 403 });
  });
  it('devolve os livros do repositório ao dono e ao admin', async () => {
    const d = deps({ teacherId: 't1' });
    expect(await listPlanChapters('p1', { id: 't1', role: Role.TEACHER }, d)).toEqual(books);
    expect(d.listPlanChapters).toHaveBeenCalledWith('p1');
    expect(await listPlanChapters('p1', { id: 'a', role: Role.ADMIN }, d)).toEqual(books);
  });
  it('planChapterIds reúne os ids de todos os livros', () => {
    expect(planChapterIds(books)).toEqual(new Set(['c1', 'c2', 'c3']));
  });

  const tree: PlanChapterBook[] = [{ materialId: 'm1', title: 'Livro', author: 'A', kind: 'BASIC', chapters: [
    { id: 'u1', order: 1, title: 'U1', startPage: 1, endPage: 9, parentId: null, depth: 0, number: '1' },
    { id: 'f', order: 2, title: 'Frações', startPage: 2, endPage: 5, parentId: 'u1', depth: 1, number: '1.1' },
    { id: 'f1', order: 3, title: 'Soma', startPage: 3, endPage: 5, parentId: 'f', depth: 2, number: '1.1.1' },
    { id: 'u2', order: 4, title: 'U2', startPage: 10, endPage: 20, parentId: null, depth: 0, number: '2' },
  ] }];
  it('ancestral e descendente viram só o ancestral', () => {
    expect(normalizeChapterSelection(['f1', 'u1', 'u2'], tree)).toEqual(['u1', 'u2']);
    expect(normalizeChapterSelection(['f', 'f1', 'f'], tree)).toEqual(['f']);
  });
  it('normalização é idempotente', () => {
    const once = normalizeChapterSelection(['f1', 'f', 'u2'], tree);
    expect(normalizeChapterSelection(once, tree)).toEqual(once);
  });
  it('mantém ids desconhecidos', () => {
    expect(normalizeChapterSelection(['x', 'u1'], tree)).toEqual(['x', 'u1']);
  });
  it('planChapterIds inclui nós de qualquer profundidade', () =>
    expect(planChapterIds(tree)).toEqual(new Set(['u1', 'f', 'f1', 'u2'])));
});
