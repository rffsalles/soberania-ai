import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { listTutorDrafts, prepareTutorDraft } from '@/domains/classroom/tutor-draft-service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ stepIndex: z.number().int().min(0) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const drafts = await listTutorDrafts(user, id);
    return NextResponse.json({ success: true, drafts });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError(400, 'Informe o passo a preparar.');
    const step = await prepareTutorDraft(user, id, parsed.data.stepIndex);
    return NextResponse.json({ success: true, step });
  } catch (error) {
    return apiError(error);
  }
}
