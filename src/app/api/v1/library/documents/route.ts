import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLibraryOverview, ingestTextDocument } from '@/domains/rag/services/library-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

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

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const overview = await getLibraryOverview({
      category: searchParams.get('category'),
      search: searchParams.get('search')?.toLowerCase(),
    });

    return NextResponse.json({ success: true, ...overview });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const parsed = ingestDocumentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: 400 }
      );
    }

    const { title, author, category, categories, text, edition, pages: rawPages } = parsed.data;

    const categoriesList: string[] =
      Array.isArray(categories) && categories.length > 0
        ? categories.map((c) => c.trim()).filter(Boolean)
        : category && category.trim().length > 0
          ? [category.trim()]
          : [];

    const result = await ingestTextDocument({
      title,
      author,
      edition,
      categories: categoriesList,
      text,
      pages: rawPages,
    });

    return NextResponse.json({
      success: true,
      material: result.material,
    });
  } catch (error) {
    return apiError(error);
  }
}
