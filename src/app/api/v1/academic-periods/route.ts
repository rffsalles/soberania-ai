import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createPeriod, listPeriods } from '@/domains/academic/services/academic-period-service';

const createPeriodSchema = z.object({
  code: z.string().min(2, 'Código deve ter no mínimo 2 caracteres'),
  year: z.coerce.number().int().min(2020).max(2050).default(2026),
  semester: z.coerce.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['SEMESTER', 'ANNUAL', 'TERM', 'INTENSIVE']).default('SEMESTER'),
});

export async function GET(req: Request) {
  try {
    // Alunos leem o período letivo ativo (painel); criar continua restrito ao ADMIN.
    await requireUser(req, [Role.STUDENT, Role.TEACHER, Role.ADMIN]);
    const periods = await listPeriods();
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
