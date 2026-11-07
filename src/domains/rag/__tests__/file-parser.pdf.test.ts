import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getText, getInfo, getScreenshot, destroy, recognizePages } = vi.hoisted(() => ({
  getText: vi.fn(),
  getInfo: vi.fn(),
  getScreenshot: vi.fn(),
  destroy: vi.fn(async () => undefined),
  recognizePages: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    getText = getText;
    getInfo = getInfo;
    getScreenshot = getScreenshot;
    destroy = destroy;
  },
}));
vi.mock('../ocr-service', async (orig) => {
  const actual = await orig<typeof import('../ocr-service')>();
  return {
    ...actual,
    ocrService: {
      isOcrEnabled: () => process.env.ENABLE_OCR === 'true',
      maxPages: () => Number(process.env.OCR_MAX_PAGES || 30),
      recognizePages,
    },
  };
});

import { parseDocumentFile } from '../file-parser';

describe('parseDocumentFile - PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getText.mockResolvedValue({
      total: 300,
      pages: [
        { num: 1, text: 'Capa' },
        { num: 2, text: 'Folha de rosto' },
      ],
    });
    getInfo.mockResolvedValue({ info: { Title: 'Fundamentos de Lógica Computacional', Author: 'Autora Exemplo' } });
  });

  it('limita o parse às primeiras páginas quando maxPages é informado', async () => {
    const result = await parseDocumentFile(Buffer.from('%PDF-1.4'), 'livro.pdf', { maxPages: 8, skipOcr: true });

    expect(getText).toHaveBeenCalledWith(expect.objectContaining({ first: 8 }));
    expect(result.pages).toHaveLength(2);
    expect(result.totalPages).toBe(300);
    expect(result.info).toEqual({ title: 'Fundamentos de Lógica Computacional', author: 'Autora Exemplo' });
  });

  it('parseia o documento inteiro quando nenhuma opção é informada', async () => {
    await parseDocumentFile(Buffer.from('%PDF-1.4'), 'livro.pdf');

    expect(getText).toHaveBeenCalledTimes(1);
    expect(getText.mock.calls[0][0]?.first).toBeUndefined();
  });

  it('renderiza as páginas escaneadas e aplica OCR preservando a numeração real', async () => {
    process.env.ENABLE_OCR = 'true';
    getText.mockResolvedValue({ total: 3, pages: [{ num: 1, text: '' }, { num: 2, text: '' }, { num: 3, text: '' }] });
    getScreenshot.mockResolvedValue({
      total: 3,
      pages: [1, 2, 3].map((n) => ({ pageNumber: n, data: new Uint8Array([n]), width: 10, height: 10, scale: 1, dataUrl: '' })),
    });
    recognizePages.mockResolvedValue(['Capítulo 1 reconhecido', '', 'Capítulo 2 reconhecido']);

    const result = await parseDocumentFile(Buffer.from('%PDF-1.4'), 'scan.pdf');

    expect(getScreenshot).toHaveBeenCalledWith(expect.objectContaining({ first: 30 }));
    expect(recognizePages).toHaveBeenCalledWith([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
    expect(result.isOcrApplied).toBe(true);
    expect(result.ocrPartial).toBe(false);
    expect(result.totalPages).toBe(3);
    expect(result.pages).toEqual([
      expect.objectContaining({ pageNumber: 1, text: 'Capítulo 1 reconhecido' }),
      expect.objectContaining({ pageNumber: 3, text: 'Capítulo 2 reconhecido' }),
    ]);
    delete process.env.ENABLE_OCR;
  });

  it('marca o OCR como parcial quando o documento excede OCR_MAX_PAGES', async () => {
    process.env.ENABLE_OCR = 'true';
    process.env.OCR_MAX_PAGES = '2';
    getText.mockResolvedValue({ total: 5, pages: [1, 2, 3, 4, 5].map((n) => ({ num: n, text: '' })) });
    getScreenshot.mockResolvedValue({
      total: 5,
      pages: [1, 2].map((n) => ({ pageNumber: n, data: new Uint8Array([n]), width: 10, height: 10, scale: 1, dataUrl: '' })),
    });
    recognizePages.mockResolvedValue(['p1', 'p2']);

    const result = await parseDocumentFile(Buffer.from('%PDF-1.4'), 'scan.pdf');

    expect(getScreenshot).toHaveBeenCalledWith(expect.objectContaining({ first: 2 }));
    expect(result.isOcrApplied).toBe(true);
    expect(result.ocrPartial).toBe(true);
    expect(result.totalPages).toBe(5);
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    delete process.env.ENABLE_OCR;
    delete process.env.OCR_MAX_PAGES;
  });

  it('mantém o texto vetorial quando o OCR falha', async () => {
    process.env.ENABLE_OCR = 'true';
    getText.mockResolvedValue({ total: 1, pages: [{ num: 1, text: 'pouco' }] });
    getScreenshot.mockRejectedValue(new Error('canvas indisponível'));

    const result = await parseDocumentFile(Buffer.from('%PDF-1.4'), 'scan.pdf');

    expect(result.isOcrApplied).toBe(false);
    expect(result.pages[0].text).toBe('pouco');
    delete process.env.ENABLE_OCR;
  });

  it('não dispara OCR com skipOcr mesmo em páginas quase vazias', async () => {
    getText.mockResolvedValue({ total: 2, pages: [{ num: 1, text: '' }, { num: 2, text: '' }] });
    process.env.ENABLE_OCR = 'true';

    const result = await parseDocumentFile(Buffer.from('%PDF-1.4'), 'scan.pdf', { maxPages: 4, skipOcr: true });

    expect(result.isOcrApplied).toBe(false);
    expect(getScreenshot).not.toHaveBeenCalled();
    expect(recognizePages).not.toHaveBeenCalled();
    delete process.env.ENABLE_OCR;
  });
});
