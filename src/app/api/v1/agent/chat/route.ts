import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAgentOrchestration } from '@/domains/agents/agent-orchestrator';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';

const chatRequestSchema = z.object({
  message: z.string().min(1, 'Parâmetro message é obrigatório.'),
  agendaType: z.enum(['CLASSROOM', 'STUDY_GROUP', 'DRAFT_REVIEW', 'OFFICE_HOURS', 'EXAM'], {
    message: 'Parâmetro agendaType é obrigatório e deve ser válido.',
  }),
  sessionId: z.string().optional().default('session-live-01'),
  videoTimestampSeconds: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: 400 }
      );
    }

    const { message, agendaType, sessionId, videoTimestampSeconds } =
      parsed.data;

    const orchestrationResult = await handleAgentOrchestration({
      message,
      agendaType,
      studentId: user.id,
      studentName: user.name,
      sessionId,
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
    return apiError(error);
  }
}
