import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { generateLessonContent } from '@/domains/teaching/services/lesson-generation-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const data = await generateLessonContent(id, user);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
