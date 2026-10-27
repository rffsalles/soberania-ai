import { describe, it, expect } from 'vitest';
import {
  buildLessonGenerationMessages,
  buildLessonRefineMessages,
  parseLessonGeneration,
  stepsToTimeScript,
} from '../lesson-generation-prompt';
import type { DidacticChunk } from '@/domains/rag/types';

const chunk: DidacticChunk = {
  id: 'c1', materialId: 'm1', bookTitle: 'Sistemas de Banco de Dados', author: 'Elmasri', chapter: 'Cap. 3: Modelagem',
  pageNumber: 41, content: 'Entidades e relacionamentos.',
};
const chapters = [
  { chapter: { id: 'ch3', order: 3, number: '3', title: 'Modelagem', startPage: 40, endPage: 60, material: { title: 'Sistemas de Banco de Dados', author: 'Elmasri' } } },
];

describe('buildLessonGenerationMessages', () => {
  it('contexto traz disciplina, ementa, aula, duração, capítulos e trechos com citação', () => {
    const [system, user] = buildLessonGenerationMessages({
      subjectName: 'Banco de Dados', syllabus: 'Modelo relacional', classNumber: 3, totalClasses: 20,
      durationMinutes: 100, topicTitle: 'Modelagem', chapters, chunks: [chunk],
    });
    expect(system.role).toBe('system');
    expect(user.content).toContain('Banco de Dados');
    expect(user.content).toContain('Modelo relacional');
    expect(user.content).toContain('Aula 3 de 20');
    expect(user.content).toContain('100 minutos');
    expect(user.content).toContain('Cap. 3: Modelagem — Sistemas de Banco de Dados (Elmasri), p. 40 a 60');
    expect(user.content).toContain('[Sistemas de Banco de Dados · Cap. 3, pág. 41]');
    expect(user.content).toContain('Entidades e relacionamentos.');
  });
});

describe('rótulo hierárquico Cap. {number}', () => {
  const sub = [
    { chapter: { id: 's22', order: 4, number: '2.2', title: 'Frações', startPage: 48, endPage: 66, material: { title: 'Matemática Básica', author: 'Silva' } } },
  ];
  it('geração usa number com páginas', () => {
    const [, user] = buildLessonGenerationMessages({
      subjectName: 'M', syllabus: 'S', classNumber: 1, totalClasses: 2,
      durationMinutes: 100, topicTitle: 'Frações', chapters: sub, chunks: [chunk],
    });
    expect(user.content).toContain('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66');
  });
  it('refino usa number sem páginas', () => {
    const [, user] = buildLessonRefineMessages({
      subjectName: 'M', topicTitle: 'Frações', chapters: sub, field: 'methodology',
      instruction: 'mais curto', current: 'x', chunks: [chunk],
    });
    expect(user.content).toContain('Cap. 2.2: Frações — Matemática Básica (Silva)');
    expect(user.content).not.toContain('p. 48');
  });
});

describe('parseLessonGeneration', () => {
  const valid = {
    dailyObjective: 'o', methodology: 'm', resourcesNeeded: ['r'], fixationExercise: 'e',
    steps: [{ activity: 'a', description: 'd', durationMinutes: 100 }],
  };
  it('extrai JSON cercado de texto', () => {
    expect(parseLessonGeneration(`ok ${JSON.stringify(valid)} fim`)).toEqual(valid);
  });
  it('null para inválido', () => {
    expect(parseLessonGeneration('sem json')).toBeNull();
    expect(parseLessonGeneration(JSON.stringify({ ...valid, steps: [] }))).toBeNull();
    expect(parseLessonGeneration(JSON.stringify({ ...valid, steps: [{ activity: 'a', description: 'd', durationMinutes: 0 }] }))).toBeNull();
  });
});

describe('stepsToTimeScript', () => {
  it('início acumulado e intervalo MM:00-MM:00', () => {
    const r = stepsToTimeScript([
      { activity: 'a', description: 'd', durationMinutes: 20, socraticQuestion: 'q?' },
      { activity: 'b', description: 'e', durationMinutes: 65 },
      { activity: 'c', description: 'f', durationMinutes: 15 },
    ]);
    expect(r.map((s) => [s.timeSeconds, s.timeRange])).toEqual([
      [0, '00:00-20:00'], [1200, '20:00-85:00'], [5100, '85:00-100:00'],
    ]);
    expect(r[0].socraticQuestion).toBe('q?');
    expect('socraticQuestion' in r[1]).toBe(false);
  });
});
