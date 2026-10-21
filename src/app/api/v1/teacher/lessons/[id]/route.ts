import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { updateLesson } from '@/domains/teaching/services/lesson-service';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const lesson = await updateLesson(id, user, await req.json());
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
