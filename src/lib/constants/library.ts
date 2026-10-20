export const MATERIAL_STATUS = {
  UPLOADING: 'UPLOADING',
  PARSING: 'PARSING',
  OCR_PROCESSING: 'OCR_PROCESSING',
  INDEXED: 'INDEXED',
  ERROR: 'ERROR',
} as const;

export type MaterialStatus = (typeof MATERIAL_STATUS)[keyof typeof MATERIAL_STATUS];

export const GENERAL_CATEGORY = 'Geral';
export const DEFAULT_CATEGORY_COLOR = 'teal';
