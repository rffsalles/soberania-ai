import { describe, expect, it } from 'vitest';
import { generateAssessmentSchema } from '../assessment.validator';

describe('generateAssessmentSchema', () => {
  const base = { teachingPlanId: 'p1', questionCount: 5, type: 'EXAM' };

  it('chapterIds obrigatório com mínimo 1', () => {
    expect(generateAssessmentSchema.safeParse({ ...base, chapterIds: ['c1'] }).success).toBe(true);
    expect(generateAssessmentSchema.safeParse({ ...base, chapterIds: [] }).success).toBe(false);
    expect(generateAssessmentSchema.safeParse(base).success).toBe(false);
  });

  it('unitNumbers não é mais aceito', () => {
    const r = generateAssessmentSchema.safeParse({ ...base, unitNumbers: [1] });
    expect(r.success).toBe(false);
  });
});
