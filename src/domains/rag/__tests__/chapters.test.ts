import { describe, expect, it } from 'vitest';
import {
  alignDraftsToText,
  chunkAssignmentsFromRows,
  headingsToTree,
  isGenericOutlineTitle,
  isTocPage,
  selectTocPages,
  outlineToTree,
  promoteSingleRoot,
  numberChapters,
  normalizeRelinks,
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

describe('outlineToTree', () => {
  const e = (title: string, pageNumber: number | null, depth: number) => ({ title, pageNumber, depth });
  const n = (title: string, startPage: number, children: ChapterNode[] = []): ChapterNode => ({ title, startPage, children });
  it('3 níveis em pré-ordem viram árvore', () =>
    expect(outlineToTree([e('Cap 1', 5, 0), e('1.1', 6, 1), e('1.1.1', 7, 2), e('1.2', 10, 1), e('Cap 2', 40, 0)])).toEqual([
      n('Cap 1', 5, [n('1.1', 6, [n('1.1.1', 7)]), n('1.2', 10)]),
      n('Cap 2', 40),
    ]));
  it('nó sem página herda a do primeiro descendente; subárvore sem página some', () =>
    expect(outlineToTree([e('Parte I', null, 0), e('Cap 1', 5, 1), e('Cap 2', 9, 1), e('Parte II', 20, 0), e('Vazio', null, 0), e('Sem página', null, 1)])).toEqual([
      n('Parte I', 5, [n('Cap 1', 5), n('Cap 2', 9)]),
      n('Parte II', 20),
    ]));
  it('título genérico sai e os filhos sobem para o nível dele', () =>
    expect(outlineToTree([e('Capa.pdf', 1, 0), e('C1', 3, 1), e('C2', 20, 1), e('Página em branco', 30, 0), e('C3', 40, 0), e('S3.1', 41, 1)])).toEqual([
      n('C1', 3), n('C2', 20), n('C3', 40, [n('S3.1', 41)]),
    ]));
  it('raiz única com 3+ filhos: os filhos viram raízes, com seus netos', () =>
    expect(outlineToTree([e('Livro', 1, 0), e('C1', 3, 1), e('C2', 20, 1), e('C3', 40, 1), e('S', 41, 2)])).toEqual([
      n('C1', 3), n('C2', 20), n('C3', 40, [n('S', 41)]),
    ]));
  it('raiz única com 2 filhos fica como está e é inválida com minRoots 2', () => {
    const tree = outlineToTree([e('Livro', 1, 0), e('C1', 3, 1), e('C2', 20, 1)]);
    expect(tree).toEqual([n('Livro', 1, [n('C1', 3), n('C2', 20)])]);
    expect(isValidChapterTree(tree, 300, 2)).toBe(false);
  });
  it('irmão decrescente sai com a subárvore; filho antes do pai sai; irmão na mesma página fica', () =>
    expect(outlineToTree([e('A', 5, 0), e('A.1', 4, 1), e('A.2', 6, 1), e('A.3', 6, 1), e('Volta', 3, 0), e('V.1', 4, 1), e('B', 9, 0)])).toEqual([
      n('A', 5, [n('A.2', 6), n('A.3', 6)]),
      n('B', 9),
    ]));
  it('filho que começa depois do próximo irmão do pai sai', () =>
    expect(outlineToTree([e('A', 5, 0), e('A.1', 20, 1), e('B', 15, 0)])).toEqual([n('A', 5), n('B', 15)]));
});

describe('promoteSingleRoot', () => {
  it('raiz única com 3+ filhos: os filhos viram raízes; com 2 filhos ou 2 raízes fica igual', () => {
    const kids = [node('a', 2, node('a1', 3)), node('b', 5), node('c', 9)];
    expect(promoteSingleRoot([node('Livro', 1, ...kids)])).toEqual(kids);
    const two = [node('Livro', 1, node('a', 2), node('b', 5))];
    expect(promoteSingleRoot(two)).toBe(two);
    const roots = [node('A', 1, ...kids), node('B', 20)];
    expect(promoteSingleRoot(roots)).toBe(roots);
  });
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

const tree3: ChapterNode[] = [
  { title: 'A', startPage: 3, children: [
    { title: 'A1', startPage: 3, children: [{ title: 'A1a', startPage: 4, children: [] }] },
    { title: 'A2', startPage: 7, children: [] },
  ] },
  { title: 'B', startPage: 10, children: [] },
];

describe('toChapterRows', () => {
  it('endPage deriva do próximo capítulo e o último vai até totalPages', () =>
    expect(toChapterRows([{ title: 'a', startPage: 12, children: [] }, { title: 'b', startPage: 25, children: [] }], 300)).toEqual([
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
  it('numberNodes com filhos sob dois pais', () =>
    expect(numberNodes(toChapterRows([node('A', 1, node('a', 2), node('b', 3)), node('B', 5, node('c', 6))], 9)))
      .toEqual(['1', '1.1', '1.2', '2', '2.1']));
  it('material plano numera 1, 2, 3', () =>
    expect(numberChapters([
      { id: 'x', order: 1, parentId: null }, { id: 'y', order: 2, parentId: null }, { id: 'z', order: 3, parentId: null },
    ]).map((c) => c.number)).toEqual(['1', '2', '3']));
  it('numberChapters resolve parentId', () =>
    expect(numberChapters([
      { id: 'u', order: 1, parentId: null }, { id: 'f', order: 2, parentId: 'u' }, { id: 'g', order: 3, parentId: 'u' },
    ]).map((c) => c.number)).toEqual(['1', '1.1', '1.2']));
});

describe('chunkAssignmentsFromRows', () => {
  const rows = toChapterRows([node('U1', 5, node('1.1', 5), node('1.2', 8)), node('U2', 12)], 20);
  it('segmentos disjuntos: a página fica com o último nó em pré-ordem que a cobre', () =>
    expect(chunkAssignmentsFromRows(rows, 20)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 4 },
      { order: 2, title: '1.1', fromPage: 5, toPage: 7 },
      { order: 3, title: '1.2', fromPage: 8, toPage: 11 },
      { order: 4, title: 'U2', fromPage: 12, toPage: 20 },
    ]));
  it('dois irmãos na página 21: a página fica com o segundo (último em pré-ordem)', () => {
    const shared = toChapterRows([node('R', 20, node('a', 21), node('b', 21)), node('S', 30)], 40);
    expect(chunkAssignmentsFromRows(shared, 40)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 19 },
      { order: 1, title: 'R', fromPage: 20, toPage: 20 },
      { order: 3, title: 'b', fromPage: 21, toPage: 29 },
      { order: 4, title: 'S', fromPage: 30, toPage: 40 },
    ]);
  });
  it('pai com página própria antes do primeiro filho', () =>
    expect(chunkAssignmentsFromRows(toChapterRows([node('U', 5, node('a', 7)), node('V', 10)], 12), 12)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 4 },
      { order: 1, title: 'U', fromPage: 5, toPage: 6 },
      { order: 2, title: 'a', fromPage: 7, toPage: 9 },
      { order: 3, title: 'V', fromPage: 10, toPage: 12 },
    ]));
  it('sem linhas: um trecho nulo do documento inteiro', () =>
    expect(chunkAssignmentsFromRows([], 20)).toEqual([{ order: null, title: null, fromPage: 1, toPage: 20 }]));
});

