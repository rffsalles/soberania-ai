import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getApplianceStatus } from '@/domains/telemetry/services/telemetry-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const status = await getApplianceStatus({ includeBaseUrl: user.role === Role.ADMIN });
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return apiError(error);
  }
}
