import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { parseMinuteFilter } from '@/lib/validators/pedagogy.validator';
import { getHeatmap } from '@/domains/pedagogy/services/reports-service';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const heatmap = await getHeatmap(user, parseMinuteFilter(req.url));
    return NextResponse.json({ success: true, heatmap });
  } catch (error) {
    return apiError(error);
  }
}
