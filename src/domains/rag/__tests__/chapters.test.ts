import { describe, expect, it } from 'vitest';
import {
  alignDraftsToText,
  chunkAssignmentsFromRows,
  isValidChapterSequence,
  headingsToDrafts,
  isGenericOutlineTitle,
  outlineToDrafts,
  draftsToTree,
  numberChapters,
  numberNodes,
  relinkByTitle,
  toChapterRows,
  findChapterTreeError,
  isValidChapterTree,
  type ChapterNode,
} from '../chapters';

const node = (title: string, startPage: number, ...children: ChapterNode[]): ChapterNode => ({ title, startPage, children });
const chain = (levels: number): ChapterNode =>
  Array.from({ length: levels - 1 }).reduce<ChapterNode>((child, _, i) => node(`L${levels - 2 - i}`, 1, child), node(`L${levels - 1}`, 1));

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

const tree3: ChapterNode[] = [
  { title: 'A', startPage: 3, children: [
    { title: 'A1', startPage: 3, children: [{ title: 'A1a', startPage: 4, children: [] }] },
    { title: 'A2', startPage: 7, children: [] },
  ] },
  { title: 'B', startPage: 10, children: [] },
];

describe('toChapterRows', () => {
  it('endPage deriva do próximo capítulo e o último vai até totalPages', () =>
    expect(toChapterRows(draftsToTree([{ title: 'a', startPage: 12 }, { title: 'b', startPage: 25 }]), 300)).toEqual([
      { title: 'a', order: 1, depth: 0, parentOrder: null, startPage: 12, endPage: 24 },
      { title: 'b', order: 2, depth: 0, parentOrder: null, startPage: 25, endPage: 300 },
    ]));
  it('toChapterRows achata 3 níveis em pré-ordem com endPage herdado', () =>
    expect(toChapterRows(tree3, 15)).toEqual([
      { title: 'A', order: 1, depth: 0, parentOrder: null, startPage: 3, endPage: 9 },
      { title: 'A1', order: 2, depth: 1, parentOrder: 1, startPage: 3, endPage: 6 },
      { title: 'A1a', order: 3, depth: 2, parentOrder: 2, startPage: 4, endPage: 6 },
      { title: 'A2', order: 4, depth: 1, parentOrder: 1, startPage: 7, endPage: 9 },
      { title: 'B', order: 5, depth: 0, parentOrder: null, startPage: 10, endPage: 15 },
    ]));
  it('irmãos na mesma página: endPage do anterior fica no próprio startPage', () =>
    expect(toChapterRows([
      { title: 'R', startPage: 20, children: [
        { title: 'a', startPage: 21, children: [] },
        { title: 'b', startPage: 21, children: [] },
      ] },
      { title: 'S', startPage: 30, children: [] },
    ], 40).map((r) => [r.title, r.startPage, r.endPage])).toEqual([['R', 20, 29], ['a', 21, 21], ['b', 21, 29], ['S', 30, 40]]));
  it('numberNodes numera pelo índice entre irmãos', () =>
    expect(numberNodes(toChapterRows(tree3, 15))).toEqual(['1', '1.1', '1.1.1', '1.2', '2']));
  it('material plano numera 1, 2, 3', () =>
    expect(numberChapters([
      { id: 'x', order: 1, parentId: null }, { id: 'y', order: 2, parentId: null }, { id: 'z', order: 3, parentId: null },
    ]).map((c) => c.number)).toEqual(['1', '2', '3']));
  it('numberChapters resolve parentId', () =>
    expect(numberChapters([
      { id: 'u', order: 1, parentId: null }, { id: 'f', order: 2, parentId: 'u' }, { id: 'g', order: 3, parentId: 'u' },
    ]).map((c) => c.number)).toEqual(['1', '1.1', '1.2']));
  it('draftsToTree põe children vazio', () =>
    expect(draftsToTree([{ title: 'a', startPage: 2 }])).toEqual([{ title: 'a', startPage: 2, children: [] }]));
});

