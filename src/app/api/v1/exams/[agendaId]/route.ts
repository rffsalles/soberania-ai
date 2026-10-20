import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getExamForStudent } from '@/domains/assessments/services/exam-service';

export async function GET(req: Request, { params }: { params: Promise<{ agendaId: string }> }) {
  try {
    const user = await requireUser(req);
    const { agendaId } = await params;
    const exam = await getExamForStudent(user, agendaId);
    return NextResponse.json({ success: true, ...exam });
  } catch (error) {
    return apiError(error);
  }
}
