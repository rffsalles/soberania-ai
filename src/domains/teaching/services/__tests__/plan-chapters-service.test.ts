import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { listPlanChapters, planChapterIds, type PlanChapterBook } from '../plan-chapters-service';

const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [{ id: 'c1', order: 1, title: 'Intro', startPage: 1, endPage: 10 }, { id: 'c2', order: 2, title: 'Fim', startPage: 11, endPage: null }],
  },
  { materialId: 'm2', title: 'Livro B', author: 'Outro', kind: 'COMPLEMENTARY', chapters: [{ id: 'c3', order: 1, title: 'X', startPage: 1, endPage: 5 }] },
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
});
