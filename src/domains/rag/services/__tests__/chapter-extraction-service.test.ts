import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamChunk } from '@/lib/ai-provider';
import type { OutlineEntry, RawDocumentPage } from '@/domains/rag/types';
import { Role } from '@prisma/client';
import {
  CHAPTERS_PDF_ONLY,
  FORCE_ADMIN_ONLY_MESSAGE,
  LINKS_CONFLICT_MESSAGE,
  extractAndSaveChapters,
  reextractMaterialChapters,
  replaceManualChapters,
  type ChapterExtractionDeps,
} from '../chapter-extraction-service';

vi.mock('@/domains/rag/file-parser', async (orig) => ({
  ...(await orig<typeof import('@/domains/rag/file-parser')>()),
  parseDocumentFile: vi.fn(),
}));
import { parseDocumentFile } from '@/domains/rag/file-parser';

vi.mock('@/domains/rag/chapters', async (orig) => {
  const actual = await orig<typeof import('@/domains/rag/chapters')>();
  return { ...actual, alignTreeToText: vi.fn(actual.alignTreeToText) };
});
import { alignTreeToText, type ChapterNode, type ChapterRow } from '@/domains/rag/chapters';
import {
  matBasicaPages,
  MAT_BASICA_OUTLINE,
  MAT_BASICA_PRINTED_TREE,
  MAT_BASICA_TOTAL_PAGES,
} from '@/domains/rag/__tests__/fixtures/mat-basica';

const node = (title: string, startPage: number, ...children: ChapterNode[]): ChapterNode => ({ title, startPage, children });
const tree = (pairs: [string, number][]) => pairs.map(([t, p]) => node(t, p));

const buffer = Buffer.from('pdf');
const pages: RawDocumentPage[] = Array.from({ length: 20 }, (_, i) => ({
  pageNumber: i + 1,
  chapter: `Página ${i + 1}`,
  section: `Seção ${i + 1}`,
  text: `Texto da página ${i + 1}`,
}));

const aiJson = (chapters: { title: string; startPage: number }[]) => JSON.stringify({ chapters });

const streamChat = vi.fn();
const replaceChapters = vi.fn();
const listChapters = vi.fn();
const listChapterLinks = vi.fn();
const findMaterial = vi.fn();
const listChapterLinkDetails = vi.fn();
const teacher = { id: 't1', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };

function depsWith(
  opts: { outline?: OutlineEntry[]; pageLabels?: string[] | null; ai?: string; fallback?: boolean; throws?: boolean } = {},
): ChapterExtractionDeps {
  streamChat.mockImplementation(async function* (): AsyncGenerator<StreamChunk> {
    if (opts.throws) throw new Error('rede caiu');
    yield { token: opts.ai ?? '', isComplete: true, fallback: opts.fallback ?? false };
  });
  return {
    readNavigation: async () => ({ outline: opts.outline ?? [], pageLabels: opts.pageLabels ?? null }),
    streamChat,
    repo: { listChapters, listChapterLinks, listChapterLinkDetails, replaceChapters },
    materials: { findMaterial },
    files: { getFileBuffer: async () => ({ buffer }) },
  } as unknown as ChapterExtractionDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
  listChapters.mockResolvedValue([]);
  listChapterLinks.mockResolvedValue([]);
  listChapterLinkDetails.mockResolvedValue([]);
  replaceChapters.mockImplementation(async (_m, rows, _s, _r, _a, beforeWrite) => {
    if (beforeWrite) await beforeWrite({ fake: 'tx' });
    return rows.map((r: { order: number; title: string; startPage: number; endPage: number }) => ({
      id: `c${r.order}`, order: r.order, title: r.title, startPage: r.startPage, endPage: r.endPage, source: 'OUTLINE',
    }));
  });
});

