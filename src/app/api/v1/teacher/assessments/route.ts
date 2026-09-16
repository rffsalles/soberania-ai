import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
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
    return NextResponse.json(
      { success: false, error: 'Falha ao buscar instrumentos de avaliação.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar avaliação.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
