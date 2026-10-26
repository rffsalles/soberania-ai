import { describe, it, expect } from 'vitest';
import { buildPlanUnitsMessages, isValidPlanUnits, parsePlanUnits, type PlanUnitItem } from '../plan-units-prompt';
import type { PlanChapterBook } from '@/domains/teaching/services/plan-chapters-service';

const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [
      { id: 'ch1', order: 1, title: 'Introdução', startPage: 12, endPage: 24 },
      { id: 'ch2', order: 2, title: 'Joins', startPage: 25, endPage: null },
      { id: 'ch3', order: 3, title: 'Índices', startPage: 30, endPage: 40 },
      { id: 'ch4', order: 4, title: 'Transações', startPage: 41, endPage: 50 },
    ],
  },
];
const lessons = [
  { classNumber: 1, chapterIds: ['ch1'] },
  { classNumber: 2, chapterIds: ['ch1', 'ch2'] },
  { classNumber: 3, chapterIds: ['ch3'] },
  { classNumber: 4, chapterIds: ['ch4'] },
];
const planIds = new Set(['ch1', 'ch2', 'ch3', 'ch4']);
const u = (n: number, chapterIds: string[], topics = ['t']): PlanUnitItem => ({ unitNumber: n, title: `U${n}`, topics, chapterIds });
const valid = [u(1, ['ch1', 'ch2']), u(2, ['ch3']), u(3, ['ch4'])];

describe('plan-units-prompt', () => {
  it('parse aceita texto em volta, apara títulos e tópicos e deduplica capítulos', () => {
    const raw = `Aqui vai: {"units":[{"unitNumber":1,"title":"  Modelagem  ","topics":["  A ","","  "," B"],"chapterIds":["ch1","ch1","ch2"]}]} fim`;
    expect(parsePlanUnits(raw)).toEqual([{ unitNumber: 1, title: 'Modelagem', topics: ['A', 'B'], chapterIds: ['ch1', 'ch2'] }]);
    const long = parsePlanUnits(`{"units":[{"unitNumber":1,"title":"${'x'.repeat(300)}","topics":["a"],"chapterIds":[]}]}`);
    expect(long![0].title).toHaveLength(200);
    expect(parsePlanUnits('sem json')).toBeNull();
    expect(parsePlanUnits('{"units":[{"unitNumber":1,"title":"  ","topics":[],"chapterIds":[]}]}')).toBeNull();
  });

  it('resposta válida com 3 unidades passa', () => {
    expect(isValidPlanUnits(valid, lessons, planIds)).toBe(true);
  });

  it('menos de 3 ou mais de 6 unidades, numeração fora de sequência ou tópicos vazios é inválida', () => {
    expect(isValidPlanUnits([u(1, ['ch1', 'ch2']), u(2, ['ch3', 'ch4'])], lessons, planIds)).toBe(false);
    const seven = [u(1, ['ch1', 'ch2']), u(2, ['ch3']), u(3, ['ch4']), u(4, []), u(5, []), u(6, []), u(7, [])];
    expect(isValidPlanUnits(seven, lessons, planIds)).toBe(false);
    expect(isValidPlanUnits(seven.slice(0, 6), lessons, planIds)).toBe(true);
    expect(isValidPlanUnits([u(1, ['ch1', 'ch2']), u(3, ['ch3']), u(4, ['ch4'])], lessons, planIds)).toBe(false);
    expect(isValidPlanUnits([u(1, ['ch1', 'ch2']), u(2, ['ch3'], []), u(3, ['ch4'])], lessons, planIds)).toBe(false);
  });

  it('capítulo de fora do plano é inválido', () => {
    expect(isValidPlanUnits([u(1, ['ch1', 'ch2']), u(2, ['ch3']), u(3, ['ch4', 'chX'])], lessons, planIds)).toBe(false);
  });

  it('aula com capítulos em duas unidades ou em nenhuma é inválida', () => {
    expect(isValidPlanUnits([u(1, ['ch1']), u(2, ['ch2', 'ch3']), u(3, ['ch4'])], lessons, planIds)).toBe(false);
    expect(isValidPlanUnits([u(1, ['ch1', 'ch2']), u(2, ['ch3']), u(3, [])], lessons, planIds)).toBe(false);
  });

  it('mensagens trazem disciplina, aulas com capítulos e ids dos livros', () => {
    const messages = buildPlanUnitsMessages({
      subjectName: 'Banco de Dados', syllabus: 'Ementa', objectives: 'Objetivos',
      lessons: [
        { classNumber: 1, topicTitle: 'Intro', chapterIds: ['ch1'] },
        { classNumber: 2, topicTitle: 'Joins', chapterIds: ['ch1', 'ch2'] },
      ],
      books,
    });
    expect(messages).toHaveLength(2);
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Banco de Dados');
    expect(user).toContain('Aula 2 · Joins · capítulos: ch1, ch2');
    expect(user).toContain('id=ch3');
  });
});
