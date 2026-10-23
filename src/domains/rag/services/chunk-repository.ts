import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { toVectorLiteral } from '@/lib/embeddings';
import { FULL_TEXT_LANGUAGE, HYBRID_CANDIDATE_LIMIT, RRF_K } from '../constants';
import type { DidacticChunk } from '../types';

export interface NewChunk {
  chapter: string;
  section?: string | null;
  pageNumber: number;
  content: string;
}

export interface StoredChunk {
  id: string;
  content: string;
}

export interface ChunkEmbedding {
  id: string;
  embedding: number[];
}

export interface HybridSearchParams {
  query: string;
  embedding: number[] | null;
  topK: number;
  categoryIds?: string[];
  materialIds?: string[];
  /** Kept for compatibility: materials are not linked to subjects in the schema yet, so it is ignored. */
  subjectId?: string;
}

const SET_EMBEDDINGS_BATCH_SIZE = 100;

export function createChunks(materialId: string, chunks: NewChunk[]): Promise<StoredChunk[]> {
  return db.materialChunk.createManyAndReturn({
    data: chunks.map((c) => ({
      materialId,
      chapter: c.chapter,
      section: c.section || null,
      pageNumber: c.pageNumber,
      content: c.content,
    })),
    select: { id: true, content: true },
  });
}

export function listChunksByMaterial(materialId: string): Promise<StoredChunk[]> {
  return db.materialChunk.findMany({
    where: { materialId },
    select: { id: true, content: true },
    orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Primeiros `limit` trechos do material na ordem das páginas, no formato de busca (DidacticChunk). */
export async function sampleChunksByMaterial(materialId: string, limit: number): Promise<DidacticChunk[]> {
  const rows = await db.materialChunk.findMany({
    where: { materialId },
    orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    include: { material: { select: { title: true, author: true, subject: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    materialId: r.materialId,
    bookTitle: r.material.title,
    author: r.material.author,
    chapter: r.chapter,
    section: r.section ?? undefined,
    pageNumber: r.pageNumber,
    content: r.content,
    category: r.material.subject ?? undefined,
  }));
}

/** Stores embeddings in `material_chunks.embedding` (vector column, not mapped by Prisma). */
export async function setEmbeddings(rows: ChunkEmbedding[]): Promise<void> {
  for (let i = 0; i < rows.length; i += SET_EMBEDDINGS_BATCH_SIZE) {
    const values = rows
      .slice(i, i + SET_EMBEDDINGS_BATCH_SIZE)
      .map((r) => Prisma.sql`(${r.id}::text, ${toVectorLiteral(r.embedding)}::text)`);
    await db.$executeRaw`
      UPDATE material_chunks AS mc
      SET embedding = v.embedding::vector
      FROM (VALUES ${Prisma.join(values)}) AS v(id, embedding)
      WHERE mc.id = v.id`;
  }
}

interface HybridRow {
  id: string;
  materialId: string;
  bookTitle: string;
  author: string;
  chapter: string;
  section: string | null;
  pageNumber: number;
  content: string;
  category: string | null;
  rrfScore: number;
  similarityScore: number | null;
  bm25Score: number | null;
}

function chunkFilters(params: HybridSearchParams): Prisma.Sql {
  const filters: Prisma.Sql[] = [];
  if (params.materialIds && params.materialIds.length > 0) {
    filters.push(Prisma.sql`material_chunks."materialId" = ANY(${params.materialIds}::text[])`);
  }
  if (params.categoryIds && params.categoryIds.length > 0) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "_DidacticMaterialToDocumentCategory" j
      WHERE j."A" = material_chunks."materialId" AND j."B" = ANY(${params.categoryIds}::text[]))`);
  }
  return filters.length > 0 ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
}

/**
 * Hybrid retrieval in a single query: pgvector cosine KNN (HNSW) + Portuguese full-text
 * (`ts_rank_cd` over the GIN-indexed `content_tsv`), fused with Reciprocal Rank Fusion.
 * Without an embedding only the lexical branch contributes. All values are bound parameters.
 */
export async function searchHybrid(params: HybridSearchParams): Promise<DidacticChunk[]> {
  const filters = chunkFilters(params);
  const limit = HYBRID_CANDIDATE_LIMIT;

  const vec = params.embedding
    ? Prisma.sql`
      SELECT id, distance, ROW_NUMBER() OVER (ORDER BY distance) AS rnk FROM (
        SELECT id, embedding <=> ${toVectorLiteral(params.embedding)}::vector AS distance
        FROM material_chunks
        WHERE embedding IS NOT NULL ${filters}
        ORDER BY distance
        LIMIT ${limit}
      ) v`
    : Prisma.sql`SELECT NULL::text AS id, NULL::float8 AS distance, NULL::bigint AS rnk WHERE false`;

  const rows = await db.$queryRaw<HybridRow[]>`
    WITH vec AS (${vec}),
    lex AS (
      SELECT id, lex_score, ROW_NUMBER() OVER (ORDER BY lex_score DESC) AS rnk FROM (
        SELECT id, ts_rank_cd(content_tsv, q) AS lex_score
        FROM material_chunks, websearch_to_tsquery(${FULL_TEXT_LANGUAGE}::regconfig, ${params.query}) AS q
        WHERE content_tsv @@ q ${filters}
        ORDER BY lex_score DESC
        LIMIT ${limit}
      ) l
    ),
    fused AS (
      SELECT COALESCE(vec.id, lex.id) AS id,
             COALESCE(1.0 / (${RRF_K}::int + vec.rnk), 0) + COALESCE(1.0 / (${RRF_K}::int + lex.rnk), 0) AS rrf,
             vec.distance,
             lex.lex_score
      FROM vec FULL OUTER JOIN lex ON vec.id = lex.id
    )
    SELECT ch.id,
           ch."materialId",
           m.title AS "bookTitle",
           m.author,
           ch.chapter,
           ch.section,
           ch."pageNumber",
           ch.content,
           COALESCE((
             SELECT c.name FROM "_DidacticMaterialToDocumentCategory" j
             JOIN document_categories c ON c.id = j."B"
             WHERE j."A" = m.id
             ORDER BY c.name
             LIMIT 1
           ), m.subject) AS category,
           f.rrf::float8 AS "rrfScore",
           (1 - f.distance)::float8 AS "similarityScore",
           f.lex_score::float8 AS "bm25Score"
    FROM fused f
    JOIN material_chunks ch ON ch.id = f.id
    JOIN didactic_materials m ON m.id = ch."materialId"
    ORDER BY f.rrf DESC, ch.id
    LIMIT ${params.topK}`;

  return rows.map((r) => ({
    id: r.id,
    materialId: r.materialId,
    bookTitle: r.bookTitle,
    author: r.author,
    chapter: r.chapter,
    section: r.section ?? undefined,
    pageNumber: r.pageNumber,
    content: r.content,
    category: r.category ?? undefined,
    rrfScore: r.rrfScore,
    similarityScore: r.similarityScore ?? undefined,
    bm25Score: r.bm25Score ?? undefined,
  }));
}
