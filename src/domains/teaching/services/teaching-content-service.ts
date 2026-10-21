import { Prisma, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { ASSESSMENT_TYPE, LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
import { parseLessonInput, type LessonInput } from '@/lib/validators/lesson.validator';
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from '@/lib/validators/assessment.validator';
import { assertOwner } from '../ownership';
import * as planRepo from './teaching-plan-repository';
import * as scheduleRepo from './course-schedule-repository';
import * as lessonRepo from './lesson-plan-repository';
import * as assessmentRepo from './assessment-repository';
import type { PlanActor } from './teaching-plan-service';

type OwnerLookup<T> = (id: string) => Promise<T | null>;

export type TeachingContentDeps = {
  repo: {
    findPlanOwner: OwnerLookup<{ teacherId: string }>;
    findScheduleOwner: OwnerLookup<{ teachingPlan: { teacherId: string } }>;
    listSchedulesByPlan(filter: { planId?: string; teacherId?: string }): Promise<unknown[]>;
    listLessonsBySchedule(filter: { scheduleId?: string; teacherId?: string }): Promise<unknown[]>;
    createLesson(data: Prisma.LessonPlanUncheckedCreateInput): Promise<unknown>;
    listAssessmentsByPlan(filter: { planId?: string; teacherId?: string }): Promise<unknown[]>;
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

export function listAssessments(user: PlanActor, planId?: string, deps: TeachingContentDeps = defaultDeps) {
  return deps.repo.listAssessmentsByPlan({ planId, ...ownerFilter(user) });
}

export async function createAssessment(
  user: PlanActor,
  input: {
    teachingPlanId?: string;
    title?: string;
    type?: string;
    questions?: Prisma.InputJsonValue;
    rubrics?: Prisma.InputJsonValue;
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
  await assertOwnsPlanId(user, input.teachingPlanId, deps);
  return deps.repo.createAssessment({
    teachingPlanId: input.teachingPlanId,
    title: input.title,
    type: input.type || ASSESSMENT_TYPE.EXAM,
    questions: input.questions || [],
    rubrics: input.rubrics || {},
    maxScore: Number(input.maxScore) || 10.0,
    ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
  });
}
