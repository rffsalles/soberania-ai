import { describe, it, expect } from 'vitest';
import { DomainError } from '@/lib/api/domain-error';
import { MATERIAL_STATUS } from '@/lib/constants/library';
import { uploadAndIngest, type LibraryDeps } from '../library-service';

function makeDeps() {
  const created: Record<string, unknown>[] = [];
  const chunks: { materialId: string; count: number }[] = [];
  const categories: string[] = ['Existente'];
  const stored: string[] = [];
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
    },
    chunks: {
      createChunks: async (materialId, list) => {
        chunks.push({ materialId, count: list.length });
        return { count: list.length };
      },
    },
    categories: {
      upsertCategoryByName: async (name) => {
        if (!categories.includes(name)) categories.push(name);
        return null;
      },
    },
  };
  return { deps, created, chunks, categories, stored };
}

const text = 'Sistemas distribuidos exigem tolerancia a falhas. '.repeat(30);
const file = { buffer: Buffer.from(text), name: 'livro.txt' };
const meta = { title: ' Livro ', author: 'Autor', categories: ['Existente', 'Nova'] };

describe('uploadAndIngest', () => {
  it('stores file, creates material, chunks and missing categories', async () => {
    const { deps, created, chunks, categories, stored } = makeDeps();
    const result = await uploadAndIngest(file, meta, deps);

    expect(stored).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'Livro',
      subject: 'Existente, Nova',
      status: MATERIAL_STATUS.INDEXED,
      originalFilename: 'livro.txt',
    });
    expect(chunks[0].materialId).toBe('m1');
    expect(chunks[0].count).toBeGreaterThan(0);
    expect(categories).toContain('Nova');
    expect(result.material).toMatchObject({
      id: 'm1',
      title: 'Livro',
      category: 'Existente, Nova',
      totalChunks: chunks[0].count,
    });
  });

  it('defaults to Geral when no categories are given', async () => {
    const { deps, created } = makeDeps();
    await uploadAndIngest(file, { ...meta, categories: [] }, deps);
    expect(created[0]).toMatchObject({ subject: 'Geral' });
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
