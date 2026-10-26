import { DomainError } from '@/lib/api/domain-error';
import { assertOwner } from '../ownership';
import * as repo from './teaching-plan-repository';
import type { PlanActor } from './teaching-plan-service';

export type PlanChapter = { id: string; order: number; title: string; startPage: number; endPage: number | null };
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
