// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { offeringADS, offeringEM, LABEL_ADS } from './fixtures';
import { DEFAULT_NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';

const nav = vi.hoisted(() => ({ id: null as string | null, push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.id ? { id: nav.id } : {}),
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
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? `${" | "}${i.subtitle}` : ''}</option>)}
      </select>
      {addNewLabel && <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>}
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock('@/components/layout/provider-badge', () => ({ ProviderBadge: () => null }));
vi.mock('@/components/layout/use-appliance-status', () => ({ useApplianceStatus: () => null }));

const modal = vi.hoisted(() => ({ refs: null as unknown[] | null }));
const REF = { id: 'cdoc0000001', title: 'Sistemas de Banco de Dados', author: 'Elmasri', category: 'Banco de Dados' };
vi.mock('../ReferenceSelectionModal', () => ({
  ReferenceSelectionModal: ({ onAddReferences }: { onAddReferences: (refs: unknown[]) => void }) => (
    <button type="button" onClick={() => onAddReferences(modal.refs ?? [REF])}>Adicionar referência (mock)</button>
  ),
}));

import TeachingPlanNewPage from '../TeachingPlanNewPage';

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}

let fetchMock: ReturnType<typeof routeFetch>;
function stubFetch(handlers: Record<string, unknown>) {
  fetchMock = routeFetch(handlers);
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.id = null;
  modal.refs = null;
  nav.push.mockReset();
});

const subjectsOk = (list: unknown[]) => ({ 'GET /api/v1/admin/subjects': { success: true, subjects: list } });
const bodyOf = (method: string, url: string) => {
  const call = fetchMock.mock.calls.find(([u, init]) => u === url && (init?.method ?? 'GET') === method);
  return JSON.parse(String(call![1]!.body));
};
const total = () => (screen.getByLabelText('Carga Horária Total (horas)') as HTMLInputElement).value;
const setHours = (theory: string, practice: string) => {
  fireEvent.change(screen.getByLabelText('Teoria (h)'), { target: { value: theory } });
  fireEvent.change(screen.getByLabelText('Prática / Lab (h)'), { target: { value: practice } });
};
const SUM_MSG = (n: number) => `A soma das horas teóricas e práticas deve ser igual à carga horária da disciplina (${n}h).`;
const pick = (id: string) => fireEvent.change(screen.getByLabelText('Oferta *'), { target: { value: id } });

