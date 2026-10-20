import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createCategoryIfMissing, listCategoriesWithStats } from '@/domains/rag/services/library-service';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants/library';
import { Role } from '@prisma/client';

const createCategorySchema = z.object({
  name: z.string().min(2, 'Nome da categoria deve ter pelo menos 2 caracteres'),
  description: z.string().optional(),
  color: z.string().optional().default(DEFAULT_CATEGORY_COLOR),
});

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const categories = await listCategoriesWithStats();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const json = await req.json();
    const parsed = createCategorySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Dados inválidos para categoria',
        },
        { status: 400 }
      );
    }

    const { category, created } = await createCategoryIfMissing(parsed.data);

    if (!created) {
      return NextResponse.json(
        {
          success: true,
          category,
          message: 'Categoria já existente recuperada com sucesso.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