describe('extractAndSaveChapters', () => {
  it('PDF com outline grava capítulos OUTLINE sem chamar a IA', async () => {
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 300 },
      depsWith({ outline: [{ title: 'Cap. 1', pageNumber: 12, depth: 0 }, { title: 'Cap. 2', pageNumber: 25, depth: 0 }] }),
    );
    expect(r.source).toBe('OUTLINE');
    expect(streamChat).not.toHaveBeenCalled();
    expect(replaceChapters).toHaveBeenCalledWith(
      'm1',
      [expect.objectContaining({ order: 1, startPage: 12, endPage: 24 }), expect.objectContaining({ order: 2, endPage: 300 })],
      'OUTLINE',
      [],
      expect.arrayContaining([{ order: null, title: null, fromPage: 1, toPage: 11 }]),
      undefined,
    );
  });

  describe('com títulos "Unidade N" no texto e outline lixo', () => {
    const withHeadings = pages.map((p) =>
      [3, 8, 14].includes(p.pageNumber)
        ? { ...p, text: `Unidade ${[3, 8, 14].indexOf(p.pageNumber) + 1} – Tema\nTexto` }
        : p,
    );
    const garbage = [
      { title: 'Página em branco', pageNumber: 2, depth: 0 },
      { title: 'Página em branco', pageNumber: 19, depth: 0 },
    ];

    it('IA sem resposta válida cai para HEADINGS', async () => {
      const r = await extractAndSaveChapters(
        'm1',
        { buffer, pages: withHeadings, totalPages: 20 },
        depsWith({ outline: garbage, ai: 'lixo' }),
      );
      expect(r.source).toBe('HEADINGS');
      expect(streamChat).toHaveBeenCalledTimes(1);
      expect(replaceChapters).toHaveBeenCalledWith(
        'm1',
        [
          expect.objectContaining({ title: 'Unidade 1 – Tema', startPage: 3, endPage: 7 }),
          expect.objectContaining({ startPage: 8, endPage: 13 }),
          expect.objectContaining({ startPage: 14, endPage: 20 }),
        ],
        'HEADINGS',
        [],
        expect.any(Array),
        undefined,
      );
    });

    it('IA válida com títulos achados no texto vence HEADINGS', async () => {
      const r = await extractAndSaveChapters(
        'm1',
        { buffer, pages: withHeadings, totalPages: 20 },
        depsWith({ outline: garbage, ai: aiJson([{ title: 'Unidade 1 – Tema', startPage: 3 }, { title: 'Extra', startPage: 11 }]) }),
      );
      expect(r.source).toBe('AI');
      expect(replaceChapters.mock.calls[0][1].map((x: ChapterRow) => x.startPage)).toEqual([3, 11]);
    });

    it('árvore realinhada inválida com "Unidade N" no texto cai para HEADINGS', async () => {
      vi.mocked(alignTreeToText).mockImplementationOnce(() => ({ tree: [node('A', 9, node('a', 5)), node('B', 3)], found: 1, total: 3 }));
      const r = await extractAndSaveChapters(
        'm1',
        { buffer, pages: withHeadings, totalPages: 20 },
        depsWith({ outline: garbage, ai: JSON.stringify({ chapters: [{ title: 'A', startPage: 3, children: [{ title: 'a', startPage: 5 }] }, { title: 'B', startPage: 9 }] }) }),
      );
      expect(r.source).toBe('HEADINGS');
    });
  });

  it('exceção ao ler o texto não derruba a cascata', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = [
      {
        pageNumber: 1,
        get text(): string {
          throw new Error('boom');
        },
      },
      ...pages.slice(1),
    ] as unknown as RawDocumentPage[];
    const r = await extractAndSaveChapters('m1', { buffer, pages: bad, totalPages: 20 }, depsWith({ ai: 'lixo' }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(r.source).toBeNull();
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('árvore da IA com depth 7 é rejeitada', async () => {
    let deep: object = { title: 'Fundo', startPage: 10 };
    for (let p = 9; p >= 3; p--) deep = { title: `N${p}`, startPage: p, children: [deep] };
    const r = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 },
      depsWith({ ai: JSON.stringify({ chapters: [deep, { title: 'Outra', startPage: 15 }] }) }));
    expect(r.source).toBeNull();
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('árvore realinhada inválida sem títulos no texto cai para a árvore crua da IA', async () => {
    vi.mocked(alignTreeToText).mockImplementationOnce(() => ({ tree: [node('A', 9, node('a', 5)), node('B', 3)], found: 1, total: 3 }));
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ ai: JSON.stringify({ chapters: [{ title: 'A', startPage: 3, children: [{ title: 'a', startPage: 5 }] }, { title: 'B', startPage: 9 }] }) }),
    );
    expect(r.source).toBe('AI');
    expect(replaceChapters.mock.calls[0][1].map((x: ChapterRow) => x.startPage)).toEqual([3, 5, 9]);
  });

  it('mat basica: sumário das páginas 9-11 vira árvore com páginas físicas', async () => {
    const fixturePages = matBasicaPages();
    const r = await extractAndSaveChapters('m1', { buffer, pages: fixturePages, totalPages: MAT_BASICA_TOTAL_PAGES },
      depsWith({ outline: MAT_BASICA_OUTLINE, ai: JSON.stringify({ chapters: MAT_BASICA_PRINTED_TREE }) }));
    expect(r.source).toBe('AI');
    const prompt = streamChat.mock.calls[0][0].map((m: { content: string }) => m.content).join('\n');
    expect(prompt).toContain('Página física 11');
    expect(prompt).toContain('Logaritmo natural');
    expect(streamChat.mock.calls[0][1]).toEqual({ temperature: 0.1, maxTokens: 4000 });
    const rows: ChapterRow[] = replaceChapters.mock.calls[0][1];
    expect(rows.filter((x) => x.depth === 0).map((x) => x.startPage)).toEqual([15, 43, 67, 95, 123]);
    expect(rows.filter((x) => x.depth === 0).at(-1)?.endPage).toBe(174);
    const fundamentais = rows.find((x) => x.title === 'Conjuntos numéricos fundamentais')!;
    expect(fundamentais.startPage).toBe(20);
    expect(rows.filter((x) => x.parentOrder === fundamentais.order).map((x) => [x.title, x.startPage])).toEqual([
      ['Conjuntos dos números naturais', 21],
      ['Conjuntos dos números inteiros', 21],
      ['Conjuntos dos números racionais', 22],
      ['Conjuntos dos números irracionais', 23],
      ['Conjuntos dos números reais', 24],
    ]);
    expect(r.chapters).toEqual(await replaceChapters.mock.results[0].value);
  });

  it('raiz única da IA com 5 unidades vira 5 raízes', async () => {
    const units = [2, 5, 8, 11, 14].map((p, i) => ({ title: `Unidade ${i + 1}`, startPage: p, children: [] }));
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ ai: JSON.stringify({ chapters: [{ title: 'Matemática Básica', startPage: 1, children: units }] }) }),
    );
    expect(r.source).toBe('AI');
    const rows: ChapterRow[] = replaceChapters.mock.calls[0][1];
    expect(rows.map((x) => [x.depth, x.startPage])).toEqual([[0, 2], [0, 5], [0, 8], [0, 11], [0, 14]]);
  });

  it('PDF sem outline usa a IA nas 15 primeiras páginas e grava AI', async () => {
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }]) }),
    );
    expect(r.source).toBe('AI');
    const prompt = streamChat.mock.calls[0][0].map((m: { content: string }) => m.content).join('\n');
    expect(prompt).toContain('Página física 15');
    expect(prompt).not.toContain('Página física 16');
    expect(streamChat.mock.calls[0][1]).toEqual({ temperature: 0.1, maxTokens: 4000 });
    expect(replaceChapters).toHaveBeenCalledWith('m1', expect.any(Array), 'AI', [], expect.any(Array), undefined);
  });

  it('exceção ao aplicar os rótulos de página segue com a árvore não convertida', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const labels = ['i', null, ...Array.from({ length: 18 }, (_, i) => String(i + 1))] as unknown as string[];
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ pageLabels: labels, ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }]) }),
    );
    expect(warn).toHaveBeenCalledWith('[chapters] falha ao aplicar rótulos de página', expect.any(Error));
    warn.mockRestore();
    expect(r.source).toBe('AI');
    expect(replaceChapters.mock.calls[0][1].map((c: { startPage: number }) => c.startPage)).toEqual([3, 9]);
  });

  it('falha no realinhamento mantém o resultado da IA com as páginas originais', async () => {
    vi.mocked(alignTreeToText).mockImplementationOnce(() => {
      throw new Error('realinhar falhou');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }]) }),
    );
    expect(warn).toHaveBeenCalledWith('[chapters] Falha ao realinhar capítulos; usando páginas da IA', expect.any(Error));
    warn.mockRestore();
    expect(r.source).toBe('AI');
    expect(replaceChapters.mock.calls[0][1].map((c: { startPage: number }) => c.startPage)).toEqual([3, 9]);
  });

  it('páginas impressas da IA são realinhadas ao topo das páginas físicas', async () => {
    const shifted = pages.map((p) =>
      p.pageNumber === 5 ? { ...p, text: 'Fundamentos de Redes\nTexto' } : p.pageNumber === 11 ? { ...p, text: 'Protocolos de Camada\nTexto' } : p,
    );
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages: shifted, totalPages: 20 },
      depsWith({ ai: aiJson([{ title: 'Fundamentos de Redes', startPage: 3 }, { title: 'Protocolos de Camada', startPage: 9 }]) }),
    );
    expect(r.source).toBe('AI');
    expect(replaceChapters.mock.calls[0][1].map((c: { startPage: number }) => c.startPage)).toEqual([5, 11]);
  });

  describe('livro de 80 páginas com deslocamento 10 entre página impressa e física', () => {
    const book: RawDocumentPage[] = Array.from({ length: 80 }, (_, i) => ({
      pageNumber: i + 1, chapter: '', section: '', text: `Texto da página ${i + 1} com conteúdo corrido`,
    }));
    const starts = [11, 30, 50, 70];
    const names = ['Alfa', 'Beta', 'Gama', 'Delta'];
    const withChapters = book.map((p) =>
      starts.includes(p.pageNumber) ? { ...p, text: `Capítulo ${starts.indexOf(p.pageNumber) + 1} – ${names[starts.indexOf(p.pageNumber)]}\nTexto` } : p,
    );
    const printed = (titled: boolean) =>
      aiJson([1, 20, 40, 60].map((startPage, i) => ({ title: titled ? `Capítulo ${i + 1} – ${names[i]}` : names[i], startPage })));
    const garbage = [{ title: 'Página em branco', pageNumber: 2, depth: 0 }];
    const startPages = () => replaceChapters.mock.calls[0][1].map((x: ChapterRow) => x.startPage);

    it('deslocamento 10 sem rótulos: HEADINGS vence a IA', async () => {
      const r = await extractAndSaveChapters('m1', { buffer, pages: withChapters, totalPages: 80 },
        depsWith({ outline: garbage, ai: printed(true) }));
      expect(r.source).toBe('HEADINGS');
      expect(startPages()).toEqual([11, 30, 50, 70]);
    });

    it('rótulos de página convertem a árvore da IA', async () => {
      const pageLabels = [...Array(10).fill('i'), ...Array.from({ length: 70 }, (_, i) => String(i + 1))];
      const r = await extractAndSaveChapters('m1', { buffer, pages: book, totalPages: 80 },
        depsWith({ outline: garbage, pageLabels, ai: printed(false) }));
      expect(r.source).toBe('AI');
      expect(startPages()).toEqual([11, 30, 50, 70]);
    });

    it('IA crua só depois do HEADINGS: sem rótulos, achados ou títulos no texto', async () => {
      const r = await extractAndSaveChapters('m1', { buffer, pages: book, totalPages: 80 },
        depsWith({ outline: garbage, ai: printed(false) }));
      expect(r.source).toBe('AI');
      expect(startPages()).toEqual([1, 20, 40, 60]);
    });
  });

  it('páginas sem texto não chamam a IA', async () => {
    const empty = pages.map((p) => ({ ...p, text: '' }));
    const r = await extractAndSaveChapters('m1', { buffer, pages: empty, totalPages: 20 },
      depsWith({ ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }]) }));
    expect(streamChat).not.toHaveBeenCalled();
    expect(r.source).toBeNull();
  });

  it.each([
    ['fora de ordem', [{ title: 'A', startPage: 9 }, { title: 'B', startPage: 3 }]],
    ['fora do intervalo', [{ title: 'A', startPage: 3 }, { title: 'B', startPage: 99 }]],
    ['com 1 capítulo', [{ title: 'A', startPage: 3 }]],
  ])('IA %s não grava nada', async (_n, chapters) => {
    const r = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ ai: aiJson(chapters) }));
    expect(r.source).toBeNull();
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('IA indisponível (fallback ou exceção) não lança e devolve sem capítulos', async () => {
    const a = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ fallback: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ throws: true }));
    warn.mockRestore();
    expect(a.source).toBeNull();
    expect(b.source).toBeNull();
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('reextração re-vincula por título e informa aulas sem par', async () => {
    listChapters.mockResolvedValue([
      { id: 'o1', order: 1, title: 'A', startPage: 2, endPage: 4, depth: 0 },
      { id: 'o2', order: 2, title: 'B', startPage: 5, endPage: 20, depth: 0 },
    ]);
    listChapterLinks.mockResolvedValue([
      { order: 1, lessonPlanIds: ['l1'] },
      { order: 2, lessonPlanIds: ['l1', 'l2'] },
    ]);
    const three = [
      { title: 'A', pageNumber: 2, depth: 0 },
      { title: 'B', pageNumber: 6, depth: 0 },
      { title: 'C', pageNumber: 8, depth: 0 },
    ];
    const same = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ outline: three }));
    expect(same.lostLessonLinks).toBe(0);
    expect(replaceChapters.mock.calls[0][3]).toEqual([
      { order: 1, lessonPlanId: 'l1' },
      { order: 2, lessonPlanId: 'l1' },
      { order: 2, lessonPlanId: 'l2' },
    ]);

    const lost = [three[0], { title: 'X', pageNumber: 6, depth: 0 }];
    const diff = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ outline: lost }));
    expect(diff.lostLessonLinks).toBe(2);
  });
});

