import type { Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
import { assertOwner } from '../ownership';
import { generateMeetings } from '../schedule-generator';
import * as planRepo from './teaching-plan-repository';
import * as scheduleRepo from './course-schedule-repository';
import * as lessonRepo from './lesson-plan-repository';
import type { PlanActor } from './teaching-plan-service';

const ISO_DATE_LENGTH = 10;

export type ScheduleRules = { weekdays: number[]; holidays: string[] };

export type ScheduleInput = {
  teachingPlanId: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  holidays: string[];
};

export type ScheduleDeps = {
  repo: {
    findPlanOwner(id: string): Promise<{ teacherId: string } | null>;
    findScheduleForSync(id: string): Promise<{
      id: string;
      startDate: Date;
      endDate: Date;
      holidays: Prisma.JsonValue;
      teachingPlan: { teacherId: string };
      lessonPlans: { classNumber: number }[];
    } | null>;
    createSchedule(data: Prisma.CourseScheduleUncheckedCreateInput): Promise<object>;
    createLesson(data: Prisma.LessonPlanUncheckedCreateInput): Promise<unknown>;
  };
};

const defaultDeps: ScheduleDeps = {
  repo: {
    findPlanOwner: planRepo.findPlanOwner,
    findScheduleForSync: scheduleRepo.findScheduleForSync,
    createSchedule: scheduleRepo.createSchedule,
    createLesson: lessonRepo.createLesson,
  },
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, ISO_DATE_LENGTH);
const fromIsoDate = (date: string) => new Date(`${date}T00:00:00Z`);

function readRules(stored: Prisma.JsonValue): ScheduleRules {
  const rules = stored as Partial<ScheduleRules> | null;
  if (!rules || Array.isArray(rules) || !Array.isArray(rules.weekdays) || !Array.isArray(rules.holidays)) {
    throw new DomainError(400, 'Este cronograma não possui regras de calendário para sincronizar.');
  }
  return { weekdays: rules.weekdays, holidays: rules.holidays };
}

export async function createSchedule(user: PlanActor, input: ScheduleInput, deps: ScheduleDeps = defaultDeps) {
  const plan = await deps.repo.findPlanOwner(input.teachingPlanId);
  if (!plan) throw new DomainError(404, 'Plano de ensino não encontrado.');
  assertOwner(user, plan.teacherId);

  const meetings = generateMeetings(input);
  if (meetings.length === 0) {
    throw new DomainError(400, 'O período informado não possui nenhuma aula.');
  }
  const rules: ScheduleRules = { weekdays: input.weekdays, holidays: input.holidays };
  const schedule = await deps.repo.createSchedule({
    teachingPlanId: input.teachingPlanId,
    startDate: fromIsoDate(input.startDate),
    endDate: fromIsoDate(input.endDate),
    holidays: rules,
    totalClasses: meetings.length,
  });
  return { ...schedule, meetings };
}

/** Creates the lesson plans missing for the schedule's meetings; existing ones are never touched. */
export async function syncLessons(scheduleId: string, user: PlanActor, deps: ScheduleDeps = defaultDeps) {
  const schedule = await deps.repo.findScheduleForSync(scheduleId);
  if (!schedule) throw new DomainError(404, 'Cronograma não encontrado.');
  assertOwner(user, schedule.teachingPlan.teacherId);

  const meetings = generateMeetings({
    startDate: toIsoDate(schedule.startDate),
    endDate: toIsoDate(schedule.endDate),
    ...readRules(schedule.holidays),
  });
  const existingNumbers = new Set(schedule.lessonPlans.map((lesson) => lesson.classNumber));
  const missing = meetings.filter((meeting) => !existingNumbers.has(meeting.classNumber));

  for (const meeting of missing) {
    await deps.repo.createLesson({
      courseScheduleId: schedule.id,
      classNumber: meeting.classNumber,
      classDate: fromIsoDate(meeting.date),
      topicTitle: `Aula ${meeting.classNumber}`,
      dailyObjective: '',
      timeScript: [],
      methodology: '',
      resourcesNeeded: [],
      fixationExercise: '',
      mediaType: LESSON_MEDIA_TYPE.NONE,
    });
  }
  return { created: missing.length, existing: meetings.length - missing.length };
}
