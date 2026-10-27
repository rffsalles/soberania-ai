import type { ChapterSource, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { numberChapters, type ChapterLinks, type ChapterRow, type ChunkAssignment } from '@/domains/rag/chapters';

export type ChapterDTO = {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
  source: ChapterSource;
  parentId: string | null;
  depth: number;
  number: string;
};

const chapterSelect = {
  id: true, order: true, title: true, startPage: true, endPage: true, source: true, parentId: true, depth: true,
} as const;

export async function listChapters(materialId: string): Promise<ChapterDTO[]> {
  const found = await db.materialChapter.findMany({ where: { materialId }, orderBy: { order: 'asc' }, select: chapterSelect });
  return numberChapters(found);
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
export async function listChapterLinkDetails(
  materialId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<ChapterLinkDetail[]> {
  const links = await client.lessonPlanChapter.findMany({
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
    ? await client.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } })
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
  beforeWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<ChapterDTO[]> {
  return db.$transaction(async (tx) => {
    if (beforeWrite) await beforeWrite(tx);
    await tx.materialChapter.deleteMany({ where: { materialId } });
    const idByOrder = new Map<number, string>();
    const maxDepth = rows.reduce((m, r) => Math.max(m, r.depth), 0);
    for (let d = 0; d <= maxDepth; d++) {
      const level = rows.filter((r) => r.depth === d);
      if (level.length === 0) continue;
      const data = level.map((r) => {
        const parentId = d === 0 ? null : idByOrder.get(r.parentOrder as number);
        if (parentId === undefined) throw new Error(`Capítulo ${r.order} sem pai gravado (parentOrder ${r.parentOrder}).`);
        return { materialId, title: r.title, order: r.order, startPage: r.startPage, endPage: r.endPage, source, depth: d, parentId };
      });
      const created = await tx.materialChapter.createManyAndReturn({ data, select: { id: true, order: true } });
      for (const c of created) idByOrder.set(c.order, c.id);
    }
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
    return numberChapters(await tx.materialChapter.findMany({ where: { materialId }, orderBy: { order: 'asc' }, select: chapterSelect }));
  }, REPLACE_CHAPTERS_TX_OPTIONS);
}

/** Ids dos capítulos informados e de todos os seus descendentes (CTE recursiva). */
export async function listDescendantIds(chapterIds: string[]): Promise<string[]> {
  if (chapterIds.length === 0) return [];
  const found = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE t AS (
      SELECT id FROM material_chapters WHERE id = ANY(${chapterIds}::text[])
      UNION
      SELECT c.id FROM material_chapters c JOIN t ON c."parentId" = t.id
    )
    SELECT id FROM t`;
  return found.map((r) => r.id);
}

/** id → número hierárquico ("2.3") dos capítulos informados; numera cada material inteiro, em uma única consulta. */
export async function chapterNumbersFor(chapterIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (chapterIds.length === 0) return result;
  const found = await db.materialChapter.findMany({
    where: { material: { chapters: { some: { id: { in: chapterIds } } } } },
    orderBy: [{ materialId: 'asc' }, { order: 'asc' }],
    select: { id: true, order: true, parentId: true, materialId: true },
  });
  const byMaterial = new Map<string, typeof found>();
  for (const c of found) {
    const group = byMaterial.get(c.materialId);
    if (group) group.push(c);
    else byMaterial.set(c.materialId, [c]);
  }
  for (const group of byMaterial.values()) {
    for (const c of numberChapters(group)) result.set(c.id, c.number);
  }
  return result;
}
