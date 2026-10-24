// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// --- Mocks reutilizáveis (copiar nos testes de outros modais que usam o combobox) ---
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

import { ClassFormModal, type ClassOption } from '../ClassFormModal';

// --- Helper de fetch por "MÉTODO url"; chave não registrada falha o teste ---
function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}
const courses = [
  { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
];
const periods = [{ id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' }];
const lists = { 'GET /api/v1/admin/courses': { success: true, courses }, 'GET /api/v1/academic-periods': { success: true, periods } };
const existing: ClassOption = {
  id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3,
  courseId: 'ccourse00001', academicPeriodId: 'cperiod0001',
  course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 },
  _count: { students: 1, subjects: 1 },
};

const courseOption = 'ADS · Análise e Desenvolvimento de Sistemas';

function setup(opts: { editing?: ClassOption | null; handlers?: Record<string, unknown> } = {}) {
  const fetchMock = routeFetch({ ...lists, ...opts.handlers });
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  const ui = (open: boolean) => (
    <ClassFormModal open={open} editingClass={opts.editing ?? null} onOpenChange={onOpenChange} onSuccess={onSuccess} />
  );
  const utils = render(ui(true));
  return { fetchMock, onSuccess, onOpenChange, ui, ...utils };
}

// Corpo enviado à API de turmas (ignora o POST de período do cadastro inline).
function bodyOf(fetchMock: ReturnType<typeof routeFetch>, method: string) {
  const call = fetchMock.mock.calls.find(
    (c) => c[0] === '/api/v1/admin/classes' && (c[1] as RequestInit | undefined)?.method === method,
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
}

async function waitLists() {
  await screen.findByText(courseOption);
}

function fillBasics(opts: { course?: string; period?: string } = {}) {
  fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: 'Turma Nova' } });
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'EM-2026-2A' } });
  if (opts.course) fireEvent.change(screen.getByLabelText('Curso'), { target: { value: opts.course } });
  if (opts.period) fireEvent.change(screen.getByLabelText('Período letivo'), { target: { value: opts.period } });
  fireEvent.change(screen.getByLabelText('Posição na matriz'), { target: { value: '2' } });
}

describe('ClassFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('carrega cursos e períodos ao abrir, sem campo de ano', async () => {
    setup();
    await waitLists();
    const opts = Array.from((screen.getByLabelText('Curso') as HTMLSelectElement).options).map((o) => o.text);
    expect(opts).toEqual(['Selecione o curso', courseOption, 'EM · Ensino Médio']);
    const periodValues = Array.from((screen.getByLabelText('Período letivo') as HTMLSelectElement).options).map((o) => o.value);
    expect(periodValues).toContain('cperiod0001');
    expect(screen.queryByLabelText('Ano letivo')).toBeNull();
    expect(screen.getByText('Ex.: 3 para 3º semestre ou 3º ano')).toBeTruthy();
    expect(screen.getByLabelText('Posição na matriz')).toBeTruthy();
  });

  it('cria com POST enviando curso, período e posição, sem year', async () => {
    const created = { ...existing, id: 'cclass00009' };
    const { fetchMock, onSuccess, onOpenChange } = setup({ handlers: { 'POST /api/v1/admin/classes': { success: true, class: created } } });
    await waitLists();
    fillBasics({ course: 'ccourse00002', period: 'cperiod0001' });
    fireEvent.click(screen.getByText('Salvar turma'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created));
    expect(bodyOf(fetchMock, 'POST')).toEqual({
      name: 'Turma Nova', code: 'EM-2026-2A', courseId: 'ccourse00002', academicPeriodId: 'cperiod0001', semester: 2,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('em edição o PUT sempre envia id, curso, período e posição', async () => {
    const { fetchMock, onSuccess } = setup({
      editing: existing,
      handlers: { 'PUT /api/v1/admin/classes': { success: true, class: existing } },
    });
    await waitLists();
    fireEvent.click(screen.getByText('Atualizar turma'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 'PUT')).toEqual({
      id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A',
      courseId: 'ccourse00001', academicPeriodId: 'cperiod0001', semester: 3,
    });
  });

  it('sem curso mostra "Selecione o curso" e não envia', async () => {
    const { fetchMock } = setup();
    await waitLists();
    fillBasics({ period: 'cperiod0001' });
    fireEvent.click(screen.getByText('Salvar turma'));
    expect((await screen.findByRole('alert')).textContent).toBe('Selecione o curso');
    expect(bodyOf(fetchMock, 'POST')).toBeUndefined();
  });

  it('sem período mostra "Selecione o período letivo" e não envia', async () => {
    const { fetchMock } = setup();
    await waitLists();
    fillBasics({ course: 'ccourse00001' });
    fireEvent.click(screen.getByText('Salvar turma'));
    expect((await screen.findByRole('alert')).textContent).toBe('Selecione o período letivo');
    expect(bodyOf(fetchMock, 'POST')).toBeUndefined();
  });

  it('"Cadastrar novo período..." abre o cadastro e seleciona o período criado', async () => {
    const newPeriod = { id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' };
    const { fetchMock, onSuccess } = setup({
      handlers: {
        'POST /api/v1/academic-periods': { success: true, period: newPeriod },
        'POST /api/v1/admin/classes': { success: true, class: { ...existing, id: 'cclass00009' } },
      },
    });
    await waitLists();
    fireEvent.click(screen.getByText('Cadastrar novo período...'));
    fireEvent.change(screen.getByLabelText('Nome do Período *'), { target: { value: newPeriod.name } });
    fireEvent.change(screen.getByLabelText('Código / Sigla *'), { target: { value: '2026.2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    await waitFor(() => expect((screen.getByLabelText('Período letivo') as HTMLSelectElement).value).toBe('cperiod0002'));
    expect(onSuccess).not.toHaveBeenCalled();
    fillBasics({ course: 'ccourse00002' });
    fireEvent.click(screen.getByText('Salvar turma'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 'POST')).toMatchObject({ academicPeriodId: 'cperiod0002' });
  });

  async function provoke409() {
    const message = 'A turma tem ofertas; não é possível trocar o curso.';
    const ctx = setup({
      editing: existing,
      handlers: { 'PUT /api/v1/admin/classes': { success: false, error: message } },
    });
    await waitLists();
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'ccourse00002' } });
    fireEvent.click(screen.getByText('Atualizar turma'));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    return ctx;
  }

  it('mostra o 409 ao trocar o curso de turma com ofertas', async () => {
    const { onSuccess, onOpenChange } = await provoke409();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('limpa o erro ao reabrir', async () => {
    const { rerender, ui } = await provoke409();
    rerender(ui(false));
    rerender(ui(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
