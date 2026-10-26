import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamChunk } from '@/lib/ai-provider';
import type { OutlineEntry, RawDocumentPage } from '@/domains/rag/types';
import {
  CHAPTERS_PDF_ONLY,
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

function depsWith(
  opts: { outline?: OutlineEntry[]; ai?: string; fallback?: boolean; throws?: boolean } = {},
): ChapterExtractionDeps {
  streamChat.mockImplementation(async function* (): AsyncGenerator<StreamChunk> {
    if (opts.throws) throw new Error('rede caiu');
    yield { token: opts.ai ?? '', isComplete: true, fallback: opts.fallback ?? false };
  });
  return {
    readNavigation: async () => ({ outline: opts.outline ?? [], pageLabels: null }),
    streamChat,
    repo: { listChapters, listChapterLinks, replaceChapters },
    materials: { findMaterial },
    files: { getFileBuffer: async () => ({ buffer }) },
  } as unknown as ChapterExtractionDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
  listChapters.mockResolvedValue([]);
  listChapterLinks.mockResolvedValue([]);
  replaceChapters.mockImplementation(async (_m, rows) =>
    rows.map((r: { order: number; title: string; startPage: number; endPage: number }) => ({
      id: `c${r.order}`, order: r.order, title: r.title, startPage: r.startPage, endPage: r.endPage, source: 'OUTLINE',
    })),
  );
});

describe('extractAndSaveChapters', () => {
  it('PDF com outline grava capítulos OUTLINE sem chamar a IA', async () => {
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 300 },
      depsWith({ outline: [{ title: 'Cap. 1', pageNumber: 12 }, { title: 'Cap. 2', pageNumber: 25 }] }),
    );
    expect(r.source).toBe('OUTLINE');
    expect(streamChat).not.toHaveBeenCalled();
    expect(replaceChapters).toHaveBeenCalledWith(
      'm1',
      [expect.objectContaining({ order: 1, startPage: 12, endPage: 24 }), expect.objectContaining({ order: 2, endPage: 300 })],
      'OUTLINE',
      [],
      expect.arrayContaining([{ order: null, title: null, fromPage: 1, toPage: 11 }]),
    );
  });

  it('PDF sem outline usa a IA nas 12 primeiras páginas e grava AI', async () => {
    const r = await extractAndSaveChapters(
      'm1',
      { buffer, pages, totalPages: 20 },
      depsWith({ ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }]) }),
    );
    expect(r.source).toBe('AI');
    const prompt = streamChat.mock.calls[0][0].map((m: { content: string }) => m.content).join('\n');
    expect(prompt).toContain('Página física 12');
    expect(prompt).not.toContain('Página física 13');
    expect(streamChat.mock.calls[0][1]).toEqual({ temperature: 0.1, maxTokens: 1200 });
    expect(replaceChapters).toHaveBeenCalledWith('m1', expect.any(Array), 'AI', [], expect.any(Array));
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

  it('mesma contagem re-vincula por ordem; contagem diferente informa aulas sem vínculo', async () => {
    listChapterLinks.mockResolvedValue([
      { order: 1, lessonPlanIds: ['l1'] },
      { order: 2, lessonPlanIds: ['l1', 'l2'] },
    ]);
    const two = [{ title: 'A', pageNumber: 2 }, { title: 'B', pageNumber: 5 }];
    const same = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ outline: two }));
    expect(same.lostLessonLinks).toBe(0);
    expect(replaceChapters.mock.calls[0][3]).toHaveLength(3);

    const three = [...two, { title: 'C', pageNumber: 8 }];
    const diff = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 }, depsWith({ outline: three }));
    expect(diff.lostLessonLinks).toBe(2);
    expect(replaceChapters.mock.calls[1][3]).toEqual([]);
  });
});

describe('reextractMaterialChapters', () => {
  const material = { id: 'm1', totalPages: 20, mimeType: 'application/pdf', filePath: 'f.pdf', originalFilename: 'livro.pdf' };

  it('material inexistente dá 404', async () => {
    findMaterial.mockResolvedValue(null);
    await expect(reextractMaterialChapters('x', depsWith())).rejects.toMatchObject({ status: 404, message: 'Material não encontrado.' });
  });

  it('DOCX dá 400', async () => {
    findMaterial.mockResolvedValue({ ...material, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFilename: 'a.docx' });
    await expect(reextractMaterialChapters('m1', depsWith())).rejects.toMatchObject({ status: 400, message: CHAPTERS_PDF_ONLY });
  });

  it('cascata vazia mantém capítulos atuais', async () => {
    findMaterial.mockResolvedValue(material);
    vi.mocked(parseDocumentFile).mockResolvedValue({ pages } as never);
    const current = [{ id: 'c1', order: 1, title: 'Velho', startPage: 1, endPage: 20, source: 'MANUAL' }];
    listChapters.mockResolvedValue(current);
    const r = await reextractMaterialChapters('m1', depsWith({ ai: 'lixo' }));
    expect(parseDocumentFile).toHaveBeenCalledWith(buffer, 'livro.pdf', { maxPages: 12, skipOcr: true });
    expect(r).toEqual({ source: null, chapters: current, lostLessonLinks: 0 });
    expect(replaceChapters).not.toHaveBeenCalled();
  });
});

describe('replaceManualChapters', () => {
  const material = { id: 'm1', totalPages: 20, mimeType: 'application/pdf', filePath: 'f.pdf', originalFilename: 'livro.pdf' };

  it('páginas decrescentes dão 400 com a mensagem exata', async () => {
    findMaterial.mockResolvedValue(material);
    await expect(
      replaceManualChapters('m1', [{ title: 'A', startPage: 9 }, { title: 'B', startPage: 3 }], depsWith()),
    ).rejects.toMatchObject({ status: 400, message: 'As páginas iniciais devem ser crescentes e estar entre 1 e 20.' });
    expect(replaceChapters).not.toHaveBeenCalled();
  });

  it('válidas gravam com source MANUAL', async () => {
    findMaterial.mockResolvedValue(material);
    await replaceManualChapters('m1', [{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }], depsWith());
    expect(replaceChapters).toHaveBeenCalledWith('m1', expect.any(Array), 'MANUAL', [], expect.any(Array));
  });

  it('não-PDF dá 400', async () => {
    findMaterial.mockResolvedValue({ ...material, mimeType: 'text/plain', originalFilename: 'a.txt' });
    await expect(replaceManualChapters('m1', [], depsWith())).rejects.toMatchObject({ status: 400, message: CHAPTERS_PDF_ONLY });
  });
});
