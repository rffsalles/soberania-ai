// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const plans = [
  {
    id: 'plan-1',
    subject: {
      id: 's1', classId: 'c1',
      discipline: { name: 'Banco de Dados I', code: 'BD1' },
      class: { id: 'c1', name: 'Turma A', course: { name: 'ADS' }, academicPeriod: { name: '2026.1' } },
    },
    syllabus: '', unitsContent: [], totalHours: 60,
  },
  {
    id: 'plan-2',
    subject: {
      id: 's2', classId: 'c2',
      discipline: { name: 'Física', code: 'FIS' },
      class: { id: 'c2', name: '2º Ano B', course: { name: 'Ensino Médio' } },
    },
    syllabus: '', unitsContent: [], totalHours: 80,
  },
];
const useAssessments = vi.fn((_planId: string | null) => ({
  assessments: [], isLoading: false, error: null, reload: vi.fn(),
}));

vi.mock('@/components/assessments/use-assessments', () => ({
  useTeacherPlans: () => ({ plans, isLoading: false, error: null }),
  useAssessments: (id: string | null) => useAssessments(id),
}));
vi.mock('../AssessmentEditor', () => ({ AssessmentEditor: () => null }));
vi.mock('../PublishDialog', () => ({ PublishDialog: () => null }));
vi.mock('../SubmissionsTable', () => ({ SubmissionsTable: () => null }));

import { AssessmentsPage } from '../AssessmentsPage';

afterEach(() => { cleanup(); useAssessments.mockClear(); });

describe('AssessmentsPage', () => {
  it('lista os planos no combobox com código e nome da disciplina', () => {
    render(<AssessmentsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.getByText('ADS · Turma A · 2026.1')).toBeTruthy();
    expect(screen.getByText('FIS · Física')).toBeTruthy();
  });

  it('selecionar um plano carrega as avaliações dele', () => {
    render(<AssessmentsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
    fireEvent.click(screen.getByText('FIS · Física'));
    expect(useAssessments).toHaveBeenLastCalledWith('plan-2');
    expect(screen.getByText('Provas do plano')).toBeTruthy();
  });
});
