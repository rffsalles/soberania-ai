import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { materialChaptersSchema } from '@/lib/validators/material-chapters.validator';
import { listMaterialChapters, replaceManualChapters } from '@/domains/rag/services/chapter-extraction-service';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;
    const chapters = await listMaterialChapters(id);
    return NextResponse.json({ success: true, chapters });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;
    const body = await req.json().catch(() => null);
    const parsed = materialChaptersSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Capítulos inválidos: informe título e página inicial de cada capítulo.' },
        { status: 400 },
      );
    }
    const result = await replaceManualChapters(id, parsed.data.chapters);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
