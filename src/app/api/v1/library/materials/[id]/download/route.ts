import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storageService } from '@/domains/storage';

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
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
    console.error('[DownloadRoute] Erro ao baixar arquivo:', error);
    const message = error instanceof Error ? error.message : 'Erro ao processar download';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
