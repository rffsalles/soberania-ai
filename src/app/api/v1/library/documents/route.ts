import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAllCorpusChunks, documentIngestionService } from '@/domains/rag';
import type { RawDocumentPage } from '@/domains/rag';

const rawPageSchema = z.object({
  pageNumber: z.number(),
  chapter: z.string().optional(),
  section: z.string().optional(),
  text: z.string(),
});

const ingestDocumentSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  author: z.string().min(1, 'Autor é obrigatório'),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  text: z.string().optional(),
  edition: z.string().optional(),
  materialType: z.enum(['BOOK', 'SCIENTIFIC_PAPER', 'INSTITUTIONAL_GUIDE']).optional(),
  pages: z.array(rawPageSchema).optional(),
});

export interface LibraryDocumentSummary {
  id: string;
  title: string;
  author: string;
  category: string;
  totalChunks: number;
  sampleExcerpt: string;
}

export interface LibraryCategorySummary {
  name: string;
  documentCount: number;
  chunkCount: number;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryFilter = searchParams.get('category');
    const searchQuery = searchParams.get('search')?.toLowerCase();

    const allChunks = getAllCorpusChunks();

    // Map unique documents by materialId
    const docMap = new Map<string, LibraryDocumentSummary>();
    const categoryStats = new Map<string, { chunks: number; docIds: Set<string> }>();

    for (const chunk of allChunks) {
      const category = chunk.category || 'Geral';

      if (!categoryStats.has(category)) {
        categoryStats.set(category, { chunks: 0, docIds: new Set<string>() });
      }
      const catStat = categoryStats.get(category)!;
      catStat.chunks += 1;
      catStat.docIds.add(chunk.materialId);

      if (!docMap.has(chunk.materialId)) {
        docMap.set(chunk.materialId, {
          id: chunk.materialId,
          title: chunk.bookTitle,
          author: chunk.author,
          category,
          totalChunks: 1,
          sampleExcerpt: chunk.content.slice(0, 160) + '...',
        });
      } else {
        const existing = docMap.get(chunk.materialId)!;
        existing.totalChunks += 1;
      }
    }

    // Also query database materials to include uploaded files
    const dbMaterials = await db.didacticMaterial.findMany({
      include: {
        _count: { select: { chunks: true } },
        chunks: { take: 1, select: { content: true } },
      },
    });

    for (const mat of dbMaterials) {
      const category = mat.subject || 'Geral';
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { chunks: 0, docIds: new Set<string>() });
      }
      const catStat = categoryStats.get(category)!;
      catStat.docIds.add(mat.id);
      if (!docMap.has(mat.id)) {
        catStat.chunks += mat._count.chunks;
        docMap.set(mat.id, {
          id: mat.id,
          title: mat.title,
          author: mat.author,
          category,
          totalChunks: mat._count.chunks || 1,
          sampleExcerpt: mat.chunks[0]?.content.slice(0, 160) || `${mat.title} (${mat.totalPages} páginas)...`,
        });
      }
    }

    // Also query registered database categories
    const dbCategories = await db.documentCategory.findMany({
      orderBy: { name: 'asc' },
    });

    for (const dbCat of dbCategories) {
      if (!categoryStats.has(dbCat.name)) {
        categoryStats.set(dbCat.name, { chunks: 0, docIds: new Set<string>() });
      }
    }

    const categories: LibraryCategorySummary[] = Array.from(categoryStats.entries()).map(
      ([name, stat]) => ({
        name,
        documentCount: stat.docIds.size,
        chunkCount: stat.chunks,
      })
    );

    let documents = Array.from(docMap.values());

    if (categoryFilter && categoryFilter !== 'ALL') {
      documents = documents.filter(
        (doc) => doc.category.toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    if (searchQuery) {
      documents = documents.filter(
        (doc) =>
          doc.title.toLowerCase().includes(searchQuery) ||
          doc.author.toLowerCase().includes(searchQuery) ||
          doc.category.toLowerCase().includes(searchQuery)
      );
    }

    return NextResponse.json({
      success: true,
      categories,
      documents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar acervo bibliográfico';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = ingestDocumentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: 400 }
      );
    }

    const { title, author, category, categories, text, edition, materialType, pages: rawPages } = parsed.data;

    const categoriesList: string[] = Array.isArray(categories) && categories.length > 0
      ? categories.map((c) => c.trim()).filter(Boolean)
      : (category && category.trim().length > 0 ? [category.trim()] : ['Geral']);

    const resolvedCategory = categoriesList.join(', ') || 'Geral';

    // Register categories in database if not present
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

    let pages: RawDocumentPage[] = [];

    if (Array.isArray(rawPages) && rawPages.length > 0) {
      pages = rawPages;
    } else if (typeof text === 'string' && text.trim().length > 0) {
      // Split text into pages of ~1000 characters
      const pageSize = 1000;
      const totalLen = text.length;
      let pageNum = 1;
      for (let i = 0; i < totalLen; i += pageSize) {
        pages.push({
          pageNumber: pageNum++,
          chapter: resolvedCategory,
          section: `Página ${pageNum - 1}`,
          text: text.slice(i, i + pageSize),
        });
      }
    } else {
      // Default page if no text was provided
      pages.push({
        pageNumber: 1,
        chapter: resolvedCategory,
        section: 'Documento Completo',
        text: `Documento de referência: ${title}, por ${author}. Categoria(s): ${resolvedCategory}.`,
      });
    }

    const result = documentIngestionService.ingestMaterial({
      title,
      author,
      edition,
      subject: resolvedCategory,
      materialType: materialType || 'BOOK',
      pages,
    });

    return NextResponse.json({
      success: true,
      material: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao ingerir documento no acervo';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
