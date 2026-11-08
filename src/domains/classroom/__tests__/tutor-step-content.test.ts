import { describe, expect, it, vi } from 'vitest';
import type { DidacticChunk } from '@/domains/rag/types';
import type { InferenceMeta } from '@/domains/telemetry/services/logged-stream-chat';
import { produceStepContent, type StepContentDeps, type StepContentInput } from '../tutor-step-content';
import { stepHash } from '../tutor-step-hash';

const item = { timeSeconds: 0, timeRange: '0-10', activity: 'Ato', description: 'Descrição do passo' };
const input: StepContentInput = {
  agendaId: 'ag1',
  lessonPlanId: 'lp1',
  stepIndex: 1,
  item,
  dailyObjective: 'Objetivo',
  chapterIds: ['ch1'],
  wantQuestion: true,
};

const chunk = (over: Partial<DidacticChunk> = {}): DidacticChunk => ({
  id: 'k1',
  materialId: 'm1',
  bookTitle: 'Livro',
  author: 'Autor',
  chapter: 'Cap',
  chapterId: 'ch1',
  pageNumber: 5,
  content: 'conteúdo',
  similarityScore: 0.8,
  ...over,
});

const cardJson = JSON.stringify({
  concepts: [
    { title: 'A', explanation: 'Explicação A', chunkId: 'k1' },
    { title: 'B', explanation: 'Explicação B', chunkId: 'k1' },
  ],
  objectiveLink: 'Liga ao objetivo',
});
const questionJson = JSON.stringify({
  questions: [
    {
      id: 'q1',
      enunciation: 'Qual é a pergunta?',
      options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Alt ${key}` })),
      correctKey: 'A',
      rationale: 'Porque sim',
      topic: 'T',
    },
  ],
  rubrics: [{ criterion: 'c', description: 'd', weight: 1 }],
});

type Script = Array<
  | { text: string }
  | { rateLimit: true }
  | { throws: true }
>;

function makeDeps(opts: {
  draft?: Partial<{ card: unknown; question: unknown; calls: number; stepHash: string }>;
  claim?: boolean;
  chunks?: DidacticChunk[];
  script?: Script;
  searchThrows?: boolean;
} = {}) {
  const state = { calls: opts.draft?.calls ?? 0 };
  const metas: InferenceMeta[] = [];
  const script = [...(opts.script ?? [])];
  const drafts = {
    ensureDraft: vi.fn(async () => ({
      id: 'd1',
      stepIndex: 1,
      stepHash: stepHash(item, ['ch1']),
      card: opts.draft?.card ?? null,
      question: opts.draft?.question ?? null,
      calls: state.calls,
    })),
    claimDraft: vi.fn(async () => opts.claim ?? true),
    spendCall: vi.fn(async () => {
      if (state.calls >= 2) return false;
      state.calls++;
      return true;
    }),
    saveDraftContent: vi.fn(async () => undefined),
    releaseDraft: vi.fn(async () => undefined),
  };
  const search = vi.fn(async () => {
    if (opts.searchThrows) throw new Error('boom');
    return { chunks: opts.chunks ?? [chunk()] };
  });
  const streamChat = vi.fn((meta: InferenceMeta) => {
    metas.push(meta);
    return async function* () {
      const step = script.shift();
      if (!step) throw new Error('script vazio');
      if ('throws' in step) throw new Error('provider');
      if ('rateLimit' in step) yield { token: '', fallback: true, fallbackReason: 'rate_limit' as const };
      else yield { token: step.text };
    };
  });
  const deps = {
    drafts,
    loadScope: vi.fn(async () => ({ allowedChapterIds: ['ch1'] })),
    search,
    chapterLabels: vi.fn(async () => new Map([['ch1', 'Cap. 1: Título — Livro (Autor), p. 1']])),
    streamChat,
  } as unknown as StepContentDeps;
  return { deps, drafts, search, streamChat, metas };
}

describe('produceStepContent', () => {
  it('rascunho completo: DONE fromDraft, sem busca nem reserva', async () => {
    const first = makeDeps({ script: [{ text: cardJson }, { text: questionJson }] });
    const gen = await produceStepContent(input, first.deps);
    expect(gen.status === 'DONE' && gen.card && gen.question).toBeTruthy();
    const g = gen as Extract<typeof gen, { status: 'DONE' }>;
    const m = makeDeps({ draft: { card: g.card!.payload, question: g.question!.payload } });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: false, failure: null });
    const d = r as Extract<typeof r, { status: 'DONE' }>;
    expect(d.card?.fromDraft).toBe(true);
    expect(d.question?.fromDraft).toBe(true);
    expect(m.search).not.toHaveBeenCalled();
    expect(m.drafts.claimDraft).not.toHaveBeenCalled();
    expect(m.streamChat).not.toHaveBeenCalled();
  });

  it('calls esgotadas: BUDGET sem busca, reserva nem modelo', async () => {
    const m = makeDeps({ draft: { calls: 2 } });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ status: 'DONE', card: null, failure: { reason: 'BUDGET', kind: 'BOTH' } });
    expect(m.search).not.toHaveBeenCalled();
    expect(m.drafts.claimDraft).not.toHaveBeenCalled();
    expect(m.streamChat).not.toHaveBeenCalled();
  });

  it('claimDraft falso: BUSY sem busca', async () => {
    const m = makeDeps({ claim: false });
    expect(await produceStepContent(input, m.deps)).toEqual({ status: 'BUSY' });
    expect(m.search).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('trecho só vetorial abaixo do corte: noMaterial, sem chamadas, reserva liberada', async () => {
    const m = makeDeps({ chunks: [chunk({ similarityScore: 0.3 })] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toEqual({ status: 'DONE', noMaterial: true, card: null, question: null, failure: null });
    expect(m.drafts.spendCall).not.toHaveBeenCalled();
    expect(m.streamChat).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1');
  });

  it('cartão e pergunta ok: 2 spendCall, metas e sem falha', async () => {
    const m = makeDeps({ script: [{ text: cardJson }, { text: questionJson }] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: false, failure: null });
    const d = r as Extract<typeof r, { status: 'DONE' }>;
    expect(d.card?.fromDraft).toBe(false);
    expect(d.card?.payload.source).toBe('GENERATED');
    expect(d.question?.payload.question.id).toBe('step-1');
    expect(m.drafts.spendCall).toHaveBeenCalledTimes(2);
    expect(m.metas).toEqual([
      { agendaId: 'ag1', purpose: 'TUTOR_CARD' },
      { agendaId: 'ag1', purpose: 'TUTOR_QUESTION' },
    ]);
    expect(m.drafts.saveDraftContent).toHaveBeenCalledTimes(2);
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1');
  });

  it('cartão inválido e depois ok: pergunta não tentada, BUDGET/QUESTION', async () => {
    const m = makeDeps({ script: [{ text: 'lixo' }, { text: cardJson }] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ failure: { reason: 'BUDGET', kind: 'QUESTION' } });
    expect((r as { card: unknown }).card).not.toBeNull();
    expect(m.streamChat).toHaveBeenCalledTimes(2);
  });

  it('cartão ok e pergunta rate_limit: RATE_LIMIT/QUESTION', async () => {
    const m = makeDeps({ script: [{ text: cardJson }, { rateLimit: true }] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ failure: { reason: 'RATE_LIMIT', kind: 'QUESTION' } });
  });

  it('dois rate_limit no cartão: RATE_LIMIT/BOTH', async () => {
    const m = makeDeps({ script: [{ rateLimit: true }, { rateLimit: true }] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ card: null, failure: { reason: 'RATE_LIMIT', kind: 'BOTH' } });
  });

  it('cartão inválido duas vezes: PROVIDER_ERROR/BOTH com 2 spendCall', async () => {
    const m = makeDeps({ script: [{ text: 'x' }, { text: 'y' }] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ failure: { reason: 'PROVIDER_ERROR', kind: 'BOTH' } });
    expect(m.drafts.spendCall.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(m.streamChat).toHaveBeenCalledTimes(2);
  });

  it('spendCall falso no meio: encerra com BUDGET', async () => {
    const m = makeDeps({ draft: { calls: 1 }, script: [{ text: 'x' }] });
    const r = await produceStepContent({ ...input, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ card: null, failure: { reason: 'PROVIDER_ERROR', kind: 'CARD' } });
    expect(m.streamChat).toHaveBeenCalledTimes(1);
  });

  it('exceção do modelo vira provider_error e libera a reserva', async () => {
    const m = makeDeps({ script: [{ throws: true }, { throws: true }] });
    const r = await produceStepContent({ ...input, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ failure: { reason: 'PROVIDER_ERROR', kind: 'CARD' } });
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1');
  });

  it('exceção na busca propaga e ainda libera a reserva', async () => {
    const m = makeDeps({ searchThrows: true });
    await expect(produceStepContent(input, m.deps)).rejects.toThrow('boom');
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1');
  });
});
