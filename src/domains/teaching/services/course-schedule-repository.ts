import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function listSchedulesByPlan(filter: { planId?: string; teacherId?: string }) {
  return db.courseSchedule.findMany({
    where: {
      ...(filter.planId ? { teachingPlanId: filter.planId } : {}),
      ...(filter.teacherId ? { teachingPlan: { teacherId: filter.teacherId } } : {}),
    },
    include: {
      teachingPlan: { include: { subject: { include: { discipline: true } } } },
      lessonPlans: { orderBy: { classNumber: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export function findScheduleOwner(id: string) {
  return db.courseSchedule.findUnique({
    where: { id },
    select: { id: true, teachingPlan: { select: { teacherId: true } } },
  });
}

export function createSchedule(data: Prisma.CourseScheduleUncheckedCreateInput) {
  return db.courseSchedule.create({
    data,
    include: { teachingPlan: { include: { subject: { include: { discipline: true } } } } },
  });
}

export function findScheduleForSync(id: string) {
  return db.courseSchedule.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      holidays: true,
      startTime: true,
      teachingPlan: { select: { teacherId: true } },
      lessonPlans: { select: { classNumber: true } },
    },
  });
}

export function findScheduleForDistribution(id: string) {
  return db.courseSchedule.findUnique({
    where: { id },
    select: {
      id: true,
      teachingPlan: {
        select: {
          id: true,
          teacherId: true,
          syllabus: true,
          generalObjectives: true,
          specificObjectives: true,
          subject: { select: { discipline: { select: { name: true } } } },
        },
      },
      lessonPlans: {
        orderBy: { classNumber: 'asc' },
        select: { id: true, classNumber: true, classDate: true, status: true },
      },
    },
  });
}