describe('relinkByTitle', () => {
  it('título igual com página diferente re-vincula', () =>
    expect(relinkByTitle([{ order: 1, title: 'Conjuntos', startPage: 15, depth: 0 }],
      toChapterRows([node('Intro', 1), node('Conjuntos', 17)], 30), [{ order: 1, lessonPlanIds: ['l1'] }]))
      .toEqual({ relinks: [{ order: 2, lessonPlanId: 'l1' }], lostLessonLinks: 0, lostLessonPlanIds: [] }));
  it('normaliza acentos, caixa e espaços', () =>
    expect(relinkByTitle([{ order: 1, title: 'Frações  e Decimais', startPage: 3, depth: 0 }],
      toChapterRows([node('fracoes e decimais', 3)], 9), [{ order: 1, lessonPlanIds: ['l1'] }]).relinks)
      .toEqual([{ order: 1, lessonPlanId: 'l1' }]));
  it('título duplicado só casa com a mesma página', () => {
    const old = [{ order: 1, title: 'Exercícios', startPage: 10, depth: 0 }, { order: 2, title: 'Exercícios', startPage: 20, depth: 0 }];
    const links = [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l2'] }];
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 10)), node('B', 15, node('Exercícios', 20))], 30), links).lostLessonLinks).toBe(0);
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 12)), node('B', 15, node('Exercícios', 22))], 30), links))
      .toMatchObject({ relinks: [], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] });
  });
  it('título que some perde o vínculo e conta aulas distintas', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'A', startPage: 1, depth: 0 }, { order: 2, title: 'B', startPage: 5, depth: 0 }],
      toChapterRows([node('A', 1), node('C', 6)], 9),
      [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l1', 'l2'] }],
    )).toEqual({ relinks: [{ order: 1, lessonPlanId: 'l1' }], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] }));
  it('renomear na mesma página mantém o vínculo', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'Unidade 1', startPage: 15, depth: 0 }],
      toChapterRows([node('Unidade 1: Conjuntos', 15), node('Unidade 2', 43)], 60),
      [{ order: 1, lessonPlanIds: ['l1'] }],
    )).toEqual({ relinks: [{ order: 1, lessonPlanId: 'l1' }], lostLessonLinks: 0, lostLessonPlanIds: [] }));
  it('pontuação não impede o casamento por título', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'Frações, decimais', startPage: 3, depth: 0 }],
      toChapterRows([node('Intro', 1), node('Frações decimais', 9)], 20),
      [{ order: 1, lessonPlanIds: ['l1'] }],
    )).toEqual({ relinks: [{ order: 2, lessonPlanId: 'l1' }], lostLessonLinks: 0, lostLessonPlanIds: [] }));
  it('unicidade só do lado antigo', () => {
    const old = [{ order: 1, title: 'X', startPage: 3, depth: 0 }, { order: 2, title: 'X', startPage: 8, depth: 0 }];
    const links = [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l2'] }];
    // Um novo 'X' para dois antigos 'X': o passo 2 não casa; sem novo na mesma (página, nível), nada casa.
    expect(relinkByTitle(old, toChapterRows([node('Intro', 1), node('X', 5)], 20), links))
      .toEqual({ relinks: [], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] });
    // Com um novo único em (8, 0), o passo 3 casa só o antigo dessa página.
    expect(relinkByTitle(old, toChapterRows([node('Intro', 1), node('X', 5), node('Y', 8)], 20), links))
      .toEqual({ relinks: [{ order: 3, lessonPlanId: 'l2' }], lostLessonLinks: 1, lostLessonPlanIds: ['l1'] });
  });
  it('passo 3 não casa quando há dois candidatos na mesma página', () => {
    // Dois novos na mesma (página, nível)
    expect(relinkByTitle(
      [{ order: 1, title: 'Antigo', startPage: 5, depth: 1 }],
      toChapterRows([node('U', 1, node('a', 5), node('b', 5))], 20),
      [{ order: 1, lessonPlanIds: ['l1'] }],
    )).toMatchObject({ relinks: [], lostLessonLinks: 1 });
    // Dois antigos restantes na mesma (página, nível)
    expect(relinkByTitle(
      [{ order: 1, title: 'p', startPage: 5, depth: 1 }, { order: 2, title: 'q', startPage: 5, depth: 1 }],
      toChapterRows([node('U', 1, node('novo', 5))], 20),
      [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l2'] }],
    )).toMatchObject({ relinks: [], lostLessonLinks: 2 });
  });
  it('passo 3 exige o mesmo nível', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'Antigo', startPage: 5, depth: 0 }],
      toChapterRows([node('U', 1, node('novo', 5))], 20),
      [{ order: 1, lessonPlanIds: ['l1'] }],
    )).toMatchObject({ relinks: [], lostLessonLinks: 1 }));
});

