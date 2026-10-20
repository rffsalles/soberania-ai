import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { listMaterialsWithStats } from '@/domains/rag/services/library-service';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const result = await listMaterialsWithStats({
      category: searchParams.get('category'),
      search: searchParams.get('search')?.toLowerCase().trim(),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
