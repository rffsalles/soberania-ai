import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { generatePlanSuggestion } from '@/domains/teaching/services/plan-generation-service';

const generatePlanSchema = z.object({
  subjectName: z.string().trim().min(1, 'Nome da disciplina é obrigatório para geração.'),
  courseName: z.string().trim().min(1).optional(),
  academicPeriod: z.string().trim().min(1).optional(),
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
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = generatePlanSchema.parse(await req.json());
    const data = await generatePlanSuggestion({
      subjectName: body.subjectName,
      courseName: body.courseName,
      academicPeriod: body.academicPeriod,
      references: body.selectedReferences,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
