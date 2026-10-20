import { z } from 'zod';

const optionalText = z.string().min(1).optional();

/** Filtros das atas pedagógicas (listagem, mapa de calor e exportação CSV). */
export const minuteFilterSchema = z.object({
  agendaId: optionalText,
  studentId: optionalText,
  subjectId: optionalText,
  classId: optionalText,
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/** Converte a query string em objeto ignorando parâmetros vazios. */
export function parseMinuteFilter(url: string) {
  const params = Object.fromEntries(
    [...new URL(url).searchParams.entries()].filter(([, value]) => value !== '')
  );
  return minuteFilterSchema.parse(params);
}
