import { describe, expect, it } from 'vitest';
import type { DidacticChunk } from '@/domains/rag/types';
import { formatCitation } from '@/domains/rag/hybrid-search';
import { buildLessonQuestionMessages } from '../lesson-question-prompt';

const chunk = (n: number): DidacticChunk => ({
  id: `c${n}`,
  materialId: 'm1',
  bookTitle: 'Livro',
  author: 'Autor',
  chapter: `Capítulo ${n}`,
  pageNumber: n,
  content: `Conteúdo ${n}.`,
});

describe('buildLessonQuestionMessages', () => {
  const chunks = [chunk(1), chunk(2)];
  const messages = buildLessonQuestionMessages({
    activity: 'Normalização',
    description: 'Formas normais',
    dailyObjective: 'Entender 3FN',
    chunks,
  });

  it('traz passo, objetivo e citações de cada trecho', () => {
    const user = messages[1].content;
    expect(user).toContain('Passo da aula: Normalização');
    expect(user).toContain('Descrição: Formas normais');
    expect(user).toContain('Objetivo do dia: Entender 3FN');
    for (const c of chunks) expect(user).toContain(formatCitation(c));
  });

  it('o sistema pede exatamente 1 questão no JSON de questions', () => {
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('"questions"');
    expect(messages[0].content).toContain('exatamente 1');
  });
});
