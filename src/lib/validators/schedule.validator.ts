import { z } from 'zod';
import { SCHEDULE_MAX_HOLIDAYS, SCHEDULE_MAX_SPAN_DAYS } from '@/lib/constants/teaching';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEEKDAY = 6;
const MS_PER_DAY = 86_400_000;

const isoDate = z.string().regex(ISO_DATE, 'Data inválida (use AAAA-MM-DD).');

export const createScheduleSchema = z.object({
  teachingPlanId: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  weekdays: z.array(z.number().int().min(0).max(MAX_WEEKDAY)).min(1),
  holidays: z.array(isoDate).max(SCHEDULE_MAX_HOLIDAYS),
}).refine(
  (v) => (Date.parse(v.endDate) - Date.parse(v.startDate)) / MS_PER_DAY <= SCHEDULE_MAX_SPAN_DAYS,
  { message: `O período não pode exceder ${SCHEDULE_MAX_SPAN_DAYS} dias.`, path: ['endDate'] }
);

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
