import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const createPeriodSchema = z.object({
  name: z.string().min(3, 'Nome do período deve ter no mínimo 3 caracteres'),
  code: z.string().min(2, 'Código deve ter no mínimo 2 caracteres'),
  year: z.coerce.number().int().min(2020).max(2050).default(2026),
  semester: z.coerce.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['SEMESTER', 'ANNUAL', 'TERM', 'INTENSIVE']).default('SEMESTER'),
});

const DEFAULT_PERIODS = [
  {
    name: '1º Semestre / 2026 (2026.1)',
    code: '2026.1',
    year: 2026,
    semester: 1,
    type: 'SEMESTER',
  },
  {
    name: '2º Semestre / 2026 (2026.2)',
    code: '2026.2',
    year: 2026,
    semester: 2,
    type: 'SEMESTER',
  },
  {
    name: 'Ano Letivo 2026 (Anual)',
    code: '2026.ANUAL',
    year: 2026,
    semester: null,
    type: 'ANNUAL',
  },
  {
    name: '1º Trimestre / 2026',
    code: '2026.T1',
    year: 2026,
    semester: 1,
    type: 'TERM',
  },
  {
    name: 'Intensivo de Férias (Julho / 2026)',
    code: '2026.INT',
    year: 2026,
    semester: 2,
    type: 'INTENSIVE',
  },
];

export async function GET() {
  try {
    let periods = await db.academicPeriod.findMany({
      where: { isActive: true },
      orderBy: [{ year: 'desc' }, { semester: 'desc' }, { createdAt: 'desc' }],
    });

    // Auto-seeding se vazio
    if (periods.length === 0) {
      for (const p of DEFAULT_PERIODS) {
        await db.academicPeriod.upsert({
          where: { code: p.code },
          update: {},
          create: p,
        });
      }

      periods = await db.academicPeriod.findMany({
        where: { isActive: true },
        orderBy: [{ year: 'desc' }, { semester: 'desc' }, { createdAt: 'desc' }],
      });
    }

    return NextResponse.json({ success: true, periods });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao buscar períodos letivos.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = createPeriodSchema.safeParse(json);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const { name, code, year, semester, type } = parsed.data;

    const existing = await db.academicPeriod.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Já existe um período letivo com o código ${code}.` },
        { status: 409 }
      );
    }

    const period = await db.academicPeriod.create({
      data: {
        name,
        code,
        year,
        semester: semester ?? null,
        type,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, period }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao cadastrar período letivo.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
