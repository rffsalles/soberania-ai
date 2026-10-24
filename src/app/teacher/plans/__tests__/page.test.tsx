// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import TeacherPlansListPage from '../page';

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}

const p2026_1 = { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 };
const p2026_2 = { id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026 };
const p2025_2 = { id: 'cperiod0009', name: '2º Semestre / 2025 (2025.2)', code: '2025.2', year: 2025 };

function plan(id: string, disciplina: { name: string; code: string }, turma: string, periodo: typeof p2026_1) {
  return {
    id, subjectId: `csubject${id}`, syllabus: '', status: 'DRAFT', totalHours: 60,
    createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
    subject: {
      id: `csubject${id}`,
      discipline: disciplina,
      class: {
        name: turma,
        course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' },
        academicPeriod: periodo,
      },
    },
  };
}

const plans = [
  plan('cplan0000001', { name: 'Banco de Dados I', code: 'BD101' }, 'Turma A', p2026_1),
  plan('cplan0000002', { name: 'Engenharia de Software', code: 'ES101' }, 'Turma B', p2025_2),
  plan('cplan0000003', { name: 'Banco de Dados II', code: 'BD102' }, 'Turma A', p2026_2),
  plan('cplan0000004', { name: 'Banco de Dados III', code: 'BD103' }, 'Turma C', p2026_1),
];

function setup() {
  vi.stubGlobal('fetch', routeFetch({ 'GET /api/v1/teacher/plans': { success: true, plans } }));
  render(<TeacherPlansListPage />);
}

describe('TeacherPlansListPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('agrupa os planos por período, do mais recente para o mais antigo', async () => {
    setup();
    await screen.findByText('Banco de Dados I');
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      '2º Semestre / 2026 (2026.2)', '1º Semestre / 2026 (2026.1)', '2º Semestre / 2025 (2025.2)',
    ]);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Disciplina & Código', 'Curso / Turma', 'Status NDE', 'Carga Horária', 'Última Atualização', 'Ações',
    ]);
  });

  it('cada linha mostra disciplina, código, curso e turma', async () => {
    setup();
    await screen.findByText('Banco de Dados I');
    const row = screen.getByText('BD101').closest('tr') as HTMLElement;
    expect(within(row).getByText('Banco de Dados I')).toBeTruthy();
    expect(within(row).getByText('Análise e Desenvolvimento de Sistemas')).toBeTruthy();
    expect(within(row).getByText('Turma A')).toBeTruthy();
  });

  it('a busca por turma filtra e esconde grupos vazios', async () => {
    setup();
    await screen.findByText('Banco de Dados I');
    fireEvent.change(screen.getByPlaceholderText('Buscar plano por disciplina, curso ou turma...'), { target: { value: 'turma b' } });
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['2º Semestre / 2025 (2025.2)']);
    expect(screen.queryByText('BD101')).toBeNull();
  });
});
