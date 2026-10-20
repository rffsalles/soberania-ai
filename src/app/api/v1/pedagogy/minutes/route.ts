import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { parseMinuteFilter } from '@/lib/validators/pedagogy.validator';
import { generateMinute, listMinutes } from '@/domains/pedagogy/services/minutes-service';

const optionalText = z.string().min(1).optional();

const generateBodySchema = z.object({
  agendaId: z.string().min(1),
  studentId: optionalText,
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const filter = parseMinuteFilter(req.url);
    const minutes = await listMinutes(user, filter);
    return NextResponse.json({ success: true, minutes });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const input = generateBodySchema.parse(await req.json());
    const minute = await generateMinute(user, input);
    return NextResponse.json({ success: true, minute });
  } catch (error) {
    return apiError(error);
  }
}
