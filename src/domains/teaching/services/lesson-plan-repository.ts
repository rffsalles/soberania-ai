import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function listLessonsBySchedule(filter: { scheduleId?: string; teacherId?: string }) {
  return db.lessonPlan.findMany({
    where: {
      ...(filter.scheduleId ? { courseScheduleId: filter.scheduleId } : {}),
      ...(filter.teacherId ? { courseSchedule: { teachingPlan: { teacherId: filter.teacherId } } } : {}),
    },
    include: {
      courseSchedule: { include: { teachingPlan: { include: { subject: true } } } },
    },
    orderBy: { classNumber: 'asc' },
  });
}

export function findLessonOwner(id: string) {
  return db.lessonPlan.findUnique({
    where: { id },
    select: { id: true, courseSchedule: { select: { teachingPlan: { select: { teacherId: true } } } } },
  });
}

export function createLesson(data: Prisma.LessonPlanUncheckedCreateInput) {
  return db.lessonPlan.create({ data });
}

export function updateLesson(id: string, data: Prisma.LessonPlanUncheckedUpdateInput) {
  return db.lessonPlan.update({ where: { id }, data });
}
