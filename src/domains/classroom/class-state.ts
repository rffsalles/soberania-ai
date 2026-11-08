import type { ClassEventDTO } from './class-event-schema';

export type SessionPhase = 'NOT_STARTED' | 'RUNNING' | 'ENDED';
export type TutorContent = {
  card: ClassEventDTO | null;
  question: ClassEventDTO | null;
  skipped: ClassEventDTO | null;
};
export type ClassState = {
  phase: SessionPhase;
  currentStepIndex: number | null;
  currentStepActivity: string | null;
  lessonMuted: boolean;
  tutorByStep: Record<number, TutorContent>;
};

type NotePayload = { tutor?: 'MUTE' | 'UNMUTE' | 'PUBLISH_NOW' | null; scope?: 'STEP' | 'LESSON' };

/** Rótulo padrão de um passo (índice base 0) quando não há descrição. */
export function stepLabel(stepIndex: number): string {
  return `Passo ${stepIndex + 1}`;
}

function sorted(events: ClassEventDTO[]): ClassEventDTO[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

export function sessionPhase(events: ClassEventDTO[]): SessionPhase {
  if (events.some((e) => e.type === 'SESSION_ENDED')) return 'ENDED';
  if (events.some((e) => e.type === 'SESSION_STARTED')) return 'RUNNING';
  return 'NOT_STARTED';
}

export function currentStep(events: ClassEventDTO[]): ClassEventDTO | null {
  const steps = sorted(events).filter((e) => e.type === 'STEP_CHANGED');
  return steps.length ? steps[steps.length - 1] : null;
}

/** A última nota relevante (LESSON mute/unmute ou do próprio passo) decide. */
export function isTutorMuted(events: ClassEventDTO[], stepIndex: number): boolean {
  let muted = false;
  for (const e of sorted(events)) {
    if (e.type !== 'TEACHER_NOTE') continue;
    const p = (e.payload ?? {}) as NotePayload;
    if (p.scope === 'LESSON' && (p.tutor === 'MUTE' || p.tutor === 'UNMUTE')) {
      muted = p.tutor === 'MUTE';
    } else if (p.scope === 'STEP' && e.stepIndex === stepIndex && p.tutor) {
      muted = p.tutor === 'MUTE';
    }
  }
  return muted;
}

export function tutorContentForStep(events: ClassEventDTO[], stepIndex: number): TutorContent {
  const out: TutorContent = { card: null, question: null, skipped: null };
  for (const e of sorted(events)) {
    if (e.stepIndex !== stepIndex) continue;
    if (e.type === 'TUTOR_CARD') out.card = e;
    else if (e.type === 'TUTOR_QUESTION') out.question = e;
    else if (e.type === 'TUTOR_SKIPPED') out.skipped = e;
  }
  return out;
}

function lessonMuted(events: ClassEventDTO[]): boolean {
  let muted = false;
  for (const e of sorted(events)) {
    if (e.type !== 'TEACHER_NOTE') continue;
    const p = (e.payload ?? {}) as NotePayload;
    if (p.scope === 'LESSON' && (p.tutor === 'MUTE' || p.tutor === 'UNMUTE')) muted = p.tutor === 'MUTE';
  }
  return muted;
}

export function reduceClassState(events: ClassEventDTO[]): ClassState {
  const tutorByStep: Record<number, TutorContent> = {};
  for (const e of sorted(events)) {
    if (e.stepIndex === null) continue;
    if (e.type !== 'TUTOR_CARD' && e.type !== 'TUTOR_QUESTION' && e.type !== 'TUTOR_SKIPPED') continue;
    tutorByStep[e.stepIndex] ??= tutorContentForStep(events, e.stepIndex);
  }
  const step = currentStep(events);
  const activity = (step?.payload as { activity?: unknown } | null | undefined)?.activity;
  return {
    phase: sessionPhase(events),
    currentStepIndex: step?.stepIndex ?? null,
    currentStepActivity: typeof activity === 'string' ? activity : null,
    lessonMuted: lessonMuted(events),
    tutorByStep,
  };
}
