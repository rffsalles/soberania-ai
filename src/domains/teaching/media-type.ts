import { API_ROUTES } from '@/lib/constants/routes';
import { LESSON_MEDIA_TYPE, YOUTUBE_URL_PATTERN, type LessonMediaType } from '@/lib/constants/teaching';

/** Deriva o tipo de mídia a partir da URL efetivamente usada pelo player. */
export function resolveMediaType(url: string | null | undefined): LessonMediaType {
  if (!url) return LESSON_MEDIA_TYPE.NONE;
  if (YOUTUBE_URL_PATTERN.test(url)) return LESSON_MEDIA_TYPE.YOUTUBE;
  if (url.startsWith(`${API_ROUTES.TEACHER_LESSONS}/`)) return LESSON_MEDIA_TYPE.S3_UPLOAD;
  return LESSON_MEDIA_TYPE.NONE;
}
