import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { questionSchema } from '@/domains/assessments/question-schema';
import { DEMO_ASSESSMENT } from '../academic';

describe('DEMO_ASSESSMENT', () => {
  it('questões passam em questionSchema com ids q1..qN', () => {
    expect(z.array(questionSchema).safeParse(DEMO_ASSESSMENT.questions).success).toBe(true);
    expect(DEMO_ASSESSMENT.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});
