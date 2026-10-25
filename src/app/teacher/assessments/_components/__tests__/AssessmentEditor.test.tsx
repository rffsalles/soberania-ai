// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/components/assessments/use-assessments', () => ({
  generateAssessment: vi.fn(),
  saveAssessment: vi.fn(),
}));

import { AssessmentEditor } from '../AssessmentEditor';

const makePlan = (unitsContent: unknown) =>
  ({
    id: 'plan-1',
    subject: {
      id: 's1', classId: 'c1',
      discipline: { name: 'BD', code: 'BD1' },
      class: { id: 'c1', name: 'Turma A' },
    },
    syllabus: '', unitsContent,
  }) as never;

const withUnits = makePlan([{ unitNumber: 1, title: 'Modelagem' }]);
const renderEditor = (plan = withUnits) =>
  render(<AssessmentEditor plan={plan} initial={null} onSaved={vi.fn()} onCancel={vi.fn()} />);
const genButton = () => screen.getByRole('button', { name: /gerar com ia/i }) as HTMLButtonElement;

afterEach(cleanup);

describe('AssessmentEditor - Gerar com IA', () => {
  it('sem unidade selecionada mostra o motivo e desabilita o botão', () => {
    renderEditor();
    expect(screen.getByText('Selecione ao menos uma unidade.')).toBeTruthy();
    expect(genButton().disabled).toBe(true);
  });

  it('plano sem unidades mostra o motivo correspondente', () => {
    renderEditor(makePlan([]));
    expect(screen.getAllByText('O plano não possui unidades cadastradas.').length).toBeGreaterThan(0);
    expect(genButton().disabled).toBe(true);
  });

  it('com unidade marcada e quantidade válida o motivo some e o botão habilita', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByText('Selecione ao menos uma unidade.')).toBeNull();
    expect(genButton().disabled).toBe(false);
  });

  it('quantidade inválida bloqueia com o motivo de intervalo', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Nº de questões'), { target: { value: '25' } });
    expect(screen.getByText('Informe entre 1 e 20 questões.')).toBeTruthy();
    expect(genButton().disabled).toBe(true);
  });
});
