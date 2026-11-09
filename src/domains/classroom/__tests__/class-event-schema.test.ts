import { describe, expect, it } from 'vitest';

import {
  CLASS_EVENT_TYPES,
  TEACHER_WRITABLE_TYPES,
  audiencesFor,
  parseClassEvent,
  projectForStudent,
} from '../class-event-schema';

const card = (n: number) => ({
  concepts: Array.from({ length: n }, (_, i) => ({
    title: `C${i}`,
    explanation: 'x',
    citation: { chunkId: 'k', label: 'Cap. 1', page: null },
  })),
  objectiveLink: 'liga',
  source: 'GENERATED',
});

describe('class-event-schema', () => {
  it('STEP_CHANGED: limites de activity/timeRange e stepIndex 0..59', () => {
    const p = { activity: 'a', timeRange: '0-5', fromStepIndex: null };
    expect(parseClassEvent('STEP_CHANGED', p, 0).ok).toBe(true);
    expect(parseClassEvent('STEP_CHANGED', { ...p, activity: 'x'.repeat(201) }, 0).ok).toBe(false);
    expect(parseClassEvent('STEP_CHANGED', { ...p, timeRange: 'x'.repeat(41) }, 0).ok).toBe(false);
    expect(parseClassEvent('STEP_CHANGED', p, 60).ok).toBe(false);
    expect(parseClassEvent('STEP_CHANGED', p, null).ok).toBe(false);
  });

  it('TUTOR_CARD aceita 2..3 conceitos', () => {
    expect([1, 2, 3, 4].map((n) => parseClassEvent('TUTOR_CARD', card(n), 0).ok)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('TEACHER_NOTE scope STEP exige stepIndex; text até 500', () => {
    expect(parseClassEvent('TEACHER_NOTE', { tutor: 'MUTE', scope: 'STEP' }, null).ok).toBe(false);
    expect(parseClassEvent('TEACHER_NOTE', { tutor: 'MUTE', scope: 'LESSON' }, null).ok).toBe(true);
    expect(
      parseClassEvent('TEACHER_NOTE', { tutor: null, scope: 'LESSON', text: 'x'.repeat(501) }, null).ok,
    ).toBe(false);
  });

  it('SESSION_* só aceita {}', () => {
    expect(parseClassEvent('SESSION_STARTED', {}, null).ok).toBe(true);
    expect(parseClassEvent('SESSION_ENDED', { a: 1 }, null).ok).toBe(false);
    expect(parseClassEvent('SESSION_STARTED', {}, 0).ok).toBe(false);
  });

  it('TUTOR_SKIPPED valida reason e kind', () => {
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'NO_MATERIAL', kind: 'BOTH' }, 1).ok).toBe(true);
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'OUTRO', kind: 'BOTH' }, 1).ok).toBe(false);
  });

  it('TUTOR_QUESTION OPEN: text 1..500; tipo desconhecido falha', () => {
    expect(
      parseClassEvent('TUTOR_QUESTION', { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' }, 2).ok,
    ).toBe(true);
    expect(
      parseClassEvent('TUTOR_QUESTION', { kind: 'OPEN', text: '', origin: 'TEACHER' }, 2).ok,
    ).toBe(false);
    expect(parseClassEvent('NOPE', {}, null).ok).toBe(false);
  });

  it('projeção do aluno remove correctKey e rationale', () => {
    const q = {
      id: 'q',
      enunciation: 'Qual a forma normal?',
      options: [...'ABCD'].map((key) => ({ key, text: key })),
      correctKey: 'C',
      rationale: 'r',
      topic: 't',
    };
    const e = projectForStudent({
      seq: 1,
      type: 'TUTOR_QUESTION',
      stepIndex: 0,
      createdBy: 'TUTOR',
      createdAt: '',
      payload: { kind: 'MULTIPLE_CHOICE', question: q, origin: 'TUTOR', source: 'GENERATED' },
    });
    expect((e.payload as any).question).not.toHaveProperty('correctKey');
    expect((e.payload as any).question).not.toHaveProperty('rationale');
    expect((e.payload as any).question.enunciation).toBe(q.enunciation);
  });

  it('audiencesFor', () => {
    expect(audiencesFor({ id: 's1', role: 'STUDENT' })).toEqual(['ALL', 's1']);
    expect(audiencesFor({ id: 't1', role: 'TEACHER' })).toEqual(['ALL', 'TEACHER']);
    expect(audiencesFor({ id: 'a1', role: 'ADMIN' })).toEqual(['ALL', 'TEACHER']);
  });

  it('GROUP_MESSAGE: payload estrito { messageId } e stepIndex nulo', () => {
    expect(parseClassEvent('GROUP_MESSAGE', { messageId: 'm1' }, null).ok).toBe(true);
    const withStep = parseClassEvent('GROUP_MESSAGE', { messageId: 'm1' }, 0);
    expect(withStep).toEqual({ ok: false, error: 'stepIndex deve ser nulo neste tipo' });
    expect(parseClassEvent('GROUP_MESSAGE', {}, null).ok).toBe(false);
    expect(parseClassEvent('GROUP_MESSAGE', { messageId: 'm1', extra: 1 }, null).ok).toBe(false);
  });

  it('TUTOR_SKIPPED: STALEMATE_FAILED sem passo; forma de passo continua exigindo passo', () => {
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'STALEMATE_FAILED' }, null).ok).toBe(true);
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'STALEMATE_FAILED' }, 2).ok).toBe(false);
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'STALEMATE_FAILED', kind: 'CARD' }, null).ok).toBe(false);
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'NO_MATERIAL', kind: 'CARD' }, null).ok).toBe(false);
    expect(parseClassEvent('TUTOR_SKIPPED', { reason: 'NO_MATERIAL', kind: 'CARD' }, 1).ok).toBe(true);
  });

  it('GROUP_MESSAGE existe mas não é gravável pelo professor', () => {
    expect(CLASS_EVENT_TYPES).toContain('GROUP_MESSAGE');
    expect(TEACHER_WRITABLE_TYPES).not.toContain('GROUP_MESSAGE');
  });
});
