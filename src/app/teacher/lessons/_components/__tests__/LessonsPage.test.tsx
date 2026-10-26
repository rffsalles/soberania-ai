// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

const plans = [
  {
    id: 'plan-1',
    subject: {
      id: 's1', classId: 'c1',
      discipline: { name: 'Banco de Dados I', code: 'BD1' },
      class: { id: 'c1', name: 'Turma A', course: { name: 'ADS' }, academicPeriod: { name: '2026.1' } },
    },
    syllabus: '', unitsContent: [], totalHours: 60, theoryHours: 40, practiceHours: 20,
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
const SCHEDULE = { id: 'sch-9', teachingPlanId: 'plan-2', startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z', totalClasses: 20, startTime: '19:00', holidays: null };
const useSchedules = vi.fn((planId: string | null) => ({
  schedules: planId === 'plan-2' ? [SCHEDULE] : [], isLoading: false, error: null, reload: vi.fn(),
}));

vi.mock('@/components/assessments/use-assessments', () => ({
  useTeacherPlans: () => ({ plans, isLoading: false, error: null }),
}));
vi.mock('@/components/teaching/use-schedules', () => ({
  useSchedules: (id: string | null) => useSchedules(id),
}));
const LESSONS = [
  { id: 'les-1', classNumber: 1, topicTitle: 'Introdução', classDate: '2026-02-01T19:00:00.000Z', status: 'DRAFT' },
  { id: 'les-2', classNumber: 2, topicTitle: 'Modelo relacional', classDate: '2026-02-08T19:00:00.000Z', status: 'PUBLISHED' },
];
vi.mock('@/components/teaching/use-lessons', () => ({
  useLessons: () => ({ lessons: LESSONS, isLoading: false, error: null, reload: vi.fn() }),
}));
vi.mock('../LessonEditor', () => ({ LessonEditor: () => null }));

import { LessonsPage } from '../LessonsPage';

afterEach(() => { cleanup(); useSchedules.mockClear(); search = ''; });

const scheduleSelect = () => screen.getByLabelText('Cronograma') as HTMLSelectElement;

describe('LessonsPage', () => {
  it('com planId e scheduleId na URL mostra o plano e o cronograma selecionados', () => {
    search = 'planId=plan-2&scheduleId=sch-9';
    render(<LessonsPage />);
    expect(screen.getByRole('combobox', { name: /plano de ensino/i }).textContent).toContain('FIS · Física');
    expect(useSchedules).toHaveBeenCalledWith('plan-2');
    expect(scheduleSelect().value).toBe('sch-9');
    expect(screen.queryByText('Cronograma selecionado')).toBeNull();
  });

  it('link legado só com scheduleId mantém a opção "Cronograma selecionado"', () => {
    search = 'scheduleId=sch-legacy';
    render(<LessonsPage />);
    expect(scheduleSelect().value).toBe('sch-legacy');
    expect(screen.getByText('Cronograma selecionado')).toBeTruthy();
  });

  it('a lista de planos mostra título, subtítulo e carga horária', () => {
    render(<LessonsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.getByText('ADS · Turma A · 2026.1')).toBeTruthy();
    expect(screen.getByText('60h (40T/20P)')).toBeTruthy();
    expect(screen.getByText('80h')).toBeTruthy();
  });

  it('cada aula mostra badge Rascunho ou Publicada', () => {
    search = 'planId=plan-2&scheduleId=sch-9';
    render(<LessonsPage />);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Publicada')).toBeTruthy();
  });

  it('trocar o plano limpa o cronograma', () => {
    search = 'planId=plan-2&scheduleId=sch-9';
    render(<LessonsPage />);
    fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
    fireEvent.click(screen.getByText('BD1 · Banco de Dados I'));
    expect(useSchedules).toHaveBeenLastCalledWith('plan-1');
    expect(scheduleSelect().value).toBe('');
  });
});
