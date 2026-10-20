import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storageService } from '@/domains/storage';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(_req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;

    const material = await db.didacticMaterial.findUnique({
      where: { id },
    });

    if (!material) {
      return NextResponse.json(
        { success: false, error: 'Material didático não encontrado.' },
        { status: 404 }
      );
    }

    let fileResult;
    try {
      fileResult = await storageService.getFileBuffer(material.filePath);
    } catch (err) {
      console.warn('[DownloadRoute] Erro ao buscar arquivo no storage:', err);
      return NextResponse.json(
        { success: false, error: 'Arquivo do material não encontrado no repositório de armazenamento.' },
        { status: 404 }
      );
    }

    const downloadFilename = material.originalFilename || `${material.title}.pdf`;
    const sanitizedFilename = downloadFilename.replace(/"/g, '');
    const contentType = material.mimeType || fileResult.contentType || 'application/octet-stream';

    return new Response(new Uint8Array(fileResult.buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileResult.buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