describe('TeachingPlanNewPage', () => {
  it('plano novo lista só as ofertas devolvidas pela API e não busca períodos', async () => {
    stubFetch(subjectsOk([offeringADS]));
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    expect((screen.getByLabelText('Oferta *') as HTMLSelectElement).options).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('academic-periods'))).toBe(false);
    expect(screen.queryByText('Cadastrar novo período letivo...')).toBeNull();
    expect(total()).toBe('—');
  });

  it('escolher a oferta mostra a carga da matriz; POST não envia totalHours nem academicPeriodId', async () => {
    stubFetch({ ...subjectsOk([offeringADS]), 'POST /api/v1/teacher/plans': { success: true, plan: { id: 'cplan000009' } } });
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    pick('csubject0001');
    expect(total()).toBe('80');
    expect((screen.getByLabelText('Carga Horária Total (horas)') as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText('Teoria (h)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Prática / Lab (h)') as HTMLInputElement).value).toBe('');
    setHours('60', '20');
    fireEvent.click(screen.getByText('Salvar Rascunho'));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/teacher/plans'));
    const body = bodyOf('POST', '/api/v1/teacher/plans');
    expect(body).toEqual({
      subjectId: 'csubject0001', syllabus: '', generalObjectives: '', methodology: '', basicBibliography: [],
      theoryHours: 60, practiceHours: 20, ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS, status: 'DRAFT',
    });
  });

  it('soma divergente mostra a mensagem inline e bloqueia o salvar', async () => {
    stubFetch(subjectsOk([offeringADS]));
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    pick('csubject0001');
    setHours('60', '10');
    expect(screen.getByText(SUM_MSG(80))).toBeTruthy();
    expect((screen.getByText('Salvar Rascunho').closest('button') as HTMLButtonElement).disabled).toBe(true);
    setHours('60', '20');
    expect(screen.queryByText(SUM_MSG(80))).toBeNull();
    expect((screen.getByText('Salvar Rascunho').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('trocar de oferta atualiza o total exibido', async () => {
    stubFetch(subjectsOk([offeringADS, offeringEM]));
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    pick('csubject0001');
    expect(total()).toBe('80');
    pick('csubject0002');
    expect(total()).toBe('60');
    pick('csubject0001');
    expect(total()).toBe('80');
  });

  it('a IA só destrava com oferta e referência e gera com { subjectId, selectedReferences }', async () => {
    stubFetch({
      ...subjectsOk([offeringADS]),
      'POST /api/v1/teacher/plans/generate': {
        success: true,
        data: { syllabus: 'Ementa gerada', generalObjectives: '', bloomLevels: [], methodology: '', citations: [] },
      },
    });
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    expect(screen.getByText('IA Bloqueada (Preencha Requisitos)')).toBeTruthy();
    expect(screen.getByText('Selecione uma oferta.')).toBeTruthy();
    pick('csubject0001');
    expect(screen.getByText('Adicione ao menos 1 documento na biblioteca RAG.')).toBeTruthy();
    fireEvent.click(screen.getByText('Adicionar referência (mock)'));
    fireEvent.click(screen.getByText('IA Socrática: Gerar Sugestão Ementa'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/v1/teacher/plans/generate')).toBe(true));
    expect(bodyOf('POST', '/api/v1/teacher/plans/generate')).toEqual({ subjectId: 'csubject0001', selectedReferences: [REF] });
  });

  it('plano salvo reabre com a oferta, o cartão e as horas salvas; PUT sem subjectId nem academicPeriodId', async () => {
    nav.id = 'cplan000001';
    stubFetch({
      ...subjectsOk([offeringEM]),
      'GET /api/v1/teacher/plans/cplan000001': {
        success: true,
        plan: {
          id: 'cplan000001', subjectId: 'csubject0001', subject: offeringADS, syllabus: 'Ementa salva',
          generalObjectives: '', methodology: '', basicBibliography: [], theoryHours: 50,
          practiceHours: 30, ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS, status: 'DRAFT',
        },
      },
      'PUT /api/v1/teacher/plans/cplan000001': { success: true, plan: { id: 'cplan000001' } },
    });
    render(<TeachingPlanNewPage />);
    await waitFor(() => {
      const select = screen.getByLabelText('Oferta *') as HTMLSelectElement;
      expect(select.value).toBe('csubject0001');
      expect(select.disabled).toBe(true);
    });
    expect(screen.getByText('Contexto da oferta')).toBeTruthy();
    expect(screen.getByText('80h')).toBeTruthy();
    expect(total()).toBe('80');
    expect((screen.getByLabelText('Teoria (h)') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Prática / Lab (h)') as HTMLInputElement).value).toBe('30');
    fireEvent.click(screen.getByText('Salvar Rascunho'));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/teacher/plans'));
    const body = bodyOf('PUT', '/api/v1/teacher/plans/cplan000001');
    expect(body).not.toHaveProperty('subjectId');
    expect(body).not.toHaveProperty('academicPeriodId');
    expect(body).not.toHaveProperty('totalHours');
    expect(body).toMatchObject({ theoryHours: 50, practiceHours: 30 });
  });

  const REF2 = { id: 'cdoc0000002', title: 'Engenharia de Software', author: 'Sommerville', category: 'Engenharia' };
  const libraryOk = { 'GET /api/v1/library/documents': { success: true, documents: [REF, REF2] } };
  const savedPlan = (extra: Record<string, unknown>) => ({
    success: true,
    plan: {
      id: 'cplan000001', subjectId: 'csubject0001', subject: offeringADS, syllabus: '', generalObjectives: '',
      methodology: '', basicBibliography: [], complementaryBiblio: [], theoryHours: 50, practiceHours: 30,
      ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS, status: 'DRAFT', ...extra,
    },
  });

  it('salvar envia references com materialId e kind, e separa básica de complementar', async () => {
    modal.refs = [REF, { ...REF2, kind: 'COMPLEMENTARY' }];
    stubFetch({ ...subjectsOk([offeringADS]), 'POST /api/v1/teacher/plans': { success: true, plan: { id: 'cplan000009' } } });
    render(<TeachingPlanNewPage />);
    await screen.findByText(`${LABEL_ADS} | 3º Semestre · ADS`);
    pick('csubject0001');
    setHours('60', '20');
    fireEvent.click(screen.getByText('Adicionar referência (mock)'));
    fireEvent.click(screen.getByText('Salvar Rascunho'));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/teacher/plans'));
    const body = bodyOf('POST', '/api/v1/teacher/plans');
    expect(body.basicBibliography).toEqual(['Sistemas de Banco de Dados (Elmasri) [Banco de Dados]']);
    expect(body.complementaryBiblio).toEqual(['Engenharia de Software (Sommerville) [Engenharia]']);
    expect(body.references).toEqual([
      { materialId: 'cdoc0000001', kind: 'BASIC' },
      { materialId: 'cdoc0000002', kind: 'COMPLEMENTARY' },
    ]);
  });

  it('plano com references reabre pelos ids, sem casar por título', async () => {
    nav.id = 'cplan000001';
    stubFetch({
      ...subjectsOk([offeringADS]), ...libraryOk,
      'GET /api/v1/teacher/plans/cplan000001': savedPlan({
        basicBibliography: ['Título antigo qualquer (Fulano) [Outra]'],
        references: [{ materialId: 'cdoc0000001', kind: 'BASIC' }, { materialId: 'cdocsumiu001', kind: 'BASIC' }],
      }),
    });
    render(<TeachingPlanNewPage />);
    await screen.findByText('Sistemas de Banco de Dados');
    expect(screen.queryByText('Título antigo qualquer')).toBeNull();
    expect(screen.getByText('1 material(is) no RAG')).toBeTruthy();
  });

  it('plano antigo sem references cai no casamento por título', async () => {
    nav.id = 'cplan000001';
    stubFetch({
      ...subjectsOk([offeringADS]), ...libraryOk,
      'GET /api/v1/teacher/plans/cplan000001': savedPlan({
        basicBibliography: ['Sistemas de Banco de Dados (Elmasri) [Banco de Dados]'],
        complementaryBiblio: ['Engenharia de Software (Sommerville) [Engenharia]'],
      }),
    });
    render(<TeachingPlanNewPage />);
    await screen.findByText('Engenharia de Software');
    expect(screen.getByText('Sistemas de Banco de Dados')).toBeTruthy();
    expect(screen.getByText('Complementar')).toBeTruthy();
  });
});