describe('chunkAssignmentsFromRows', () => {
  const rows = toChapterRows([node('U1', 5, node('1.1', 5), node('1.2', 8)), node('U2', 12)], 20);
  it('nó mais profundo vence: faixas em pré-ordem após o trecho nulo', () =>
    expect(chunkAssignmentsFromRows(rows, 20)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 4 },
      { order: 1, title: 'U1', fromPage: 5, toPage: 11 },
      { order: 2, title: '1.1', fromPage: 5, toPage: 7 },
      { order: 3, title: '1.2', fromPage: 8, toPage: 11 },
      { order: 4, title: 'U2', fromPage: 12, toPage: 20 },
    ]));
  it('dois irmãos na página 21: a página fica com o segundo (último em pré-ordem)', () => {
    const shared = toChapterRows([node('R', 20, node('a', 21), node('b', 21)), node('S', 30)], 40);
    const result = chunkAssignmentsFromRows(shared, 40);
    expect(result).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 19 },
      { order: 1, title: 'R', fromPage: 20, toPage: 29 },
      { order: 2, title: 'a', fromPage: 21, toPage: 21 },
      { order: 3, title: 'b', fromPage: 21, toPage: 29 },
      { order: 4, title: 'S', fromPage: 30, toPage: 40 },
    ]);
    expect(result.filter((a) => a.fromPage <= 21 && 21 <= a.toPage).at(-1)?.title).toBe('b');
  });
  it('sem linhas: um trecho nulo do documento inteiro', () =>
    expect(chunkAssignmentsFromRows([], 20)).toEqual([{ order: null, title: null, fromPage: 1, toPage: 20 }]));
});

describe('relinkByTitle', () => {
  it('título igual com página diferente re-vincula', () =>
    expect(relinkByTitle([{ order: 1, title: 'Conjuntos', startPage: 15 }],
      toChapterRows([node('Intro', 1), node('Conjuntos', 17)], 30), [{ order: 1, lessonPlanIds: ['l1'] }]))
      .toEqual({ relinks: [{ order: 2, lessonPlanId: 'l1' }], lostLessonLinks: 0, lostLessonPlanIds: [] }));
  it('normaliza acentos, caixa e espaços', () =>
    expect(relinkByTitle([{ order: 1, title: 'Frações  e Decimais', startPage: 3 }],
      toChapterRows([node('fracoes e decimais', 3)], 9), [{ order: 1, lessonPlanIds: ['l1'] }]).relinks)
      .toEqual([{ order: 1, lessonPlanId: 'l1' }]));
  it('título duplicado só casa com a mesma página', () => {
    const old = [{ order: 1, title: 'Exercícios', startPage: 10 }, { order: 2, title: 'Exercícios', startPage: 20 }];
    const links = [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l2'] }];
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 10)), node('B', 15, node('Exercícios', 20))], 30), links).lostLessonLinks).toBe(0);
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 12)), node('B', 15, node('Exercícios', 22))], 30), links))
      .toMatchObject({ relinks: [], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] });
  });
  it('título que some perde o vínculo e conta aulas distintas', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'A', startPage: 1 }, { order: 2, title: 'B', startPage: 5 }],
      toChapterRows([node('A', 1), node('C', 5)], 9),
      [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l1', 'l2'] }],
    )).toEqual({ relinks: [{ order: 1, lessonPlanId: 'l1' }], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] }));
});

