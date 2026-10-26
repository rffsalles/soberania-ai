import { describe, expect, it } from 'vitest';
import {
  buildChunkAssignments,
  isValidChapterSequence,
  headingsToDrafts,
  isGenericOutlineTitle,
  outlineToDrafts,
  relinkByOrder,
  toChapterRows,
} from '../chapters';

describe('outlineToDrafts', () => {
  it('outline com 2 entradas de 1º nível com página vira rascunho', () =>
    expect(
      outlineToDrafts([
        { title: 'Cap. 1', pageNumber: 12, depth: 0 },
        { title: 'Cap. 2', pageNumber: 25, depth: 0 },
        { title: 'Sem destino', pageNumber: null, depth: 0 },
      ]),
    ).toEqual([
      { title: 'Cap. 1', startPage: 12 },
      { title: 'Cap. 2', startPage: 25 },
    ]));
  it('outline com 1 entrada válida devolve null', () =>
    expect(
      outlineToDrafts([
        { title: 'Cap. 1', pageNumber: 12, depth: 0 },
        { title: 'Sem destino', pageNumber: null, depth: 0 },
      ]),
    ).toBeNull());
  it('descarta título vazio e páginas não estritamente crescentes', () =>
    expect(
      outlineToDrafts([
        { title: 'A', pageNumber: 5, depth: 0 },
        { title: '  ', pageNumber: 8, depth: 0 },
        { title: 'Volta', pageNumber: 3, depth: 0 },
        { title: 'Repete', pageNumber: 5, depth: 0 },
        { title: 'B', pageNumber: 9, depth: 0 },
      ]),
    ).toEqual([
      { title: 'A', startPage: 5 },
      { title: 'B', startPage: 9 },
    ]));
});

describe('isGenericOutlineTitle', () => {
  it.each(['Página em branco', 'página 1', 'Pagina 174', 'Página', 'Blank page', 'Blank page 2', 'Untitled', 'Sem título', 'Sin titulo', 'Capa_X.pdf', '  ', ''])(
    'considera "%s" genérico',
    (t) => expect(isGenericOutlineTitle(t)).toBe(true),
  );
  it.each(['Unidade 1 – Conjuntos', 'Capítulo 2', 'Página inicial do livro'])('"%s" não é genérico', (t) =>
    expect(isGenericOutlineTitle(t)).toBe(false),
  );
});

describe('outlineToDrafts (níveis e qualidade)', () => {
  it('outline lixo do PDF de matemática devolve null', () =>
    expect(
      outlineToDrafts([
        { title: 'Capa_Matematica_Basica_Vol1.pdf', pageNumber: null, depth: 0 },
        { title: 'Página em branco', pageNumber: 2, depth: 0 },
        { title: 'Capa_Matematica_Basica_Vol1.pdf', pageNumber: null, depth: 0 },
        { title: 'Página em branco', pageNumber: 173, depth: 0 },
        { title: 'Página 1', pageNumber: 1, depth: 1 },
        { title: 'Página 1', pageNumber: 174, depth: 1 },
      ]),
    ).toBeNull());
  it('raiz com o nome do livro e 4 capítulos no nível 1 usa o nível 1', () =>
    expect(
      outlineToDrafts([
        { title: 'Livro', pageNumber: 1, depth: 0 },
        { title: 'C1', pageNumber: 3, depth: 1 },
        { title: 'C2', pageNumber: 20, depth: 1 },
        { title: 'C3', pageNumber: 40, depth: 1 },
        { title: 'C4', pageNumber: 60, depth: 1 },
      ]),
    ).toEqual([
      { title: 'C1', startPage: 3 },
      { title: 'C2', startPage: 20 },
      { title: 'C3', startPage: 40 },
      { title: 'C4', startPage: 60 },
    ]));
  it('nível 1 com menos de 3 válidos é rejeitado', () =>
    expect(
      outlineToDrafts([
        { title: 'Livro', pageNumber: 1, depth: 0 },
        { title: 'C1', pageNumber: 3, depth: 1 },
        { title: 'C2', pageNumber: 20, depth: 1 },
      ]),
    ).toBeNull());
  it('descarta títulos genéricos', () =>
    expect(
      outlineToDrafts([
        { title: 'Página em branco', pageNumber: 2, depth: 0 },
        { title: 'Cap. 1', pageNumber: 5, depth: 0 },
        { title: 'Cap. 2', pageNumber: 9, depth: 0 },
      ]),
    ).toEqual([
      { title: 'Cap. 1', startPage: 5 },
      { title: 'Cap. 2', startPage: 9 },
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

describe('headingsToDrafts', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const body = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => page(from + i, `Texto corrido da página ${from + i}`));

  it('detecta 5 unidades pelo topo das páginas', () => {
    const pages = [
      page(9, 'Sumário\nUnidade 1 – Conjuntos Numéricos ........ 15'),
      ...body(10, 16),
      page(17, 'Unidade 1 – Conjuntos  Numéricos\nTexto'),
      ...body(18, 39),
      page(40, '\n  \nUnidade 2 – Funções\nTexto'),
      page(70, 'UNIDADE 3 – Geometria\nTexto'),
      page(100, 'Unidade 4 – Trigonometria'),
      page(130, 'Texto\nUnidade 5 – Estatística'),
    ];
    expect(headingsToDrafts(pages)).toEqual([
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 17 },
      { title: 'Unidade 2 – Funções', startPage: 40 },
      { title: 'UNIDADE 3 – Geometria', startPage: 70 },
      { title: 'Unidade 4 – Trigonometria', startPage: 100 },
      { title: 'Unidade 5 – Estatística', startPage: 130 },
    ]);
  });

  it('cabeçalho repetido mantém a primeira ocorrência', () => {
    expect(
      headingsToDrafts([
        page(5, 'Unidade 1 – A'),
        page(6, 'Unidade 1 – A\nmais texto'),
        page(20, 'Capítulo 2 - B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 5 },
      { title: 'Capítulo 2 - B', startPage: 20 },
    ]);
  });

  it('só olha as 3 primeiras linhas não vazias', () => {
    expect(headingsToDrafts([page(1, 'a\nb\nc\nUnidade 1 – X'), page(2, 'Unidade 2 – Y')])).toBeNull();
  });

  it('numeração fora de sequência devolve null', () =>
    expect(headingsToDrafts([page(5, 'Unidade 1 – A'), page(9, 'Unidade 3 – C'), page(12, 'Unidade 4 – D')])).toBeNull());

  it('numeração que não começa em 1 devolve null', () =>
    expect(headingsToDrafts([page(5, 'Capítulo 2 – A'), page(9, 'Capítulo 3 – C')])).toBeNull());

  it('um único acerto devolve null', () =>
    expect(headingsToDrafts([page(5, 'Unidade 1 – A'), page(9, 'Texto')])).toBeNull());
});
