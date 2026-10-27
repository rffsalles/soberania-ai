import { describe, expect, it } from 'vitest';
import {
  alignDraftsToText,
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

  it('linha de sumário com pontos espaçados conta como sumário', () => {
    const toc = page(
      9,
      'Sumário\nUnidade 1 – Conjuntos . . . . 15\nUnidade 2 – Frações . . . . 43\nUnidade 3 – Geometria . . . 70',
    );
    expect(
      headingsToDrafts([toc, page(17, 'Unidade 1 – Conjuntos\nTexto'), page(43, 'Unidade 2 – Frações\nTexto')]),
    ).toEqual([
      { title: 'Unidade 1 – Conjuntos', startPage: 17 },
      { title: 'Unidade 2 – Frações', startPage: 43 },
    ]);
  });

  it('"1, 2, 3, ..." sem número no fim não é sumário', () => {
    const p = page(9, 'Unidade 1 – Contagem\n1, 2, 3, ...\n1, 2, 3, ...\n1, 2, 3, ...');
    expect(headingsToDrafts([p, page(30, 'Unidade 2 – Soma\nTexto')])).toEqual([
      { title: 'Unidade 1 – Contagem', startPage: 9 },
      { title: 'Unidade 2 – Soma', startPage: 30 },
    ]);
  });

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

  it('ignora páginas de sumário (líderes de pontos) mesmo com "Unidade N" no topo', () => {
    const toc = (n: number, unit: number) =>
      page(n, `Unidade ${unit} – Tema ${unit}\nIntrodução......... 67\nRazão........... 69\nOutro............ 70`);
    expect(
      headingsToDrafts([
        toc(9, 1),
        toc(10, 3),
        page(15, '13Módulo 0\nApresentação\nUNIDADE 1\nObjetivos'),
        page(16, 'texto'),
        page(17, '15Módulo 0\nUnidade 1 – Conjuntos Numéricos\nCONJUNTOS'),
        page(19, '17Módulo 0\nUnidade 1 – Conjuntos Numéricos\ntexto'),
        page(43, '41Módulo 0\nApresentação\nUNIDADE 2\nObjetivos'),
        page(45, '43Módulo 0\nUnidade 2 – Produtos Notáveis\nPRODUTOS'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15 },
      { title: 'Unidade 2 – Produtos Notáveis', startPage: 43 },
    ]);
  });

  it('"Módulo 0" no topo antes das unidades não lança e não conta como acerto', () => {
    expect(
      headingsToDrafts([
        page(3, 'Módulo 0\nApresentação'),
        page(4, 'Capítulo 0'),
        page(15, 'Unidade 1 – A'),
        page(43, 'Unidade 2 – B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 15 },
      { title: 'Unidade 2 – B', startPage: 43 },
    ]);
  });

  it('linhas de reticências sem número de página no fim não tornam a página um sumário', () => {
    expect(
      headingsToDrafts([
        page(5, 'Unidade 1 – A\n1, 2, 3, ...\n4, 5, 6, ...\n7, 8, 9, ...'),
        page(9, 'Unidade 2 – B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 5 },
      { title: 'Unidade 2 – B', startPage: 9 },
    ]);
  });

  it('página de sumário com líderes de pontos e número é ignorada', () => {
    expect(
      headingsToDrafts([
        page(2, 'Unidade 1 – Conjuntos ........ 15\nB ....... 20\nC ....... 30'),
        page(15, 'Unidade 1 – Conjuntos'),
        page(30, 'Unidade 2 – Outro'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – Conjuntos', startPage: 15 },
      { title: 'Unidade 2 – Outro', startPage: 30 },
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

describe('alignDraftsToText', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const pages = [
    ...Array.from({ length: 60 }, (_, i) => page(i + 1, `Texto qualquer ${i + 1}`)),
  ];
  pages[16] = page(17, 'Unidade 1 – Conjuntos Numéricos\nTexto');
  pages[29] = page(30, 'Unidade 2 – Funções e Gráficos\nTexto');
  pages[44] = page(45, 'Unidade 3 – Geometria Plana\nTexto');

  it('realinha páginas impressas (+2) para a página física cujo topo tem o título', () => {
    const drafts = [
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15 },
      { title: 'Unidade 2 – Funções e Gráficos', startPage: 28 },
      { title: 'Unidade 3 – Geometria Plana', startPage: 43 },
    ];
    expect(alignDraftsToText(drafts, pages).map((d) => d.startPage)).toEqual([17, 30, 45]);
    expect(drafts.map((d) => d.startPage)).toEqual([15, 28, 43]);
  });

  it('draft sem título encontrado herda o deslocamento majoritário', () => {
    const drafts = [
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15 },
      { title: 'Unidade 2 – Funções e Gráficos', startPage: 28 },
      { title: 'Título que não existe no texto', startPage: 50 },
    ];
    expect(alignDraftsToText(drafts, pages).map((d) => d.startPage)).toEqual([17, 30, 52]);
  });

  it('sem maioria de realinhados, mantém os não encontrados como estão', () => {
    const drafts = [
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15 },
      { title: 'Nada a ver aqui', startPage: 28 },
      { title: 'Outro título ausente', startPage: 40 },
    ];
    expect(alignDraftsToText(drafts, pages).map((d) => d.startPage)).toEqual([17, 28, 40]);
  });

  it('deslocamento herdado fora de [1, total] descarta só esse rascunho', () => {
    const book = Array.from({ length: 300 }, (_, i) => page(i + 1, `Texto ${i + 1}`));
    book[16] = page(17, 'Unidade 1 – Conjuntos Numéricos');
    book[29] = page(30, 'Unidade 2 – Funções e Gráficos');
    const r = alignDraftsToText(
      [
        { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15 },
        { title: 'Unidade 2 – Funções e Gráficos', startPage: 28 },
        { title: 'Título ausente do texto', startPage: 299 },
      ],
      book,
    );
    expect(r).toEqual([
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 17 },
      { title: 'Unidade 2 – Funções e Gráficos', startPage: 30 },
    ]);
  });

  it('ignora acentos e pontuação ao comparar', () => {
    const r = alignDraftsToText([{ title: 'UNIDADE 2: FUNCOES e graficos', startPage: 29 }], pages);
    expect(r[0].startPage).toBe(30);
  });
});
