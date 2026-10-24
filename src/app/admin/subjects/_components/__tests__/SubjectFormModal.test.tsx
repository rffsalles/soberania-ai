// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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

import { SubjectFormModal, type OfferingItem } from '../SubjectFormModal';
import type { ClassOption } from '../../../classes/_components/ClassFormModal';
import type { Teacher } from '../TeacherCreateModal';

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}
function bodyOf(fetchMock: ReturnType<typeof routeFetch>, method: string) {
  const call = fetchMock.mock.calls.find(
    (c) => c[0] === '/api/v1/admin/subjects' && (c[1] as RequestInit | undefined)?.method === method,
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined;
}

const ads = { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' };
const em = { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' };
const p1 = { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 };
const classes: ClassOption[] = [
  { id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, courseId: ads.id, academicPeriodId: p1.id, course: ads, academicPeriod: p1 },
  { id: 'cclass00002', name: '1º Ano · EM', code: 'EM-2026-1A', semester: 1, courseId: em.id, academicPeriodId: p1.id, course: em, academicPeriod: p1 },
];
const bd = { id: 'cdiscip0001', courseId: ads.id, code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 };
const mat = { id: 'cdiscip0002', courseId: em.id, code: 'MAT1', name: 'Matemática I', workloadHours: 120 };
const ana: Teacher = { id: 'cteacher001', name: 'Profa. Ana', email: 'ana@x.br', enrollment: 'P001' };

const discRoutes = {
  'GET /api/v1/admin/disciplines?courseId=ccourse00001': { success: true, disciplines: [bd, mat] },
  'GET /api/v1/admin/disciplines?courseId=ccourse00002': { success: true, disciplines: [mat] },
};

const editing: OfferingItem = {
  id: 'csubject001',
  discipline: bd,
  class: { ...classes[0] },
  teacherAssignments: [{ teacher: ana }],
  teachingPlans: [],
};

function Harness({ editingSubject = null, onSuccess, onOpenChange, onRequestCreateClass }: {
  editingSubject?: OfferingItem | null; onSuccess: () => void; onOpenChange: (o: boolean) => void; onRequestCreateClass?: () => void;
}) {
  const [classId, setClassId] = React.useState<string | null>(null);
  const [teachers, setTeachers] = React.useState<string[]>([]);
  return (
    <SubjectFormModal
      open
      onOpenChange={onOpenChange}
      editingSubject={editingSubject}
      teachers={[ana]}
      classes={classes}
      selectedTeachers={teachers}
      setSelectedTeachers={setTeachers}
      selectedClassId={classId}
      setSelectedClassId={setClassId}
      onSuccess={onSuccess}
      onRequestCreateTeacher={vi.fn()}
      onRequestCreateClass={onRequestCreateClass ?? vi.fn()}
    />
  );
}

function setup(handlers: Record<string, unknown> = {}, editingSubject: OfferingItem | null = null, onRequestCreateClass?: () => void) {
  const fetchMock = routeFetch({ ...discRoutes, ...handlers });
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(<Harness editingSubject={editingSubject} onSuccess={onSuccess} onOpenChange={onOpenChange} onRequestCreateClass={onRequestCreateClass} />);
  return { fetchMock, onSuccess, onOpenChange, ...utils };
}

const opts = (label: string) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);
const val = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;

async function pickClassAndDiscipline() {
  fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'cclass00001' } });
  await waitFor(() => expect(opts('Disciplina')).toContain('BD101 · Banco de Dados I | 80 h'));
  fireEvent.change(screen.getByLabelText('Disciplina'), { target: { value: 'cdiscip0001' } });
}

