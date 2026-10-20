import { NextResponse } from 'next/server';
import { AgendaStatus, Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { setAgendaStatusSchema } from '@/lib/validators/agenda.validator';
import { setAgendaStatus } from '@/domains/agendas/services/agenda-service';
import { generateMinutesForAgenda } from '@/domains/pedagogy/services/minutes-service';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const { status } = setAgendaStatusSchema.parse(await req.json());
    const agenda = await setAgendaStatus(id, user, status);
    if (status !== AgendaStatus.COMPLETED) return NextResponse.json({ success: true, agenda });
    const minutes = await generateMinutesForAgenda(id, user);
    return NextResponse.json({ success: true, agenda, minutes });
  } catch (error) {
    return apiError(error);
  }
}
