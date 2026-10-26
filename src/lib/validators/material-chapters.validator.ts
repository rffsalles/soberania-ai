import { z } from 'zod';

export const materialChaptersSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        startPage: z.number().int().min(1),
      }),
    )
    .max(200),
});
