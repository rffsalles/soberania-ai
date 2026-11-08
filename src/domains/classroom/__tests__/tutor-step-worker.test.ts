import { describe, expect, it, vi } from 'vitest';
const findLessonPlayerData = vi.fn();
vi.mock('@/domains/teaching/services/lesson-plan-repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findLessonPlayerData: (...a: unknown[]) => findLessonPlayerData(...a),
  findLessonTutorScope: vi.fn(async () => null),
}));
vi.mock('@/domains/agendas/services/agenda-repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findAgendaById: vi.fn(async () => {
    throw new Error('boom');
  }),
}));

import { findAgendaById } from '@/domains/agendas/services/agenda-repository';
import type { ClassEventDTO } from '../class-event-schema';
import type { NewTutorEvent } from '../class-event-repository';
import type { StepContent } from '../tutor-step-content';
import {
  runTutorForStep,
  runTutorForStepSafely,
  type TutorStepContext,
  type TutorWorkerDeps,
} from '../tutor-step-worker';

const item = (over = {}) => ({ timeSeconds: 0, timeRange: 'a', activity: 'Ato', description: 'd', ...over });
const ctx = (script = [item({ timeSeconds: 0 }), item({ timeSeconds: 600 }), item({ timeSeconds: 1200 })]): TutorStepContext => ({
  agendaId: 'ag',
  lessonPlanId: 'lp',
  agendaSeconds: 1800,
  script,
  dailyObjective: 'obj',
  chapterIds: ['c1'],
});
let seq = 0;
const ev = (type: ClassEventDTO['type'], stepIndex: number | null, payload: unknown = {}): ClassEventDTO => ({
  seq: ++seq,
  type,
  stepIndex,
  payload,
  createdBy: 'SYSTEM',
  createdAt: '2026-11-08T10:00:00.000Z',
});
const running = () => [ev('SESSION_STARTED', null), ev('STEP_CHANGED', 0)];

const cardPayload = { concepts: [], objectiveLink: 'x', source: 'GENERATED' as const };
const questionPayload = { kind: 'MULTIPLE_CHOICE' as const, origin: 'TUTOR' as const, source: 'GENERATED' as const, question: {} };
const done = (over: Partial<Extract<StepContent, { status: 'DONE' }>> = {}): StepContent => ({
  status: 'DONE',
  noMaterial: false,
  card: null,
  question: null,
  failure: null,
  ...over,
});

function makeDeps(opts: {
  events?: ClassEventDTO[];
  content?: StepContent;
  context?: TutorStepContext | 'ENDED' | null;
}) {
  const events = opts.events ?? running();
  const calls: NewTutorEvent[][] = [];
  const deps = {
    loadContext: vi.fn(async () => (opts.context === undefined ? ctx() : opts.context)),
    readEvents: vi.fn(async () => [...events]),
    produce: vi.fn(async () => opts.content ?? done()),
    appendTutorEvents: vi.fn(async (_a: string, step: number, batch: NewTutorEvent[]) => {
      calls.push(batch);
      for (const b of batch) {
        if (!events.some((e) => e.stepIndex === step && e.type === b.type)) {
          events.push(ev(b.type, step, b.payload));
        }
      }
      return events.filter((e) => e.stepIndex === step && batch.some((b) => b.type === e.type));
    }),
  } as unknown as TutorWorkerDeps & { produce: ReturnType<typeof vi.fn>; appendTutorEvents: ReturnType<typeof vi.fn> };
  return { deps, calls };
}

