import type { PlanChapterBook } from './services/plan-chapters-service';

export type ChapterParentRef = { id: string; parentId: string | null };

export function chapterParentIndex(books: PlanChapterBook[]): Map<string, ChapterParentRef> {
  const byId = new Map<string, ChapterParentRef>();
  for (const b of books) for (const c of b.chapters) byId.set(c.id, { id: c.id, parentId: c.parentId });
  return byId;
}

/** Sobe por parentId até a raiz; id desconhecido devolve ele mesmo; guarda contra ciclo. */
export function rootIdOf(chapterId: string, byId: Map<string, ChapterParentRef>): string {
  const seen = new Set<string>();
  let current = chapterId;
  while (!seen.has(current)) {
    seen.add(current);
    const parentId = byId.get(current)?.parentId;
    if (!parentId || !byId.has(parentId)) return current;
    current = parentId;
  }
  return current;
}

/** Mapeia cada id para a raiz do ramo, deduplicando pela primeira ocorrência. */
export function toRootIds(chapterIds: string[], byId: Map<string, ChapterParentRef>): string[] {
  return Array.from(new Set(chapterIds.map((id) => rootIdOf(id, byId))));
}

export function rootBooks(books: PlanChapterBook[]): PlanChapterBook[] {
  return books.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.depth === 0) }));
}
