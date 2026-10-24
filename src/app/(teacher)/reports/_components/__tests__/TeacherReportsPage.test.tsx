// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/components/agendas/use-agenda', () => ({
  useAgendas: () => ({ agendas: [], isLoading: false, error: null }),
}));
vi.mock('@/components/pedagogy/use-minutes', () => ({
  useMinutes: () => ({ data: [], isLoading: false, error: null }),
  useHeatmap: () => ({ data: [], isLoading: false, error: null }),
  buildMinuteQuery: () => '',
}));
vi.mock('../ClassAgendasSection', () => ({ ClassAgendasSection: () => null }));

import TeacherReportsPage from '../TeacherReportsPage';

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}

const ofertaADS = {
  id: 'csubject0001',
  discipline: { code: 'BD101', name: 'Banco de Dados I', workloadHours: 60 },
  class: {
    id: 'cclass00001', name: 'ADS 3A', code: 'ADS3A', semester: 3,
    course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
    academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026', code: '2026.1' },
  },
};
const ofertaEM = {
  id: 'csubject0002',
  discipline: { code: 'MAT201', name: 'Matemática II', workloadHours: 80 },
  class: {
    id: 'cclass00002', name: 'EM 2A', code: 'EM2A', semester: 2,
    course: { name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
    academicPeriod: { id: 'cperiod0002', name: 'Ano 2026', code: '2026' },
  },
};

const LABEL_ADS = 'BD101 · Banco de Dados I · 3º Sem ADS · 2026.1';
const LABEL_EM = 'MAT201 · Matemática II · 2º Ano EM · 2026';

describe('TeacherReportsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      routeFetch({ 'GET /api/v1/admin/subjects': { success: true, subjects: [ofertaADS, ofertaEM] } })
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('filtro de disciplina usa o rótulo da oferta', async () => {
    render(<TeacherReportsPage />);
    await screen.findByRole('option', { name: LABEL_ADS });
    expect(screen.getByRole('option', { name: LABEL_EM })).toBeTruthy();
    for (const option of screen.getAllByRole('option')) {
      expect((option.textContent ?? '').trim()).not.toBe('');
    }
  });

  it('o resumo impresso usa o rótulo da oferta selecionada', async () => {
    render(<TeacherReportsPage />);
    const option = await screen.findByRole('option', { name: LABEL_ADS });
    fireEvent.change(option.closest('select') as HTMLSelectElement, { target: { value: 'csubject0001' } });
    expect(screen.getByText(/Disciplina: BD101 · Banco de Dados I · 3º Sem ADS · 2026\.1/)).toBeTruthy();
  });
});
