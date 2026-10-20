import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createPeriod, listPeriodsEnsuringDefaults } from '@/domains/academic/services/academic-period-service';

const createPeriodSchema = z.object({
  name: z.string().min(3, 'Nome do período deve ter no mínimo 3 caracteres'),
  code: z.string().min(2, 'Código deve ter no mínimo 2 caracteres'),
  year: z.coerce.number().int().min(2020).max(2050).default(2026),
  semester: z.coerce.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['SEMESTER', 'ANNUAL', 'TERM', 'INTENSIVE']).default('SEMESTER'),
});

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const periods = await listPeriodsEnsuringDefaults();
    return NextResponse.json({ success: true, periods });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const json = await req.json();
    const parsed = createPeriodSchema.safeParse(json);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const period = await createPeriod(parsed.data);
    return NextResponse.json({ success: true, period }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
