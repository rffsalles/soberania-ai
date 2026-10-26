import { describe, expect, it } from 'vitest';
import {
  buildChunkAssignments,
  isValidChapterSequence,
  outlineToDrafts,
  relinkByOrder,
  toChapterRows,
} from '../chapters';

describe('outlineToDrafts', () => {
  it('outline com 2 entradas de 1º nível com página vira rascunho', () =>
    expect(
      outlineToDrafts([
        { title: 'Cap. 1', pageNumber: 12 },
        { title: 'Cap. 2', pageNumber: 25 },
        { title: 'Sem destino', pageNumber: null },
      ]),
    ).toEqual([
      { title: 'Cap. 1', startPage: 12 },
      { title: 'Cap. 2', startPage: 25 },
    ]));
  it('outline com 1 entrada válida devolve null', () =>
    expect(
      outlineToDrafts([
        { title: 'Cap. 1', pageNumber: 12 },
        { title: 'Sem destino', pageNumber: null },
      ]),
    ).toBeNull());
  it('descarta título vazio e páginas não estritamente crescentes', () =>
    expect(
      outlineToDrafts([
        { title: 'A', pageNumber: 5 },
        { title: '  ', pageNumber: 8 },
        { title: 'Volta', pageNumber: 3 },
        { title: 'Repete', pageNumber: 5 },
        { title: 'B', pageNumber: 9 },
      ]),
    ).toEqual([
      { title: 'A', startPage: 5 },
      { title: 'B', startPage: 9 },
    ]));
});

describe('isValidChapterSequence', () => {
  it('rejeita página fora do intervalo, fora de ordem e contagem menor que o mínimo', () => {
    expect(isValidChapterSequence([{ title: 'a', startPage: 1 }, { title: 'b', startPage: 301 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 0 }, { title: 'b', startPage: 3 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 50 }, { title: 'b', startPage: 20 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 5 }, { title: 'b', startPage: 5 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 1.5 }, { title: 'b', startPage: 5 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 5 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 5 }], 300, 1)).toBe(true);
    expect(isValidChapterSequence([{ title: 'a', startPage: 1 }, { title: 'b', startPage: 300 }], 300, 2)).toBe(true);
  });
});

describe('toChapterRows', () => {
  it('endPage deriva do próximo capítulo e o último vai até totalPages', () =>
    expect(toChapterRows([{ title: 'a', startPage: 12 }, { title: 'b', startPage: 25 }], 300)).toEqual([
      { title: 'a', order: 1, startPage: 12, endPage: 24 },
      { title: 'b', order: 2, startPage: 25, endPage: 300 },
    ]));
});

describe('buildChunkAssignments', () => {
  it('páginas antes do primeiro capítulo ficam sem capítulo', () =>
    expect(
      buildChunkAssignments(toChapterRows([{ title: 'a', startPage: 12 }, { title: 'b', startPage: 25 }], 300), 300),
    ).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 11 },
      { order: 1, title: 'a', fromPage: 12, toPage: 24 },
      { order: 2, title: 'b', fromPage: 25, toPage: 300 },
    ]));
  it('sem faixa nula quando o primeiro capítulo começa na página 1', () =>
    expect(buildChunkAssignments(toChapterRows([{ title: 'a', startPage: 1 }], 10), 10)).toEqual([
      { order: 1, title: 'a', fromPage: 1, toPage: 10 },
    ]));
  it('lista vazia vira uma faixa nula do documento inteiro', () =>
    expect(buildChunkAssignments([], 50)).toEqual([{ order: null, title: null, fromPage: 1, toPage: 50 }]));
});

describe('relinkByOrder', () => {
  it('mesma contagem mantém pares; diferente conta aulas distintas', () => {
    const old = [
      { order: 1, lessonPlanIds: ['l1', 'l2'] },
      { order: 2, lessonPlanIds: ['l2'] },
    ];
    expect(relinkByOrder(old, 2).relinks).toEqual([
      { order: 1, lessonPlanId: 'l1' },
      { order: 1, lessonPlanId: 'l2' },
      { order: 2, lessonPlanId: 'l2' },
    ]);
    expect(relinkByOrder(old, 3)).toEqual({ relinks: [], lostLessonLinks: 2 });
  });
});
