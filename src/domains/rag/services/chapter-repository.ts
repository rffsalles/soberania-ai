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

export type ChapterLinkConflict = {
  disciplina: string;
  turma: string;
  classNumber: number;
  topicTitle: string;
  professor: string;
};
export type ChapterLinkDetail = ChapterLinkConflict & { lessonPlanId: string; teacherId: string };

/** Aulas vinculadas a capítulos do material, uma linha por aula, com disciplina, turma e professor. */
export async function listChapterLinkDetails(materialId: string): Promise<ChapterLinkDetail[]> {
  const links = await db.lessonPlanChapter.findMany({
    where: { chapter: { materialId } },
    select: {
      lessonPlan: {
        select: {
          id: true,
          classNumber: true,
          topicTitle: true,
          courseSchedule: {
            select: {
              teachingPlan: {
                select: {
                  teacherId: true,
                  subject: { select: { discipline: { select: { name: true } }, class: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const byPlan = new Map<string, Omit<ChapterLinkDetail, 'professor'>>();
  for (const { lessonPlan: lp } of links) {
    if (byPlan.has(lp.id)) continue;
    const plan = lp.courseSchedule.teachingPlan;
    byPlan.set(lp.id, {
      lessonPlanId: lp.id,
      teacherId: plan.teacherId,
      disciplina: plan.subject.discipline.name,
      turma: plan.subject.class.name,
      classNumber: lp.classNumber,
      topicTitle: lp.topicTitle,
    });
  }
  const teacherIds = [...new Set([...byPlan.values()].map((d) => d.teacherId))];
  const users = teacherIds.length > 0
    ? await db.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return [...byPlan.values()]
    .map((d) => ({ ...d, professor: nameById.get(d.teacherId) ?? '—' }))
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina) || a.classNumber - b.classNumber);
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
