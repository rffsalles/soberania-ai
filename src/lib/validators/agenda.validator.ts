import { z } from 'zod';
import { AgendaStatus, AgendaType } from '@prisma/client';

const isoDate = z.string().datetime({ offset: true });

export const createAgendaSchema = z
  .object({
    title: z.string().min(3),
    type: z.nativeEnum(AgendaType),
    classId: z.string().min(1),
    subjectId: z.string().min(1),
    startTime: isoDate,
    endTime: isoDate,
    videoUrl: z.string().url().optional(),
    lessonPlanId: z.string().min(1).optional(),
    assessmentId: z.string().min(1).optional(),
  })
  .refine((v) => new Date(v.endTime).getTime() > new Date(v.startTime).getTime(), {
    message: 'endTime deve ser posterior a startTime',
    path: ['endTime'],
  });

export const setAgendaStatusSchema = z.object({
  status: z.enum([AgendaStatus.CANCELLED, AgendaStatus.COMPLETED]),
});

export type CreateAgendaInput = z.infer<typeof createAgendaSchema>;
