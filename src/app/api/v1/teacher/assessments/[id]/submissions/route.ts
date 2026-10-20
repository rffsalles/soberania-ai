import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { listSubmissionsForAssessment } from '@/domains/assessments/services/assessment-submissions-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const submissions = await listSubmissionsForAssessment(id, user);
    return NextResponse.json({ success: true, submissions });
  } catch (error) {
    return apiError(error);
  }
}
