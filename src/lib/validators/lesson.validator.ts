import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import {
  INSTITUTION_TIMEZONE,
  LESSON_MEDIA_TYPE,
  LESSON_RESOURCE_MAX_LENGTH,
  LESSON_RESOURCES_MAX_ITEMS,
  LESSON_TEXT_MAX_LENGTH,
  LESSON_TITLE_MAX_LENGTH,
  LESSON_URL_MAX_LENGTH,
  SCHEDULE_MAX_MEETINGS,
  YOUTUBE_URL_PATTERN,
  type LessonMediaType,
} from '@/lib/constants/teaching';
import { localDateTimeToUtc } from '@/lib/timezone';
import { timeScriptSchema } from '@/domains/teaching/time-script';

export const lessonStatusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED']) });

const INVALID_LESSON = 'Dados da aula inválidos.';
const INVALID_CLASS_DATE = 'Data da aula inválida.';
/** Valor de `<input type="datetime-local">`: horário de parede no fuso da instituição. */
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
/** Instante ISO 8601 completo, com fuso explícito. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const CLASS_DATE_MAX_LENGTH = 40;

/** Normaliza a data da aula para um instante ISO (UTC); rejeita datas inválidas com 400. */
const classDateSchema = z
  .string()
  .max(CLASS_DATE_MAX_LENGTH)
  .transform((value, ctx) => {
    const local = LOCAL_DATE_TIME.exec(value);
    try {
      const instant = local
        ? localDateTimeToUtc(local[1], local[2], INSTITUTION_TIMEZONE)
        : ISO_INSTANT.test(value)
          ? new Date(value)
          : null;
      if (instant && !Number.isNaN(instant.getTime())) return instant.toISOString();
    } catch {
      // RangeError de data/horário inexistente: cai no erro de validação abaixo.
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: INVALID_CLASS_DATE });
    return z.NEVER;
  });

const title = z.string().max(LESSON_TITLE_MAX_LENGTH);
const longText = z.string().max(LESSON_TEXT_MAX_LENGTH);
const INVALID_TIME_SCRIPT = 'Roteiro inválido: cada etapa precisa de tempo (segundos), faixa, atividade e descrição.';

/** Shared by lesson creation and update; unknown keys are stripped (explicit whitelist). */
export const lessonInputSchema = z.object({
  courseScheduleId: z.string().optional(),
  /** `AAAA-MM-DDTHH:mm` (fuso da instituição) ou instante ISO com fuso; sai como instante ISO UTC. */
  classDate: classDateSchema.optional(),
  classNumber: z
    .union([z.number().int().positive().max(SCHEDULE_MAX_MEETINGS), z.string().regex(/^\d{1,4}$/)])
    .optional(),
  topicTitle: title.optional(),
  dailyObjective: longText.optional(),
  timeScript: timeScriptSchema.optional(),
  methodology: longText.optional(),
  resourcesNeeded: z.array(z.string().max(LESSON_RESOURCE_MAX_LENGTH)).max(LESSON_RESOURCES_MAX_ITEMS).optional(),
  fixationExercise: longText.optional(),
  mediaType: z.enum([LESSON_MEDIA_TYPE.NONE, LESSON_MEDIA_TYPE.YOUTUBE, LESSON_MEDIA_TYPE.S3_UPLOAD]).optional(),
  mediaUrl: z.string().max(LESSON_URL_MAX_LENGTH).nullable().optional(),
  s3ObjectKey: z.string().max(LESSON_URL_MAX_LENGTH).nullable().optional(),
  chapterIds: z.array(z.string().min(1)).max(50).optional(),
});

export type LessonInput = z.infer<typeof lessonInputSchema>;

export type ExistingLessonMedia = { mediaType: string | null; mediaUrl: string | null };

/**
 * Validates a create/update payload. The effective media type is `incoming ?? existing`:
 * YOUTUBE needs an anchored YouTube URL, NONE clears the URL, and S3_UPLOAD can only be produced by the
 * upload endpoint (so neither the URL nor the object key may be sent, nor the type switched to it).
 */
export function parseLessonInput(raw: unknown, existing?: ExistingLessonMedia): LessonInput {
  const parsed = lessonInputSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const field = (name: string) => parsed.error.issues.some((i) => i.path[0] === name);
    if (field('timeScript')) throw new DomainError(400, INVALID_TIME_SCRIPT);
    throw new DomainError(400, field('classDate') ? INVALID_CLASS_DATE : INVALID_LESSON);
  }
  const input = parsed.data;
  const effective = (input.mediaType ?? existing?.mediaType ?? LESSON_MEDIA_TYPE.NONE) as LessonMediaType;
  const mediaTouched = input.mediaType !== undefined || input.mediaUrl !== undefined;

  if (input.s3ObjectKey !== undefined) {
    throw new DomainError(400, 'O arquivo da mídia só pode ser definido pelo envio de arquivo.');
  }
  if (effective === LESSON_MEDIA_TYPE.S3_UPLOAD) {
    const switching = input.mediaType === LESSON_MEDIA_TYPE.S3_UPLOAD && existing?.mediaType !== LESSON_MEDIA_TYPE.S3_UPLOAD;
    if (switching || input.mediaUrl !== undefined) {
      throw new DomainError(400, 'Mídia enviada só pode ser definida pelo envio de arquivo.');
    }
  }
  if (effective === LESSON_MEDIA_TYPE.YOUTUBE && mediaTouched) {
    const url = input.mediaUrl !== undefined ? input.mediaUrl : (existing?.mediaUrl ?? null);
    if (!url || !YOUTUBE_URL_PATTERN.test(url)) {
      throw new DomainError(400, 'Informe uma URL válida de vídeo do YouTube.');
    }
  }
  if (effective === LESSON_MEDIA_TYPE.NONE && mediaTouched) {
    return { ...input, mediaUrl: null };
  }
  return input;
}
