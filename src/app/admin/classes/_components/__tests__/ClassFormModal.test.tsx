// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

import { ClassFormModal, type ClassOption } from '../ClassFormModal';

const existing: ClassOption = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 };

function fetchOk(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe('ClassFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('cria a turma com POST e devolve a turma criada', async () => {
    const created = { id: 'c9', name: 'Turma Nova', code: 'NOVA-2026-1', semester: 2, year: 2027 };
    const fetchMock = fetchOk({ success: true, class: created });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<ClassFormModal open editingClass={null} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    expect(screen.getByText('Nova turma')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: 'Turma Nova' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'NOVA-2026-1' } });
    fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2027' } });
    fireEvent.change(screen.getByLabelText('Semestre'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Salvar turma'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/classes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Turma Nova', code: 'NOVA-2026-1', year: 2027, semester: 2 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('em edição preenche os campos e envia PUT com id', async () => {
    const fetchMock = fetchOk({ success: true, class: existing });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClassFormModal open editingClass={existing} onOpenChange={() => {}} onSuccess={() => {}} />);
    expect(screen.getByText('Editar turma')).toBeTruthy();
    expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('ADS-2026-3A');
    expect((screen.getByLabelText('Semestre') as HTMLSelectElement).value).toBe('3');
    fireEvent.click(screen.getByText('Atualizar turma'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toMatchObject({ id: 'c1', code: 'ADS-2026-3A', year: 2026, semester: 3 });
  });

  it('mostra o erro da API inline e mantém o modal aberto', async () => {
    vi.stubGlobal('fetch', fetchOk({ success: false, error: 'Já existe uma turma com este código.' }));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<ClassFormModal open editingClass={null} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: 'Turma' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ADS-2026-3A' } });
    fireEvent.click(screen.getByText('Salvar turma'));
    expect((await screen.findByRole('alert')).textContent).toBe('Já existe uma turma com este código.');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
