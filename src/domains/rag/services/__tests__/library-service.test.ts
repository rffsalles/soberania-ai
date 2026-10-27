import { describe, it, expect, vi } from 'vitest';
import * as fileParser from '../../file-parser';
import { DomainError } from '@/lib/api/domain-error';
import { MATERIAL_STATUS } from '@/lib/constants/library';
import { EmbeddingUnavailableError, EmbeddingsDisabledError } from '@/lib/embeddings';
import {
  ingestTextDocument,
  reindexMaterial,
  uploadAndIngest,
  type LibraryDeps,
} from '../library-service';

vi.mock('../../file-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../file-parser')>();
  return { ...actual, parseDocumentFile: vi.fn(actual.parseDocumentFile) };
});

function makeDeps(over: Partial<LibraryDeps> = {}) {
  const created: Record<string, unknown>[] = [];
  const chunks: { materialId: string; count: number }[] = [];
  const statuses: { id: string; status: string }[] = [];
  const embedded: { id: string; embedding: number[] }[][] = [];
  const categories: string[] = ['Existente'];
  const stored: string[] = [];
  const calls: string[] = [];
  const deps: LibraryDeps = {
    storage: {
      uploadFile: async (_buf, name) => {
        stored.push(name);
        return { filePath: `/files/${name}` };
      },
    },
    materials: {
      createMaterial: async (data) => {
        const rec = { id: 'm1', createdAt: new Date('2026-01-01'), edition: null, originalFilename: null, ...data };
        created.push(rec);
        return rec as never;
      },
      updateMaterialStatus: async (id, status) => {
        statuses.push({ id, status });
      },
      findMaterial: async (id) => (id === 'm1' ? ({ id: 'm1' } as never) : null),
    },
    chunks: {
      createChunks: async (materialId, list) => {
        calls.push('createChunks');
        chunks.push({ materialId, count: list.length });
        return list.map((c, i) => ({ id: `ch${i}`, content: c.content }));
      },
      setEmbeddings: async (rows) => {
        embedded.push(rows);
      },
      listChunksByMaterial: async () => [
        { id: 'ch0', content: 'a' },
        { id: 'ch1', content: 'b' },
      ],
    },
    categories: {
      upsertCategoryByName: async (name) => {
        if (!categories.includes(name)) categories.push(name);
        return { id: `cat-${name}` };
      },
    },
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.5])),
    chapters: {
      extractAndSave: vi.fn(async () => {
        calls.push('extractAndSave');
      }),
    },
    ...over,
  };
  return { calls, deps, created, chunks, categories, stored, statuses, embedded };
}

const text = 'Sistemas distribuidos exigem tolerancia a falhas. '.repeat(30);
const file = { buffer: Buffer.from(text), name: 'livro.txt' };
const meta = { title: ' Livro ', author: 'Autor', categories: ['Existente', 'Nova'] };

const throwingEmbed = async (): Promise<number[][]> => {
  throw new EmbeddingUnavailableError('provider offline');
};

describe('uploadAndIngest', () => {
  it('stores file, creates material linked to categories, chunks and missing categories', async () => {
    const { deps, created, chunks, categories, stored } = makeDeps();
    const result = await uploadAndIngest(file, meta, deps);

    expect(stored).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'Livro',
      subject: 'Existente, Nova',
      originalFilename: 'livro.txt',
      categories: { connect: [{ id: 'cat-Existente' }, { id: 'cat-Nova' }] },
    });
    expect(chunks[0].materialId).toBe('m1');
    expect(chunks[0].count).toBeGreaterThan(0);
    expect(categories).toContain('Nova');
    expect(result.material).toMatchObject({
      id: 'm1',
      title: 'Livro',
      category: 'Existente, Nova',
      totalChunks: chunks[0].count,
      status: MATERIAL_STATUS.INDEXED,
    });
  });

  it('embeds the chunks, stores embeddings by chunk id and marks the material INDEXED', async () => {
    const { deps, chunks, statuses, embedded } = makeDeps();
    await uploadAndIngest(file, meta, deps);

    expect(deps.embed).toHaveBeenCalledTimes(1);
    expect(embedded).toHaveLength(1);
    expect(embedded[0]).toHaveLength(chunks[0].count);
    expect(embedded[0][0]).toEqual({ id: 'ch0', embedding: [0.5] });
    expect(statuses).toEqual([{ id: 'm1', status: MATERIAL_STATUS.INDEXED }]);
  });

  it('marks the material INDEXED_LEXICAL_ONLY when embeddings are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, statuses, embedded } = makeDeps({ embed: vi.fn(throwingEmbed) });
    const result = await uploadAndIngest(file, meta, deps);

    expect(embedded).toHaveLength(0);
    expect(statuses).toEqual([{ id: 'm1', status: MATERIAL_STATUS.INDEXED_LEXICAL_ONLY }]);
    expect(result.material.status).toBe(MATERIAL_STATUS.INDEXED_LEXICAL_ONLY);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ingestão não quebra com embeddings desligados: chunks salvos sem vetor, INDEXED_LEXICAL_ONLY', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { deps, statuses, embedded } = makeDeps({
      embed: vi.fn(async () => {
        throw new EmbeddingsDisabledError();
      }),
    });
    const result = await uploadAndIngest(file, meta, deps);
    expect(embedded).toHaveLength(0);
    expect(statuses).toEqual([{ id: 'm1', status: MATERIAL_STATUS.INDEXED_LEXICAL_ONLY }]);
    expect(result.material.status).toBe(MATERIAL_STATUS.INDEXED_LEXICAL_ONLY);
    warn.mockRestore();
    info.mockRestore();
  });

  it('defaults to Geral when no categories are given', async () => {
    const { deps, created } = makeDeps();
    await uploadAndIngest(file, { ...meta, categories: [] }, deps);
    expect(created[0]).toMatchObject({ subject: 'Geral', categories: { connect: [] } });
  });

  it('throws DomainError 400 for an invalid file', async () => {
    const { deps, created } = makeDeps();
    const err = await uploadAndIngest({ buffer: Buffer.from('x'), name: 'virus.exe' }, meta, deps).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it('throws DomainError 400 when title or author is missing', async () => {
    const { deps } = makeDeps();
    const err = await uploadAndIngest(file, { ...meta, author: ' ' }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.status).toBe(400);
  });
});

