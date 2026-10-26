import type { ChapterSource } from '@prisma/client';
import { db } from '@/lib/db';
import type { ChapterLinks, ChapterRow, ChunkAssignment } from '@/domains/rag/chapters';

export type ChapterDTO = {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
  source: ChapterSource;
};

const chapterSelect = { id: true, order: true, title: true, startPage: true, endPage: true, source: true } as const;

export function listChapters(materialId: string): Promise<ChapterDTO[]> {
  return db.materialChapter.findMany({ where: { materialId }, orderBy: { order: 'asc' }, select: chapterSelect });
}

export async function listChapterLinks(materialId: string): Promise<ChapterLinks[]> {
  const chapters = await db.materialChapter.findMany({
    where: { materialId },
    orderBy: { order: 'asc' },
    select: { order: true, lessonLinks: { select: { lessonPlanId: true } } },
  });
  return chapters.map((c) => ({ order: c.order, lessonPlanIds: c.lessonLinks.map((l) => l.lessonPlanId) }));
}

// Livros grandes (milhares de chunks, índices HNSW/GIN) estouram o timeout padrão de 5 s.
export const REPLACE_CHAPTERS_TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

/**
 * Uma $transaction: apaga os capítulos do material, cria `rows`, recria `relinks` (order → id novo)
 * e aplica `assignments` nos chunks (chapterId e rótulo `chapter`) por faixa de página.
 */
export function replaceChapters(
  materialId: string,
  rows: ChapterRow[],
  source: ChapterSource,
  relinks: { order: number; lessonPlanId: string }[],
  assignments: ChunkAssignment[],
): Promise<ChapterDTO[]> {
  return db.$transaction(async (tx) => {
    await tx.materialChapter.deleteMany({ where: { materialId } });
    const idByOrder = new Map<number, string>();
    const created = await tx.materialChapter.createManyAndReturn({
      data: rows.map((r) => ({ materialId, title: r.title, order: r.order, startPage: r.startPage, endPage: r.endPage, source })),
      select: { id: true, order: true },
    });
    for (const c of created) idByOrder.set(c.order, c.id);
    const links = relinks.flatMap((l) => {
      const chapterId = idByOrder.get(l.order);
      return chapterId ? [{ lessonPlanId: l.lessonPlanId, chapterId }] : [];
    });
    if (links.length > 0) await tx.lessonPlanChapter.createMany({ data: links, skipDuplicates: true });
    for (const a of assignments) {
      const chapterId = a.order === null ? null : (idByOrder.get(a.order) ?? null);
      await tx.$executeRaw`
        UPDATE material_chunks
        SET "chapterId" = ${chapterId}, chapter = COALESCE(${a.title}, 'Página ' || "pageNumber")
        WHERE "materialId" = ${materialId} AND "pageNumber" BETWEEN ${a.fromPage} AND ${a.toPage}
          AND ("chapterId" IS DISTINCT FROM ${chapterId}
            OR "chapter" IS DISTINCT FROM COALESCE(${a.title}, 'Página ' || "pageNumber"))`;
    }
    return tx.materialChapter.findMany({ where: { materialId }, orderBy: { order: 'asc' }, select: chapterSelect });
  }, REPLACE_CHAPTERS_TX_OPTIONS);
}
