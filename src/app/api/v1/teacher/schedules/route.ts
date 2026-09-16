import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('planId');

    const schedules = await db.courseSchedule.findMany({
      where: planId ? { teachingPlanId: planId } : undefined,
      include: {
        teachingPlan: {
          include: { subject: true },
        },
        lessonPlans: {
          orderBy: { classNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, schedules });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Falha ao buscar cronogramas.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { teachingPlanId, startDate, endDate, holidays, totalClasses } = body;

    if (!teachingPlanId || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Plano de Ensino e período de datas são obrigatórios.' },
        { status: 400 }
      );
    }

    const schedule = await db.courseSchedule.create({
      data: {
        teachingPlanId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        holidays: holidays || [],
        totalClasses: Number(totalClasses) || 40,
      },
      include: {
        teachingPlan: { include: { subject: true } },
      },
    });

    return NextResponse.json({ success: true, schedule });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar cronograma de aulas.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
