import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { updateAssessmentSchema } from '@/lib/validators/assessment.validator';
import { updateAssessment } from '@/domains/assessments/services/assessment-service';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const parsed = updateAssessmentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Payload de atualização inválido.', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const assessment = await updateAssessment(id, user, parsed.data);
    return NextResponse.json({ success: true, assessment });
  } catch (error) {
    return apiError(error);
  }
}
