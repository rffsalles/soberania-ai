import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');

    const plans = await db.teachingPlan.findMany({
      where: {
        ...(subjectId ? { subjectId } : {}),
        ...(user.role === Role.TEACHER ? { teacherId: user.id } : {}),
      },
      include: {
        subject: true,
        academicPeriod: true,
        schedules: {
          include: {
            lessonPlans: true,
          },
        },
        assessments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, plans });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const {
      subjectId,
      academicPeriodId,
      syllabus,
      generalObjectives,
      specificObjectives,
      unitsContent,
      methodology,
      assessmentCriteria,
      basicBibliography,
      complementaryBiblio,
      status,
      totalHours,
      theoryHours,
      practiceHours,
      ndeComplianceStatus,
    } = body;

    if (!subjectId || !syllabus) {
      return NextResponse.json(
        { success: false, error: 'Disciplina e ementa são obrigatórias.' },
        { status: 400 }
      );
    }

    const plan = await db.teachingPlan.create({
      data: {
        subjectId,
        teacherId: user.id,
        academicPeriodId: academicPeriodId || null,
        syllabus,
        generalObjectives: generalObjectives || '',
        specificObjectives: specificObjectives || '',
        unitsContent: unitsContent || [],
        methodology: methodology || '',
        assessmentCriteria: assessmentCriteria || '',
        basicBibliography: basicBibliography || [],
        complementaryBiblio: complementaryBiblio || [],
        status: status || 'DRAFT',
        totalHours: totalHours ? Number(totalHours) : 80,
        theoryHours: theoryHours ? Number(theoryHours) : 60,
        practiceHours: practiceHours ? Number(practiceHours) : 20,
        ndeComplianceStatus: ndeComplianceStatus || '100% OK - Alinhado DCNs',
      },
      include: {
        subject: true,
        academicPeriod: true,
      },
    });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return apiError(error);
  }
}
