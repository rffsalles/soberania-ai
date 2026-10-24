// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

import { CourseFormModal, type CourseOption } from '../CourseFormModal';

function fetchOk(body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));
}
const bodyOf = (fetchMock: ReturnType<typeof fetchOk>) =>
  JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

const existing: CourseOption = { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' };

function setup(body: unknown, editing: CourseOption | null = null) {
  const fetchMock = fetchOk(body);
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  const onOpenChange = vi.fn();
  const ui = (open: boolean) => (
    <CourseFormModal open={open} onOpenChange={onOpenChange} editingCourse={editing} onSuccess={onSuccess} />
  );
  const { rerender } = render(ui(true));
  return { fetchMock, onSuccess, onOpenChange, rerender, ui };
}

describe('CourseFormModal', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('cria o curso com POST enviando nome, código e nível', async () => {
    const { fetchMock, onSuccess, onOpenChange } = setup({ success: true, course: { id: 'x' } });
    expect(screen.getByText('Novo curso')).toBeTruthy();
    const select = screen.getByLabelText('Nível acadêmico') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      'Ensino Superior', 'Ensino Médio', 'Ensino Fundamental',
    ]);
    expect(select.value).toBe('HIGHER_EDUCATION');
    fireEvent.change(screen.getByLabelText('Nome do curso'), { target: { value: 'Ensino Médio' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'EM' } });
    fireEvent.change(select, { target: { value: 'HIGH_SCHOOL' } });
    fireEvent.click(screen.getByText('Salvar curso'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/admin/courses');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(bodyOf(fetchMock)).toEqual({ name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('em edição o PUT sempre envia o nível acadêmico', async () => {
    const { fetchMock, onSuccess } = setup({ success: true, course: existing }, existing);
    expect(screen.getByText('Editar curso')).toBeTruthy();
    expect((screen.getByLabelText('Nível acadêmico') as HTMLSelectElement).value).toBe('HIGH_SCHOOL');
    fireEvent.click(screen.getByText('Atualizar curso'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(bodyOf(fetchMock)).toEqual({ id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' });
  });

  async function provoke409() {
    const message = 'Já existe um curso com este código.';
    const ctx = setup({ success: false, error: message }, existing);
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ADS' } });
    fireEvent.click(screen.getByText('Atualizar curso'));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    return ctx;
  }

  it('mostra o erro da API e mantém o modal aberto', async () => {
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
