import { NextResponse, after as runAfter } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import {
  appendTeacherEvent,
  listEventsAfter,
  stalledTutorStepFor,
} from '@/domains/classroom/class-event-service';
import { tutorRunTarget } from '@/domains/classroom/tutor-policy';
import { runTutorForStepSafely } from '@/domains/classroom/tutor-step-worker';

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
    const { events, warning } = await appendTeacherEvent(user, id, input);
    const target = tutorRunTarget(events);
    if (target !== null) runAfter(() => runTutorForStepSafely(id, target));
    return NextResponse.json({ success: true, events, warning }, { status: 201 });
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
    const { events, lastSeq, closed } = await listEventsAfter(user, id, after);
    const stalled = await stalledTutorStepFor(user, id, Date.now());
    if (stalled !== null) runAfter(() => runTutorForStepSafely(id, stalled));
    return NextResponse.json({ success: true, events, lastSeq, closed });
  } catch (error) {
    return apiError(error);
  }
}
