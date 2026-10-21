import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createLesson, listLessons } from '@/domains/teaching/services/teaching-content-service';
import { syncAgendaForLessonId } from '@/domains/teaching/services/lesson-service';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);

    const lessons = await listLessons(user, searchParams.get('scheduleId') || undefined);
    return NextResponse.json({ success: true, lessons });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const lessonInput = await req.json();
    const lesson = (await createLesson(user, lessonInput)) as { id: string };
    await syncAgendaForLessonId(lesson.id);
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
