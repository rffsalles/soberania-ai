import { Prisma, Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { ASSESSMENT_TYPE, LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
import * as planRepo from './teaching-plan-repository';
import * as scheduleRepo from './course-schedule-repository';
import * as lessonRepo from './lesson-plan-repository';
import * as assessmentRepo from './assessment-repository';
import type { PlanActor } from './teaching-plan-service';

const ownerFilter = (user: PlanActor) => (user.role === Role.TEACHER ? { teacherId: user.id } : {});

function assertOwner(user: PlanActor, teacherId: string) {
  if (user.role === Role.TEACHER && teacherId !== user.id) {
    throw new DomainError(403, 'Você não tem acesso a este recurso.');
  }
}

async function assertOwnsPlanId(user: PlanActor, planId: string) {
  const plan = await planRepo.findPlanById(planId);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwner(user, plan.teacherId);
}

async function assertOwnsScheduleId(user: PlanActor, scheduleId: string) {
  const schedule = await scheduleRepo.findScheduleOwner(scheduleId);
  if (!schedule) throw new DomainError(404, 'Cronograma não encontrado.');
  assertOwner(user, schedule.teachingPlan.teacherId);
}

export function listSchedules(user: PlanActor, planId?: string) {
  return scheduleRepo.listSchedulesByPlan({ planId, ...ownerFilter(user) });
}

export async function createSchedule(
  user: PlanActor,
  input: { teachingPlanId?: string; startDate?: string; endDate?: string; holidays?: Prisma.InputJsonValue; totalClasses?: number | string }
) {
  if (!input.teachingPlanId || !input.startDate || !input.endDate) {
    throw new DomainError(400, 'Plano de Ensino e período de datas são obrigatórios.');
  }
  await assertOwnsPlanId(user, input.teachingPlanId);
  return scheduleRepo.createSchedule({
    teachingPlanId: input.teachingPlanId,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    holidays: input.holidays || [],
    totalClasses: Number(input.totalClasses) || 40,
  });
}

export function listLessons(user: PlanActor, scheduleId?: string) {
  return lessonRepo.listLessonsBySchedule({ scheduleId, ...ownerFilter(user) });
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

export async function createLesson(user: PlanActor, input: LessonInput) {
  if (!input.courseScheduleId || !input.topicTitle) {
    throw new DomainError(400, 'Cronograma e título do tópico são obrigatórios.');
  }
  await assertOwnsScheduleId(user, input.courseScheduleId);
  return lessonRepo.createLesson({
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
  input: Omit<LessonInput, 'courseScheduleId' | 'classDate'> & { classDate?: string }
) {
  const lesson = await lessonRepo.findLessonOwner(id);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  assertOwner(user, lesson.courseSchedule.teachingPlan.teacherId);
  const { classDate, classNumber, ...rest } = input;
  return lessonRepo.updateLesson(id, {
    ...rest,
    ...(classDate ? { classDate: new Date(classDate) } : {}),
    ...(classNumber !== undefined ? { classNumber: Number(classNumber) } : {}),
  });
}

export function listAssessments(user: PlanActor, planId?: string) {
  return assessmentRepo.listAssessmentsByPlan({ planId, ...ownerFilter(user) });
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
  }
) {
  if (!input.teachingPlanId || !input.title) {
    throw new DomainError(400, 'Plano de ensino e título da avaliação são obrigatórios.');
  }
  await assertOwnsPlanId(user, input.teachingPlanId);
  return assessmentRepo.createAssessment({
    teachingPlanId: input.teachingPlanId,
    title: input.title,
    type: input.type || ASSESSMENT_TYPE.EXAM,
    questions: input.questions || [],
    rubrics: input.rubrics || {},
    maxScore: Number(input.maxScore) || 10.0,
  });
}
