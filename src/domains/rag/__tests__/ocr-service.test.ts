import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { recognize, terminate, createWorker } = vi.hoisted(() => {
  const recognize = vi.fn();
  const terminate = vi.fn(async () => undefined);
  const createWorker = vi.fn(async () => ({ recognize, terminate }));
  return { recognize, terminate, createWorker };
});

vi.mock('tesseract.js', () => ({ createWorker }));

import { OcrService } from '../ocr-service';

describe('OcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recognize.mockImplementation(async (img: Uint8Array) => ({ data: { text: `texto ${img[0]}` } }));
  });

  afterEach(() => {
    delete process.env.OCR_MAX_PAGES;
  });

  it('reconhece várias páginas com um único worker e devolve o texto de cada uma na ordem', async () => {
    const service = new OcrService();
    const images = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    const texts = await service.recognizePages(images);

    expect(texts).toEqual(['texto 1', 'texto 2', 'texto 3']);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('encerra o worker mesmo quando uma página falha', async () => {
    recognize.mockRejectedValueOnce(new Error('imagem inválida'));
    const service = new OcrService();

    await expect(service.recognizePages([new Uint8Array([9])])).rejects.toThrow('imagem inválida');
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('limita o número de páginas por OCR_MAX_PAGES com padrão 30', () => {
    const service = new OcrService();
    expect(service.maxPages()).toBe(30);
    process.env.OCR_MAX_PAGES = '12';
    expect(service.maxPages()).toBe(12);
    process.env.OCR_MAX_PAGES = 'abc';
    expect(service.maxPages()).toBe(30);
  });
});
