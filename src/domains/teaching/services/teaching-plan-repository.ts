import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { PlanReferenceInput } from '@/lib/validators/teaching-plan.validator';
import { numberChapters } from '@/domains/rag/chapters';

const subjectContext = {
  include: { discipline: true, class: { include: { course: true, academicPeriod: true } } },
} as const;

const planFull = {
  subject: subjectContext,
  schedules: { include: { lessonPlans: true } },
  assessments: true,
  references: { select: { materialId: true, kind: true } },
} as const;

const planBasic = { subject: subjectContext } as const;

export function findPlans(filter: { teacherId?: string; subjectId?: string }) {
  return db.teachingPlan.findMany({
    where: {
      ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
    },
    include: planFull,
    orderBy: { createdAt: 'desc' },
  });
}

export function findPlanById(id: string) {
  return db.teachingPlan.findUnique({ where: { id }, include: planFull });
}

export function insertPlan(data: Prisma.TeachingPlanUncheckedCreateInput) {
  return db.teachingPlan.create({ data, include: planBasic });
}

export function updatePlanById(id: string, data: Prisma.TeachingPlanUncheckedUpdateInput) {
  return db.teachingPlan.update({ where: { id }, data, include: planBasic });
}

export async function replacePlanReferences(teachingPlanId: string, refs: PlanReferenceInput[]): Promise<void> {
  await db.$transaction([
    db.teachingPlanReference.deleteMany({ where: { teachingPlanId } }),
    db.teachingPlanReference.createMany({
      data: refs.map((r) => ({ teachingPlanId, materialId: r.materialId, kind: r.kind })),
      skipDuplicates: true,
    }),
  ]);
}

export function findPlanOwner(id: string) {
  return db.teachingPlan.findUnique({ where: { id }, select: { id: true, teacherId: true } });
}

export function findPlanForAssessment(id: string) {
  return db.teachingPlan.findUnique({
    where: { id },
    select: { id: true, teacherId: true, subjectId: true, subject: { select: { discipline: { select: { name: true } } } } },
  });
}

export async function listPlanChapters(planId: string) {
  const refs = await db.teachingPlanReference.findMany({
    where: { teachingPlanId: planId },
    select: {
      kind: true,
      material: {
        select: {
          id: true,
          title: true,
          author: true,
          chapters: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true, startPage: true, endPage: true, parentId: true, depth: true } },
        },
      },
    },
  });
  return refs
    .map((r) => ({
      materialId: r.material.id,
      title: r.material.title,
      author: r.material.author,
      kind: r.kind as 'BASIC' | 'COMPLEMENTARY',
      chapters: numberChapters(r.material.chapters),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, 'pt-BR') : a.kind === 'BASIC' ? -1 : 1));
}
