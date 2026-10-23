import { describe, it, expect } from 'vitest';
import type { DidacticChunk } from '@/domains/rag/types';
import { buildTeachingPlanMessages, parseTeachingPlanText } from '../teaching-plan-prompt';

const chunk: DidacticChunk = {
  id: 'c1',
  materialId: 'm1',
  bookTitle: 'Sistemas de Banco de Dados',
  author: 'Elmasri',
  chapter: 'Cap. 3: Modelo ER',
  pageNumber: 57,
  content: 'Uma entidade representa um objeto do mundo real.',
};

describe('teaching-plan-prompt', () => {
  it('buildTeachingPlanMessages coloca disciplina, referências e trechos RAG no prompt do usuário', () => {
    const [system, user] = buildTeachingPlanMessages({
      subjectName: 'Banco de Dados',
      courseName: 'Computação',
      academicPeriod: '2026.1',
      references: [{ title: 'Sistemas de Banco de Dados', author: 'Elmasri' }],
      chunks: [chunk],
    });
    expect(system.role).toBe('system');
    expect(system.content).toContain('JSON');
    expect(user.role).toBe('user');
    expect(user.content).toContain('Banco de Dados');
    expect(user.content).toContain('Computação');
    expect(user.content).toContain('2026.1');
    expect(user.content).toContain('Sistemas de Banco de Dados (Elmasri)');
    expect(user.content).toContain('Uma entidade representa um objeto do mundo real.');
    expect(user.content).toContain('pág. 57');
  });

  it('buildTeachingPlanMessages omite curso e período quando não informados', () => {
    const [, user] = buildTeachingPlanMessages({ subjectName: 'Filosofia Antiga', references: [], chunks: [] });
    expect(user.content).toContain('Filosofia Antiga');
    expect(user.content).not.toContain('undefined');
    expect(user.content).not.toContain('2026.1');
  });

  it('parseTeachingPlanText extrai o JSON mesmo com texto ao redor', () => {
    const raw = `Segue:\n{"syllabus":"Ementa X","generalObjectives":"Obj Y","bloomLevels":["Nível 2: Compreender"],"methodology":"Met Z"}\nFim.`;
    expect(parseTeachingPlanText(raw)).toEqual({
      syllabus: 'Ementa X',
      generalObjectives: 'Obj Y',
      bloomLevels: ['Nível 2: Compreender'],
      methodology: 'Met Z',
    });
  });

  it('parseTeachingPlanText devolve null para texto sem JSON ou com campos vazios', () => {
    expect(parseTeachingPlanText('sem json aqui')).toBeNull();
    expect(parseTeachingPlanText('{"syllabus":"","generalObjectives":"a","bloomLevels":[],"methodology":"b"}')).toBeNull();
    expect(parseTeachingPlanText('{"syllabus":"a"}')).toBeNull();
  });
});
