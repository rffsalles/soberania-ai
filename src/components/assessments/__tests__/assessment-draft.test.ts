import { describe, expect, it } from 'vitest';
import { OPTION_KEYS, type Question } from '@/domains/assessments/question-schema';
import { validateAssessmentDraft } from '../assessment-draft';

const question = (patch: Partial<Question> = {}): Question => ({
  id: 'q1',
  enunciation: 'Qual afirmação está correta?',
  options: OPTION_KEYS.map((key) => ({ key, text: `opção ${key}` })),
  correctKey: 'A',
  rationale: '',
  topic: '',
  ...patch,
});

const valid = { questions: [question()], rubrics: [], maxScore: 10, durationMinutes: 60 };

describe('validateAssessmentDraft', () => {
  it('accepts a valid draft', () => {
    expect(validateAssessmentDraft(valid)).toEqual([]);
  });

  it('requires at least one question', () => {
    expect(validateAssessmentDraft({ ...valid, questions: [] })[0]).toMatch(/ao menos uma questão/);
  });

  it('flags empty enunciation and options', () => {
    const errors = validateAssessmentDraft({
      ...valid,
      questions: [question({ enunciation: '', options: OPTION_KEYS.map((key) => ({ key, text: key === 'B' ? ' ' : 'x' })) })],
    });
    expect(errors).toHaveLength(2);
  });

  it('flags a correctKey missing from the options', () => {
    const q = question({ options: OPTION_KEYS.slice(1).map((key) => ({ key, text: 'x' })) });
    expect(validateAssessmentDraft({ ...valid, questions: [q] }).join()).toMatch(/alternativa correta/);
  });

  it('rejects non-positive score and out-of-range duration', () => {
    expect(validateAssessmentDraft({ ...valid, maxScore: NaN })).toHaveLength(1);
    expect(validateAssessmentDraft({ ...valid, durationMinutes: 4 })).toHaveLength(1);
    expect(validateAssessmentDraft({ ...valid, durationMinutes: 301 })).toHaveLength(1);
  });
});
