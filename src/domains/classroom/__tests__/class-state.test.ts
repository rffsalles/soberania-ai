import { describe, expect, it } from 'vitest';

import type { ClassEventDTO, ClassEventTypeName } from '../class-event-schema';
import {
  isTutorMuted,
  reduceClassState,
  sessionPhase,
  tutorContentForStep,
} from '../class-state';

function ev(
  seq: number,
  type: ClassEventTypeName,
  stepIndex: number | null = null,
  payload: unknown = {},
): ClassEventDTO {
  return { seq, type, stepIndex, payload, createdBy: 'TEACHER', createdAt: '2026-11-08T00:00:00.000Z' };
}

describe('class-state', () => {
  it('passo atual é o STEP_CHANGED de maior seq, inclusive ao voltar', () => {
    const es = [ev(3, 'STEP_CHANGED', 0), ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0), ev(4, 'STEP_CHANGED', 2), ev(5, 'STEP_CHANGED', 1)];
    expect(reduceClassState(es).currentStepIndex).toBe(1);
  });
  it('fases', () => {
    expect(sessionPhase([])).toBe('NOT_STARTED');
    expect(sessionPhase([ev(1, 'SESSION_STARTED')])).toBe('RUNNING');
    expect(sessionPhase([ev(1, 'SESSION_STARTED'), ev(9, 'SESSION_ENDED')])).toBe('ENDED');
  });
  it('mute: vale a última nota relevante; PUBLISH_NOW anula só o próprio passo', () => {
    const es = [ev(1, 'TEACHER_NOTE', null, { tutor: 'MUTE', scope: 'LESSON' }), ev(2, 'TEACHER_NOTE', 3, { tutor: 'PUBLISH_NOW', scope: 'STEP' })];
    expect(isTutorMuted(es, 3)).toBe(false);
    expect(isTutorMuted(es, 4)).toBe(true);
    expect(isTutorMuted([...es, ev(3, 'TEACHER_NOTE', null, { tutor: 'UNMUTE', scope: 'LESSON' })], 4)).toBe(false);
    expect(isTutorMuted([ev(1, 'TEACHER_NOTE', 2, { tutor: 'MUTE', scope: 'STEP' })], 2)).toBe(true);
  });
  it('conteúdo da tutora por passo', () => {
    const es = [ev(1, 'TUTOR_CARD', 0), ev(2, 'TUTOR_SKIPPED', 1), ev(3, 'TUTOR_QUESTION', 0)];
    expect(tutorContentForStep(es, 0)).toMatchObject({ card: { seq: 1 }, question: { seq: 3 }, skipped: null });
    expect(tutorContentForStep(es, 1).skipped?.seq).toBe(2);
  });
});
