import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createPlan, listPlansForTeacher } from '@/domains/teaching/services/teaching-plan-service';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId') || undefined;

    const plans = await listPlansForTeacher(user, { subjectId });
    return NextResponse.json({ success: true, plans });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();

    const plan = await createPlan(user, body);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return apiError(error);
  }
}
