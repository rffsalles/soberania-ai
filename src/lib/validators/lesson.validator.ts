import { z } from 'zod';
import { DomainError } from '@/lib/api/domain-error';
import { LESSON_MEDIA_TYPE, YOUTUBE_URL_PATTERN, type LessonMediaType } from '@/lib/constants/teaching';
import { timeScriptSchema } from '@/domains/teaching/time-script';

const INVALID_LESSON = 'Dados da aula inválidos.';
const INVALID_TIME_SCRIPT = 'Roteiro inválido: cada etapa precisa de tempo (segundos), faixa, atividade e descrição.';

/** Shared by lesson creation and update; unknown keys are stripped (explicit whitelist). */
export const lessonInputSchema = z.object({
  courseScheduleId: z.string().optional(),
  classDate: z.string().optional(),
  classNumber: z.union([z.number(), z.string()]).optional(),
  topicTitle: z.string().optional(),
  dailyObjective: z.string().optional(),
  timeScript: timeScriptSchema.optional(),
  methodology: z.string().optional(),
  resourcesNeeded: z.array(z.string()).optional(),
  fixationExercise: z.string().optional(),
  mediaType: z.enum([LESSON_MEDIA_TYPE.NONE, LESSON_MEDIA_TYPE.YOUTUBE, LESSON_MEDIA_TYPE.S3_UPLOAD]).optional(),
  mediaUrl: z.string().nullable().optional(),
  s3ObjectKey: z.string().nullable().optional(),
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
    const timeScriptIssue = parsed.error.issues.some((i) => i.path[0] === 'timeScript');
    throw new DomainError(400, timeScriptIssue ? INVALID_TIME_SCRIPT : INVALID_LESSON);
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
