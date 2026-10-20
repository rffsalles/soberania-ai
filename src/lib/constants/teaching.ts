export const PLAN_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

export const DEFAULT_NDE_COMPLIANCE_STATUS = '100% OK - Alinhado DCNs';

export const LESSON_MEDIA_TYPE = { NONE: 'NONE' } as const;
export const ASSESSMENT_TYPE = { EXAM: 'EXAM' } as const;
export type AssessmentType = (typeof ASSESSMENT_TYPE)[keyof typeof ASSESSMENT_TYPE];
export const ASSESSMENT_STATUS = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' } as const;
