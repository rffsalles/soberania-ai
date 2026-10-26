import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { reextractMaterialChapters } from '@/domains/rag/services/chapter-extraction-service';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;
    const result = await reextractMaterialChapters(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
