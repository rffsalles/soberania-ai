import { describe, it, expect } from 'vitest';
import {
  buildChapterDistributionMessages,
  isValidDistribution,
  parseChapterDistribution,
} from '../chapter-distribution-prompt';
import type { PlanChapterBook } from '@/domains/teaching/services/plan-chapters-service';

const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [
      { id: 'ch1', order: 1, title: 'Introdução', startPage: 12, endPage: 24 },
      { id: 'ch2', order: 2, title: 'Fim', startPage: 25, endPage: null },
    ],
  },
];

describe('chapter-distribution-prompt', () => {
  it('prompt lista aulas com data e duração e capítulos com id e páginas', () => {
    const messages = buildChapterDistributionMessages({
      subjectName: 'Banco de Dados', syllabus: 'Ementa', objectives: 'Objetivos',
      lessons: [{ classNumber: 1, date: '2026-03-02', durationMinutes: 100 }], books,
    });
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Aula 1 · 2026-03-02 · 100 min');
    expect(user).toContain('id=ch1 · Cap. 1: Introdução (p. 12 a 24)');
    expect(user).toContain('id=ch2 · Cap. 2: Fim (p. 25)');
    expect(user).toContain('Livro A');
  });

  it('parse extrai o primeiro objeto JSON e rejeita formato inválido', () => {
    const raw = 'ok {"lessons":[{"classNumber":1,"topicTitle":" Intro ","chapterIds":["ch1"]}]} fim';
    expect(parseChapterDistribution(raw)).toEqual([{ classNumber: 1, topicTitle: 'Intro', chapterIds: ['ch1'] }]);
    expect(parseChapterDistribution('sem json')).toBeNull();
    expect(parseChapterDistribution('{"lessons":[{"classNumber":1}]}')).toBeNull();
  });

  it('isValidDistribution exige cobertura exata, capítulos do plano e não vazios', () => {
    const ids = new Set(['ch1', 'ch2']);
    const item = (n: number, c: string[]) => ({ classNumber: n, topicTitle: 'T', chapterIds: c });
    expect(isValidDistribution([item(1, ['ch1']), item(2, ['ch1', 'ch2'])], [1, 2], ids)).toBe(true);
    expect(isValidDistribution([item(1, ['ch1'])], [1, 2], ids)).toBe(false);
    expect(isValidDistribution([item(1, ['ch1']), item(2, ['ch2']), item(3, ['ch2'])], [1, 2], ids)).toBe(false);
    expect(isValidDistribution([item(1, ['ch1']), item(1, ['ch1'])], [1, 2], ids)).toBe(false);
    expect(isValidDistribution([item(1, ['ch1']), item(2, ['zz'])], [1, 2], ids)).toBe(false);
    expect(isValidDistribution([item(1, ['ch1']), item(2, [])], [1, 2], ids)).toBe(false);
  });
});
