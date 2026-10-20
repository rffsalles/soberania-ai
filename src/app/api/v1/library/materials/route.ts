import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase().trim();

    const whereClause: {
      subject?: { contains: string; mode: 'insensitive' };
      OR?: Array<{
        title?: { contains: string; mode: 'insensitive' };
        author?: { contains: string; mode: 'insensitive' };
        originalFilename?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};

    if (category && category !== 'ALL') {
      whereClause.subject = { contains: category, mode: 'insensitive' };
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
        { originalFilename: { contains: search, mode: 'insensitive' } },
      ];
    }

    const materials = await db.didacticMaterial.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcula estatísticas gerais de acervo
    const allMaterials = await db.didacticMaterial.findMany({
      select: {
        id: true,
        fileSize: true,
        isOcrApplied: true,
        _count: { select: { chunks: true } },
      },
    });

    const totalMaterials = allMaterials.length;
    const totalChunks = allMaterials.reduce((acc, m) => acc + m._count.chunks, 0);
    const totalBytes = allMaterials.reduce((acc, m) => acc + (m.fileSize || 0), 0);
    const totalSizeMb = (totalBytes / (1024 * 1024)).toFixed(1);
    const ocrCount = allMaterials.filter((m) => m.isOcrApplied).length;

    // Categorias cadastradas
    const categories = await db.documentCategory.findMany({
      orderBy: { name: 'asc' },
    });

    const formattedMaterials = materials.map((m) => ({
      id: m.id,
      title: m.title,
      author: m.author,
      edition: m.edition,
      category: m.subject,
      totalPages: m.totalPages,
      totalChunks: m._count.chunks,
      filePath: m.filePath,
      originalFilename: m.originalFilename || `${m.title}.pdf`,
      fileSize: m.fileSize || 0,
      mimeType: m.mimeType || 'application/pdf',
      isOcrApplied: m.isOcrApplied,
      status: m.status,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({
      success: true,
      materials: formattedMaterials,
      stats: {
        totalMaterials,
        totalChunks,
        totalSizeMb,
        ocrCount,
      },
      categories,
    });
  } catch (error) {
    return apiError(error);
  }
}