describe('outlineToDrafts (segundo nível sem promover seções)', () => {
  const e = (title: string, pageNumber: number | null, depth: number) => ({ title, pageNumber, depth });
  it('2 raízes válidas com seções ficam no nível 0', () =>
    expect(
      outlineToDrafts([
        e('Capítulo 1', 5, 0),
        ...[6, 10, 14, 18, 22].map((p, i) => e(`Seção 1.${i + 1}`, p, 1)),
        e('Capítulo 2', 40, 0),
        ...[41, 45, 50, 55].map((p, i) => e(`Seção 2.${i + 1}`, p, 1)),
      ]),
    ).toEqual([
      { title: 'Capítulo 1', startPage: 5 },
      { title: 'Capítulo 2', startPage: 40 },
    ]));
  it('raiz única genérica (.pdf) com 4 capítulos filhos usa os filhos', () =>
    expect(
      outlineToDrafts([
        e('livro.pdf', 1, 0),
        e('C1', 3, 1),
        e('C2', 20, 1),
        e('C3', 40, 1),
        e('C4', 60, 1),
      ]),
    ).toHaveLength(4));
  it('2 raízes genéricas: usa só os filhos da raiz com mais filhos válidos', () =>
    expect(
      outlineToDrafts([
        e('a.pdf', 1, 0),
        e('A1', 3, 1),
        e('A2', 20, 1),
        e('A3', 40, 1),
        e('b.pdf', 50, 0),
        e('B1', 55, 1),
      ]),
    ).toEqual([
      { title: 'A1', startPage: 3 },
      { title: 'A2', startPage: 20 },
      { title: 'A3', startPage: 40 },
    ]));
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

describe('isValidChapterTree', () => {
  it('árvore de 3 níveis é válida', () => expect(isValidChapterTree(tree3, 15)).toBe(true));
  it('filho antes do pai é inválido', () =>
    expect(findChapterTreeError([node('A', 5, node('a', 3)), node('B', 10)], 20, 0)).toEqual({
      number: '1.1', message: 'Capítulo 1.1: a página inicial (3) não pode ser anterior à do item anterior (5).' }));
  it('irmão decrescente é inválido, igual é válido', () => {
    expect(isValidChapterTree([node('A', 5), node('B', 4)], 20)).toBe(false);
    expect(findChapterTreeError([node('A', 2, node('a', 4), node('b', 3)), node('B', 10)], 20)?.number).toBe('1.2');
    expect(isValidChapterTree([node('A', 5), node('B', 5)], 20)).toBe(true);
    expect(isValidChapterTree([node('A', 2, node('a', 4), node('b', 4)), node('B', 10)], 20)).toBe(true);
  });
  it('filho na página do irmão seguinte do pai é inválido (endPage do pai limitado)', () =>
    // A.endPage = max(5, 6 - 1) = 5; a começa em 6 > 5
    expect(findChapterTreeError([node('A', 5, node('a', 6)), node('B', 6)], 20)?.message).toBe('Capítulo 1.1: começa depois do fim do capítulo pai.'));
  it('filho depois do fim do pai é inválido', () =>
    expect(findChapterTreeError([node('A', 5, node('a', 9)), node('B', 9)], 20)).toEqual({
      number: '1.1', message: 'Capítulo 1.1: começa depois do fim do capítulo pai.' }));
  it('depth 7 é inválido e depth 6 é válido', () => {
    expect(isValidChapterTree([chain(8), node('B', 10)], 20)).toBe(false);   // 8 níveis: depth 0..7
    expect(isValidChapterTree([chain(7), node('B', 10)], 20)).toBe(true);    // 7 níveis: depth 0..6
  });
  it('501 nós é inválido e 500 é válido', () => {
    const roots = (n: number) => Array.from({ length: n }, (_, i) => node(`C${i + 1}`, i + 1));
    expect(findChapterTreeError(roots(501), 600)).toEqual({ number: null, message: 'O material admite no máximo 500 capítulos.' });
    expect(isValidChapterTree(roots(500), 600)).toBe(true);
  });
  it('raiz única depende de minRoots', () => {
    expect(isValidChapterTree([node('A', 1)], 20, 2)).toBe(false);
    expect(isValidChapterTree([node('A', 1)], 20, 1)).toBe(true);
    expect(isValidChapterTree([node('A', 1)], 20, 0)).toBe(true);
    expect(isValidChapterTree([], 20, 0)).toBe(true);
  });
  it('página fora do intervalo ou não inteira é inválida', () => {
    expect(isValidChapterTree([node('A', 0), node('B', 5)], 20)).toBe(false);
    expect(isValidChapterTree([node('A', 1), node('B', 21)], 20)).toBe(false);
    expect(isValidChapterTree([node('A', 1), node('B', 2.5)], 20)).toBe(false);
  });
});
