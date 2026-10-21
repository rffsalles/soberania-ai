export const PLAN_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

export const DEFAULT_NDE_COMPLIANCE_STATUS = '100% OK - Alinhado DCNs';

export const LESSON_MEDIA_TYPE = { NONE: 'NONE', YOUTUBE: 'YOUTUBE', S3_UPLOAD: 'S3_UPLOAD' } as const;
export type LessonMediaType = (typeof LESSON_MEDIA_TYPE)[keyof typeof LESSON_MEDIA_TYPE];

export const LESSON_DEFAULT_DURATION_MINUTES = 100;
export const MEDIA_MAX_UPLOAD_MB = 200;
export const YOUTUBE_URL_PATTERN = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}([?&#].*)?$/;

/** Extensões de mídia aceitas no upload de aulas, com o tipo de conteúdo servido no download. */
export const LESSON_MEDIA_CONTENT_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
} as const;
export const LESSON_MEDIA_ACCEPT = Object.keys(LESSON_MEDIA_CONTENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');
export const ASSESSMENT_TYPE = { EXAM: 'EXAM' } as const;
export type AssessmentType = (typeof ASSESSMENT_TYPE)[keyof typeof ASSESSMENT_TYPE];
export const ASSESSMENT_STATUS = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' } as const;

export const SCHEDULE_MAX_SPAN_DAYS = 366;
export const SCHEDULE_MAX_MEETINGS = 400;
export const SCHEDULE_MAX_HOLIDAYS = 60;
