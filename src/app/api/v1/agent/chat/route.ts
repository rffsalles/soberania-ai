import { NextRequest, NextResponse } from 'next/server';
import { handleAgentOrchestration } from '@/domains/agents/agent-orchestrator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, agendaType, studentId, studentName, sessionId, videoTimestampSeconds } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Parâmetro message é obrigatório.' },
        { status: 400 }
      );
    }

    const orchestrationResult = await handleAgentOrchestration({
      message,
      agendaType: agendaType || 'CLASSROOM',
      studentId: studentId || 'student-lucas',
      studentName: studentName || 'Lucas Ferreira',
      sessionId: sessionId || 'session-live-01',
      videoTimestampSeconds,
    });

    return NextResponse.json({
      success: true,
      reply: orchestrationResult.reply,
      isSocraticChallenge: orchestrationResult.isSocraticChallenge,
      citations: orchestrationResult.citations,
      latencyMs: orchestrationResult.latencyMs,
      blockedByExamGuardrail: orchestrationResult.blockedByExamGuardrail,
    });
  } catch (error) {
    console.error('Erro no orchestrator do agente:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar diálogo do agente.' },
      { status: 500 }
    );
  }
}
