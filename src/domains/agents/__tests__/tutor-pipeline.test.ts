import { describe, it, expect, vi } from 'vitest';
import type { AIMessage, StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { NO_CHUNKS_CONTEXT, startTutorPipeline } from '../tutor-pipeline';
import { TUTOR_MAX_TOKENS } from '@/lib/constants/tutor';

const chunk = (over: Partial<DidacticChunk>): DidacticChunk => ({
  id: 'c1',
  materialId: 'm1',
  bookTitle: 'Apostila',
  author: 'Prof',
  chapter: 'Cap. 2: ER',
  pageNumber: 31,
  content: 'Uma entidade representa um objeto.',
  ...over,
});

async function systemPromptFor(c: DidacticChunk): Promise<string> {
  const sent: AIMessage[][] = [];
  const streamChat = vi.fn(async function* (messages: AIMessage[]): AsyncGenerator<StreamChunk> {
    sent.push(messages);
    yield { token: '', isComplete: true };
  });
  const start = await startTutorPipeline(
    { message: 'o que é entidade?', agendaType: 'CLASSROOM' },
    { search: async () => ({ query: 'q', chunks: [c], latencyMs: 1 }), streamChat }
  );
  if (start.kind !== 'stream') throw new Error('esperava stream');
  for await (const _ of start.stream) { /* consome */ }
  return sent[0][0].content;
}

describe('startTutorPipeline (contexto RAG)', () => {
  it('cita página real para chunks de PDF', async () => {
    const prompt = await systemPromptFor(chunk({}));
    expect(prompt).toContain('[Apostila · Cap. 2, pág. 31]');
  });

  it('não inventa "pág." para trechos sintéticos de DOCX/TXT/MD', async () => {
    const prompt = await systemPromptFor(chunk({ chapter: 'Trecho 2', pageNumber: 2 }));
    expect(prompt).toContain('[FONTE: [Apostila · Trecho 2]]');
    // O prompt fixo da tutora cita "pág. Y" como formato; o que não pode aparecer é a página do trecho sintético.
    expect(prompt).not.toContain('pág. 2');
  });
});

describe('startTutorPipeline (sem trechos)', () => {
  it('diz explicitamente ao modelo que não há fonte e devolve a lista de trechos usados', async () => {
    const sent: AIMessage[][] = [];
    const streamChat = vi.fn(async function* (messages: AIMessage[]): AsyncGenerator<StreamChunk> {
      sent.push(messages);
      yield { token: '', isComplete: true };
    });
    const start = await startTutorPipeline(
      { message: 'o que é entidade?', agendaType: 'DRAFT_REVIEW' },
      { search: async () => ({ query: 'q', chunks: [], latencyMs: 1 }), streamChat }
    );
    if (start.kind !== 'stream') throw new Error('esperava stream');
    for await (const _ of start.stream) { /* consome */ }
    expect(sent[0][0].content).toContain(NO_CHUNKS_CONTEXT);
    expect(start.chunks).toEqual([]);
  });
});

describe('startTutorPipeline (fora do material)', () => {
  const noChunks = async () => ({ query: 'q', chunks: [], latencyMs: 1 });

  it('sala de aula sem trecho e sem conversa recusa sem chamar o modelo, sugerindo os capítulos da aula', async () => {
    const streamChat = vi.fn();
    const start = await startTutorPipeline(
      { message: 'receita de bolo?', agendaType: 'CLASSROOM', scope: { allowedChapterIds: ['c4'], chapterLabels: ['Cap. 4: SQL (BD)'] } },
      { search: noChunks, streamChat }
    );
    expect(start.kind).toBe('no_material');
    if (start.kind !== 'no_material') return;
    expect(start.reply).toMatch(/^Não encontrei isso no material desta aula\./);
    expect(start.reply).toContain('Cap. 4: SQL (BD)');
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('com conversa em andamento segue para o modelo com a regra de escopo no prompt', async () => {
    const sent: AIMessage[][] = [];
    const streamChat = vi.fn(async function* (messages: AIMessage[]): AsyncGenerator<StreamChunk> {
      sent.push(messages);
      yield { token: '', isComplete: true };
    });
    const start = await startTutorPipeline(
      {
        message: 'acho que é a atomicidade',
        agendaType: 'CLASSROOM',
        history: [{ role: 'assistant', content: 'Qual propriedade garante tudo ou nada?' }],
      },
      { search: noChunks, streamChat }
    );
    expect(start.kind).toBe('stream');
    if (start.kind !== 'stream') return;
    for await (const _ of start.stream) { /* consome */ }
    expect(sent[0][0].content).toContain('não encontrou isso no material');
  });
});

describe('startTutorPipeline (escopo da aula)', () => {
  async function run(scope?: { allowedChapterIds?: string[]; allowedMaterialIds?: string[]; chapterLabels?: string[] }) {
    const sent: AIMessage[][] = [];
    const search = vi.fn(async () => ({ query: 'q', chunks: [chunk({})], latencyMs: 1 }));
    const streamChat = vi.fn(async function* (messages: AIMessage[]): AsyncGenerator<StreamChunk> {
      sent.push(messages);
      yield { token: '', isComplete: true };
    });
    const start = await startTutorPipeline(
      { message: 'o que é entidade?', agendaType: 'CLASSROOM', scope },
      { search, streamChat }
    );
    if (start.kind !== 'stream') throw new Error('esperava stream');
    for await (const _ of start.stream) { /* consome */ }
    return { search, prompt: sent[0][0].content };
  }

  it('"Esta aula cobre" junta os rótulos hierárquicos e filtra pelos ids expandidos', async () => {
    const { prompt, search } = await run({
      allowedChapterIds: ['s22', 's221', 's222', 'u3'],
      chapterLabels: ['Cap. 2.2: Frações (Matemática Básica)', 'Cap. 3: Unidade 3 (Matemática Básica)'],
    });
    expect(prompt).toContain('Esta aula cobre: Cap. 2.2: Frações (Matemática Básica); Cap. 3: Unidade 3 (Matemática Básica).');
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ allowedChapterIds: ['s22', 's221', 's222', 'u3'] }));
  });

  it('com escopo de capítulos filtra a busca e cita os capítulos no prompt', async () => {
    const { search, prompt } = await run({
      allowedChapterIds: ['ch3'],
      chapterLabels: ['Cap. 3: Modelo ER (Sistemas de Banco de Dados)'],
    });
    expect(search).toHaveBeenCalledWith({ query: 'o que é entidade?', topK: 2, allowedChapterIds: ['ch3'] });
    expect(prompt).toContain('Esta aula cobre: Cap. 3: Modelo ER (Sistemas de Banco de Dados).');
  });

  it('sem escopo busca no acervo inteiro como hoje', async () => {
    const { search, prompt } = await run(undefined);
    expect(search).toHaveBeenCalledWith({ query: 'o que é entidade?', topK: 2 });
    expect(prompt).not.toContain('Esta aula cobre');
  });
});

describe('startTutorPipeline (opções do provedor)', () => {
  it('passa TUTOR_MAX_TOKENS ao streamChat', async () => {
    const calls: unknown[][] = [];
    const streamChat = vi.fn(async function* (...args: unknown[]): AsyncGenerator<StreamChunk> {
      calls.push(args);
      yield { token: '', isComplete: true };
    });
    const c = chunk({});
    const start = await startTutorPipeline(
      { message: 'o que é entidade?', agendaType: 'CLASSROOM' },
      { search: async () => ({ query: 'q', chunks: [c], primaryCitation: '[Apostila · Cap. 2, pág. 31]', latencyMs: 1 }), streamChat }
    );
    if (start.kind !== 'stream') throw new Error('esperava stream');
    for await (const _ of start.stream) { /* consome */ }
    expect(TUTOR_MAX_TOKENS).toBe(1200);
    expect(calls[0][1]).toEqual({ citation: '[Apostila · Cap. 2, pág. 31]', maxTokens: TUTOR_MAX_TOKENS });
  });
});
