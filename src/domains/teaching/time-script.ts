import { z } from 'zod';

export const TIME_SCRIPT_MAX_ITEMS = 60;

export const timeScriptItemSchema = z.object({
  timeSeconds: z.number().int().min(0),
  timeRange: z.string(),
  activity: z.string(),
  description: z.string(),
  socraticQuestion: z.string().optional(),
});

export const timeScriptSchema = z.array(timeScriptItemSchema).max(TIME_SCRIPT_MAX_ITEMS);

export type TimeScriptItem = z.infer<typeof timeScriptItemSchema>;
