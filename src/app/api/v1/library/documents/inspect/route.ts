import { NextResponse } from 'next/server';
import { validateFileSafety, documentInspectorService } from '@/domains/rag';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Nenhum arquivo fornecido para inspeção.' },
        { status: 400 }
      );
    }

    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    // Valida extensões permitidas, tamanho máximo e magic bytes de segurança
    const validation = validateFileSafety(fileBuffer, file.name);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Inspeciona as primeiras 4 páginas via IA / Heurística
    const metadata = await documentInspectorService.inspectDocumentHeader(
      fileBuffer,
      file.name
    );

    return NextResponse.json({
      success: true,
      metadata: {
        title: metadata.title,
        author: metadata.author,
        categories: metadata.categories,
        confidence: metadata.confidence,
        summary: metadata.summary,
        originalFilename: file.name,
        fileSize: fileBuffer.length,
      },
    });
  } catch (error) {
    console.error('[DocumentInspectRoute] Erro na inspeção de documento:', error);
    const message = error instanceof Error ? error.message : 'Erro ao inspecionar documento';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
