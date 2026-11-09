import { describe, expect, it, vi } from 'vitest';
import type { DidacticChunk } from '@/domains/rag/types';
import type { InferenceMeta } from '@/domains/telemetry/services/logged-stream-chat';
import { produceStepContent, relevantChunks, type StepContent, type StepContentDeps, type StepContentInput } from '../tutor-step-content';
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
  content: 'Descrição do passo na prática.',
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
  draft?: Partial<{ card: unknown; question: unknown; calls: number; stepHash: string; claimActive: boolean }>;
  claim?: boolean;
  chunks?: DidacticChunk[];
  script?: Script;
  searchThrows?: boolean;
  lostAtSpend?: number;
  saveFails?: boolean;
} = {}) {
  const state = { calls: opts.draft?.calls ?? 0, spends: 0 };
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
      claimActive: opts.draft?.claimActive ?? false,
    })),
    claimDraft: vi.fn(async () => ((opts.claim ?? true) ? 'T1' : null)),
    spendCall: vi.fn(async () => {
      state.spends++;
      if (opts.lostAtSpend === state.spends) return 'LOST' as const;
      if (state.calls >= 2) return 'BUDGET' as const;
      state.calls++;
      return 'SPENT' as const;
    }),
    saveDraftContent: vi.fn(async () => !opts.saveFails),
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
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1', 'T1');
  });

  it('busca só léxica com trecho fora do tópico do passo: noMaterial, sem chamadas, reserva liberada', async () => {
    const lexical = chunk({
      similarityScore: undefined,
      bm25Score: 0.2,
      chapter: 'Capítulo 4: Álgebra Relacional e SQL',
      content: 'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção.',
    });
    const m = makeDeps({ chunks: [lexical] });
    const step = {
      ...item,
      activity: 'Subqueries e operações de conjunto',
      description: 'Reescrever uma junção como subquery e combinar consultas com UNION e EXCEPT.',
    };
    const r = await produceStepContent({ ...input, item: step }, m.deps);
    expect(r).toEqual({ status: 'DONE', noMaterial: true, card: null, question: null, failure: null });
    expect(m.streamChat).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1', 'T1');
  });

  it('busca só léxica com trecho que cobre o tópico do passo: gera o cartão', async () => {
    const lexical = chunk({
      similarityScore: undefined,
      bm25Score: 0.2,
      chapter: 'Capítulo 4: Álgebra Relacional e SQL',
      content: 'A cláusula INNER JOIN combina tuplas; o LEFT OUTER JOIN preserva a tabela à esquerda.',
    });
    const m = makeDeps({ chunks: [lexical], script: [{ text: cardJson }] });
    const step = { ...item, activity: 'INNER JOIN e LEFT JOIN na prática' };
    const r = await produceStepContent({ ...input, item: step, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: false, failure: null });
    expect((r as Extract<StepContent, { status: 'DONE' }>).card?.payload.source).toBe('GENERATED');
  });

  it('com embeddings, trecho léxico abaixo do corte de similaridade passa se cobre o tópico', async () => {
    const m = makeDeps({ chunks: [chunk({ similarityScore: 0.3, bm25Score: 0.1 })], script: [{ text: cardJson }] });
    const r = await produceStepContent({ ...input, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: false });
  });

  it('híbrido: trecho de JOIN com sim 0,62 e casamento léxico, passo Subqueries: noMaterial', async () => {
    const join = chunk({
      similarityScore: 0.62,
      bm25Score: 0.2,
      chapter: 'Capítulo 4: Álgebra Relacional e SQL',
      content: 'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção.',
    });
    const m = makeDeps({ chunks: [join] });
    const step = {
      ...item,
      activity: 'Subqueries e operações de conjunto',
      description: 'Reescrever uma junção como subquery e combinar consultas com UNION e EXCEPT.',
    };
    const r = await produceStepContent({ ...input, item: step }, m.deps);
    expect(r).toEqual({ status: 'DONE', noMaterial: true, card: null, question: null, failure: null });
    expect(m.streamChat).not.toHaveBeenCalled();
  });

  it('híbrido: trecho do Cap. 8 com sim 0,69 cobrindo "Propriedades ACID": publica', async () => {
    const acid = chunk({
      similarityScore: 0.69,
      bm25Score: 0.3,
      chapter: 'Capítulo 8: Transações',
      content: 'As propriedades ACID (atomicidade, consistência, isolamento e durabilidade) garantem transações.',
    });
    const m = makeDeps({ chunks: [acid], script: [{ text: cardJson }] });
    const step = { ...item, activity: 'Propriedades ACID', description: 'Atomicidade e durabilidade.' };
    const r = await produceStepContent({ ...input, item: step, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: false, failure: null });
  });

  it('lista mista: o gate de tópico vale por trecho, só o que cobre o tópico segue', () => {
    const off = chunk({ id: 'k2', similarityScore: undefined, bm25Score: 0.2, content: 'nada a ver' });
    const on = chunk({ id: 'k3', similarityScore: 0.7 });
    expect(relevantChunks([chunk({ similarityScore: 0.3 }), off, on], item, 'Descrição do passo', 0).map((c) => c.id)).toEqual(['k3']);
  });

  it('busca só léxica com tópico vazio: avisa com o passo e fica sem material', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lexical = chunk({ similarityScore: undefined, bm25Score: 0.2, content: 'O intervalo de confiança de 95%.' });
    const m = makeDeps({ chunks: [lexical] });
    const r = await produceStepContent({ ...input, item: { ...item, activity: 'Intervalo', description: '' } }, m.deps);
    expect(r).toEqual({ status: 'DONE', noMaterial: true, card: null, question: null, failure: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('passo 1'));
    warn.mockRestore();
  });

  it('relevantChunks sem trechos devolve lista vazia', () => {
    expect(relevantChunks([], item, 'consulta', 0)).toEqual([]);
  });

  it('sem trechos com cartão do rascunho: devolve o cartão (fromDraft) e noMaterial só da pergunta', async () => {
    const first = makeDeps({ script: [{ text: cardJson }] });
    const g = (await produceStepContent({ ...input, wantQuestion: false }, first.deps)) as Extract<
      StepContent,
      { status: 'DONE' }
    >;
    const m = makeDeps({ draft: { card: g.card!.payload, calls: 1 }, chunks: [] });
    const r = await produceStepContent(input, m.deps);
    expect(r).toMatchObject({ status: 'DONE', noMaterial: true, question: null, failure: null });
    const d = r as Extract<StepContent, { status: 'DONE' }>;
    expect(d.card?.fromDraft).toBe(true);
    expect(d.card?.payload.source).toBe('DRAFT');
    expect(m.drafts.spendCall).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1', 'T1');
  });

  it('reserva perdida no spendCall: BUSY sem modelo, sem publicar nem liberar', async () => {
    const m = makeDeps({ lostAtSpend: 1, script: [{ text: cardJson }] });
    expect(await produceStepContent(input, m.deps)).toEqual({ status: 'BUSY' });
    expect(m.streamChat).not.toHaveBeenCalled();
    expect(m.drafts.saveDraftContent).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('reserva perdida antes da pergunta: BUSY, sem gerar a pergunta', async () => {
    const m = makeDeps({ lostAtSpend: 2, script: [{ text: cardJson }, { text: questionJson }] });
    expect(await produceStepContent(input, m.deps)).toEqual({ status: 'BUSY' });
    expect(m.streamChat).toHaveBeenCalledTimes(1);
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('saveDraftContent falso (linha perdida): BUSY sem publicar nem liberar', async () => {
    const m = makeDeps({ saveFails: true, script: [{ text: cardJson }, { text: questionJson }] });
    expect(await produceStepContent(input, m.deps)).toEqual({ status: 'BUSY' });
    expect(m.drafts.saveDraftContent).toHaveBeenCalledTimes(1);
    expect(m.streamChat).toHaveBeenCalledTimes(1);
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
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
    expect(m.drafts.spendCall).toHaveBeenCalledWith('d1', 'T1');
    expect(m.drafts.saveDraftContent).toHaveBeenCalledWith('d1', 'T1', stepHash(item, ['ch1']), {
      card: expect.objectContaining({ source: 'GENERATED' }),
    });
    expect(m.metas).toEqual([
      { agendaId: 'ag1', purpose: 'TUTOR_CARD' },
      { agendaId: 'ag1', purpose: 'TUTOR_QUESTION' },
    ]);
    expect(m.drafts.saveDraftContent).toHaveBeenCalledTimes(2);
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1', 'T1');
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

  it('spendCall BUDGET no meio: encerra', async () => {
    const m = makeDeps({ draft: { calls: 1 }, script: [{ text: 'x' }] });
    const r = await produceStepContent({ ...input, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ card: null, failure: { reason: 'PROVIDER_ERROR', kind: 'CARD' } });
    expect(m.streamChat).toHaveBeenCalledTimes(1);
  });

  it('exceção do modelo vira provider_error e libera a reserva', async () => {
    const m = makeDeps({ script: [{ throws: true }, { throws: true }] });
    const r = await produceStepContent({ ...input, wantQuestion: false }, m.deps);
    expect(r).toMatchObject({ failure: { reason: 'PROVIDER_ERROR', kind: 'CARD' } });
    expect(m.drafts.releaseDraft).toHaveBeenCalledWith('d1', 'T1');
  });

  it('exceção na busca propaga e mantém a reserva (TTL vira backoff)', async () => {
    const m = makeDeps({ searchThrows: true });
    await expect(produceStepContent(input, m.deps)).rejects.toThrow('boom');
    expect(m.drafts.claimDraft).toHaveBeenCalled();
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('exceção ao carregar o escopo também mantém a reserva', async () => {
    const m = makeDeps();
    (m.deps.loadScope as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('escopo'));
    await expect(produceStepContent(input, m.deps)).rejects.toThrow('escopo');
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('calls=2 com reserva viva: BUSY, sem BUDGET nem reserva', async () => {
    const m = makeDeps({ draft: { calls: 2, claimActive: true } });
    expect(await produceStepContent(input, m.deps)).toEqual({ status: 'BUSY' });
    expect(m.drafts.claimDraft).not.toHaveBeenCalled();
    expect(m.search).not.toHaveBeenCalled();
    expect(m.drafts.releaseDraft).not.toHaveBeenCalled();
  });

  it('calls=2 com reserva vencida ou ausente: BUDGET', async () => {
    const m = makeDeps({ draft: { calls: 2, claimActive: false } });
    expect(await produceStepContent(input, m.deps)).toMatchObject({
      status: 'DONE',
      failure: { reason: 'BUDGET', kind: 'BOTH' },
    });
  });

  it('reserva viva com rascunho completo ainda promove o rascunho', async () => {
    const first = makeDeps({ script: [{ text: cardJson }, { text: questionJson }] });
    const g = (await produceStepContent(input, first.deps)) as Extract<StepContent, { status: 'DONE' }>;
    const m = makeDeps({ draft: { card: g.card!.payload, question: g.question!.payload, claimActive: true } });
    expect(await produceStepContent(input, m.deps)).toMatchObject({ status: 'DONE', failure: null });
  });

  it('reserva acontece antes da busca', async () => {
    const m = makeDeps({ script: [{ text: cardJson }, { text: questionJson }] });
    await produceStepContent(input, m.deps);
    expect(m.drafts.claimDraft.mock.invocationCallOrder[0]).toBeLessThan(m.search.mock.invocationCallOrder[0]);
  });
});
