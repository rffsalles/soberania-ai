import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createAgendaSchema } from '@/lib/validators/agenda.validator';
import { createAgenda, listAgendasForUser } from '@/domains/agendas/services/agenda-service';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const agendas = await listAgendasForUser(user);
    return NextResponse.json({ success: true, agendas });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const input = createAgendaSchema.parse(await req.json());
    const agenda = await createAgenda(user, input);
    return NextResponse.json({ success: true, agenda }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
