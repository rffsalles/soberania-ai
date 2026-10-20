import { Prisma, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { ASSESSMENT_TYPE, LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
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
    findLessonOwner: OwnerLookup<{ courseSchedule: { teachingPlan: { teacherId: string } } }>;
    listSchedulesByPlan(filter: { planId?: string; teacherId?: string }): Promise<unknown[]>;
    createSchedule(data: Prisma.CourseScheduleUncheckedCreateInput): Promise<unknown>;
    listLessonsBySchedule(filter: { scheduleId?: string; teacherId?: string }): Promise<unknown[]>;
    createLesson(data: Prisma.LessonPlanUncheckedCreateInput): Promise<unknown>;
    updateLesson(id: string, data: Prisma.LessonPlanUncheckedUpdateInput): Promise<unknown>;
    listAssessmentsByPlan(filter: { planId?: string; teacherId?: string }): Promise<unknown[]>;
    createAssessment(data: Prisma.AssessmentUncheckedCreateInput): Promise<unknown>;
  };
};

const defaultDeps: TeachingContentDeps = {
  repo: {
    findPlanOwner: planRepo.findPlanOwner,
    findScheduleOwner: scheduleRepo.findScheduleOwner,
    findLessonOwner: lessonRepo.findLessonOwner,
    listSchedulesByPlan: scheduleRepo.listSchedulesByPlan,
    createSchedule: scheduleRepo.createSchedule,
    listLessonsBySchedule: lessonRepo.listLessonsBySchedule,
    createLesson: lessonRepo.createLesson,
    updateLesson: lessonRepo.updateLesson,
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

export async function createSchedule(
  user: PlanActor,
  input: { teachingPlanId?: string; startDate?: string; endDate?: string; holidays?: Prisma.InputJsonValue; totalClasses?: number | string },
  deps: TeachingContentDeps = defaultDeps
) {
  if (!input.teachingPlanId || !input.startDate || !input.endDate) {
    throw new DomainError(400, 'Plano de Ensino e período de datas são obrigatórios.');
  }
  await assertOwnsPlanId(user, input.teachingPlanId, deps);
  return deps.repo.createSchedule({
    teachingPlanId: input.teachingPlanId,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    holidays: input.holidays || [],
    totalClasses: Number(input.totalClasses) || 40,
  });
}

export function listLessons(user: PlanActor, scheduleId?: string, deps: TeachingContentDeps = defaultDeps) {
  return deps.repo.listLessonsBySchedule({ scheduleId, ...ownerFilter(user) });
}

export type LessonInput = {
  courseScheduleId?: string;
  classDate?: string;
  classNumber?: number | string;
  topicTitle?: string;
  dailyObjective?: string;
  timeScript?: Prisma.InputJsonValue;
  methodology?: string;
  resourcesNeeded?: string[];
  fixationExercise?: string;
  mediaType?: string;
  mediaUrl?: string | null;
};

export async function createLesson(user: PlanActor, input: LessonInput, deps: TeachingContentDeps = defaultDeps) {
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
    timeScript: input.timeScript || [],
    methodology: input.methodology || '',
    resourcesNeeded: input.resourcesNeeded || [],
    fixationExercise: input.fixationExercise || '',
    mediaType: input.mediaType || LESSON_MEDIA_TYPE.NONE,
    mediaUrl: input.mediaUrl || null,
  });
}

export async function updateLesson(
  id: string,
  user: PlanActor,
  input: Omit<LessonInput, 'courseScheduleId'>,
  deps: TeachingContentDeps = defaultDeps
) {
  const lesson = await deps.repo.findLessonOwner(id);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  assertOwner(user, lesson.courseSchedule.teachingPlan.teacherId);

  // Explicit whitelist: the parent schedule can never be changed through an update.
  const data: Prisma.LessonPlanUncheckedUpdateInput = {};
  if (input.classDate) data.classDate = new Date(input.classDate);
  if (input.classNumber !== undefined) data.classNumber = Number(input.classNumber);
  if (input.topicTitle !== undefined) data.topicTitle = input.topicTitle;
  if (input.dailyObjective !== undefined) data.dailyObjective = input.dailyObjective;
  if (input.timeScript !== undefined) data.timeScript = input.timeScript;
  if (input.methodology !== undefined) data.methodology = input.methodology;
  if (input.resourcesNeeded !== undefined) data.resourcesNeeded = input.resourcesNeeded;
  if (input.fixationExercise !== undefined) data.fixationExercise = input.fixationExercise;
  if (input.mediaType !== undefined) data.mediaType = input.mediaType;
  if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;
  return deps.repo.updateLesson(id, data);
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
