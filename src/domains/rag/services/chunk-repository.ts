import { db } from '@/lib/db';

export interface NewChunk {
  chapter: string;
  section?: string | null;
  pageNumber: number;
  content: string;
}

export function createChunks(materialId: string, chunks: NewChunk[]) {
  return db.materialChunk.createMany({
    data: chunks.map((c) => ({
      materialId,
      chapter: c.chapter,
      section: c.section || null,
      pageNumber: c.pageNumber,
      content: c.content,
    })),
  });
}

export function listChunksByMaterial(materialId: string) {
  return db.materialChunk.findMany({ where: { materialId } });
}
