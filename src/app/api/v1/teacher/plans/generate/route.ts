import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getOfferingContext } from '@/domains/academic/services/subject-service';
import { generatePlanSuggestion } from '@/domains/teaching/services/plan-generation-service';

const generatePlanSchema = z.object({
  subjectId: z
    .string({ required_error: 'Selecione a oferta para gerar.' })
    .min(1, 'Selecione a oferta para gerar.'),
  selectedReferences: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string(),
        author: z.string(),
        category: z.string().optional(),
      })
    )
    .default([]),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const parsed = generatePlanSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const context = await getOfferingContext(body.subjectId, user);
    const data = await generatePlanSuggestion({ ...context, references: body.selectedReferences });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
