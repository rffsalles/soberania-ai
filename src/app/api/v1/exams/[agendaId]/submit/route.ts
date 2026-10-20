import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { submitExamSchema } from '@/lib/validators/exam.validator';
import { submitExam } from '@/domains/assessments/services/exam-service';

export async function POST(req: Request, { params }: { params: Promise<{ agendaId: string }> }) {
  try {
    const user = await requireUser(req);
    const { agendaId } = await params;
    const input = submitExamSchema.parse(await req.json());
    const result = await submitExam(user, agendaId, input);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
