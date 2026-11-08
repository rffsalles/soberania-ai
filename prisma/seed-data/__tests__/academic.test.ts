import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { questionSchema } from '@/domains/assessments/question-schema';
import { timeScriptSchema } from '@/domains/teaching/time-script';
import { DEMO_ASSESSMENT, DEMO_LESSON_PLANS } from '../academic';

describe('DEMO_ASSESSMENT', () => {
  it('questões passam em questionSchema com ids q1..qN', () => {
    expect(z.array(questionSchema).safeParse(DEMO_ASSESSMENT.questions).success).toBe(true);
    expect(DEMO_ASSESSMENT.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('DEMO_LESSON_PLANS roteiro', () => {
  it('aula 3 tem roteiro de 3 passos válido para eventos de aula', () => {
    const plan = DEMO_LESSON_PLANS.find((p) => p.classNumber === 3)!;
    const script = timeScriptSchema.parse(plan.timeScript);
    expect(script.map((s) => s.activity)).toEqual([
      'Revisão: chaves e relacionamentos',
      'INNER JOIN e LEFT JOIN na prática',
      'Subqueries e operações de conjunto',
    ]);
    for (const s of script) {
      expect(s.activity.length).toBeLessThanOrEqual(200);
      expect(s.timeRange.length).toBeLessThanOrEqual(40);
    }
    expect(script.map((s) => s.timeSeconds)).toEqual([0, 600, 1800]);
  });

  it('as outras aulas seguem sem roteiro', () => {
    expect(DEMO_LESSON_PLANS.filter((p) => p.classNumber !== 3).every((p) => p.timeScript.length === 0)).toBe(true);
  });
});