describe('uploadAndIngest com PDF', () => {
  const pdfFile = { buffer: Buffer.from('%PDF-1.4 conteudo'), name: 'livro.pdf' };
  const pages = [{ pageNumber: 1, text }];
  const mockParse = () =>
    vi.mocked(fileParser.parseDocumentFile).mockResolvedValueOnce({
      pages,
      totalPages: 7,
      isOcrApplied: false,
    } as never);

  it('PDF chama a extração de capítulos depois de gravar os chunks', async () => {
    mockParse();
    const { deps, calls } = makeDeps();
    await uploadAndIngest(pdfFile, meta, deps);

    expect(deps.chapters.extractAndSave).toHaveBeenCalledTimes(1);
    expect(deps.chapters.extractAndSave).toHaveBeenCalledWith('m1', {
      buffer: pdfFile.buffer,
      pages,
      totalPages: 7,
    });
    expect(calls.indexOf('createChunks')).toBeLessThan(calls.indexOf('extractAndSave'));
  });

  it('falha na extração de capítulos não derruba o upload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockParse();
    const { deps } = makeDeps({
      chapters: { extractAndSave: vi.fn(async () => { throw new Error('boom'); }) },
    });
    const result = await uploadAndIngest(pdfFile, meta, deps);

    expect(result.material.status).toBe(MATERIAL_STATUS.INDEXED);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[LibraryService] Falha ao extrair capítulos'),
      expect.anything()
    );
    warn.mockRestore();
  });

  it('texto colado (.txt) não chama a extração', async () => {
    const { deps } = makeDeps();
    await ingestTextDocument({ title: 'Notas', author: 'Prof', categories: [], text }, deps);
    expect(deps.chapters.extractAndSave).not.toHaveBeenCalled();
  });
});

describe('ingestTextDocument', () => {
  it('rejeita texto vazio com 400 em vez de indexar um resumo inventado', async () => {
    const { deps, stored, created } = makeDeps();
    const err = await ingestTextDocument({ title: 'Vazio', author: 'Prof', categories: [], text: '   ' }, deps).catch((e) => e);
    expect(err).toMatchObject({ status: 400 });
    expect(stored).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('persists pasted text through uploadAndIngest as a .txt file', async () => {
    const { deps, stored, created, embedded } = makeDeps();
    const result = await ingestTextDocument(
      { title: 'Notas de Aula', author: 'Prof', categories: ['Nova'], text },
      deps
    );

    expect(stored[0]).toMatch(/\.txt$/);
    expect(created[0]).toMatchObject({ title: 'Notas de Aula', mimeType: 'text/plain' });
    expect(embedded).toHaveLength(1);
    expect(result.material.id).toBe('m1');
  });
});

describe('reindexMaterial', () => {
  it('re-embeds every chunk and marks the material INDEXED', async () => {
    const { deps, statuses, embedded } = makeDeps();
    const result = await reindexMaterial('m1', deps);

    expect(deps.embed).toHaveBeenCalledWith(['a', 'b']);
    expect(embedded[0]).toEqual([
      { id: 'ch0', embedding: [0.5] },
      { id: 'ch1', embedding: [0.5] },
    ]);
    expect(statuses).toEqual([{ id: 'm1', status: MATERIAL_STATUS.INDEXED }]);
    expect(result).toEqual({ status: MATERIAL_STATUS.INDEXED, chunks: 2 });
  });

  it('marks INDEXED_LEXICAL_ONLY when embeddings are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = makeDeps({ embed: vi.fn(throwingEmbed) });
    const result = await reindexMaterial('m1', deps);
    expect(result.status).toBe(MATERIAL_STATUS.INDEXED_LEXICAL_ONLY);
    warn.mockRestore();
  });

  it('throws DomainError 404 for an unknown material', async () => {
    const { deps } = makeDeps();
    const err = await reindexMaterial('nope', deps).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.status).toBe(404);
  });
});
