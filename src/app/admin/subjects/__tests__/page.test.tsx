// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/components/layout/provider-badge', () => ({ ProviderBadge: () => null }));
vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

type Item = { id: string; title: string; subtitle?: string; badge?: string };
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ id, label, items, selectedId, onSelect, disabled, addNewLabel, onAddNewClick }: {
    id?: string; label?: string; items: Item[]; selectedId: string | null; onSelect: (id: string) => void;
    disabled?: boolean; addNewLabel?: string; onAddNewClick?: () => void;
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} disabled={disabled} value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="">—</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? ` | ${i.subtitle}` : ''}</option>)}
      </select>
      {addNewLabel && <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>}
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));

import AdminSubjectsPage from '../page';

const ads = { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' };
const p1 = { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 };
const klass = { id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, courseId: ads.id, academicPeriodId: p1.id, course: ads, academicPeriod: p1 };
const ana = { id: 'cteacher001', name: 'Profa. Ana', email: 'ana@x.br', enrollment: 'P001' };
const offering = {
  id: 'csubject001',
  discipline: { id: 'cdiscip0001', code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 },
  class: klass,
  teacherAssignments: [{ teacher: ana }],
  teachingPlans: [{ id: 'cplan000001', status: 'DRAFT' }],
};

function setup() {
  const handlers: Record<string, unknown> = {
    'GET /api/v1/admin/subjects': { success: true, subjects: [offering] },
    'GET /api/v1/admin/teachers': { success: true, teachers: [ana] },
    'GET /api/v1/admin/classes': { success: true, classes: [klass] },
    'PUT /api/v1/admin/subjects': { success: true, subject: { id: 'csubject001', teacherAssignments: [] } },
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminSubjectsPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lista disciplina, turma, curso, período, professores e planos', async () => {
    setup();
    render(<AdminSubjectsPage />);
    await screen.findByText('BD101 · Banco de Dados I');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Disciplina', 'Turma', 'Curso', 'Período', 'Professores', 'Planos', 'Ações']);
    const row = within(screen.getAllByRole('row')[1]);
    for (const t of ['BD101 · Banco de Dados I', '3º Semestre · ADS', 'ADS', '2026.1', 'Profa. Ana', '1']) {
      expect(row.getByText(t)).toBeTruthy();
    }
    expect(screen.queryByText('Nível Acadêmico')).toBeNull();
    expect(screen.getByRole('button', { name: /Nova oferta/ })).toBeTruthy();
    expect(screen.getByText('Ofertas sem professor')).toBeTruthy();
  });

  it('Editar abre a oferta e, ao salvar, recarrega a lista', async () => {
    const fetchMock = setup();
    render(<AdminSubjectsPage />);
    await screen.findByText('BD101 · Banco de Dados I');
    const editar = screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement;
    expect(editar.disabled).toBe(false);
    fireEvent.click(editar);
    expect(screen.getByText('Editar oferta')).toBeTruthy();
    fireEvent.click(screen.getByText('Atualizar oferta'));
    const gets = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/v1/admin/subjects' && !(c[1] as RequestInit | undefined)?.method).length;
    await waitFor(() => expect(gets()).toBe(2));
  });
});
