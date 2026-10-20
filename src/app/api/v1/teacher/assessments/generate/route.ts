import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { generateAssessmentSchema } from '@/lib/validators/assessment.validator';
import { generateQuestions } from '@/domains/assessments/services/assessment-service';

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const parsed = generateAssessmentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Parâmetros de geração inválidos.', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const data = await generateQuestions(user, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
