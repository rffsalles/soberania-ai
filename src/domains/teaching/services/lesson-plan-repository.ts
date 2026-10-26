import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function listLessonsBySchedule(filter: { scheduleId?: string; teacherId?: string }) {
  return db.lessonPlan.findMany({
    where: {
      ...(filter.scheduleId ? { courseScheduleId: filter.scheduleId } : {}),
      ...(filter.teacherId ? { courseSchedule: { teachingPlan: { teacherId: filter.teacherId } } } : {}),
    },
    include: {
      courseSchedule: { include: { teachingPlan: { include: { subject: { include: { discipline: true } } } } } },
      chapters: { select: { chapterId: true, chapter: { select: { order: true } } } },
    },
    orderBy: { classNumber: 'asc' },
  });
}

export function createLesson(data: Prisma.LessonPlanUncheckedCreateInput) {
  return db.lessonPlan.create({ data });
}

const lessonContextInclude = {
  courseSchedule: {
    include: { teachingPlan: { select: { id: true, teacherId: true, subject: { select: { id: true, classId: true, discipline: { select: { name: true } } } } } } },
  },
  chapters: { select: { chapterId: true } },
} satisfies Prisma.LessonPlanInclude;

export function findLessonWithContext(id: string) {
  return db.lessonPlan.findUnique({ where: { id }, include: lessonContextInclude });
}

export function updateLessonWithContext(id: string, data: Prisma.LessonPlanUncheckedUpdateInput) {
  return db.lessonPlan.update({ where: { id }, data, include: lessonContextInclude });
}

export function findLessonPlayerData(id: string) {
  return db.lessonPlan.findUnique({
    where: { id },
    select: { topicTitle: true, dailyObjective: true, timeScript: true, mediaType: true, mediaUrl: true },
  });
}

/** Substitui os capítulos e o título de tema das aulas informadas, tudo ou nada. */
export async function applyChapterDistribution(
  rows: { lessonPlanId: string; topicTitle: string; chapterIds: string[] }[]
): Promise<void> {
  await db.$transaction([
    db.lessonPlanChapter.deleteMany({ where: { lessonPlanId: { in: rows.map((r) => r.lessonPlanId) } } }),
    db.lessonPlanChapter.createMany({
      data: rows.flatMap((r) => r.chapterIds.map((chapterId) => ({ lessonPlanId: r.lessonPlanId, chapterId }))),
    }),
    ...rows.map((r) => db.lessonPlan.update({ where: { id: r.lessonPlanId }, data: { topicTitle: r.topicTitle } })),
  ]);
}

/** Substitui os capítulos de uma aula, tudo ou nada. */
export async function replaceLessonChapters(lessonPlanId: string, chapterIds: string[]): Promise<void> {
  await db.$transaction([
    db.lessonPlanChapter.deleteMany({ where: { lessonPlanId } }),
    db.lessonPlanChapter.createMany({ data: chapterIds.map((chapterId) => ({ lessonPlanId, chapterId })) }),
  ]);
}

const generationInclude = {
  courseSchedule: {
    select: {
      totalClasses: true,
      teachingPlan: {
        select: {
          teacherId: true,
          syllabus: true,
          generalObjectives: true,
          subject: { select: { discipline: { select: { name: true } } } },
        },
      },
    },
  },
  chapters: {
    select: {
      chapter: {
        select: {
          id: true,
          order: true,
          title: true,
          startPage: true,
          endPage: true,
          material: { select: { title: true, author: true } },
        },
      },
    },
    orderBy: { chapter: { order: 'asc' } },
  },
} satisfies Prisma.LessonPlanInclude;

export type GenerationLesson = {
  id: string;
  classNumber: number;
  topicTitle: string;
  courseSchedule: {
    totalClasses: number;
    teachingPlan: {
      teacherId: string;
      syllabus: string;
      generalObjectives: string;
      subject: { discipline: { name: string } };
    };
  };
  chapters: {
    chapter: {
      id: string;
      order: number;
      title: string;
      startPage: number;
      endPage: number | null;
      material: { title: string; author: string };
    };
  }[];
};

export function findLessonForGeneration(id: string): Promise<GenerationLesson | null> {
  return db.lessonPlan.findUnique({
    where: { id },
    select: { id: true, classNumber: true, topicTitle: true, ...generationInclude },
  });
}
