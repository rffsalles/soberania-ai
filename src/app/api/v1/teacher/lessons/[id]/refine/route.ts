import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { refineLessonSchema } from '@/lib/validators/lesson.validator';
import { refineLessonField } from '@/domains/teaching/services/lesson-generation-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const parsed = refineLessonSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError(400, 'Pedido de refino inválido.');
    const { text } = await refineLessonField(id, user, parsed.data);
    return NextResponse.json({ success: true, text });
  } catch (error) {
    return apiError(error);
  }
}
