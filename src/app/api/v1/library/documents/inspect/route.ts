import { NextResponse } from 'next/server';
import { validateFileSafety, documentInspectorService } from '@/domains/rag';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
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
    return apiError(error);
  }
}
