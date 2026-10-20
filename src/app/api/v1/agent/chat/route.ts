import { NextRequest, NextResponse } from 'next/server';
import { chatWithTutor } from '@/domains/agents/services/chat-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { chatRequestSchema } from '@/lib/validators/chat.validator';

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const parsed = chatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: 400 }
      );
    }
    const result = await chatWithTutor(user, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
