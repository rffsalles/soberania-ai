import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { parseMinuteFilter } from '@/lib/validators/pedagogy.validator';
import { exportMinutesCsv } from '@/domains/pedagogy/services/reports-service';

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';
const CSV_DISPOSITION = 'attachment; filename="atas.csv"';

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const csv = await exportMinutesCsv(user, parseMinuteFilter(req.url));
    return new NextResponse(csv, {
      headers: { 'Content-Type': CSV_CONTENT_TYPE, 'Content-Disposition': CSV_DISPOSITION },
    });
  } catch (error) {
    return apiError(error);
  }
}
