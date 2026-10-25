// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const SCHEDULE = { id: 'sch-9', teachingPlanId: 'plan-2', startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z', totalClasses: 20, startTime: '19:00', holidays: null };
const useSchedules = vi.fn((planId: string | null) => ({
  schedules: planId === 'plan-2' ? [SCHEDULE] : [], isLoading: false, error: null, reload: vi.fn(),
}));
const plans = [
  {
    id: 'plan-1',
    subject: {
      id: 's1', classId: 'c1',
      discipline: { name: 'Banco de Dados I', code: 'BD1' },
      class: {
        id: 'c1', name: 'Turma A',
        course: { name: 'Análise e Desenvolvimento de Sistemas' },
        academicPeriod: { name: '2026.1 · 1º Semestre / 2026' },
      },
    },
    syllabus: '', unitsContent: [], totalHours: 60, theoryHours: 40, practiceHours: 20,
  },
  {
    id: 'plan-2',
    subject: {
      id: 's2', classId: 'c2',
      discipline: { name: 'Física', code: 'FIS' },
      class: { id: 'c2', name: '2º Ano B', course: { name: 'Ensino Médio' }, academicPeriod: { name: '2025.2 · 2º Semestre / 2025' } },
    },
    syllabus: '', unitsContent: [], totalHours: 80,
  },
  {
    id: 'plan-3',
    subject: { id: 's3', classId: 'c3', discipline: { name: 'Ética', code: 'ETI' }, class: { id: 'c3', name: 'Turma C' } },
    syllabus: '', unitsContent: [],
  },
];

vi.mock('@/components/assessments/use-assessments', () => ({
  useTeacherPlans: () => ({ plans, isLoading: false, error: null }),
}));
vi.mock('@/components/teaching/use-schedules', () => ({
  useSchedules: (id: string | null) => useSchedules(id),
  useScheduleLessons: () => ({ lessons: [], reload: vi.fn() }),
  syncSchedule: vi.fn(),
}));
vi.mock('../ScheduleForm', () => ({ ScheduleForm: () => null }));
vi.mock('../MeetingsTable', () => ({ MeetingsTable: () => null }));

import { SchedulesPage } from '../SchedulesPage';

afterEach(() => { cleanup(); useSchedules.mockClear(); });

function open() {
  render(<SchedulesPage />);
  fireEvent.click(screen.getByRole('combobox', { name: /plano de ensino/i }));
}

describe('SchedulesPage seletor de plano', () => {
  it('mostra título, subtítulo e carga horária de cada plano', () => {
    open();
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.getByText('Análise e Desenvolvimento de Sistemas · Turma A · 2026.1 · 1º Semestre / 2026')).toBeTruthy();
    expect(screen.getByText('60h (40T/20P)')).toBeTruthy();
    expect(screen.getByText('80h')).toBeTruthy();
    expect(screen.getByText('ETI · Ética')).toBeTruthy();
    expect(screen.getByText('Turma C')).toBeTruthy();
  });

  it('a busca filtra por curso e por período', () => {
    open();
    const search = screen.getByLabelText('Buscar por disciplina, curso, turma ou período...');
    fireEvent.change(search, { target: { value: 'ensino médio' } });
    expect(screen.queryByText('BD1 · Banco de Dados I')).toBeNull();
    expect(screen.getByText('FIS · Física')).toBeTruthy();
    fireEvent.change(search, { target: { value: '2026.1' } });
    expect(screen.getByText('BD1 · Banco de Dados I')).toBeTruthy();
    expect(screen.queryByText('FIS · Física')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum plano encontrado.')).toBeTruthy();
  });

  it('selecionar um plano carrega os cronogramas dele', () => {
    open();
    fireEvent.click(screen.getByText('FIS · Física'));
    expect(useSchedules).toHaveBeenLastCalledWith('plan-2');
    expect(screen.getByText('Cronogramas')).toBeTruthy();
  });

  it('o link para planos de aula leva planId e scheduleId', () => {
    open();
    fireEvent.click(screen.getByText('FIS · Física'));
    fireEvent.click(screen.getByRole('button', { name: /20 aulas/ }));
    const href = screen.getByRole('link', { name: /Ir para planos de aula/ }).getAttribute('href') ?? '';
    expect(href).toContain('planId=plan-2');
    expect(href).toContain('scheduleId=sch-9');
  });
});
