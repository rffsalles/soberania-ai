export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export type OptionKey = (typeof OPTION_KEYS)[number];

/** Rubrica formativa usada quando a agenda não tem avaliação com rubricas. */
export const DEFAULT_DRAFT_RUBRIC = ['Coesão', 'Coerência', 'Fontes'].map((criterion) => ({
  criterion,
  description: `Avaliação formativa de ${criterion.toLowerCase()}.`,
  weight: 1,
}));

export const DRAFT_MIN_CHARS = 200;
export const DRAFT_MAX_SCORE = 10;
export const DRAFT_FALLBACK_SCORE = 6;
export const DRAFT_ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx'] as const;
