import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { LESSON_STATUS } from '@/lib/constants/teaching';
import { timeScriptSchema, type TimeScriptItem } from '@/domains/teaching/time-script';
import { assertOwner } from '@/domains/teaching/ownership';
import type { LessonActor } from '@/domains/teaching/services/lesson-service';
import { findLessonWithContext, findLessonTutorScope } from '@/domains/teaching/services/lesson-plan-repository';
import { findAgendaByLessonPlanId } from '@/domains/agendas/services/agenda-repository';
import type { ClassEventDTO, TutorCardPayload } from './class-event-schema';
import { readTutorEvents } from './class-event-service';
import { isTutorMuted, sessionPhase } from './class-state';
import { decideTutorPlan, stepDurationSeconds, tutorSkipMessage } from './tutor-policy';
import { listDrafts, type TutorDraftRow } from './tutor-step-draft-repository';
import { stepHash } from './tutor-step-hash';
import {
  parseDraftCard,
  parseDraftQuestion,
  produceStepContent,
  type MultipleChoicePayload,
  type StepContent,
  type StepContentInput,
} from './tutor-step-content';

export type PreparedStep = {
  stepIndex: number;
  status: 'READY' | 'MUTED' | 'NO_MATERIAL' | 'BUSY' | 'FAILED';
  card: boolean;
  question: boolean;
  message: string | null;
};

export type TutorDraftView = {
  stepIndex: number;
  card: TutorCardPayload | null;
  question: MultipleChoicePayload | null;
  current: boolean;
};

export type DraftLesson = {
  status: string;
  ownerId: string;
  dailyObjective: string;
  timeScript: unknown;
  chapterIds: string[];
};

export type TutorDraftDeps = {
  loadLesson(lessonPlanId: string): Promise<DraftLesson | null>;
  findAgenda(lessonPlanId: string): Promise<{ id: string; startTime: Date; endTime: Date; status: string } | null>;
  readEvents(agendaId: string): Promise<ClassEventDTO[]>;
  produce(input: StepContentInput): Promise<StepContent>;
  listDrafts(lessonPlanId: string): Promise<TutorDraftRow[]>;
};

const defaultDeps: TutorDraftDeps = {
  async loadLesson(lessonPlanId) {
    const [lesson, scope] = await Promise.all([findLessonWithContext(lessonPlanId), findLessonTutorScope(lessonPlanId)]);
    if (!lesson) return null;
    return {
      status: lesson.status,
      ownerId: lesson.courseSchedule.teachingPlan.teacherId,
      dailyObjective: lesson.dailyObjective,
      timeScript: lesson.timeScript,
      chapterIds: (scope?.chapters ?? []).map((c) => c.id),
    };
  },
  findAgenda: findAgendaByLessonPlanId,
  readEvents: readTutorEvents,
  produce: (input) => produceStepContent(input),
  listDrafts,
};

async function loadOwned(user: LessonActor, lessonPlanId: string, deps: TutorDraftDeps): Promise<DraftLesson> {
  if (user.role === Role.STUDENT) throw new DomainError(403, 'Apenas o professor da aula prepara a tutora.');
  const lesson = await deps.loadLesson(lessonPlanId);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  assertOwner(user, lesson.ownerId);
  return lesson;
}

function scriptOf(lesson: DraftLesson): TimeScriptItem[] {
  const parsed = timeScriptSchema.safeParse(lesson.timeScript);
  return parsed.success ? parsed.data : [];
}

export async function prepareTutorDraft(
  user: LessonActor,
  lessonPlanId: string,
  stepIndex: number,
  deps: TutorDraftDeps = defaultDeps,
): Promise<PreparedStep> {
  const lesson = await loadOwned(user, lessonPlanId, deps);
  if (lesson.status !== LESSON_STATUS.PUBLISHED) {
    throw new DomainError(409, 'Publique a aula antes de preparar a tutora.', { code: 'LESSON_NOT_PUBLISHED' });
  }
  const agenda = await deps.findAgenda(lessonPlanId);
  if (!agenda) throw new DomainError(409, 'A aula publicada não tem agenda.', { code: 'NO_AGENDA' });
  const script = scriptOf(lesson);
  const item = script[stepIndex];
  if (!item) throw new DomainError(400, 'O passo informado não existe no roteiro.', { code: 'STEP_OUT_OF_RANGE' });

  const agendaSeconds = Math.max(0, (agenda.endTime.getTime() - agenda.startTime.getTime()) / 1000);
  const events = await deps.readEvents(agenda.id);
  if (agenda.status === 'CANCELLED' || agenda.status === 'COMPLETED' || sessionPhase(events) === 'ENDED') {
    throw new DomainError(409, 'A aula já foi encerrada.', { code: 'CLASS_ENDED' });
  }
  const plan = decideTutorPlan(
    { item, durationSeconds: stepDurationSeconds(script, stepIndex, agendaSeconds) },
    { muted: isTutorMuted(events, stepIndex) },
  );
  const base = { stepIndex, card: false, question: false, message: null };
  if (plan.kind === 'SILENT') return { ...base, status: 'MUTED' };

  const result = await deps.produce({
    agendaId: agenda.id,
    lessonPlanId,
    stepIndex,
    item,
    dailyObjective: lesson.dailyObjective,
    chapterIds: lesson.chapterIds,
    wantQuestion: plan.question?.from === 'MODEL',
  });
  if (result.status === 'BUSY') return { ...base, status: 'BUSY' };
  const pieces = { card: !!result.card, question: !!result.question };
  if (result.noMaterial) return { ...base, ...pieces, status: 'NO_MATERIAL' };
  if (result.failure) return { ...base, ...pieces, status: 'FAILED', message: tutorSkipMessage(result.failure) };
  return { ...base, ...pieces, status: 'READY' };
}

export async function listTutorDrafts(
  user: LessonActor,
  lessonPlanId: string,
  deps: TutorDraftDeps = defaultDeps,
): Promise<TutorDraftView[]> {
  const lesson = await loadOwned(user, lessonPlanId, deps);
  const script = scriptOf(lesson);
  const rows = await deps.listDrafts(lessonPlanId);
  return rows.map((row) => {
    const item = script[row.stepIndex];
    return {
      stepIndex: row.stepIndex,
      card: parseDraftCard(row.card, row.stepIndex),
      question: parseDraftQuestion(row.question, row.stepIndex),
      current: !!item && row.stepHash === stepHash(item, lesson.chapterIds),
    };
  });
}
