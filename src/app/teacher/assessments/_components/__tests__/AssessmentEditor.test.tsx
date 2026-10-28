// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const chaptersState = vi.hoisted(() => ({ loading: false }));
vi.mock('@/components/teaching/use-plan-chapters', async () => {
  const { MAT_BOOK } = await import('@/components/teaching/__tests__/chapter-tree-fixtures');
  return {
    usePlanChapters: () =>
      chaptersState.loading
        ? { books: [], isLoading: true, error: null, reload: vi.fn() }
        : { books: [MAT_BOOK], isLoading: false, error: null, reload: vi.fn() },
  };
});
vi.mock('@/components/assessments/use-assessments', () => ({
  generateAssessment: vi.fn(),
  saveAssessment: vi.fn(),
}));

import type { Question } from '@/domains/assessments/question-schema';
import { AssessmentEditor } from '../AssessmentEditor';
import { generateAssessment, saveAssessment, type AssessmentItem } from '@/components/assessments/use-assessments';

const plan = {
  id: 'plan-1',
  subject: {
    id: 's1', classId: 'c1',
    discipline: { name: 'BD', code: 'BD1' },
    class: { id: 'c1', name: 'Turma A' },
  },
  syllabus: '', unitsContent: [],
} as never;

const q = (id: string): Question => ({
  id,
  enunciation: 'Quanto é 1/2 + 1/2?',
  options: [
    { key: 'A', text: 'um' },
    { key: 'B', text: 'dois' },
    { key: 'C', text: 'três' },
    { key: 'D', text: 'quatro' },
  ],
  correctKey: 'A',
  rationale: 'porque sim',
  topic: 'frações',
});

const existing = {
  id: 'a1',
  teachingPlanId: 'plan-1',
  title: 'Prova 1',
  type: 'EXAM',
  questions: [q('q1')],
  rubrics: [],
  maxScore: 10,
  durationMinutes: 60,
  status: 'DRAFT',
  agendas: [],
  chapterIds: [],
} as unknown as AssessmentItem;

const renderEditor = (initial: AssessmentItem | null = null) =>
  render(<AssessmentEditor plan={plan} initial={initial} onSaved={vi.fn()} onCancel={vi.fn()} />);
const genButton = () => screen.getByRole('button', { name: /gerar com ia/i }) as HTMLButtonElement;

beforeEach(() => {
  chaptersState.loading = false;
  vi.mocked(generateAssessment).mockReset();
  vi.mocked(saveAssessment).mockReset();
});
afterEach(cleanup);

describe('AssessmentEditor - capítulos', () => {
  it('árvore renderiza com os livros do plano', () => {
    renderEditor();
    expect(screen.getByRole('tree')).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '2 Unidade 2' })).toBeTruthy();
  });

  it('sem capítulos trava o botão; prova antiga continua salvável', () => {
    renderEditor({ ...existing, chapterIds: [] });
    expect(screen.getByText('Selecione ao menos um capítulo.')).toBeTruthy();
    expect(genButton().disabled).toBe(true);
    expect(screen.queryByText(/^Cap\./)).toBeNull();
    expect((screen.getByRole('button', { name: /salvar/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('árvore carregando trava o botão', () => {
    chaptersState.loading = true;
    renderEditor();
    expect(genButton().disabled).toBe(true);
  });

  it('quantidade inválida bloqueia com o motivo de intervalo', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
    fireEvent.change(screen.getByLabelText('Nº de questões'), { target: { value: '25' } });
    expect(screen.getByText('Informe entre 1 e 20 questões.')).toBeTruthy();
    expect(genButton().disabled).toBe(true);
  });

  it('payload de geração leva chapterIds; aviso offline e rótulo aparecem', async () => {
    vi.mocked(generateAssessment).mockResolvedValue({
      questions: [{ ...q('q1'), chapterId: 's22' }],
      rubrics: [],
      fallback: true,
    });
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    fireEvent.click(screen.getByRole('treeitem', { name: '2.2 Frações' }));
    fireEvent.click(genButton());
    await waitFor(() =>
      expect(generateAssessment).toHaveBeenCalledWith({
        teachingPlanId: 'plan-1',
        chapterIds: ['s22'],
        questionCount: 5,
        type: 'EXAM',
      }),
    );
    expect(await screen.findByText('Questões geradas sem IA (modo offline). Revise antes de publicar.')).toBeTruthy();
    expect(screen.getByText('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66')).toBeTruthy();
  });

  it('salvar envia chapterIds', async () => {
    vi.mocked(saveAssessment).mockResolvedValue(undefined as never);
    renderEditor({ ...existing, chapterIds: ['u2'] });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() =>
      expect(saveAssessment).toHaveBeenCalledWith('plan-1', 'a1', expect.objectContaining({ chapterIds: ['u2'] })),
    );
  });
});
