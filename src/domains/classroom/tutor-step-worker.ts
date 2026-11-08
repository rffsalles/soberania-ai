import type { TimeScriptItem } from '@/domains/teaching/time-script';
import { timeScriptSchema } from '@/domains/teaching/time-script';
import { findAgendaById } from '@/domains/agendas/services/agenda-repository';
import { findLessonPlayerData, findLessonTutorScope } from '@/domains/teaching/services/lesson-plan-repository';
import type { ClassEventDTO } from './class-event-schema';
import { appendTutorEvents, type NewTutorEvent } from './class-event-repository';
import { readTutorEvents } from './class-event-service';
import { isTutorMuted, sessionPhase, tutorContentForStep } from './class-state';
import { decideTutorPlan, noMaterialSkip, stepDurationSeconds } from './tutor-policy';
import { produceStepContent, type StepContent, type StepContentInput } from './tutor-step-content';

export type TutorStepContext = {
  agendaId: string;
  lessonPlanId: string;
  agendaSeconds: number;
  script: TimeScriptItem[];
  dailyObjective: string;
  chapterIds: string[];
};

export type TutorWorkerDeps = {
  /** null sem aula/roteiro; 'ENDED' quando a agenda foi cancelada ou concluída (mesmo sem SESSION_ENDED). */
  loadContext(agendaId: string): Promise<TutorStepContext | 'ENDED' | null>;
  readEvents(agendaId: string): Promise<ClassEventDTO[]>;
  produce(input: StepContentInput): Promise<StepContent>;
  appendTutorEvents: typeof appendTutorEvents;
};

export type TutorRunResult = 'NO_STEP' | 'ENDED' | 'SILENT' | 'ALREADY_DONE' | 'BUSY' | 'PUBLISHED';

const defaultDeps: TutorWorkerDeps = {
  async loadContext(agendaId) {
    const agenda = await findAgendaById(agendaId);
    if (!agenda) return null;
    if (agenda.status === 'CANCELLED' || agenda.status === 'COMPLETED') return 'ENDED';
    if (!agenda.lessonPlanId) return null;
    const [lesson, scope] = await Promise.all([
      findLessonPlayerData(agenda.lessonPlanId),
      findLessonTutorScope(agenda.lessonPlanId),
    ]);
    if (!lesson) return null;
    const parsed = timeScriptSchema.safeParse(lesson.timeScript);
    return {
      agendaId,
      lessonPlanId: agenda.lessonPlanId,
      agendaSeconds: Math.max(0, (agenda.endTime.getTime() - agenda.startTime.getTime()) / 1000),
      script: parsed.success ? parsed.data : [],
      dailyObjective: lesson.dailyObjective,
      chapterIds: (scope?.chapters ?? []).map((c) => c.id),
    };
  },
  readEvents: readTutorEvents,
  produce: (input) => produceStepContent(input),
  appendTutorEvents,
};

export async function runTutorForStep(
  agendaId: string,
  stepIndex: number,
  deps: TutorWorkerDeps = defaultDeps,
): Promise<TutorRunResult> {
  const ctx = await deps.loadContext(agendaId);
  if (ctx === 'ENDED') return 'ENDED';
  const item = ctx?.script[stepIndex];
  if (!ctx || !item) return 'NO_STEP';

  const events = await deps.readEvents(agendaId);
  if (sessionPhase(events) === 'ENDED') return 'ENDED';

  const plan = decideTutorPlan(
    { item, durationSeconds: stepDurationSeconds(ctx.script, stepIndex, ctx.agendaSeconds) },
    { muted: isTutorMuted(events, stepIndex) },
  );
  if (plan.kind === 'SILENT') return 'SILENT';

  const content = tutorContentForStep(events, stepIndex);
  if (content.card || content.skipped) return 'ALREADY_DONE';

  if (plan.question?.from === 'TEACHER' && !content.question) {
    const published = await deps.appendTutorEvents(agendaId, stepIndex, [
      {
        type: 'TUTOR_QUESTION',
        payload: { kind: 'OPEN', text: plan.question.text, origin: 'TEACHER' },
        audience: 'ALL',
      },
    ]);
    // Append vazio = a aula terminou entre a leitura e a trava: não gasta chamadas ao modelo.
    if (published.length === 0) return 'ENDED';
  }

  const result = await deps.produce({
    agendaId,
    lessonPlanId: ctx.lessonPlanId,
    stepIndex,
    item,
    dailyObjective: ctx.dailyObjective,
    chapterIds: ctx.chapterIds,
    wantQuestion: plan.question?.from === 'MODEL',
  });
  if (result.status === 'BUSY') return 'BUSY';

  const batch: NewTutorEvent[] = [];
  if (result.card) {
    batch.push({
      type: 'TUTOR_CARD',
      payload: { ...result.card.payload, source: result.card.fromDraft ? 'DRAFT' : 'GENERATED' },
      audience: 'ALL',
    });
  }
  if (result.question) {
    batch.push({
      type: 'TUTOR_QUESTION',
      payload: { ...result.question.payload, source: result.question.fromDraft ? 'DRAFT' : 'GENERATED' },
      audience: 'ALL',
    });
  }
  if (result.noMaterial) {
    const has = { card: !!result.card, question: !!result.question };
    batch.push({ type: 'TUTOR_SKIPPED', payload: noMaterialSkip(plan, has), audience: 'TEACHER' });
  } else if (result.failure) {
    batch.push({ type: 'TUTOR_SKIPPED', payload: result.failure, audience: 'TEACHER' });
  }
  if (batch.length > 0) await deps.appendTutorEvents(agendaId, stepIndex, batch);
  return 'PUBLISHED';
}

export async function runTutorForStepSafely(agendaId: string, stepIndex: number): Promise<void> {
  try {
    await runTutorForStep(agendaId, stepIndex);
  } catch (err) {
    console.error('[tutora] falha no worker', err);
  }
}
