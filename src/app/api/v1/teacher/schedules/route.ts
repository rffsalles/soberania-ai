import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { listSchedules } from '@/domains/teaching/services/teaching-content-service';
import { createSchedule } from '@/domains/teaching/services/schedule-service';
import { createScheduleSchema } from '@/lib/validators/schedule.validator';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);

    const schedules = await listSchedules(user, searchParams.get('planId') || undefined);
    return NextResponse.json({ success: true, schedules });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const parsed = createScheduleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dados do cronograma inválidos.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const schedule = await createSchedule(user, parsed.data);
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    return apiError(error);
  }
}
