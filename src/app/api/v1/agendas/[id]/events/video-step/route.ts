import { NextResponse, after as runAfter } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { appendVideoStep } from '@/domains/classroom/class-event-service';
import { runTutorForStepSafely } from '@/domains/classroom/tutor-step-worker';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ videoSeconds: z.number().int().min(0) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const { videoSeconds } = bodySchema.parse(await req.json());
    const events = await appendVideoStep(user, id, videoSeconds);
    if (events.length > 0) {
      const stepIndex = events[0].stepIndex!;
      runAfter(() => runTutorForStepSafely(id, stepIndex));
    }
    return NextResponse.json({ success: true, events }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
