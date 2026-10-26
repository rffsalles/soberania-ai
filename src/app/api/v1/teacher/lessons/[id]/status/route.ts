import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { lessonStatusSchema } from '@/lib/validators/lesson.validator';
import { setLessonStatus } from '@/domains/teaching/services/lesson-service';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const parsed = lessonStatusSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError(400, 'Status inválido.');
    const lesson = await setLessonStatus(id, user, parsed.data.status);
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