describe('SubjectFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lista as turmas com curso e período, sem "Sem turma"', () => {
    setup();
    expect(screen.getByText('Nova oferta')).toBeTruthy();
    expect(opts('Turma')).toEqual(['—', '3º Semestre · ADS | ADS · 2026.1', '1º Ano · EM | EM · 2026.1']);
    expect(screen.queryByLabelText('Nome da Disciplina')).toBeNull();
    expect(screen.queryByLabelText('Nível acadêmico')).toBeNull();
    expect(screen.queryByLabelText('Curso')).toBeNull();
  });

  it('Disciplina fica desabilitada até escolher a turma', () => {
    const { fetchMock } = setup();
    expect((screen.getByLabelText('Disciplina') as HTMLSelectElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lista só disciplinas do curso da turma', async () => {
    const { fetchMock } = setup();
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'cclass00001' } });
    await waitFor(() => expect(opts('Disciplina')).toEqual(['—', 'BD101 · Banco de Dados I | 80 h']));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/disciplines?courseId=ccourse00001');
    expect((screen.getByLabelText('Disciplina') as HTMLSelectElement).disabled).toBe(false);
  });

  it('trocar a turma limpa a disciplina e recarrega pelo curso novo', async () => {
    const { fetchMock } = setup();
    await pickClassAndDiscipline();
    expect(val('Disciplina')).toBe('cdiscip0001');
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'cclass00002' } });
    expect(val('Disciplina')).toBe('');
    await waitFor(() => expect(opts('Disciplina')).toEqual(['—', 'MAT1 · Matemática I | 120 h']));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/disciplines?courseId=ccourse00002');
  });

  it('cria com POST { classId, disciplineId, teacherIds } e avisa a página sem dados', async () => {
    const { fetchMock, onSuccess, onOpenChange } = setup({
      'POST /api/v1/admin/subjects': { success: true, subject: { id: 'csubject001', teacherAssignments: [] } },
    });
    await pickClassAndDiscipline();
    fireEvent.click(screen.getByText('Salvar oferta'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith());
    expect(bodyOf(fetchMock, 'POST')).toEqual({ classId: 'cclass00001', disciplineId: 'cdiscip0001', teacherIds: [] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sem disciplina mostra "Selecione a disciplina" e sem turma "Selecione a turma", sem enviar', async () => {
    const { fetchMock } = setup();
    fireEvent.click(screen.getByText('Salvar oferta'));
    expect((await screen.findByRole('alert')).textContent).toBe('Selecione a turma');
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'cclass00001' } });
    await waitFor(() => expect(opts('Disciplina')).toHaveLength(2));
    fireEvent.click(screen.getByText('Salvar oferta'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Selecione a disciplina'));
    expect(bodyOf(fetchMock, 'POST')).toBeUndefined();
  });

  it('oferta duplicada mostra o 409 e mantém as escolhas', async () => {
    const { onSuccess } = setup({
      'POST /api/v1/admin/subjects': { success: false, error: 'Esta disciplina já é ofertada nesta turma.' },
    });
    await pickClassAndDiscipline();
    fireEvent.click(screen.getByText('Salvar oferta'));
    expect((await screen.findByRole('alert')).textContent).toBe('Esta disciplina já é ofertada nesta turma.');
    expect(val('Turma')).toBe('cclass00001');
    expect(val('Disciplina')).toBe('cdiscip0001');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('mostra erro de conexão quando o fetch falha', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') throw new Error('rede');
      return new Response(JSON.stringify(discRoutes[`GET ${url}` as keyof typeof discRoutes]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness onSuccess={vi.fn()} onOpenChange={vi.fn()} />);
    await pickClassAndDiscipline();
    fireEvent.click(screen.getByText('Salvar oferta'));
    expect((await screen.findByRole('alert')).textContent).toBe('Erro ao conectar com servidor.');
  });

  it('em edição só professores mudam e o PUT envia { id, teacherIds }', async () => {
    const { fetchMock, onSuccess } = setup(
      { 'PUT /api/v1/admin/subjects': { success: true, subject: { id: 'csubject001', teacherAssignments: [] } } },
      editing,
    );
    expect(screen.getByText('Editar oferta')).toBeTruthy();
    const turma = screen.getByLabelText('Turma') as HTMLSelectElement;
    expect(turma.value).toBe('cclass00001');
    expect(turma.disabled).toBe(true);
    const disc = screen.getByLabelText('Disciplina') as HTMLSelectElement;
    expect(disc.value).toBe('cdiscip0001');
    expect(disc.disabled).toBe(true);
    expect(opts('Disciplina')).toContain('BD101 · Banco de Dados I | 80 h');
    expect(screen.queryByText('+ Nova turma...')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Atualizar oferta'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(bodyOf(fetchMock, 'PUT')).toEqual({ id: 'csubject001', teacherIds: ['cteacher001'] });
  });

  it('"+ Nova turma..." chama onRequestCreateClass', () => {
    const onRequestCreateClass = vi.fn();
    setup({}, null, onRequestCreateClass);
    fireEvent.click(screen.getByText('+ Nova turma...'));
    expect(onRequestCreateClass).toHaveBeenCalledTimes(1);
  });

  it('limpa o erro ao reabrir em outra oferta', async () => {
    const fetchMock = routeFetch({ ...discRoutes });
    vi.stubGlobal('fetch', fetchMock);
    const props = {
      open: true, onOpenChange: vi.fn(), editingSubject: null, teachers: [ana], classes,
      selectedTeachers: [], setSelectedTeachers: vi.fn(), selectedClassId: null, setSelectedClassId: vi.fn(),
      onSuccess: vi.fn(), onRequestCreateTeacher: vi.fn(), onRequestCreateClass: vi.fn(),
    };
    const { rerender } = render(<SubjectFormModal {...props} />);
    fireEvent.click(screen.getByText('Salvar oferta'));
    await screen.findByRole('alert');
    rerender(<SubjectFormModal {...props} editingSubject={editing} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
