import { describe, it, expect, vi, beforeEach } from 'vitest';

const { load, destroy, doc } = vi.hoisted(() => ({
  load: vi.fn(),
  destroy: vi.fn(async () => undefined),
  doc: {
    getOutline: vi.fn(),
    getDestination: vi.fn(),
    getPageIndex: vi.fn(),
    getPageLabels: vi.fn(),
  },
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    load = load;
    destroy = destroy;
  },
}));

import { readPdfNavigation } from '../file-parser';

describe('readPdfNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    load.mockResolvedValue(doc);
    doc.getPageLabels.mockResolvedValue(null);
  });

  it('resolve destinos nomeados e explícitos para página física (1-based)', async () => {
    doc.getOutline.mockResolvedValue([
      { title: 'Cap. 1 Introdução', dest: 'c1', items: [{ title: '1.1', dest: 'x', items: [] }] },
      { title: 'Cap. 2 Modelo ER', dest: [{ num: 7, gen: 0 }, { name: 'XYZ' }], items: [] },
    ]);
    doc.getDestination.mockResolvedValue([{ num: 3, gen: 0 }]);
    doc.getPageIndex.mockImplementation(async (ref: { num: number }) => (ref.num === 3 ? 11 : 24));
    doc.getPageLabels.mockResolvedValue(['i', 'ii', '1']);

    expect(await readPdfNavigation(Buffer.from('%PDF'))).toEqual({
      outline: [
        { title: 'Cap. 1 Introdução', pageNumber: 12 },
        { title: 'Cap. 2 Modelo ER', pageNumber: 25 },
      ],
      pageLabels: ['i', 'ii', '1'],
    });
    expect(doc.getDestination).toHaveBeenCalledTimes(1);
    expect(doc.getDestination).toHaveBeenCalledWith('c1');
    expect(destroy).toHaveBeenCalled();
  });

  it('aceita destino explícito com índice numérico de página', async () => {
    doc.getOutline.mockResolvedValue([{ title: 'Cap. 3', dest: [4, { name: 'Fit' }], items: [] }]);
    const result = await readPdfNavigation(Buffer.from('%PDF'));
    expect(result.outline).toEqual([{ title: 'Cap. 3', pageNumber: 5 }]);
  });

  it('destino irresolúvel vira pageNumber null', async () => {
    doc.getOutline.mockResolvedValue([
      { title: 'Cap. 1', dest: 'quebrado', items: [] },
      { title: 'Cap. 2', dest: [{ num: 9, gen: 0 }], items: [] },
    ]);
    doc.getDestination.mockRejectedValue(new Error('destino inexistente'));
    doc.getPageIndex.mockResolvedValue(1);

    const result = await readPdfNavigation(Buffer.from('%PDF'));
    expect(result.outline).toEqual([
      { title: 'Cap. 1', pageNumber: null },
      { title: 'Cap. 2', pageNumber: 2 },
    ]);
  });

  it('PDF sem outline devolve lista vazia', async () => {
    doc.getOutline.mockResolvedValue(null);
    const result = await readPdfNavigation(Buffer.from('%PDF'));
    expect(result).toEqual({ outline: [], pageLabels: null });
    expect(destroy).toHaveBeenCalled();
  });

  it('erro ao abrir o PDF devolve navegação vazia', async () => {
    load.mockRejectedValue(new Error('PDF corrompido'));
    const result = await readPdfNavigation(Buffer.from('%PDF'));
    expect(result).toEqual({ outline: [], pageLabels: null });
    expect(destroy).toHaveBeenCalled();
  });
});
