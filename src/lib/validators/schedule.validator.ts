import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEEKDAY = 6;

const isoDate = z.string().regex(ISO_DATE, 'Data inválida (use AAAA-MM-DD).');

export const createScheduleSchema = z.object({
  teachingPlanId: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  weekdays: z.array(z.number().int().min(0).max(MAX_WEEKDAY)).min(1),
  holidays: z.array(isoDate),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
