import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { generateUnitsFromDistribution } from '@/domains/teaching/services/plan-units-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const units = await generateUnitsFromDistribution(id, user);
    return NextResponse.json({ success: true, units });
  } catch (error) {
    return apiError(error);
  }
}
