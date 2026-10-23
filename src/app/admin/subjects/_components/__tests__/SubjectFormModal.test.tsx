// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

type Item = { id: string; title: string; subtitle?: string; badge?: string };
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ label, items, selectedId, onSelect, addNewLabel, onAddNewClick }: {
    label: string; items: Item[]; selectedId: string | null; onSelect: (id: string) => void; addNewLabel?: string; onAddNewClick?: () => void;
  }) => (
    <div>
      <label htmlFor="combo">{label}</label>
      <select id="combo" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? ` | ${i.subtitle}` : ''}{i.badge ? ` | ${i.badge}` : ''}</option>)}
      </select>
      <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));

import { SubjectFormModal, type SubjectItem } from '../SubjectFormModal';
import type { ClassOption } from '../../../classes/_components/ClassFormModal';

const classes: ClassOption[] = [
  { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof SubjectFormModal>> = {}) {
  const props: React.ComponentProps<typeof SubjectFormModal> = {
    open: true,
    onOpenChange: vi.fn(),
    editingSubject: null,
    teachers: [],
    classes,
    selectedTeachers: [],
    setSelectedTeachers: vi.fn(),
    selectedClassId: null,
    setSelectedClassId: vi.fn(),
    onSuccess: vi.fn(),
    onRequestCreateTeacher: vi.fn(),
    onRequestCreateClass: vi.fn(),
    ...overrides,
  };
  return { ...render(<SubjectFormModal {...props} />), props };
}

describe('SubjectFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lista "Sem turma" e as turmas com ano, semestre e código', () => {
    renderModal();
    const options = Array.from((screen.getByLabelText('Turma') as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(['Sem turma | não aparece para alunos', '3º Semestre · ADS | 2026 · 3º semestre | ADS-2026-3A']);
    expect(screen.getByText('Ano letivo e semestre vêm da turma selecionada.')).toBeTruthy();
  });

  it('"+ Nova turma..." chama onRequestCreateClass', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('+ Nova turma...'));
    expect(props.onRequestCreateClass).toHaveBeenCalledTimes(1);
  });

  it('selecionar uma turma informa o id; "Sem turma" informa null', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'c1' } });
    expect(props.setSelectedClassId).toHaveBeenLastCalledWith('c1');
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: '__none__' } });
    expect(props.setSelectedClassId).toHaveBeenLastCalledWith(null);
  });

  it('envia nível acadêmico e classId null, sem academicYear', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'MT01' } });
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'Ensino Médio' } });
    fireEvent.change(screen.getByLabelText('Nível acadêmico'), { target: { value: 'HIGH_SCHOOL' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ name: 'Matemática', code: 'MT01', courseName: 'Ensino Médio', academicLevel: 'HIGH_SCHOOL', teacherIds: [], classId: null });
    expect(body).not.toHaveProperty('academicYear');
  });

  it('em edição abre com a turma e o nível da disciplina', () => {
    const editing: SubjectItem = {
      id: 's1', name: 'Cálculo', code: 'MAT01', courseName: 'Engenharia', academicLevel: 'HIGHER_EDUCATION',
      academicYear: 2026, classId: 'c1', class: { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A' }, teacherAssignments: [],
    };
    const { props } = renderModal({ editingSubject: editing, selectedClassId: 'c1' });
    expect(props.setSelectedClassId).toHaveBeenCalledWith('c1');
    expect((screen.getByLabelText('Turma') as HTMLSelectElement).value).toBe('c1');
    expect((screen.getByLabelText('Nível acadêmico') as HTMLSelectElement).value).toBe('HIGHER_EDUCATION');
    expect(screen.getByText('Atualizar disciplina')).toBeTruthy();
  });

  it('mantém o que foi digitado quando chega uma turma nova e ela fica selecionada', () => {
    const { rerender, props } = renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    const nova: ClassOption = { id: 'c9', name: 'Turma Nova', code: 'NOVA-2026-1', semester: 1, year: 2026 };
    rerender(<SubjectFormModal {...props} classes={[...classes, nova]} selectedClassId="c9" />);
    expect((screen.getByLabelText('Nome da Disciplina') as HTMLInputElement).value).toBe('Matemática');
    expect((screen.getByLabelText('Turma') as HTMLSelectElement).value).toBe('c9');
  });

  it('mostra erro da API inline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Turma não encontrada.' }), { status: 404 })));
    renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'MT01' } });
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'ADS' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    expect((await screen.findByRole('alert')).textContent).toBe('Turma não encontrada.');
  });
});
