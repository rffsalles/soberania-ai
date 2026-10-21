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

export function createLesson(data: Prisma.LessonPlanUncheckedCreateInput) {
  return db.lessonPlan.create({ data });
}

const lessonContextInclude = {
  courseSchedule: {
    include: { teachingPlan: { select: { teacherId: true, subject: { select: { id: true, name: true, classId: true } } } } },
  },
} satisfies Prisma.LessonPlanInclude;

export function findLessonWithContext(id: string) {
  return db.lessonPlan.findUnique({ where: { id }, include: lessonContextInclude });
}

export function updateLessonWithContext(id: string, data: Prisma.LessonPlanUncheckedUpdateInput) {
  return db.lessonPlan.update({ where: { id }, data, include: lessonContextInclude });
}
