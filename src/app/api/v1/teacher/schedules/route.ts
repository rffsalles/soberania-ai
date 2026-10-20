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
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
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
  } catch (error) {
    return apiError(error);
  }
}
