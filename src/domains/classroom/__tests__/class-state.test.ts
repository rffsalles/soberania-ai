import { describe, expect, it } from 'vitest';

import type { ClassEventDTO, ClassEventTypeName } from '../class-event-schema';
import {
  isTutorMuted,
  reduceStudentView,
  reduceClassState,
  reduceTeacherView,
  sessionPhase,
  stepLabel,
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
  it('currentStepActivity vem do STEP_CHANGED de maior seq', () => {
    const es = [
      ev(1, 'SESSION_STARTED'),
      ev(2, 'STEP_CHANGED', 0, { activity: 'Revisão', timeRange: '0-10 min', fromStepIndex: null }),
      ev(3, 'STEP_CHANGED', 1, { activity: 'JOINs', timeRange: '10-30 min', fromStepIndex: 0 }),
    ];
    expect(reduceClassState(es).currentStepActivity).toBe('JOINs');
    expect(reduceClassState([ev(1, 'SESSION_STARTED')]).currentStepActivity).toBeNull();
    expect(reduceClassState([ev(1, 'STEP_CHANGED', 0, {})]).currentStepActivity).toBeNull();
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

describe('stepLabel', () => {
  it('converte índice base 0 em Passo N', () => {
    expect(stepLabel(0)).toBe('Passo 1');
    expect(stepLabel(4)).toBe('Passo 5');
  });

  describe('reduceStudentView', () => {
    const step = (seq: number, i: number) => ev(seq, 'STEP_CHANGED', i, { activity: `Passo ${i}`, timeRange: '', fromStepIndex: null });
    const card = { concepts: [], objectiveLink: 'x', source: 'GENERATED' };
    it('passo atual com cartão e pergunta; resposta vem do mapa', () => {
      const es = [
        ev(1, 'SESSION_STARTED'),
        step(2, 1),
        ev(3, 'TUTOR_CARD', 1, card),
        ev(4, 'TUTOR_QUESTION', 1, {
          kind: 'MULTIPLE_CHOICE',
          question: { id: 'q', enunciation: 'Qual JOIN?', options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }], topic: 't' },
          origin: 'TUTOR',
          source: 'GENERATED',
        }),
      ];
      const v = reduceStudentView(es, { 4: { wasCorrect: true, correctKey: 'B', rationale: 'r' } });
      expect(v.stepIndex).toBe(1);
      expect(v.activity).toBe('Passo 1');
      expect(v.card).toEqual(card);
      expect(v.question).toEqual({
        seq: 4,
        kind: 'MULTIPLE_CHOICE',
        enunciation: 'Qual JOIN?',
        options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }],
      });
      expect(v.answer).toEqual({ wasCorrect: true, correctKey: 'B', rationale: 'r' });
      expect(reduceStudentView(es, {}).answer).toBeNull();
    });
    it('pergunta aberta do professor', () => {
      const es = [ev(1, 'SESSION_STARTED'), step(2, 0), ev(3, 'TUTOR_QUESTION', 0, { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' })];
      expect(reduceStudentView(es, {}).question).toEqual({ seq: 3, kind: 'OPEN', text: 'Por quê?' });
    });
    it('ENDED não tem passo', () => {
      const es = [ev(1, 'SESSION_STARTED'), step(2, 1), ev(3, 'SESSION_ENDED')];
      expect(reduceStudentView(es, {}).stepIndex).toBeNull();
    });
  });

  describe('reduceTeacherView', () => {
    const started = [ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0, { activity: 'A' })];
    const openQ = ev(3, 'TUTOR_QUESTION', 0, { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' });
    it('IDLE antes de iniciar', () => {
      const v = reduceTeacherView([], [], 3);
      expect(v.status).toBe('IDLE');
      expect(v.canPublishNow).toBe(false);
    });
    it('GENERATING com só a pergunta do professor', () => {
      const v = reduceTeacherView([...started, openQ], [], 3);
      expect(v.status).toBe('GENERATING');
      expect(v.questionSeq).toBe(3);
      expect(v.canPublishNow).toBe(false);
    });
    it('READY com skip', () => {
      const sk = ev(3, 'TUTOR_SKIPPED', 0, { reason: 'NO_MATERIAL', kind: 'BOTH' });
      const v = reduceTeacherView([...started, sk], [], 3);
      expect(v.status).toBe('READY');
      expect(v.skipped).toEqual({ reason: 'NO_MATERIAL', kind: 'BOTH' });
    });
    it('MUTED com nota de passo; canPublishNow só sem conteúdo', () => {
      const note = ev(3, 'TEACHER_NOTE', 0, { tutor: 'MUTE', scope: 'STEP' });
      const v = reduceTeacherView([...started, note], [], 3);
      expect(v.status).toBe('MUTED');
      expect(v.canPublishNow).toBe(true);
    });
    it('nextStepMuted e nextStepIndex', () => {
      const note = ev(3, 'TEACHER_NOTE', 1, { tutor: 'MUTE', scope: 'STEP' });
      expect(reduceTeacherView([...started, note], [], 3)).toMatchObject({ nextStepIndex: 1, nextStepMuted: true });
      expect(reduceTeacherView([...started, ev(3, 'STEP_CHANGED', 2)], [], 3).nextStepIndex).toBeNull();
    });
    it('pulse casado por questionSeq', () => {
      const pulse = [
        { seq: 9, stepIndex: 1, kind: 'OPEN' as const, answered: 1, correct: null },
        { seq: 3, stepIndex: 0, kind: 'OPEN' as const, answered: 2, correct: null },
      ];
      expect(reduceTeacherView([...started, openQ], pulse, 3).pulse).toEqual(pulse[1]);
    });
  });
});
