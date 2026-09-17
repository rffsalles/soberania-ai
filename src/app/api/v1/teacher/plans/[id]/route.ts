import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { updateTeachingPlanSchema } from '@/lib/validators/teaching-plan.validator';



export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID do plano não fornecido.' },
        { status: 400 }
      );
    }

    const plan = await db.teachingPlan.findUnique({
      where: { id },
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
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Plano de ensino não encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao buscar plano de ensino.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const parsed = updateTeachingPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Payload de atualização inválido.', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const existingPlan = await db.teachingPlan.findUnique({ where: { id } });
    if (!existingPlan) {
      return NextResponse.json(
        { success: false, error: 'Plano de ensino não encontrado para atualização.' },
        { status: 404 }
      );
    }

    const dataToUpdate = parsed.data;

    const updatedPlan = await db.teachingPlan.update({
      where: { id },
      data: {
        subjectId: dataToUpdate.subjectId ?? existingPlan.subjectId,
        academicPeriodId: dataToUpdate.academicPeriodId !== undefined ? dataToUpdate.academicPeriodId : existingPlan.academicPeriodId,
        syllabus: dataToUpdate.syllabus !== undefined ? dataToUpdate.syllabus : existingPlan.syllabus,
        generalObjectives: dataToUpdate.generalObjectives !== undefined ? dataToUpdate.generalObjectives : existingPlan.generalObjectives,
        specificObjectives: dataToUpdate.specificObjectives !== undefined ? dataToUpdate.specificObjectives : existingPlan.specificObjectives,
        unitsContent: dataToUpdate.unitsContent !== undefined ? (dataToUpdate.unitsContent as unknown as Prisma.InputJsonValue) : (existingPlan.unitsContent as unknown as Prisma.InputJsonValue),
        methodology: dataToUpdate.methodology !== undefined ? dataToUpdate.methodology : existingPlan.methodology,
        assessmentCriteria: dataToUpdate.assessmentCriteria !== undefined ? dataToUpdate.assessmentCriteria : existingPlan.assessmentCriteria,
        basicBibliography: dataToUpdate.basicBibliography !== undefined ? dataToUpdate.basicBibliography : existingPlan.basicBibliography,
        complementaryBiblio: dataToUpdate.complementaryBiblio !== undefined ? dataToUpdate.complementaryBiblio : existingPlan.complementaryBiblio,
        status: dataToUpdate.status ?? existingPlan.status,
        totalHours: dataToUpdate.totalHours !== undefined ? dataToUpdate.totalHours : existingPlan.totalHours,
        theoryHours: dataToUpdate.theoryHours !== undefined ? dataToUpdate.theoryHours : existingPlan.theoryHours,
        practiceHours: dataToUpdate.practiceHours !== undefined ? dataToUpdate.practiceHours : existingPlan.practiceHours,
        ndeComplianceStatus: dataToUpdate.ndeComplianceStatus ?? existingPlan.ndeComplianceStatus,
      },
      include: {
        subject: true,
        academicPeriod: true,
      },
    });

    return NextResponse.json({ success: true, plan: updatedPlan });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar plano de ensino.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

