import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const FILE_PATH = `e2e://hybrid-search-${Date.now()}`;
const NORMAL_FORM_TEXT =
  'A terceira forma normal (3FN) exige que nenhum atributo não chave dependa transitivamente da chave primária.';
const UNRELATED_TEXT =
  'Algoritmos de ordenação como quicksort e mergesort possuem complexidade média n log n.';
const QUERY = 'terceira forma normal';

type ChunkRepo = typeof import('@/domains/rag/services/chunk-repository');
type MaterialRepo = typeof import('@/domains/rag/services/material-repository');
type CategoryRepo = typeof import('@/domains/rag/services/category-repository');
type Embeddings = typeof import('@/lib/embeddings');

describe.skipIf(!TEST_DB_URL)('hybrid search over Postgres (pgvector + tsvector)', () => {
  let chunkRepo: ChunkRepo;
  let materialRepo: MaterialRepo;
  let categoryRepo: CategoryRepo;
  let embeddings: Embeddings;
  let materialId = '';
  let categoryId = '';
  const categoryName = `E2E Categoria ${Date.now()}`;
  let normalFormChunkId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    chunkRepo = await import('@/domains/rag/services/chunk-repository');
    materialRepo = await import('@/domains/rag/services/material-repository');
    categoryRepo = await import('@/domains/rag/services/category-repository');
    embeddings = await import('@/lib/embeddings');

    categoryId = (await categoryRepo.createCategory({ name: categoryName })).id;

    const material = await materialRepo.createMaterial({
      title: 'Livro E2E de Banco de Dados',
      author: 'Autor E2E',
      subject: 'Banco de Dados',
      totalPages: 2,
      filePath: FILE_PATH,
      categories: { connect: [{ id: categoryId }] },
    });
    materialId = material.id;

    const created = await chunkRepo.createChunks(materialId, [
      { chapter: 'Capítulo 1: Normalização', pageNumber: 1, content: NORMAL_FORM_TEXT },
      { chapter: 'Capítulo 2: Ordenação', pageNumber: 2, content: UNRELATED_TEXT },
    ]);
    normalFormChunkId = created.find((c) => c.content === NORMAL_FORM_TEXT)!.id;
    await chunkRepo.setEmbeddings(
      created.map((c) => ({ id: c.id, embedding: embeddings.hashEmbedding(c.content) }))
    );
  });

  afterAll(async () => {
    if (materialId) await materialRepo.deleteMaterial(materialId);
    if (categoryId) await categoryRepo.deleteCategory(categoryId);
  });

  it('ranks the 3FN chunk first with the query embedding', async () => {
    const results = await chunkRepo.searchHybrid({
      query: QUERY,
      embedding: embeddings.hashEmbedding(QUERY),
      topK: 2,
      materialIds: [materialId],
    });

    expect(results[0].id).toBe(normalFormChunkId);
    expect(results[0]).toMatchObject({
      materialId,
      bookTitle: 'Livro E2E de Banco de Dados',
      author: 'Autor E2E',
      chapter: 'Capítulo 1: Normalização',
      pageNumber: 1,
      category: categoryName,
    });
    expect(results[0].rrfScore).toBeGreaterThan(0);
  });

  it('finds the 3FN chunk lexically when no embedding is available', async () => {
    const results = await chunkRepo.searchHybrid({
      query: QUERY,
      embedding: null,
      topK: 5,
      materialIds: [materialId],
    });

    expect(results.map((r) => r.id)).toEqual([normalFormChunkId]);
  });

  it('applies the material filter', async () => {
    const results = await chunkRepo.searchHybrid({
      query: QUERY,
      embedding: null,
      topK: 5,
      materialIds: ['does-not-exist'],
    });
    expect(results).toEqual([]);
  });

  it('applies the category filter', async () => {
    const inCategory = await chunkRepo.searchHybrid({
      query: QUERY,
      embedding: embeddings.hashEmbedding(QUERY),
      topK: 5,
      categoryIds: [categoryId],
    });
    expect(inCategory.map((r) => r.materialId)).toContain(materialId);
    expect(inCategory.every((r) => r.materialId === materialId)).toBe(true);

    const otherCategory = await chunkRepo.searchHybrid({
      query: QUERY,
      embedding: embeddings.hashEmbedding(QUERY),
      topK: 5,
      categoryIds: ['does-not-exist'],
    });
    expect(otherCategory).toEqual([]);
  });
});
