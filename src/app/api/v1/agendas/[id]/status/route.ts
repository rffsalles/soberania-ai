import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { setAgendaStatusSchema } from '@/lib/validators/agenda.validator';
import { setAgendaStatus } from '@/domains/agendas/services/agenda-service';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const { status } = setAgendaStatusSchema.parse(await req.json());
    const agenda = await setAgendaStatus(id, user, status);
    return NextResponse.json({ success: true, agenda });
  } catch (error) {
    return apiError(error);
  }
}