describe('reextractMaterialChapters', () => {
  const material = { id: 'm1', totalPages: 20, mimeType: 'application/pdf', filePath: 'f.pdf', originalFilename: 'livro.pdf' };

  it('material inexistente dá 404', async () => {
    findMaterial.mockResolvedValue(null);
    await expect(reextractMaterialChapters('x', { user: teacher }, depsWith())).rejects.toMatchObject({ status: 404, message: 'Material não encontrado.' });
  });

  it('DOCX dá 400', async () => {
    findMaterial.mockResolvedValue({ ...material, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFilename: 'a.docx' });
    await expect(reextractMaterialChapters('m1', { user: teacher }, depsWith())).rejects.toMatchObject({ status: 400, message: CHAPTERS_PDF_ONLY });
  });

  it('cascata vazia mantém capítulos atuais', async () => {
    findMaterial.mockResolvedValue(material);
    vi.mocked(parseDocumentFile).mockResolvedValue({ pages } as never);
    const current = [{ id: 'c1', order: 1, title: 'Velho', startPage: 1, endPage: 20, source: 'MANUAL' }];
    listChapters.mockResolvedValue(current);
    const r = await reextractMaterialChapters('m1', { user: teacher }, depsWith({ ai: 'lixo' }));
    expect(parseDocumentFile).toHaveBeenCalledWith(buffer, 'livro.pdf', { skipOcr: true });
    expect(r).toEqual({ source: null, chapters: current, lostLessonLinks: 0 });
    expect(replaceChapters).not.toHaveBeenCalled();
  });
});

