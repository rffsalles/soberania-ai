import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');

    const plans = await db.teachingPlan.findMany({
      where: subjectId ? { subjectId } : undefined,
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
    return NextResponse.json(
      { success: false, error: 'Falha ao buscar planos de ensino.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      subjectId,
      teacherId,
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
        teacherId: teacherId || 'PROF001',
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao gerar plano de ensino.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
