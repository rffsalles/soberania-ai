// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('@/components/layout/provider-badge', () => ({ ProviderBadge: () => null }));
vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

import AdminClassesPage from '../page';

const existing = {
  id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3,
  courseId: 'ccourse00001', academicPeriodId: 'cperiod0001',
  course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 },
  _count: { students: 1, subjects: 1 },
};

describe('AdminClassesPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('mostra curso, período letivo e posição da turma', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/v1/admin/classes') return new Response(JSON.stringify({ success: true, classes: [existing] }), { status: 200 });
      throw new Error(`fetch inesperado: ${url}`);
    }));
    render(<AdminClassesPage />);
    await screen.findByText('3º Semestre · ADS');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Nome', 'Código', 'Curso', 'Período', 'Posição', 'Alunos', 'Ofertas', 'Ações'],
    );
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('ADS')).toBeTruthy();
    expect(row.getByText('2026.1')).toBeTruthy();
    expect(row.getByText('3')).toBeTruthy();
  });
});
