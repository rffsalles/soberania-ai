import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId');

    const assessments = await db.assessment.findMany({
      where: planId ? { teachingPlanId: planId } : undefined,
      include: {
        teachingPlan: {
          include: { subject: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, assessments });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const { teachingPlanId, title, type, questions, rubrics, maxScore } = body;

    if (!teachingPlanId || !title) {
      return NextResponse.json(
        { success: false, error: 'Plano de ensino e título da avaliação são obrigatórios.' },
        { status: 400 }
      );
    }

    const assessment = await db.assessment.create({
      data: {
        teachingPlanId,
        title,
        type: type || 'EXAM',
        questions: questions || [],
        rubrics: rubrics || {},
        maxScore: Number(maxScore) || 10.0,
      },
    });

    return NextResponse.json({ success: true, assessment });
  } catch (error) {
    return apiError(error);
  }
}
