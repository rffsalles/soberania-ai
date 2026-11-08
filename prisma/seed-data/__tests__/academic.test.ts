import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { questionSchema } from '@/domains/assessments/question-schema';
import { decideTutorPlan, stepDurationSeconds } from '@/domains/classroom/tutor-policy';
import { timeScriptSchema } from '@/domains/teaching/time-script';
import { DEMO_AGENDAS } from '../agendas';
import { DEMO_ASSESSMENT, DEMO_LESSON_PLANS, DEMO_LIVE_TIME_SCRIPT } from '../academic';

describe('DEMO_ASSESSMENT', () => {
  it('questões passam em questionSchema com ids q1..qN', () => {
    expect(z.array(questionSchema).safeParse(DEMO_ASSESSMENT.questions).success).toBe(true);
    expect(DEMO_ASSESSMENT.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('DEMO_LESSON_PLANS roteiro', () => {
  it('aula 3 tem roteiro válido para eventos de aula', () => {
    const plan = DEMO_LESSON_PLANS.find((p) => p.classNumber === 3)!;
    const script = timeScriptSchema.parse(plan.timeScript);
    for (const s of script) {
      expect(s.activity.length).toBeLessThanOrEqual(200);
      expect(s.timeRange.length).toBeLessThanOrEqual(40);
    }
  });

  it('aula 3 tem um passo de cada tipo para a tutora', () => {
    const live = DEMO_AGENDAS.find((a) => a.type === 'CLASSROOM' && a.status === 'LIVE')!;
    const seconds = (live.endOffsetMinutes - live.startOffsetMinutes) * 60;
    const plans = DEMO_LIVE_TIME_SCRIPT.map((item, i) =>
      decideTutorPlan({ item, durationSeconds: stepDurationSeconds(DEMO_LIVE_TIME_SCRIPT, i, seconds) }, { muted: false }),
    );
    expect(plans.map((p) => (p.kind === 'RUN' ? p.question?.from ?? 'NONE' : 'SILENT'))).toEqual([
      'MODEL',
      'TEACHER',
      'MODEL',
      'NONE',
      'MODEL',
    ]);
    expect(DEMO_LIVE_TIME_SCRIPT.slice(0, 3).map((s) => s.activity)).toEqual([
      'Revisão: chaves e relacionamentos',
      'INNER JOIN e LEFT JOIN na prática',
      'Subqueries e operações de conjunto',
    ]);
    expect(timeScriptSchema.parse(DEMO_LIVE_TIME_SCRIPT)).toHaveLength(5);
    expect(DEMO_LIVE_TIME_SCRIPT.map((s) => s.timeSeconds)).toEqual([0, 600, 1800, 3000, 3180]);
  });

  it('as outras aulas seguem sem roteiro', () => {
    expect(DEMO_LESSON_PLANS.filter((p) => p.classNumber !== 3).every((p) => p.timeScript.length === 0)).toBe(true);
  });
});
