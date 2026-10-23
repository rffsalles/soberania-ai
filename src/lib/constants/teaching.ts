export const PLAN_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

/** Parecer NDE/DCN: nenhum plano nasce "alinhado"; o status só muda por decisão humana. */
export const NDE_COMPLIANCE_STATUS = {
  PENDING: 'Pendente de Avaliação Colegiado',
  ADJUSTING: 'Em Adequação com NDE',
  OK: '100% OK - Alinhado DCNs',
  PERIODIC_REVIEW: 'Revisão Periódica',
} as const;
export const DEFAULT_NDE_COMPLIANCE_STATUS = NDE_COMPLIANCE_STATUS.PENDING;

export const LESSON_MEDIA_TYPE = { NONE: 'NONE', YOUTUBE: 'YOUTUBE', S3_UPLOAD: 'S3_UPLOAD' } as const;
export type LessonMediaType = (typeof LESSON_MEDIA_TYPE)[keyof typeof LESSON_MEDIA_TYPE];

export const LESSON_DEFAULT_DURATION_MINUTES = 100;

/** Horário de início (HH:mm, no fuso da instituição) das aulas geradas por um cronograma. */
export const SCHEDULE_DEFAULT_START_TIME = '19:00';
export const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_INSTITUTION_TIMEZONE = 'America/Sao_Paulo';

/** Fuso IANA válido ou o padrão da instituição (valor vazio ou desconhecido). */
export function resolveInstitutionTimeZone(value: string | undefined): string {
  if (!value) return DEFAULT_INSTITUTION_TIMEZONE;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_INSTITUTION_TIMEZONE;
  }
}

/**
 * Fuso em que datas e horários de aula são digitados e exibidos. Acesso literal a
 * process.env.NEXT_PUBLIC_INSTITUTION_TIMEZONE para o Next.js embutir o valor no bundle do cliente.
 */
export const INSTITUTION_TIMEZONE = resolveInstitutionTimeZone(process.env.NEXT_PUBLIC_INSTITUTION_TIMEZONE);

/** Limites de texto das aulas (M9). */
export const LESSON_TITLE_MAX_LENGTH = 200;
export const LESSON_TEXT_MAX_LENGTH = 10_000;
export const LESSON_RESOURCES_MAX_ITEMS = 50;
export const LESSON_RESOURCE_MAX_LENGTH = 300;
export const LESSON_URL_MAX_LENGTH = 2048;
export const MEDIA_MAX_UPLOAD_MB = 200;
export const YOUTUBE_URL_PATTERN = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}([?&#].*)?$/;

export const YOUTUBE_VIDEO_ID_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

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
