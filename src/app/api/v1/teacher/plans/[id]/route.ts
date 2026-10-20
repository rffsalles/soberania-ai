import { NextResponse } from 'next/server';
import { updateTeachingPlanSchema } from '@/lib/validators/teaching-plan.validator';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { getPlan, updatePlan } from '@/domains/teaching/services/teaching-plan-service';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID do plano não fornecido.' },
        { status: 400 }
      );
    }

    const plan = await getPlan(id, user);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const body = await req.json();

    const parsed = updateTeachingPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Payload de atualização inválido.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const plan = await updatePlan(id, user, parsed.data);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return apiError(error);
  }
}
