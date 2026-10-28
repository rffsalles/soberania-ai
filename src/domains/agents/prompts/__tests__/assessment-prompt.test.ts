import { describe, expect, it } from 'vitest';
import { buildAssessmentMessages, parseAssessmentText } from '../assessment-prompt';

const chunk = { id: 'k1', materialId: 'm', bookTitle: 'Matemática Básica', author: 'Silva', chapter: 'Cap. 2.2: Frações', pageNumber: 50, content: 'Fração é parte de um todo.' };

describe('assessment-prompt', () => {
  it('mensagem lista capítulos com id e rótulo e trechos com citação', () => {
    const [sys, user] = buildAssessmentMessages({ subjectName: 'Matemática', chapters: [{ id: 's22', label: 'Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66' }], chunks: [chunk], questionCount: 3, type: 'EXAM' });
    expect(sys.content).toContain('chapterId');
    expect(user.content).toContain('Disciplina: Matemática');
    expect(user.content).toContain('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66 (id: s22)');
    expect(user.content).toContain('[Matemática Básica · Cap. 2.2, pág. 50]\nFração é parte de um todo.');
    expect(user.content).not.toMatch(/Unidade/);
  });

  it('parser aceita chapterId, tolera ausência e descarta null/numérico', () => {
    const q = (extra: object) => ({ id: 'q1', enunciation: 'Enunciado válido?', options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: key })), correctKey: 'A', rationale: 'r', topic: 't', ...extra });
    const out = parseAssessmentText(JSON.stringify({ questions: [q({ chapterId: 's22' }), q({}), q({ chapterId: null }), q({ chapterId: 7 })] }));
    expect(out?.questions.map((x) => x.chapterId)).toEqual(['s22', undefined, undefined, undefined]);
  });
});