describe('normalizeRelinks', () => {
  const rows = toChapterRows([node('U', 1, node('a', 2, node('a1', 3))), node('V', 9)], 20);
  it('aula ligada à raiz e ao filho fica só na raiz', () =>
    expect(normalizeRelinks([{ order: 1, lessonPlanId: 'l1' }, { order: 2, lessonPlanId: 'l1' }], rows))
      .toEqual([{ order: 1, lessonPlanId: 'l1' }]));
  it('ancestral distante também absorve; aulas diferentes não interferem', () =>
    expect(normalizeRelinks([
      { order: 3, lessonPlanId: 'l1' },
      { order: 1, lessonPlanId: 'l1' },
      { order: 2, lessonPlanId: 'l2' },
      { order: 4, lessonPlanId: 'l1' },
    ], rows)).toEqual([
      { order: 1, lessonPlanId: 'l1' },
      { order: 2, lessonPlanId: 'l2' },
      { order: 4, lessonPlanId: 'l1' },
    ]));
});

describe('headingsToTree', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const body = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => page(from + i, `Texto corrido da página ${from + i}`));

  it('linha de sumário com pontos espaçados conta como sumário', () => {
    const toc = page(
      9,
      'Sumário\nUnidade 1 – Conjuntos . . . . 15\nUnidade 2 – Frações . . . . 43\nUnidade 3 – Geometria . . . 70',
    );
    expect(
      headingsToTree([toc, page(17, 'Unidade 1 – Conjuntos\nTexto'), page(43, 'Unidade 2 – Frações\nTexto')]),
    ).toEqual([
      { title: 'Unidade 1 – Conjuntos', startPage: 17, children: [] },
      { title: 'Unidade 2 – Frações', startPage: 43, children: [] },
    ]);
  });

  it('"1, 2, 3, ..." sem número no fim não é sumário', () => {
    const p = page(9, 'Unidade 1 – Contagem\n1, 2, 3, ...\n1, 2, 3, ...\n1, 2, 3, ...');
    expect(headingsToTree([p, page(30, 'Unidade 2 – Soma\nTexto')])).toEqual([
      { title: 'Unidade 1 – Contagem', startPage: 9, children: [] },
      { title: 'Unidade 2 – Soma', startPage: 30, children: [] },
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
    expect(headingsToTree(pages)).toEqual([
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 17, children: [] },
      { title: 'Unidade 2 – Funções', startPage: 40, children: [] },
      { title: 'UNIDADE 3 – Geometria', startPage: 70, children: [] },
      { title: 'Unidade 4 – Trigonometria', startPage: 100, children: [] },
      { title: 'Unidade 5 – Estatística', startPage: 130, children: [] },
    ]);
  });

  it('cabeçalho repetido mantém a primeira ocorrência', () => {
    expect(
      headingsToTree([
        page(5, 'Unidade 1 – A'),
        page(6, 'Unidade 1 – A\nmais texto'),
        page(20, 'Capítulo 2 - B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 5, children: [] },
      { title: 'Capítulo 2 - B', startPage: 20, children: [] },
    ]);
  });

  it('ignora páginas de sumário (líderes de pontos) mesmo com "Unidade N" no topo', () => {
    const toc = (n: number, unit: number) =>
      page(n, `Unidade ${unit} – Tema ${unit}\nIntrodução......... 67\nRazão........... 69\nOutro............ 70`);
    expect(
      headingsToTree([
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
      { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15, children: [] },
      { title: 'Unidade 2 – Produtos Notáveis', startPage: 43, children: [] },
    ]);
  });

  it('"Módulo 0" no topo antes das unidades não lança e não conta como acerto', () => {
    expect(
      headingsToTree([
        page(3, 'Módulo 0\nApresentação'),
        page(4, 'Capítulo 0'),
        page(15, 'Unidade 1 – A'),
        page(43, 'Unidade 2 – B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 15, children: [] },
      { title: 'Unidade 2 – B', startPage: 43, children: [] },
    ]);
  });

  it('linhas de reticências sem número de página no fim não tornam a página um sumário', () => {
    expect(
      headingsToTree([
        page(5, 'Unidade 1 – A\n1, 2, 3, ...\n4, 5, 6, ...\n7, 8, 9, ...'),
        page(9, 'Unidade 2 – B'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – A', startPage: 5, children: [] },
      { title: 'Unidade 2 – B', startPage: 9, children: [] },
    ]);
  });

  it('página de sumário com líderes de pontos e número é ignorada', () => {
    expect(
      headingsToTree([
        page(2, 'Unidade 1 – Conjuntos ........ 15\nB ....... 20\nC ....... 30'),
        page(15, 'Unidade 1 – Conjuntos'),
        page(30, 'Unidade 2 – Outro'),
      ]),
    ).toEqual([
      { title: 'Unidade 1 – Conjuntos', startPage: 15, children: [] },
      { title: 'Unidade 2 – Outro', startPage: 30, children: [] },
    ]);
  });

  it('só olha as 3 primeiras linhas não vazias', () => {
    expect(headingsToTree([page(1, 'a\nb\nc\nUnidade 1 – X'), page(2, 'Unidade 2 – Y')])).toBeNull();
  });

  it('numeração fora de sequência devolve null', () =>
    expect(headingsToTree([page(5, 'Unidade 1 – A'), page(9, 'Unidade 3 – C'), page(12, 'Unidade 4 – D')])).toBeNull());

  it('numeração que não começa em 1 devolve null', () =>
    expect(headingsToTree([page(5, 'Capítulo 2 – A'), page(9, 'Capítulo 3 – C')])).toBeNull());

  it('um único acerto devolve null', () =>
    expect(headingsToTree([page(5, 'Unidade 1 – A'), page(9, 'Texto')])).toBeNull());

  it('títulos numerados viram filhos com profundidade pela quantidade de pontos', () =>
    expect(headingsToTree([
      page(5, 'Capítulo 1 – Redes'), page(6, '1.1 Modelos de camadas'), page(8, 'Texto\n1.2 Endereçamento IP'),
      page(9, '1.2.1 Sub-redes'), page(20, 'Capítulo 2 – Transporte'), page(22, '2.1 Protocolo TCP'),
    ])).toEqual([
      { title: 'Capítulo 1 – Redes', startPage: 5, children: [
        { title: '1.1 Modelos de camadas', startPage: 6, children: [] },
        { title: '1.2 Endereçamento IP', startPage: 8, children: [{ title: '1.2.1 Sub-redes', startPage: 9, children: [] }] },
      ] },
      { title: 'Capítulo 2 – Transporte', startPage: 20, children: [{ title: '2.1 Protocolo TCP', startPage: 22, children: [] }] },
    ]));

  it('numerado de outra raiz, sem pai intermediário ou antes da 1ª raiz é ignorado', () =>
    expect(headingsToTree([
      page(3, '1.1 Antes da raiz'), page(5, 'Capítulo 1 – A'), page(6, '2.3 Fora da raiz'),
      page(7, '1.2.1 Sem pai'), page(9, '1.1 Certo'), page(20, 'Capítulo 2 – B'),
    ])).toEqual([
      { title: 'Capítulo 1 – A', startPage: 5, children: [{ title: '1.1 Certo', startPage: 9, children: [] }] },
      { title: 'Capítulo 2 – B', startPage: 20, children: [] },
    ]));

  it('numerado repetido (cabeçalho corrido) fica na primeira ocorrência', () =>
    expect(headingsToTree([page(5, 'Capítulo 1 – A'), page(8, '1.1 Seção'), page(9, '1.1 Seção'), page(20, 'Capítulo 2 – B')])?.[0].children).toEqual([
      { title: '1.1 Seção', startPage: 8, children: [] },
    ]));
});

describe('alignDraftsToText', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const node = (title: string, startPage: number, children: ChapterNode[] = []): ChapterNode => ({ title, startPage, children });
  const blank = (total: number) => Array.from({ length: total }, (_, i) => page(i + 1, `Texto qualquer ${i + 1}`));
  const pages = blank(60);
  pages[16] = page(17, 'Unidade 1 – Conjuntos Numéricos\nTexto');
  pages[29] = page(30, 'Unidade 2 – Funções e Gráficos\nTexto');
  pages[44] = page(45, 'Unidade 3 – Geometria Plana\nTexto');

  it('realinha páginas impressas (+2) para a página física cujo topo tem o título', () => {
    const tree = [
      node('Unidade 1 – Conjuntos Numéricos', 15),
      node('Unidade 2 – Funções e Gráficos', 28),
      node('Unidade 3 – Geometria Plana', 43),
    ];
    expect(alignDraftsToText(tree, pages).map((d) => d.startPage)).toEqual([17, 30, 45]);
    expect(tree.map((d) => d.startPage)).toEqual([15, 28, 43]);
  });

  it('draft sem título encontrado herda o deslocamento majoritário', () => {
    const tree = [
      node('Unidade 1 – Conjuntos Numéricos', 15),
      node('Unidade 2 – Funções e Gráficos', 28),
      node('Título que não existe no texto', 50),
    ];
    expect(alignDraftsToText(tree, pages).map((d) => d.startPage)).toEqual([17, 30, 52]);
  });

  it('deslocamento herdado fora de [1, total] descarta o nó com a subárvore', () => {
    const book = Array.from({ length: 300 }, (_, i) => page(i + 1, `Texto ${i + 1}`));
    book[16] = page(17, 'Unidade 1 – Conjuntos Numéricos');
    book[29] = page(30, 'Unidade 2 – Funções e Gráficos');
    const r = alignDraftsToText(
      [
        node('Unidade 1 – Conjuntos Numéricos', 15),
        node('Unidade 2 – Funções e Gráficos', 28),
        node('Título ausente do texto', 299, [node('x', 300)]),
      ],
      book,
    );
    expect(r).toEqual([node('Unidade 1 – Conjuntos Numéricos', 17), node('Unidade 2 – Funções e Gráficos', 30)]);
  });

  it('ignora acentos e pontuação ao comparar', () => {
    const r = alignDraftsToText([node('UNIDADE 2: FUNCOES e graficos', 29)], pages);
    expect(r[0].startPage).toBe(30);
  });

  it.each([
    ['Intervalos', 21, '23Módulo 0\nUnidade 1 – Conjuntos Numéricos\nI NTERVALOS', 23],
    ['Logaritmo e exponencial', 11, '111Módulo 0\nUnidade 4\nLOGARITMO E EXPONENCIAL', 13],
  ])('versalete espaçado e letra isolada: "%s" acha o topo com deslocamento 2', (title, printed, top, expected) => {
    const book = blank(60);
    book[expected - 1] = page(expected, top);
    expect(alignDraftsToText([node(title, printed)], book)[0].startPage).toBe(expected);
  });

  it('maioria dos encontrados impõe o deslocamento a todos, filhos inclusive', () => {
    const book = blank(60);
    book[4] = page(5, 'Fundamentos de Redes');
    book[10] = page(11, 'Protocolos de Camada');
    book[13] = page(14, 'Camada de Aplicação');
    const tree = [node('Fundamentos de Redes', 3, [node('Título ausente', 4)]), node('Protocolos de Camada', 9), node('Camada de Aplicação', 14)];
    expect(alignDraftsToText(tree, book)).toEqual([
      node('Fundamentos de Redes', 5, [node('Título ausente', 6)]), node('Protocolos de Camada', 11), node('Camada de Aplicação', 16),
    ]);
    expect(tree[0].startPage).toBe(3);
  });

  it('sem maioria cada nó encontrado usa o próprio deslocamento', () => {
    const book = blank(60);
    book[4] = page(5, 'Fundamentos de Redes');
    book[8] = page(9, 'Protocolos de Camada');
    book[13] = page(14, 'Segurança de Sistemas');
    const tree = [node('Fundamentos de Redes', 3), node('Protocolos de Camada', 9), node('Segurança de Sistemas', 15), node('Título ausente', 18)];
    expect(alignDraftsToText(tree, book).map((n) => n.startPage)).toEqual([5, 9, 14, 18]);
  });

  it('raiz "Unidade N" recua para a divisória "UNIDADE N"', () => {
    const book = blank(60);
    book[14] = page(15, '13Módulo 0\nApresentação\nUNIDADE 1');
    book[16] = page(17, '15Módulo 0\nUnidade 1 – Conjuntos Numéricos\nCONJUNTOS NUMÉRICOS');
    book[42] = page(43, 'UNIDADE 2');
    book[44] = page(45, 'Unidade 2 – Frações');
    const tree = [
      node('Unidade 1 – Conjuntos Numéricos', 15, [node('Conjuntos Numéricos', 15)]),
      node('Unidade 2 – Frações', 43, [node('Frações', 43)]),
    ];
    expect(alignDraftsToText(tree, book)).toEqual([
      node('Unidade 1 – Conjuntos Numéricos', 15, [node('Conjuntos Numéricos', 17)]),
      node('Unidade 2 – Frações', 43, [node('Frações', 45)]),
    ]);
  });

  it('divisória com outro número não puxa a raiz', () => {
    const book = blank(60);
    book[42] = page(43, 'UNIDADE 3');
    book[44] = page(45, 'Unidade 2 – Frações');
    expect(alignDraftsToText([node('Unidade 2 – Frações', 43, [node('Frações', 43)])], book)[0].startPage).toBe(45);
  });

  it('palavra-chave e número de outro capítulo não casam o título', () => {
    const book = blank(60);
    book[10] = page(11, 'Capítulo 2: Álgebra vetorial');
    expect(alignDraftsToText([node('Capítulo 3: Álgebra linear', 10)], book)[0].startPage).toBe(10);
  });

  it('título "Capítulo N: ..." casa topo com o mesmo número e as palavras do título', () => {
    const book = blank(60);
    book[10] = page(11, 'Capítulo 3\nÁlgebra linear');
    expect(alignDraftsToText([node('Capítulo 3: Álgebra linear', 10)], book)[0].startPage).toBe(11);
  });

  it('raiz com página própria no sumário (diferente do primeiro filho) não recua', () => {
    const book = blank(60);
    book[42] = page(43, 'UNIDADE 2');
    book[44] = page(45, 'Unidade 2 – Frações');
    expect(alignDraftsToText([node('Unidade 2 – Frações', 43, [node('Frações', 44)])], book)[0].startPage).toBe(45);
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

describe('isTocPage', () => {
  it('3 linhas com líder e número é sumário; 2 não', () => {
    expect(isTocPage('Sumário\nA ........ 3\nB . . . . 9\nC …… 12')).toBe(true);
    expect(isTocPage('A ........ 3\nB ........ 9\nTexto')).toBe(false);
  });
});

describe('selectTocPages', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const toc = 'Sumário\nA ........ 3\nB ........ 9\nC ........ 12';
  it('sem sumário fora da janela devolve só a janela', () => {
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, `Texto ${i + 1}`));
    expect(selectTocPages(pages, 15).map((p) => p.pageNumber)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it('acrescenta no máximo 10 páginas de sumário depois da janela', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(i + 1, i + 1 >= 30 && i + 1 <= 41 ? toc : `Texto ${i + 1}`));
    expect(selectTocPages(pages, 5).map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });
});
