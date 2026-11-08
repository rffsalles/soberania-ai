import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { appendTeacherEvent, listEventsAfter } from '@/domains/classroom/class-event-service';

export const dynamic = 'force-dynamic';

const appendEventSchema = z.object({
  type: z.string().min(1),
  stepIndex: z.number().int().optional(),
  payload: z.unknown().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const input = appendEventSchema.parse(await req.json());
    const events = await appendTeacherEvent(user, id, input);
    return NextResponse.json({ success: true, events }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const raw = Number.parseInt(new URL(req.url).searchParams.get('after') ?? '', 10);
    const after = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const { events, lastSeq } = await listEventsAfter(user, id, after);
    return NextResponse.json({ success: true, events, lastSeq });
  } catch (error) {
    return apiError(error);
  }
}
