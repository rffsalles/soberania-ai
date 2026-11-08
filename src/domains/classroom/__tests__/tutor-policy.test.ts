import { describe, expect, it } from 'vitest';

import type { TimeScriptItem } from '@/domains/teaching/time-script';

import type { ClassEventDTO, ClassEventTypeName } from '../class-event-schema';
import {
  decideTutorPlan,
  failureReason,
  noMaterialSkip,
  stalledTutorStep,
  stepDurationSeconds,
  tutorRunTarget,
  tutorSkipMessage,
} from '../tutor-policy';

function item(timeSeconds: number, extra: Partial<TimeScriptItem> = {}): TimeScriptItem {
  return { timeSeconds, ...extra } as TimeScriptItem;
}
function ev(
  seq: number,
  type: ClassEventTypeName,
  stepIndex: number | null = null,
  payload: unknown = {},
): ClassEventDTO {
  return { seq, type, stepIndex, payload, createdBy: 'TEACHER', createdAt: '2026-11-08T00:00:00.000Z' };
}

describe('tutor-policy', () => {
  it('regra 1 vence a 2: mudo não publica nem a pergunta do professor', () => {
    expect(decideTutorPlan({ item: item(0, { socraticQuestion: 'Por quê?' }), durationSeconds: 900 }, { muted: true })).toEqual({ kind: 'SILENT' });
  });
  it('regra 2 vence a 3: pergunta do professor mesmo em passo curto', () => {
    expect(decideTutorPlan({ item: item(0, { socraticQuestion: ' Por quê? ' }), durationSeconds: 60 }, { muted: false }))
      .toEqual({ kind: 'RUN', question: { from: 'TEACHER', text: 'Por quê?' } });
  });
  it('regra 3: menos de 4 min sem pergunta gerada; 4 min com', () => {
    expect(decideTutorPlan({ item: item(0), durationSeconds: 239 }, { muted: false })).toEqual({ kind: 'RUN', question: null });
    expect(decideTutorPlan({ item: item(0), durationSeconds: 240 }, { muted: false })).toEqual({ kind: 'RUN', question: { from: 'MODEL' } });
  });
  it('duração do último passo vem da agenda', () => {
    const s = [item(0), item(600), item(1800)];
    expect([0, 1, 2].map((i) => stepDurationSeconds(s, i, 3000))).toEqual([600, 1200, 1200]);
    expect(stepDurationSeconds(s, 2, 1000)).toBe(0);
  });
  it('regra 4: NO_MATERIAL com BOTH só quando a pergunta seria gerada', () => {
    expect(noMaterialSkip({ kind: 'RUN', question: { from: 'MODEL' } })).toEqual({ reason: 'NO_MATERIAL', kind: 'BOTH' });
    expect(noMaterialSkip({ kind: 'RUN', question: { from: 'TEACHER', text: 'x' } })).toEqual({ reason: 'NO_MATERIAL', kind: 'CARD' });
  });
  it('regra 4 com rascunho: cartão já disponível deixa o skip só da pergunta', () => {
    const model = { kind: 'RUN', question: { from: 'MODEL' } } as const;
    expect(noMaterialSkip(model, { card: true, question: false })).toEqual({ reason: 'NO_MATERIAL', kind: 'QUESTION' });
    expect(noMaterialSkip(model, { card: false, question: true })).toEqual({ reason: 'NO_MATERIAL', kind: 'CARD' });
  });
  it('regra 5', () => {
    expect(failureReason(['rate_limit', 'rate_limit'])).toBe('RATE_LIMIT');
    expect(failureReason(['rate_limit'])).toBe('RATE_LIMIT');
    expect(failureReason(['ok', 'rate_limit'])).toBe('RATE_LIMIT');
    expect(failureReason(['invalid', 'rate_limit'])).toBe('PROVIDER_ERROR');
    expect(failureReason(['provider_error', 'rate_limit'])).toBe('PROVIDER_ERROR');
    expect(failureReason(['invalid'])).toBe('PROVIDER_ERROR');
    expect(failureReason([])).toBe('BUDGET');
    expect(failureReason(['ok'])).toBe('BUDGET');
  });
  it('passo parado: >20 s sem cartão nem skip; pergunta do professor sozinha não conclui', () => {
    const t0 = Date.parse('2026-11-08T12:00:00Z');
    const step = { ...ev(2, 'STEP_CHANGED', 1), createdAt: new Date(t0).toISOString() };
    const es = [ev(1, 'SESSION_STARTED'), step, ev(3, 'TUTOR_QUESTION', 1)];
    expect(stalledTutorStep(es, t0 + 20_000)).toBeNull();
    expect(stalledTutorStep(es, t0 + 20_001)).toBe(1);
    expect(stalledTutorStep([...es, ev(4, 'TUTOR_SKIPPED', 1)], t0 + 60_000)).toBeNull();
    expect(stalledTutorStep([...es, ev(4, 'TEACHER_NOTE', 1, { tutor: 'MUTE', scope: 'STEP' })], t0 + 60_000)).toBeNull();
    expect(stalledTutorStep([...es, ev(4, 'SESSION_ENDED')], t0 + 60_000)).toBeNull();
  });
  it('alvo do worker após o POST', () => {
    expect(tutorRunTarget([ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0)])).toBe(0);
    expect(tutorRunTarget([ev(5, 'TEACHER_NOTE', 3, { tutor: 'PUBLISH_NOW', scope: 'STEP' })])).toBe(3);
    expect(tutorRunTarget([ev(5, 'TEACHER_NOTE', 3, { tutor: 'MUTE', scope: 'STEP' })])).toBeNull();
  });
  it('mensagem do skip', () => {
    expect(tutorSkipMessage({ reason: 'RATE_LIMIT', kind: 'QUESTION' }))
      .toBe('O provedor de IA recusou por limite de uso. Sem pergunta gerada neste passo.');
  });
});
