import { DomainError } from '@/lib/api/domain-error';
import { loggedStreamChat, type StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import { collectStream } from '@/domains/agents/collect-stream';
import {
  buildPlanUnitsMessages,
  countLessonGroups,
  PLAN_UNITS_MIN,
  isValidPlanUnits,
  parsePlanUnits,
  type PlanUnitItem,
} from '@/domains/agents/prompts/plan-units-prompt';
import { NO_DISTRIBUTED_CHAPTERS, PLAN_UNITS_AI_UNAVAILABLE_MESSAGE } from '@/lib/constants/teaching';
import { assertOwner } from '../ownership';
import { chapterParentIndex, rootBooks, toRootIds } from '../chapter-roots';
import { findScheduleForDistribution } from './course-schedule-repository';
import { listPlanChapters, updatePlanById } from './teaching-plan-repository';
import { planChapterIds, type PlanChapterBook } from './plan-chapters-service';
import type { PlanActor } from './teaching-plan-service';

export type PlanUnitsDeps = {
  findSchedule: typeof findScheduleForDistribution;
  listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
  saveUnits(planId: string, units: PlanUnitItem[]): Promise<void>;
  streamChat: StreamChatFn;
};

export const PLAN_UNITS_TEMPERATURE = 0.2;
export const PLAN_UNITS_MAX_TOKENS = 1500;

const defaultDeps: PlanUnitsDeps = {
  findSchedule: findScheduleForDistribution,
  listPlanChapters,
  saveUnits: async (planId, units) => {
    await updatePlanById(planId, { unitsContent: units });
  },
  streamChat: loggedStreamChat,
};

async function askModel(
  messages: ReturnType<typeof buildPlanUnitsMessages>,
  deps: PlanUnitsDeps
): Promise<PlanUnitItem[] | null> {
  try {
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: PLAN_UNITS_TEMPERATURE,
      maxTokens: PLAN_UNITS_MAX_TOKENS,
    });
    return fallback ? null : parsePlanUnits(text);
  } catch (err) {
    console.warn('[plan-units] falha ao gerar unidades com a IA', err);
    return null;
  }
}

/**
 * Agrupa a distribuição de capítulos do cronograma em unidades do plano (LLM) e grava em unitsContent.
 * Resposta inválida, fallback ou falha → 503 sem gravar nada.
 */
export async function generateUnitsFromDistribution(
  scheduleId: string,
  user: PlanActor,
  deps: PlanUnitsDeps = defaultDeps
): Promise<PlanUnitItem[]> {
  const schedule = await deps.findSchedule(scheduleId);
  if (!schedule) throw new DomainError(404, 'Cronograma não encontrado.');
  assertOwner(user, schedule.teachingPlan.teacherId);

  const rawLessons = schedule.lessonPlans
    .map((l) => ({ classNumber: l.classNumber, topicTitle: l.topicTitle ?? '', chapterIds: l.chapters.map((c) => c.chapterId) }))
    .filter((l) => l.chapterIds.length > 0);
  if (rawLessons.length === 0) throw new DomainError(422, NO_DISTRIBUTED_CHAPTERS);

  const { teachingPlan } = schedule;
  const allBooks = await deps.listPlanChapters(teachingPlan.id);
  // Aulas podem referenciar seções; o plano trabalha só com capítulos raiz.
  const parentIndex = chapterParentIndex(allBooks);
  const lessons = rawLessons.map((l) => ({ ...l, chapterIds: toRootIds(l.chapterIds, parentIndex) }));
  const books = rootBooks(allBooks);
  const minUnits = Math.max(1, Math.min(PLAN_UNITS_MIN, countLessonGroups(lessons)));
  const messages = buildPlanUnitsMessages({
    subjectName: teachingPlan.subject.discipline.name,
    syllabus: teachingPlan.syllabus,
    objectives: [teachingPlan.generalObjectives, teachingPlan.specificObjectives].filter(Boolean).join('\n'),
    lessons,
    books,
    minUnits,
  });
  const units = await askModel(messages, deps);
  if (!units || !isValidPlanUnits(units, lessons, planChapterIds(books), minUnits)) {
    throw new DomainError(503, PLAN_UNITS_AI_UNAVAILABLE_MESSAGE);
  }

  await deps.saveUnits(teachingPlan.id, units);
  return units;
}