describe('replaceManualChapters', () => {
  const material = { id: 'm1', totalPages: 20, mimeType: 'application/pdf', filePath: 'f.pdf', originalFilename: 'livro.pdf' };

  it('páginas decrescentes dão 400 com a mensagem exata', async () => {
    findMaterial.mockResolvedValue(material);
    await expect(
      replaceManualChapters('m1', tree([['A', 9], ['B', 3]]), { user: teacher }, depsWith()),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Capítulo 2: a página inicial (3) não pode ser anterior à do item anterior (9).',
    });
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('válidas gravam com source MANUAL', async () => {
    findMaterial.mockResolvedValue(material);
    await replaceManualChapters('m1', tree([['A', 3], ['B', 9]]), { user: teacher }, depsWith());
    expect(replaceChapters).toHaveBeenCalledWith('m1', expect.any(Array), 'MANUAL', [], expect.any(Array), undefined);
  });

  it('não-PDF dá 400', async () => {
    findMaterial.mockResolvedValue({ ...material, mimeType: 'text/plain', originalFilename: 'a.txt' });
    await expect(replaceManualChapters('m1', [], { user: teacher }, depsWith())).rejects.toMatchObject({ status: 400, message: CHAPTERS_PDF_ONLY });
  });
});

describe('guarda de vínculos', () => {
  const material = { id: 'm1', totalPages: 20, mimeType: 'application/pdf', filePath: 'f.pdf', originalFilename: 'livro.pdf' };
  const linked = [
    { order: 1, lessonPlanIds: ['l1'] },
    { order: 2, lessonPlanIds: ['l9'] },
  ];
  const foreign = {
    lessonPlanId: 'l9', teacherId: 't2', disciplina: 'BD', turma: 'A', classNumber: 4, topicTitle: 'Joins', professor: 'Ana',
  };

  beforeEach(() => {
    findMaterial.mockResolvedValue(material);
    listChapters.mockResolvedValue([
      { id: 'o1', order: 1, title: 'A', startPage: 2, endPage: 4, depth: 0 },
      { id: 'o2', order: 2, title: 'B', startPage: 5, endPage: 20, depth: 0 },
    ]);
    listChapterLinks.mockResolvedValue(linked);
  });

  it('vínculo perdido de outro professor dá 409', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    await expect(replaceManualChapters('m1', tree([['A', 2], ['C', 8]]), { user: teacher }, depsWith())).rejects.toMatchObject({
      status: 409,
      message: LINKS_CONFLICT_MESSAGE,
      details: [{ disciplina: 'BD', turma: 'A', classNumber: 4, topicTitle: 'Joins', professor: 'Ana' }],
    });
    expect(listChapterLinkDetails).toHaveBeenCalledWith('m1', { fake: 'tx' });
    expect(LINKS_CONFLICT_MESSAGE).toBe('Esta alteração desfaz vínculos de aulas de outros professores.');
  });

  it('contagem diferente sem vínculo perdido não bloqueia', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    const r = await replaceManualChapters('m1', tree([['A', 2], ['B', 5], ['C', 8]]), { user: teacher }, depsWith());
    expect(listChapterLinkDetails).not.toHaveBeenCalled();
    expect(r.lostLessonLinks).toBe(0);
  });

  it('perder só vínculo próprio não bloqueia', async () => {
    listChapterLinkDetails.mockResolvedValue([{ ...foreign, lessonPlanId: 'l1', teacherId: 't1' }]);
    const r = await replaceManualChapters('m1', tree([['X', 3], ['B', 5]]), { user: teacher }, depsWith());
    expect(r.lostLessonLinks).toBe(1);
    expect(replaceChapters).toHaveBeenCalled();
  });

  it('renomear com aula alheia não dá 409', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    const r = await replaceManualChapters('m1', tree([['A renomeado', 2], ['B', 5]]), { user: teacher }, depsWith());
    expect(r.lostLessonLinks).toBe(0);
    expect(replaceChapters).toHaveBeenCalled();
    expect(replaceChapters.mock.calls[0][3]).toEqual([
      { order: 1, lessonPlanId: 'l1' },
      { order: 2, lessonPlanId: 'l9' },
    ]);
  });

  it('árvore manual com filhos grava linhas com parentOrder', async () => {
    await replaceManualChapters('m1', [node('U1', 2, node('Frações', 3)), node('U2', 9)], { user: teacher }, depsWith());
    expect(replaceChapters.mock.calls[0][1].map((r: { order: number; parentOrder: number | null }) => [r.order, r.parentOrder])).toEqual([
      [1, null],
      [2, 1],
      [3, null],
    ]);
  });

  it('aula re-vinculada a pai e filho fica só no pai', async () => {
    listChapters.mockResolvedValue([
      { id: 'o1', order: 1, title: 'U', startPage: 2, endPage: 8, depth: 0 },
      { id: 'o2', order: 2, title: 'a', startPage: 3, endPage: 8, depth: 1 },
      { id: 'o3', order: 3, title: 'V', startPage: 9, endPage: 20, depth: 0 },
    ]);
    listChapterLinks.mockResolvedValue([{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l1'] }]);
    await replaceManualChapters('m1', [node('U', 2, node('a', 3)), node('V', 9)], { user: teacher }, depsWith());
    expect(replaceChapters.mock.calls[0][3]).toEqual([{ order: 1, lessonPlanId: 'l1' }]);
  });

  it('force: TEACHER → 403; ADMIN grava', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    const next = tree([['A', 2], ['C', 8]]);
    await expect(replaceManualChapters('m1', next, { user: teacher, force: true }, depsWith())).rejects.toMatchObject({
      status: 403,
      message: FORCE_ADMIN_ONLY_MESSAGE,
    });
    expect(findMaterial).not.toHaveBeenCalled();
    await replaceManualChapters('m1', next, { user: admin, force: true }, depsWith());
    expect(replaceChapters).toHaveBeenCalled();
  });

  it('reextração que perde vínculo alheio → 409', async () => {
    vi.mocked(parseDocumentFile).mockResolvedValue({ pages } as never);
    listChapterLinkDetails.mockResolvedValue([foreign]);
    const outline = [{ title: 'A', pageNumber: 2, depth: 0 }, { title: 'C', pageNumber: 8, depth: 0 }];
    await expect(reextractMaterialChapters('m1', { user: teacher }, depsWith({ outline }))).rejects.toMatchObject({ status: 409 });
    expect(listChapterLinkDetails).toHaveBeenCalledWith('m1', { fake: 'tx' });
  });
});
