import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getClassPulse } from '@/domains/classroom/class-answer-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const pulse = await getClassPulse(user, id);
    return NextResponse.json({ success: true, pulse });
  } catch (error) {
    return apiError(error);
  }
}
