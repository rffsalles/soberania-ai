import { describe, it, expect } from 'vitest';
import {
  CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS_SYSTEM_PROMPT,
  TUTOR_STYLE_RULES,
} from '../socratic-prompts';

const PROMPTS = {
  CLASSROOM: CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP: STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR: DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS: OFFICE_HOURS_SYSTEM_PROMPT,
};

describe('prompts da tutora', () => {
  it('todos os prompts de tutoria terminam com as regras de estilo', () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt.trimEnd().endsWith(TUTOR_STYLE_RULES.trimEnd())).toBe(true);
    }
  });

  it('as regras proíbem apresentação, markdown e LaTeX', () => {
    for (const trecho of ['Não se apresente', 'sem markdown', 'sem LaTeX', '√2']) {
      expect(TUTOR_STYLE_RULES).toContain(trecho);
    }
  });

  it('o prompt de sala não manda reforçar a identidade', () => {
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).not.toContain('Reforce sempre que você é a Tutora Lucy');
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).toContain('NUNCA dê a resposta de forma mastigada');
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).toContain('[Livro Didático · Cap. X, pág. Y]');
  });
});
