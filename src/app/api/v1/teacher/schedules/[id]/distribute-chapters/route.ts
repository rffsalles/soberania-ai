import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { distributeChapters } from '@/domains/teaching/services/chapter-distribution-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const result = await distributeChapters(id, user);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return apiError(error);
  }
}
