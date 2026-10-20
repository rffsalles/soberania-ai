import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storageService } from '@/domains/storage';
import {
  validateFileSafety,
  parseDocumentFile,
  documentIngestionService,
} from '@/domains/rag';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string | null) || '';
    const author = (formData.get('author') as string | null) || '';
    const edition = (formData.get('edition') as string | null) || '';
    const rawCategories = formData.get('categories');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Nenhum arquivo enviado.' },
        { status: 400 }
      );
    }

    if (!title.trim() || !author.trim()) {
      return NextResponse.json(
        { success: false, error: 'Título e Autor são obrigatórios.' },
        { status: 400 }
      );
    }

    // Processa o buffer do arquivo enviado
    const fileBytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileBytes);

    // Validação de segurança, limites de tamanho e Magic Bytes
    const validation = validateFileSafety(fileBuffer, file.name);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Tratamento de categorias
    let categoriesList: string[] = [];
    if (typeof rawCategories === 'string') {
      try {
        const parsed = JSON.parse(rawCategories);
        if (Array.isArray(parsed)) {
          categoriesList = parsed.map((c) => String(c).trim()).filter(Boolean);
        } else {
          categoriesList = rawCategories.split(',').map((c) => c.trim()).filter(Boolean);
        }
      } catch {
        categoriesList = rawCategories.split(',').map((c) => c.trim()).filter(Boolean);
      }
    }

    if (categoriesList.length === 0) {
      categoriesList = ['Geral'];
    }

    const resolvedCategory = categoriesList.join(', ');

    // Persiste novas categorias na tabela base se não existirem
    for (const catName of categoriesList) {
      if (catName && catName !== 'Geral') {
        const exists = await db.documentCategory.findFirst({
          where: { name: { equals: catName, mode: 'insensitive' } },
        });
        if (!exists) {
          await db.documentCategory.create({
            data: { name: catName, color: 'teal' },
          }).catch(() => {});
        }
      }
    }

    // Armazenamento do binário original via StorageService (Cloudflare R2 ou Local)
    const storageResult = await storageService.uploadFile(
      fileBuffer,
      validation.sanitizedFilename,
      validation.mimeType
    );

    // Extração estruturada de conteúdo (com fallback de OCR se aplicável)
    const parseResult = await parseDocumentFile(fileBuffer, file.name);

    // Registro na tabela de materiais didáticos (Prisma)
    const createdMaterial = await db.didacticMaterial.create({
      data: {
        title: title.trim(),
        author: author.trim(),
        edition: edition.trim() || null,
        subject: resolvedCategory,
        totalPages: parseResult.totalPages,
        filePath: storageResult.filePath,
        originalFilename: file.name,
        fileSize: fileBuffer.length,
        mimeType: validation.mimeType,
        isOcrApplied: parseResult.isOcrApplied,
        status: 'INDEXED',
      },
    });

    // Ingestão e chunking semântico no RAG Híbrido
    const ingestResult = documentIngestionService.ingestMaterial({
      id: createdMaterial.id,
      title: createdMaterial.title,
      author: createdMaterial.author,
      edition: createdMaterial.edition || undefined,
      subject: resolvedCategory,
      materialType: 'BOOK',
      filePath: createdMaterial.filePath,
      originalFilename: createdMaterial.originalFilename || undefined,
      fileSize: createdMaterial.fileSize || undefined,
      mimeType: createdMaterial.mimeType || undefined,
      isOcrApplied: parseResult.isOcrApplied,
      pages: parseResult.pages,
    });

    // Persistência física dos chunks no banco de dados
    if (ingestResult.createdChunks && ingestResult.createdChunks.length > 0) {
      await db.materialChunk.createMany({
        data: ingestResult.createdChunks.map((chunk) => ({
          materialId: createdMaterial.id,
          chapter: chunk.chapter,
          section: chunk.section || null,
          pageNumber: chunk.pageNumber,
          content: chunk.content,
        })),
      }).catch((dbErr) => {
        console.warn('[UploadRoute] Advertência ao salvar chunks no banco:', dbErr);
      });
    }

    return NextResponse.json({
      success: true,
      material: {
        id: createdMaterial.id,
        title: createdMaterial.title,
        author: createdMaterial.author,
        category: createdMaterial.subject,
        totalPages: createdMaterial.totalPages,
        totalChunks: ingestResult.totalChunks,
        fileSize: createdMaterial.fileSize,
        originalFilename: createdMaterial.originalFilename,
        isOcrApplied: createdMaterial.isOcrApplied,
        sampleExcerpt: parseResult.pages[0]?.text.slice(0, 160) + '...',
        createdAt: createdMaterial.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
