import { describe, it, expect, vi } from 'vitest';
import type { AIMessage, StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { startTutorPipeline } from '../tutor-pipeline';

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
