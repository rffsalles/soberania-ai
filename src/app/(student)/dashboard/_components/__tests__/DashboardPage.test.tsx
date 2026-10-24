// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

void React;

const current = vi.hoisted(() => ({
  value: { user: null, isLoading: false } as { user: unknown; isLoading: boolean },
}));

vi.mock('@/components/agendas/use-agenda', () => ({
  useAgendas: () => ({ agendas: [], isLoading: false, error: null }),
}));
vi.mock('@/components/pedagogy/use-minutes', () => ({
  useMinutes: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/components/classroom/pedagogical-minutes-modal', () => ({
  PedagogicalMinutesModal: () => null,
}));
vi.mock('@/components/layout/use-current-user', () => ({
  useCurrentUser: () => current.value,
}));

import DashboardPage from '../DashboardPage';

const student = {
  id: 'cuser000001',
  name: 'Aluno Demo',
  email: 'aluno@demo.local',
  role: 'STUDENT',
  enrollment: null,
  avatarUrl: null,
  classId: 'cclass00001',
  sessionId: 'csession0001',
  class: {
    id: 'cclass00001',
    name: '3º Semestre · ADS',
    code: 'ADS-2026-3A',
    semester: 3,
    course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' },
    academicPeriod: { name: '1º Semestre / 2026 (2026.1)', code: '2026.1' },
  },
};

const fetchMock = vi.fn(async () => {
  throw new Error('fetch inesperado');
});

describe('DashboardPage do aluno', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('mostra o período letivo da turma do aluno sem buscar a lista de períodos', () => {
    current.value = { user: student, isLoading: false };
    render(<DashboardPage />);
    expect(screen.getByText('1º Semestre / 2026 (2026.1)')).toBeTruthy();
    expect(screen.getByText('Bem-vindo, Aluno Demo!')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aluno sem turma vê a saudação e nenhum bloco de período', () => {
    current.value = { user: { ...student, classId: null, class: null }, isLoading: false };
    render(<DashboardPage />);
    expect(screen.getByText('Bem-vindo, Aluno Demo!')).toBeTruthy();
    expect(screen.queryByText(/Período letivo/)).toBeNull();
    expect(screen.queryByText(/2026\.1/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enquanto carrega o usuário não mostra período nem fallback', () => {
    current.value = { user: null, isLoading: true };
    render(<DashboardPage />);
    expect(screen.getByText('Bem-vindo!')).toBeTruthy();
    expect(screen.queryByText(/Período letivo/)).toBeNull();
    expect(screen.queryByText(/2026\.1/)).toBeNull();
  });
});
