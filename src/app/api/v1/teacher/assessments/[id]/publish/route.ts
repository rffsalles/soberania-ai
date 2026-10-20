import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { publishAssessmentSchema } from '@/lib/validators/assessment.validator';
import { publishAssessment } from '@/domains/assessments/services/assessment-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const parsed = publishAssessmentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Turma e horário de início são obrigatórios.', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const agenda = await publishAssessment(id, user, parsed.data);
    return NextResponse.json({ success: true, agenda });
  } catch (error) {
    return apiError(error);
  }
}
