import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { listPlanChapters } from '@/domains/teaching/services/plan-chapters-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const books = await listPlanChapters(id, user);
    return NextResponse.json({ success: true, books });
  } catch (error) {
    return apiError(error);
  }
}
