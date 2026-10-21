import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { syncLessons } from '@/domains/teaching/services/schedule-service';
import { syncAgendasForSchedule } from '@/domains/teaching/services/lesson-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const result = await syncLessons(id, user);
    await syncAgendasForSchedule(id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return apiError(error);
  }
}
