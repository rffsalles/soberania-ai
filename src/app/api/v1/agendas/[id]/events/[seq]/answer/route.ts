import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { answerTutorQuestion } from '@/domains/classroom/class-answer-service';

export const dynamic = 'force-dynamic';

const answerSchema = z.object({
  optionKey: z.string().optional(),
  text: z.string().optional(),
  videoSeconds: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string; seq: string }> }) {
  try {
    const user = await requireUser(req);
    const { id, seq: rawSeq } = await params;
    const seq = /^\d+$/.test(rawSeq) ? Number.parseInt(rawSeq, 10) : 0;
    if (!Number.isSafeInteger(seq) || seq < 1) throw new DomainError(404, 'Pergunta não encontrada.');
    const input = answerSchema.parse(await req.json());
    const result = await answerTutorQuestion(user, id, seq, input);
    // Resposta já gravada antes: 200 com o resultado dela; resposta nova: 201.
    return NextResponse.json({ success: true, result }, { status: result.alreadyAnswered ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
