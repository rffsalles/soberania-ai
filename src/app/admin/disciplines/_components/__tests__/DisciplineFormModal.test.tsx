// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

import { DisciplineFormModal, type DisciplineOption } from '../DisciplineFormModal';
import type { CourseOption } from '@/app/admin/courses/_components/CourseFormModal';

function fetchOk(body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
}
const bodyOf = (fetchMock: ReturnType<typeof fetchOk>) =>
  JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

const courses: CourseOption[] = [
  { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
];

const editing: DisciplineOption = {
  id: 'cdiscip0001',
  courseId: 'ccourse00001',
  code: 'BD101',
  name: 'Banco de Dados I',
  description: null,
  workloadHours: 80,
  course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' },
};

function setup(
  body: unknown,
  opts: { editingDiscipline?: DisciplineOption | null; defaultCourseId?: string | null } = {}
) {
  const fetchMock = fetchOk(body);
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  const ui = (open: boolean) => (
    <DisciplineFormModal
      open={open}
      onOpenChange={onOpenChange}
      editingDiscipline={opts.editingDiscipline ?? null}
      courses={courses}
      defaultCourseId={opts.defaultCourseId ?? null}
      onSuccess={onSuccess}
    />
  );
  const { rerender } = render(ui(true));
  return { fetchMock, onSuccess, onOpenChange, rerender, ui };
}

describe('DisciplineFormModal', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('pré-seleciona o curso do filtro ativo', () => {
    setup({ success: true }, { defaultCourseId: 'ccourse00002' });
    const select = screen.getByLabelText('Curso') as HTMLSelectElement;
    expect(select.value).toBe('ccourse00002');
    expect(select.disabled).toBe(false);
    cleanup();
    setup({ success: true }, { defaultCourseId: null });
    expect((screen.getByLabelText('Curso') as HTMLSelectElement).value).toBe('');
  });

  it('cria com POST enviando curso, código, nome, carga horária numérica e descrição', async () => {
    const { fetchMock, onSuccess } = setup({ success: true, discipline: { id: 'x' } });
    expect(screen.getByText('Nova disciplina')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'ccourse00001' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'BD101' } });
    fireEvent.change(screen.getByLabelText('Nome da disciplina'), { target: { value: 'Banco de Dados I' } });
    fireEvent.change(screen.getByLabelText('Carga horária (h)'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/admin/disciplines');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({
      courseId: 'ccourse00001',
      code: 'BD101',
      name: 'Banco de Dados I',
      workloadHours: 80,
      description: '',
    });
  });

  it('sem curso mostra "Selecione o curso" e não envia', async () => {
    const { fetchMock } = setup({ success: true });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'BD101' } });
    fireEvent.change(screen.getByLabelText('Nome da disciplina'), { target: { value: 'Banco de Dados I' } });
    fireEvent.change(screen.getByLabelText('Carga horária (h)'), { target: { value: '80' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    expect((await screen.findByRole('alert')).textContent).toBe('Selecione o curso');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('em edição o curso fica desabilitado e o PUT não envia courseId', async () => {
    const { fetchMock, onSuccess } = setup({ success: true }, { editingDiscipline: editing });
    expect(screen.getByText('Editar disciplina')).toBeTruthy();
    const select = screen.getByLabelText('Curso') as HTMLSelectElement;
    expect(select.value).toBe('ccourse00001');
    expect(select.disabled).toBe(true);
    expect((screen.getByLabelText('Carga horária (h)') as HTMLInputElement).value).toBe('80');
    fireEvent.click(screen.getByText('Atualizar disciplina'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(bodyOf(fetchMock)).toEqual({
      id: 'cdiscip0001',
      code: 'BD101',
      name: 'Banco de Dados I',
      workloadHours: 80,
      description: '',
    });
  });

  it('mostra o 409 da API e limpa ao reabrir', async () => {
    const message = 'Já existe uma disciplina com este código neste curso.';
    const { onSuccess, onOpenChange, rerender, ui } = setup(
      { success: false, error: message },
      { editingDiscipline: editing }
    );
    fireEvent.click(screen.getByText('Atualizar disciplina'));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    rerender(ui(false));
    rerender(ui(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
