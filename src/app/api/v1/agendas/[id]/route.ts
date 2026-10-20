import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getAgendaForUser } from '@/domains/agendas/services/agenda-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const agenda = await getAgendaForUser(id, user);
    return NextResponse.json({ success: true, agenda });
  } catch (error) {
    return apiError(error);
  }
}
