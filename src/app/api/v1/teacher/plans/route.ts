import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createTeachingPlanSchema } from '@/lib/validators/teaching-plan.validator';
import { createPlan, listPlansForTeacher, type CreatePlanInput } from '@/domains/teaching/services/teaching-plan-service';

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

    const parsed = createTeachingPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const plan = await createPlan(user, parsed.data as CreatePlanInput);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return apiError(error);
  }
}
