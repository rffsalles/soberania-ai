import { DomainError } from '@/lib/api/domain-error';
import { assertOwner } from '../ownership';
import * as repo from './teaching-plan-repository';
import type { PlanActor } from './teaching-plan-service';

export type PlanChapter = {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
  parentId: string | null;
  depth: number;
  number: string;
};
export type PlanChapterBook = {
  materialId: string;
  title: string;
  author: string;
  kind: 'BASIC' | 'COMPLEMENTARY';
  chapters: PlanChapter[];
};
export type PlanChaptersDeps = {
  findPlanOwner(id: string): Promise<{ teacherId: string } | null>;
  listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
};

const defaultDeps: PlanChaptersDeps = { findPlanOwner: repo.findPlanOwner, listPlanChapters: repo.listPlanChapters };

export async function listPlanChapters(planId: string, user: PlanActor, deps: PlanChaptersDeps = defaultDeps) {
  const plan = await deps.findPlanOwner(planId);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwner(user, plan.teacherId);
  return deps.listPlanChapters(planId);
}

export function planChapterIds(books: PlanChapterBook[]): Set<string> {
  return new Set(books.flatMap((b) => b.chapters.map((c) => c.id)));
}

/** Remove todo id com ancestral também selecionado; dedup; preserva a ordem de entrada; idempotente. Ids desconhecidos são mantidos. */
export function normalizeChapterSelection(ids: string[], books: PlanChapterBook[]): string[] {
  const parentOf = new Map<string, string | null>();
  for (const b of books) for (const c of b.chapters) parentOf.set(c.id, c.parentId);
  const selected = new Set(ids);
  const hasSelectedAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let cur = parentOf.get(id) ?? null;
    while (cur && !seen.has(cur)) {
      if (selected.has(cur)) return true;
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return false;
  };
  return [...selected].filter((id) => !hasSelectedAncestor(id));
}
