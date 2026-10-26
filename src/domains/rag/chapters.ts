import type { OutlineEntry } from '@/domains/rag/types';
import { MIN_EXTRACTED_CHAPTERS } from '@/domains/rag/constants';

export type ChapterDraft = { title: string; startPage: number };
export type ChapterRow = { title: string; order: number; startPage: number; endPage: number };
export type ChunkAssignment = { order: number | null; title: string | null; fromPage: number; toPage: number };
export type ChapterLinks = { order: number; lessonPlanIds: string[] };

/** Converte o outline do PDF em rascunhos; null quando sobram menos que o mínimo. */
export function outlineToDrafts(entries: OutlineEntry[]): ChapterDraft[] | null {
  const drafts: ChapterDraft[] = [];
  let last = 0;
  for (const entry of entries) {
    const title = entry.title.trim();
    if (!title || entry.pageNumber === null) continue;
    if (entry.pageNumber <= last) continue;
    drafts.push({ title, startPage: entry.pageNumber });
    last = entry.pageNumber;
  }
  return drafts.length >= MIN_EXTRACTED_CHAPTERS ? drafts : null;
}

export function isValidChapterSequence(drafts: ChapterDraft[], totalPages: number, minCount: number): boolean {
  if (drafts.length < minCount) return false;
  let prev = 0;
  for (const d of drafts) {
    if (!Number.isInteger(d.startPage) || d.startPage < 1 || d.startPage > totalPages) return false;
    if (d.startPage <= prev) return false;
    prev = d.startPage;
  }
  return true;
}

export function toChapterRows(drafts: ChapterDraft[], totalPages: number): ChapterRow[] {
  return drafts.map((d, i) => ({
    title: d.title,
    order: i + 1,
    startPage: d.startPage,
    endPage: i + 1 < drafts.length ? drafts[i + 1].startPage - 1 : totalPages,
  }));
}

export function buildChunkAssignments(rows: ChapterRow[], totalPages: number): ChunkAssignment[] {
  if (rows.length === 0) return [{ order: null, title: null, fromPage: 1, toPage: totalPages }];
  const result: ChunkAssignment[] = [];
  if (rows[0].startPage > 1) result.push({ order: null, title: null, fromPage: 1, toPage: rows[0].startPage - 1 });
  for (const r of rows) result.push({ order: r.order, title: r.title, fromPage: r.startPage, toPage: r.endPage });
  return result;
}

export function relinkByOrder(
  old: ChapterLinks[],
  newCount: number,
): { relinks: { order: number; lessonPlanId: string }[]; lostLessonLinks: number } {
  if (old.length === newCount) {
    return {
      relinks: old.flatMap((c) => c.lessonPlanIds.map((lessonPlanId) => ({ order: c.order, lessonPlanId }))),
      lostLessonLinks: 0,
    };
  }
  return { relinks: [], lostLessonLinks: new Set(old.flatMap((c) => c.lessonPlanIds)).size };
}
