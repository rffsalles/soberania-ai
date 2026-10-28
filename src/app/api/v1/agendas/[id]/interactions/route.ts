import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { listStudentChatHistory } from '@/domains/agents/services/chat-history-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const items = await listStudentChatHistory(user, id);
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
