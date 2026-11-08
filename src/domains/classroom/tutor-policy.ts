import type { TimeScriptItem } from '@/domains/teaching/time-script';

import type { ClassEventDTO, TutorSkippedPayload } from './class-event-schema';
import { currentStep, isTutorMuted, sessionPhase, tutorContentForStep } from './class-state';

export const SHORT_STEP_SECONDS = 240;
export const TUTOR_STALL_MS = 20_000;

export type TutorPlan =
  | { kind: 'SILENT' }
  | { kind: 'RUN'; question: { from: 'TEACHER'; text: string } | { from: 'MODEL' } | null };
export type CallResult = 'ok' | 'rate_limit' | 'provider_error' | 'invalid';
export type SkipReason = TutorSkippedPayload['reason'];

/** Duração do passo: próximo timeSeconds menos o atual; no último, agenda menos o atual (mínimo 0). */
export function stepDurationSeconds(
  script: TimeScriptItem[],
  stepIndex: number,
  agendaSeconds: number,
): number {
  const current = script[stepIndex]?.timeSeconds ?? 0;
  const next = script[stepIndex + 1];
  const end = next ? next.timeSeconds : agendaSeconds;
  return Math.max(0, end - current);
}

export function decideTutorPlan(
  step: { item: TimeScriptItem; durationSeconds: number },
  context: { muted: boolean },
): TutorPlan {
  if (context.muted) return { kind: 'SILENT' };
  const teacherText = step.item.socraticQuestion?.trim();
  if (teacherText) return { kind: 'RUN', question: { from: 'TEACHER', text: teacherText.slice(0, 500) } };
  if (step.durationSeconds < SHORT_STEP_SECONDS) return { kind: 'RUN', question: null };
  return { kind: 'RUN', question: { from: 'MODEL' } };
}

export function noMaterialSkip(plan: Extract<TutorPlan, { kind: 'RUN' }>): TutorSkippedPayload {
  return { reason: 'NO_MATERIAL', kind: plan.question?.from === 'MODEL' ? 'BOTH' : 'CARD' };
}

export function failureReason(results: CallResult[]): Exclude<SkipReason, 'NO_MATERIAL'> {
  const failed = results.filter((r) => r !== 'ok');
  if (failed.length === 0) return 'BUDGET';
  return failed.every((r) => r === 'rate_limit') ? 'RATE_LIMIT' : 'PROVIDER_ERROR';
}

export function tutorRunTarget(written: ClassEventDTO[]): number | null {
  let target: number | null = null;
  let lastSeq = -Infinity;
  for (const e of written) {
    const isPublish =
      e.type === 'TEACHER_NOTE' && (e.payload as { tutor?: string } | null)?.tutor === 'PUBLISH_NOW';
    if ((e.type === 'STEP_CHANGED' || isPublish) && e.stepIndex !== null && e.seq >= lastSeq) {
      target = e.stepIndex;
      lastSeq = e.seq;
    }
  }
  return target;
}

export function stalledTutorStep(events: ClassEventDTO[], now: number): number | null {
  if (sessionPhase(events) === 'ENDED') return null;
  const step = currentStep(events);
  if (!step || step.stepIndex === null) return null;
  if (now - Date.parse(step.createdAt) <= TUTOR_STALL_MS) return null;
  if (isTutorMuted(events, step.stepIndex)) return null;
  const content = tutorContentForStep(events, step.stepIndex);
  if (content.card || content.skipped) return null;
  return step.stepIndex;
}

const REASON_TEXT: Record<SkipReason, string> = {
  NO_MATERIAL: 'Nenhum trecho do material foi encontrado para este passo.',
  RATE_LIMIT: 'O provedor de IA recusou por limite de uso.',
  BUDGET: 'O limite de 2 chamadas à IA neste passo já foi usado.',
  PROVIDER_ERROR: 'A IA não devolveu um conteúdo válido.',
};
const KIND_TEXT: Record<TutorSkippedPayload['kind'], string> = {
  CARD: 'Sem cartão neste passo.',
  QUESTION: 'Sem pergunta gerada neste passo.',
  BOTH: 'Sem cartão nem pergunta neste passo.',
};

export function tutorSkipMessage(p: TutorSkippedPayload): string {
  return `${REASON_TEXT[p.reason]} ${KIND_TEXT[p.kind]}`;
}