describe('runTutorForStep', () => {
  it('NO_STEP sem contexto ou fora do roteiro', async () => {
    expect(await runTutorForStep('ag', 0, makeDeps({ context: null }).deps)).toBe('NO_STEP');
    expect(await runTutorForStep('ag', 7, makeDeps({}).deps)).toBe('NO_STEP');
  });

  it('ENDED com SESSION_ENDED', async () => {
    const { deps } = makeDeps({ events: [...running(), ev('SESSION_ENDED', null)] });
    expect(await runTutorForStep('ag', 0, deps)).toBe('ENDED');
    expect(deps.produce).not.toHaveBeenCalled();
  });

  it('ENDED quando o contexto diz que a agenda foi cancelada ou concluída', async () => {
    const { deps } = makeDeps({ context: 'ENDED' });
    expect(await runTutorForStep('ag', 0, deps)).toBe('ENDED');
    expect(deps.produce).not.toHaveBeenCalled();
  });

  it('loadContext padrão: agenda CANCELLED ou COMPLETED vira ENDED sem ler o plano', async () => {
    for (const status of ['CANCELLED', 'COMPLETED'] as const) {
      vi.mocked(findAgendaById).mockResolvedValueOnce({
        id: 'ag',
        status,
        lessonPlanId: 'lp',
        startTime: new Date(),
        endTime: new Date(),
      } as never);
      expect(await runTutorForStep('ag', 0)).toBe('ENDED');
    }
    expect(findLessonPlayerData).not.toHaveBeenCalled();
  });

  it('pergunta do professor com append vazio (aula encerrada): ENDED sem produce', async () => {
    const script = [item({ socraticQuestion: 'Por quê?' }), item({ timeSeconds: 600 })];
    const { deps } = makeDeps({ context: ctx(script) });
    deps.appendTutorEvents.mockResolvedValueOnce([]);
    expect(await runTutorForStep('ag', 0, deps)).toBe('ENDED');
    expect(deps.produce).not.toHaveBeenCalled();
    expect(deps.appendTutorEvents).toHaveBeenCalledTimes(1);
  });

  it('SILENT quando mudo', async () => {
    const note = ev('TEACHER_NOTE', null, { tutor: 'MUTE', scope: 'LESSON' });
    const { deps } = makeDeps({ events: [...running(), note] });
    expect(await runTutorForStep('ag', 0, deps)).toBe('SILENT');
    expect(deps.produce).not.toHaveBeenCalled();
    expect(deps.appendTutorEvents).not.toHaveBeenCalled();
  });

  it('ALREADY_DONE com cartão ou skip', async () => {
    for (const t of ['TUTOR_CARD', 'TUTOR_SKIPPED'] as const) {
      const { deps } = makeDeps({ events: [...running(), ev(t, 0)] });
      expect(await runTutorForStep('ag', 0, deps)).toBe('ALREADY_DONE');
      expect(deps.produce).not.toHaveBeenCalled();
    }
  });

  it('pergunta do professor sai antes do produce, sem pergunta gerada', async () => {
    const script = [item({ socraticQuestion: 'Por quê?' }), item({ timeSeconds: 600 })];
    const { deps, calls } = makeDeps({ context: ctx(script), content: done({ card: { payload: cardPayload, fromDraft: false } }) });
    const order: string[] = [];
    deps.produce.mockImplementation(async () => {
      order.push('produce');
      return done({ card: { payload: cardPayload, fromDraft: false } });
    });
    deps.appendTutorEvents.mockImplementationOnce(async () => {
      order.push('teacher');
      return [ev('TUTOR_QUESTION', 0)];
    });
    expect(await runTutorForStep('ag', 0, deps)).toBe('PUBLISHED');
    expect(order).toEqual(['teacher', 'produce']);
    expect(deps.appendTutorEvents.mock.calls[0][2]).toEqual([
      { type: 'TUTOR_QUESTION', payload: { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' }, audience: 'ALL' },
    ]);
    expect(deps.produce.mock.calls[0][0].wantQuestion).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((e) => e.type)).toEqual(['TUTOR_CARD']);
  });

  it('não republica a pergunta do professor já presente', async () => {
    const script = [item({ socraticQuestion: 'Por quê?' }), item({ timeSeconds: 600 })];
    const { deps, calls } = makeDeps({
      context: ctx(script),
      events: [...running(), ev('TUTOR_QUESTION', 0, { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' })],
      content: done({ card: { payload: cardPayload, fromDraft: false } }),
    });
    await runTutorForStep('ag', 0, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((e) => e.type)).toEqual(['TUTOR_CARD']);
  });

  it('BUSY repassado sem publicar', async () => {
    const { deps } = makeDeps({ content: { status: 'BUSY' } });
    expect(await runTutorForStep('ag', 0, deps)).toBe('BUSY');
    expect(deps.appendTutorEvents).not.toHaveBeenCalled();
  });

  it('PUBLISHED cartão + pergunta, DRAFT vs GENERATED por fromDraft', async () => {
    const { deps, calls } = makeDeps({
      content: done({
        card: { payload: cardPayload, fromDraft: true },
        question: { payload: questionPayload as never, fromDraft: false },
      }),
    });
    expect(await runTutorForStep('ag', 0, deps)).toBe('PUBLISHED');
    expect(deps.produce.mock.calls[0][0].wantQuestion).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((e) => [e.type, e.audience])).toEqual([
      ['TUTOR_CARD', 'ALL'],
      ['TUTOR_QUESTION', 'ALL'],
    ]);
    expect((calls[0][0].payload as { source: string }).source).toBe('DRAFT');
    expect((calls[0][1].payload as { source: string }).source).toBe('GENERATED');
  });

  it('NO_MATERIAL publica só o skip para o professor', async () => {
    const { deps, calls } = makeDeps({ content: done({ noMaterial: true }) });
    expect(await runTutorForStep('ag', 0, deps)).toBe('PUBLISHED');
    expect(calls).toEqual([
      [{ type: 'TUTOR_SKIPPED', payload: { reason: 'NO_MATERIAL', kind: 'BOTH' }, audience: 'TEACHER' }],
    ]);
  });

  it('cartão + falha vira um append com cartão e skip', async () => {
    const { deps, calls } = makeDeps({
      content: done({
        card: { payload: cardPayload, fromDraft: false },
        failure: { reason: 'PROVIDER_ERROR', kind: 'QUESTION' },
      }),
    });
    await runTutorForStep('ag', 0, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((e) => e.type)).toEqual(['TUTOR_CARD', 'TUTOR_SKIPPED']);
    expect(calls[0][1]).toMatchObject({ audience: 'TEACHER', payload: { reason: 'PROVIDER_ERROR', kind: 'QUESTION' } });
  });

  it('segunda execução não publica de novo', async () => {
    const { deps, calls } = makeDeps({ content: done({ card: { payload: cardPayload, fromDraft: false } }) });
    expect(await runTutorForStep('ag', 0, deps)).toBe('PUBLISHED');
    expect(await runTutorForStep('ag', 0, deps)).toBe('ALREADY_DONE');
    expect(calls.flat().filter((e) => e.type === 'TUTOR_CARD')).toHaveLength(1);
  });
});

describe('runTutorForStepSafely', () => {
  it('captura e loga falhas sem lançar', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runTutorForStepSafely('ag', 0)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('[tutora] falha no worker', expect.anything());
    spy.mockRestore();
  });
});
