import { NextRequest, NextResponse } from 'next/server';
import { generateClassMinute, getMockMinutesFeed } from '@/domains/pedagogy/minutes-generator';

export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
  try {
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
    console.error('Erro na emissão da ata:', error);
    return NextResponse.json(
      { error: 'Erro ao emitir ata pedagógica.' },
      { status: 500 }
    );
  }
}
