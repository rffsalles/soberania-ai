import { NextRequest, NextResponse } from 'next/server';
import { generateClassMinute } from '@/domains/pedagogy/minutes-generator';
import { getMockMinutesFeed } from '@/lib/mocks-pending';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const { searchParams } = new URL(req.url);
    const agendaId = searchParams.get('agendaId');

    if (agendaId) {
      const minute = generateClassMinute({
        agendaId,
        sessionTitle: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
        studentId: 'student-lucas',
        studentName: 'Lucas Ferreira',
      });
      return NextResponse.json({ success: true, minute });
    }

    const feed = getMockMinutesFeed();
    return NextResponse.json({ success: true, feed });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const body = await req.json();
    const { agendaId, sessionTitle, studentId, studentName, questionsCount, challengesCount } = body;

    const minute = generateClassMinute({
      agendaId: agendaId || 'session-live-01',
      sessionTitle: sessionTitle || 'Sessão de Aprendizagem Interativa',
      studentId: studentId || 'student-lucas',
      studentName: studentName || 'Lucas Ferreira',
      questionsCount,
      challengesCount,
    });

    return NextResponse.json({ success: true, minute });
  } catch (error) {
    return apiError(error);
  }
}
