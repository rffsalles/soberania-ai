import type {
  AnswerResult,
  ClassEventDTO,
  PulseEntry,
  TutorCardPayload,
  TutorQuestionPayload,
  TutorSkippedPayload,
} from './class-event-schema';

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

/** Resultado da resposta; `alreadyAnswered` quando o aluno já tinha respondido (o resultado é o da resposta gravada). */
export type AnswerOutcome = AnswerResult & { alreadyAnswered?: true };
export type StudentQuestion =
  | { seq: number; kind: 'MULTIPLE_CHOICE'; enunciation: string; options: { key: string; text: string }[] }
  | { seq: number; kind: 'OPEN'; text: string };
export type StudentView = {
  stepIndex: number | null;
  activity: string | null;
  card: TutorCardPayload | null;
  question: StudentQuestion | null;
  answer: AnswerOutcome | null;
};

const EMPTY_VIEW: StudentView = { stepIndex: null, activity: null, card: null, question: null, answer: null };

function toStudentQuestion(e: ClassEventDTO): StudentQuestion | null {
  const p = e.payload as {
    kind?: string;
    text?: unknown;
    question?: { enunciation?: unknown; options?: unknown };
  } | null;
  if (!p) return null;
  if (p.kind === 'OPEN' && typeof p.text === 'string') return { seq: e.seq, kind: 'OPEN', text: p.text };
  if (p.kind === 'MULTIPLE_CHOICE' && p.question && typeof p.question.enunciation === 'string') {
    const options = Array.isArray(p.question.options)
      ? (p.question.options as { key: string; text: string }[]).map((o) => ({ key: o.key, text: o.text }))
      : [];
    return { seq: e.seq, kind: 'MULTIPLE_CHOICE', enunciation: p.question.enunciation, options };
  }
  return null;
}

/** O que o aluno vê na faixa: passo atual (se a aula não acabou), cartão, pergunta e a própria resposta. */
export function reduceStudentView(events: ClassEventDTO[], answers: Record<number, AnswerOutcome>): StudentView {
  if (sessionPhase(events) === 'ENDED') return EMPTY_VIEW;
  const step = currentStep(events);
  if (!step || step.stepIndex === null) return EMPTY_VIEW;
  const activity = (step.payload as { activity?: unknown } | null)?.activity;
  const content = tutorContentForStep(events, step.stepIndex);
  const question = content.question ? toStudentQuestion(content.question) : null;
  return {
    stepIndex: step.stepIndex,
    activity: typeof activity === 'string' ? activity : null,
    card: content.card ? (content.card.payload as TutorCardPayload) : null,
    question,
    answer: question ? (answers[question.seq] ?? null) : null,
  };
}

export type TeacherTutorView = {
  stepIndex: number | null;
  status: 'IDLE' | 'MUTED' | 'GENERATING' | 'READY';
  card: TutorCardPayload | null;
  question: TutorQuestionPayload | null;
  questionSeq: number | null;
  skipped: TutorSkippedPayload | null;
  canPublishNow: boolean;
  nextStepIndex: number | null;
  nextStepMuted: boolean;
  lessonMuted: boolean;
  pulse: PulseEntry | null;
};

/** O que o professor vê na coluna da tutora: conteúdo do passo atual, controles e pulso da turma. */
export function reduceTeacherView(events: ClassEventDTO[], pulse: PulseEntry[], stepCount: number): TeacherTutorView {
  const phase = sessionPhase(events);
  const step = currentStep(events);
  const muteAll = lessonMuted(events);
  const idx = step?.stepIndex ?? null;
  if (phase !== 'RUNNING' || idx === null) {
    return {
      stepIndex: null,
      status: 'IDLE',
      card: null,
      question: null,
      questionSeq: null,
      skipped: null,
      canPublishNow: false,
      nextStepIndex: null,
      nextStepMuted: false,
      lessonMuted: muteAll,
      pulse: null,
    };
  }
  const content = tutorContentForStep(events, idx);
  const muted = isTutorMuted(events, idx);
  const status: TeacherTutorView['status'] = muted
    ? 'MUTED'
    : content.card || content.skipped
      ? 'READY'
      : 'GENERATING';
  const next = idx + 1 < stepCount ? idx + 1 : null;
  const questionSeq = content.question?.seq ?? null;
  return {
    stepIndex: idx,
    status,
    card: content.card ? (content.card.payload as TutorCardPayload) : null,
    question: content.question ? (content.question.payload as TutorQuestionPayload) : null,
    questionSeq,
    skipped: content.skipped ? (content.skipped.payload as TutorSkippedPayload) : null,
    canPublishNow: !content.card && !content.question && !content.skipped,
    nextStepIndex: next,
    nextStepMuted: next !== null && isTutorMuted(events, next),
    lessonMuted: muteAll,
    pulse: questionSeq === null ? null : (pulse.find((p) => p.seq === questionSeq) ?? null),
  };
}
