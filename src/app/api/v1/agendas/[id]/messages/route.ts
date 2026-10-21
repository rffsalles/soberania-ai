import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { postStudyGroupMessageSchema } from '@/lib/validators/study-group.validator';
import { checkStalemate, listMessages, postMessage } from '@/domains/agendas/services/study-group-service';

const HTTP_BAD_REQUEST = 400;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const rawSince = new URL(req.url).searchParams.get('since');
    let since: Date | undefined;
    if (rawSince) {
      since = new Date(rawSince);
      if (Number.isNaN(since.getTime())) throw new DomainError(HTTP_BAD_REQUEST, 'Parâmetro since inválido.');
    }
    // Intervenção por silêncio é best-effort: falha não impede a leitura.
    try {
      await checkStalemate(id, user, new Date());
    } catch (err) {
      if (err instanceof DomainError) throw err;
      console.warn('[study-group] falha ao verificar silêncio do grupo', err);
    }
    const messages = await listMessages(user, id, since);
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const parsed = postStudyGroupMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: HTTP_BAD_REQUEST }
      );
    }
    const result = await postMessage(user, id, parsed.data.content);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
