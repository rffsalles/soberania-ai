import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import { ASSESSMENT_TYPE, LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
import { parseLessonInput, type LessonInput } from '@/lib/validators/lesson.validator';
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@/lib/validators/assessment.validator';
import { assertOwner } from '../ownership';
import * as planRepo from './teaching-plan-repository';
import * as scheduleRepo from './course-schedule-repository';
import * as lessonRepo from './lesson-plan-repository';
import * as assessmentRepo from './assessment-repository';
import { resolveChapterSelection, type PlanChapterBook } from './plan-chapters-service';
import { questionSchema, rubricSchema } from '@/domains/assessments/question-schema';
import type { PlanActor } from './teaching-plan-service';

type OwnerLookup<T> = (id: string) => Promise<T | null>;

export type TeachingContentDeps = {
  repo: {
    findPlanOwner: OwnerLookup<{ teacherId: string }>;
    findScheduleOwner: OwnerLookup<{ teachingPlan: { teacherId: string } }>;
    listSchedulesByPlan(filter: { planId?: string; teacherId?: string }): Promise<unknown[]>;
    listLessonsBySchedule(filter: { scheduleId?: string; teacherId?: string }): Promise<unknown[]>;
    createLesson(data: Prisma.LessonPlanUncheckedCreateInput): Promise<unknown>;
    listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
    listAssessmentsByPlan(filter: {
      planId?: string;
      teacherId?: string;
    }): Promise<Array<{ chapters: { chapterId: string }[] } & Record<string, unknown>>>;
    createAssessment(data: Prisma.AssessmentUncheckedCreateInput): Promise<unknown>;
  };
};

const defaultDeps: TeachingContentDeps = {
  repo: {
    findPlanOwner: planRepo.findPlanOwner,
    findScheduleOwner: scheduleRepo.findScheduleOwner,
    listSchedulesByPlan: scheduleRepo.listSchedulesByPlan,
    listLessonsBySchedule: lessonRepo.listLessonsBySchedule,
    createLesson: lessonRepo.createLesson,
    listPlanChapters: planRepo.listPlanChapters,
    listAssessmentsByPlan: assessmentRepo.listAssessmentsByPlan,
    createAssessment: assessmentRepo.createAssessment,
  },
};

const ownerFilter = (user: PlanActor) => (user.role === Role.TEACHER ? { teacherId: user.id } : {});

async function assertOwnsPlanId(user: PlanActor, planId: string, deps: TeachingContentDeps) {
  const plan = await deps.repo.findPlanOwner(planId);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwner(user, plan.teacherId);
}

async function assertOwnsScheduleId(user: PlanActor, scheduleId: string, deps: TeachingContentDeps) {
  const schedule = await deps.repo.findScheduleOwner(scheduleId);
  if (!schedule) throw new DomainError(404, 'Cronograma não encontrado.');
  assertOwner(user, schedule.teachingPlan.teacherId);
}

export function listSchedules(user: PlanActor, planId?: string, deps: TeachingContentDeps = defaultDeps) {
  return deps.repo.listSchedulesByPlan({ planId, ...ownerFilter(user) });
}

export function listLessons(user: PlanActor, scheduleId?: string, deps: TeachingContentDeps = defaultDeps) {
  return deps.repo.listLessonsBySchedule({ scheduleId, ...ownerFilter(user) });
}

export type { LessonInput };

export async function createLesson(user: PlanActor, raw: unknown, deps: TeachingContentDeps = defaultDeps) {
  const input = parseLessonInput(raw);
  if (!input.courseScheduleId || !input.topicTitle) {
    throw new DomainError(400, 'Cronograma e título do tópico são obrigatórios.');
  }
  await assertOwnsScheduleId(user, input.courseScheduleId, deps);
  return deps.repo.createLesson({
    courseScheduleId: input.courseScheduleId,
    classDate: input.classDate ? new Date(input.classDate) : new Date(),
    classNumber: Number(input.classNumber) || 1,
    topicTitle: input.topicTitle,
    dailyObjective: input.dailyObjective || '',
    timeScript: input.timeScript ?? [],
    methodology: input.methodology || '',
    resourcesNeeded: input.resourcesNeeded || [],
    fixationExercise: input.fixationExercise || '',
    mediaType: input.mediaType || LESSON_MEDIA_TYPE.NONE,
    mediaUrl: input.mediaUrl || null,
  });
}

export async function listAssessments(user: PlanActor, planId?: string, deps: TeachingContentDeps = defaultDeps) {
  const rows = await deps.repo.listAssessmentsByPlan({ planId, ...ownerFilter(user) });
  return rows.map(({ chapters, ...rest }) => ({ ...rest, chapterIds: chapters.map((c) => c.chapterId) }));
}

export async function createAssessment(
  user: PlanActor,
  input: {
    teachingPlanId?: string;
    title?: string;
    type?: string;
    questions?: unknown;
    rubrics?: unknown;
    chapterIds?: unknown;
    maxScore?: number | string;
    durationMinutes?: number;
  },
  deps: TeachingContentDeps = defaultDeps
) {
  if (!input.teachingPlanId || !input.title) {
    throw new DomainError(400, 'Plano de ensino e título da avaliação são obrigatórios.');
  }
  if (
    input.durationMinutes !== undefined &&
    !(Number.isInteger(input.durationMinutes) &&
      input.durationMinutes >= MIN_DURATION_MINUTES &&
      input.durationMinutes <= MAX_DURATION_MINUTES)
  ) {
    throw new DomainError(400, `A duração deve estar entre ${MIN_DURATION_MINUTES} e ${MAX_DURATION_MINUTES} minutos.`);
  }
  const questions = z.array(questionSchema).optional().safeParse(input.questions);
  if (!questions.success) throw new DomainError(400, 'Questões inválidas: cada questão exige 4 alternativas (A a D).');
  const rubrics = z.array(rubricSchema).optional().safeParse(input.rubrics);
  if (!rubrics.success) throw new DomainError(400, 'Rubricas inválidas.');
  const chapterIdsInput = z.array(z.string()).optional().safeParse(input.chapterIds);
  if (!chapterIdsInput.success) throw new DomainError(400, 'Capítulos inválidos.');
  await assertOwnsPlanId(user, input.teachingPlanId, deps);
  const chapterIds = chapterIdsInput.data?.length
    ? resolveChapterSelection(chapterIdsInput.data, await deps.repo.listPlanChapters(input.teachingPlanId))
    : [];
  return deps.repo.createAssessment({
    teachingPlanId: input.teachingPlanId,
    title: input.title,
    type: input.type || ASSESSMENT_TYPE.EXAM,
    questions: questions.data ?? [],
    rubrics: rubrics.data ?? [],
    maxScore: Number(input.maxScore) || 10.0,
    ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
    ...(chapterIds.length ? { chapters: { create: chapterIds.map((chapterId) => ({ chapterId })) } } : {}),
  });
}
