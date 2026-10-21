import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export function createMaterial(data: Prisma.DidacticMaterialUncheckedCreateInput) {
  return db.didacticMaterial.create({ data });
}

export async function updateMaterialStatus(id: string, status: string): Promise<void> {
  await db.didacticMaterial.update({ where: { id }, data: { status } });
}

export function findMaterial(id: string) {
  return db.didacticMaterial.findUnique({ where: { id } });
}

export function deleteMaterial(id: string) {
  return db.didacticMaterial.delete({ where: { id } });
}

export function listMaterials(filter: { category?: string | null; search?: string | null } = {}) {
  const where: Prisma.DidacticMaterialWhereInput = {};
  if (filter.category && filter.category !== 'ALL') {
    where.subject = { contains: filter.category, mode: 'insensitive' };
  }
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { author: { contains: filter.search, mode: 'insensitive' } },
      { originalFilename: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  return db.didacticMaterial.findMany({
    where,
    include: { _count: { select: { chunks: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** All materials with chunk counts, linked categories and one sample chunk (library view). */
export function listMaterialsWithSample() {
  return db.didacticMaterial.findMany({
    include: {
      _count: { select: { chunks: true } },
      categories: { select: { name: true }, orderBy: { name: 'asc' } },
      chunks: {
        take: 1,
        select: { content: true },
        orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function materialStats() {
  const all = await db.didacticMaterial.findMany({
    select: {
      id: true,
      fileSize: true,
      isOcrApplied: true,
      _count: { select: { chunks: true } },
    },
  });
  const totalBytes = all.reduce((acc, m) => acc + (m.fileSize || 0), 0);
  return {
    totalMaterials: all.length,
    totalChunks: all.reduce((acc, m) => acc + m._count.chunks, 0),
    totalSizeMb: (totalBytes / (1024 * 1024)).toFixed(1),
    ocrCount: all.filter((m) => m.isOcrApplied).length,
  };
}
