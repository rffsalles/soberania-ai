import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getAgendaLesson } from '@/domains/teaching/services/agenda-lesson-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const lesson = await getAgendaLesson(user, id);
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
