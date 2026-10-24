// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { API_ROUTES } from '@/lib/constants/routes';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

import { PeriodCreateInlineModal } from '../PeriodCreateInlineModal';

describe('PeriodCreateInlineModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('cadastra o período com POST e devolve o período criado', async () => {
    const period = { id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, period }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(<PeriodCreateInlineModal open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('Nome do Período *'), { target: { value: '2º Semestre / 2026 (2026.2)' } });
    fireEvent.change(screen.getByLabelText('Código / Sigla *'), { target: { value: '2026.2' } });
    fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(period));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(API_ROUTES.ACADEMIC_PERIODS);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, type: 'SEMESTER', semester: 2,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mostra o erro da API e não chama onCreated', async () => {
    const message = 'Já existe um período letivo com o código 2026.2.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: message }), { status: 409 })));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(<PeriodCreateInlineModal open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('Nome do Período *'), { target: { value: 'Período X' } });
    fireEvent.change(screen.getByLabelText('Código / Sigla *'), { target: { value: '2026.2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
