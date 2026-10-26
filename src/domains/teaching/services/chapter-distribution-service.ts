import { DomainError } from '@/lib/api/domain-error';
import { loggedStreamChat, type StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import {
  buildChapterDistributionMessages,
  isValidDistribution,
  parseChapterDistribution,
  type DistributionItem,
} from '@/domains/agents/prompts/chapter-distribution-prompt';
import {
  DISTRIBUTION_AI_UNAVAILABLE_MESSAGE,
  INSTITUTION_TIMEZONE,
  LESSON_DEFAULT_DURATION_MINUTES,
  LESSON_STATUS,
  NO_PLAN_CHAPTERS,
  NO_SYNCED_LESSONS,
} from '@/lib/constants/teaching';
import { assertOwner } from '../ownership';
import { findScheduleForDistribution } from './course-schedule-repository';
import { applyChapterDistribution } from './lesson-plan-repository';
import { listPlanChapters } from './teaching-plan-repository';
import { planChapterIds, type PlanChapterBook } from './plan-chapters-service';
import type { PlanActor } from './teaching-plan-service';
import { collectStream } from '@/domains/agents/collect-stream';

export type ChapterDistributionDeps = {
  findSchedule: typeof findScheduleForDistribution;
  listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
  apply: typeof applyChapterDistribution;
  streamChat: StreamChatFn;
};
export type DistributionResult = { updated: number; skippedPublished: number };

const defaultDeps: ChapterDistributionDeps = {
  findSchedule: findScheduleForDistribution,
  listPlanChapters,
  apply: applyChapterDistribution,
  streamChat: loggedStreamChat,
};

const DISTRIBUTION_TEMPERATURE = 0.2;
const DISTRIBUTION_BASE_TOKENS = 400;
const DISTRIBUTION_TOKENS_PER_LESSON = 90;
const DISTRIBUTION_MAX_TOKENS_CAP = 8000;

/** Cada aula repete ids de capítulos na resposta; o orçamento cresce com o cronograma. */
export const distributionMaxTokens = (lessonCount: number) =>
  Math.min(DISTRIBUTION_MAX_TOKENS_CAP, DISTRIBUTION_BASE_TOKENS + DISTRIBUTION_TOKENS_PER_LESSON * lessonCount);

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: INSTITUTION_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

async function askModel(
  messages: ReturnType<typeof buildChapterDistributionMessages>,
  maxTokens: number,
  deps: ChapterDistributionDeps
): Promise<DistributionItem[] | null> {
  try {
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: DISTRIBUTION_TEMPERATURE,
      maxTokens,
    });
    return fallback ? null : parseChapterDistribution(text);
  } catch (err) {
    console.warn('[chapter-distribution] falha ao distribuir capítulos com a IA', err);
    return null;
  }
}

/**
 * Distribui os capítulos dos livros do plano pelas aulas do cronograma com o LLM. Só aulas em rascunho são
 * gravadas; publicadas são contadas e preservadas. Resposta inválida, fallback ou falha → 503 sem gravar nada.
 */
export async function distributeChapters(
  scheduleId: string,
  user: PlanActor,
  deps: ChapterDistributionDeps = defaultDeps
): Promise<DistributionResult> {
  const schedule = await deps.findSchedule(scheduleId);
  if (!schedule) throw new DomainError(404, 'Cronograma não encontrado.');
  assertOwner(user, schedule.teachingPlan.teacherId);
  if (schedule.lessonPlans.length === 0) throw new DomainError(400, NO_SYNCED_LESSONS);

  const books = await deps.listPlanChapters(schedule.teachingPlan.id);
  const chapterIds = planChapterIds(books);
  if (chapterIds.size === 0) throw new DomainError(422, NO_PLAN_CHAPTERS);

  const { teachingPlan, lessonPlans } = schedule;
  const messages = buildChapterDistributionMessages({
    subjectName: teachingPlan.subject.discipline.name,
    syllabus: teachingPlan.syllabus,
    objectives: [teachingPlan.generalObjectives, teachingPlan.specificObjectives].filter(Boolean).join('\n'),
    lessons: lessonPlans.map((l) => ({
      classNumber: l.classNumber,
      date: dateFormat.format(l.classDate),
      durationMinutes: LESSON_DEFAULT_DURATION_MINUTES,
    })),
    books,
  });
  const raw = await askModel(messages, distributionMaxTokens(lessonPlans.length), deps);
  // A PK (lessonPlanId, chapterId) não admite repetição dentro da mesma aula.
  const items = raw?.map((i) => ({ ...i, chapterIds: Array.from(new Set(i.chapterIds)) })) ?? null;
  if (!items || !isValidDistribution(items, lessonPlans.map((l) => l.classNumber), chapterIds)) {
    throw new DomainError(503, DISTRIBUTION_AI_UNAVAILABLE_MESSAGE);
  }

  const byClass = new Map(items.map((i) => [i.classNumber, i]));
  const rows = lessonPlans
    .filter((l) => l.status === LESSON_STATUS.DRAFT)
    .map((l) => {
      const item = byClass.get(l.classNumber)!;
      return { lessonPlanId: l.id, topicTitle: item.topicTitle, chapterIds: item.chapterIds };
    });
  if (rows.length > 0) await deps.apply(rows);
  return { updated: rows.length, skippedPublished: lessonPlans.length - rows.length };
}
