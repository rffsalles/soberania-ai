import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createSchedule, listSchedules } from '@/domains/teaching/services/teaching-content-service';

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
    const body = await req.json();

    const schedule = await createSchedule(user, body);
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    return apiError(error);
  }
}
