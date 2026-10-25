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
    const period = { id: 'cperiod0002', name: '2026.2 · 2º Semestre / 2026', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, period }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(<PeriodCreateInlineModal open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(period));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(API_ROUTES.ACADEMIC_PERIODS);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      code: '2026.2', year: 2026, type: 'SEMESTER', semester: 2,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mostra o erro da API e não chama onCreated', async () => {
    const message = 'Já existe um período letivo com o código 2026.2.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: message }), { status: 409 })));
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(<PeriodCreateInlineModal open onOpenChange={onOpenChange} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('erro de rede mostra mensagem fixa e reabrir limpa o erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede interna'); }));
    const { rerender } = render(<PeriodCreateInlineModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Código / Sigla *'), { target: { value: '2026.2' } });
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    expect((await screen.findByRole('alert')).textContent).toBe('Erro ao conectar com servidor.');
    rerender(<PeriodCreateInlineModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    rerender(<PeriodCreateInlineModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Código / Sigla *') as HTMLInputElement).value).toBe('2026.1');
  });

  it('o código segue ano, tipo e semestre e o nome é pré-visualizado', () => {
    render(<PeriodCreateInlineModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    const code = () => (screen.getByLabelText('Código / Sigla *') as HTMLInputElement).value;
    expect(code()).toBe('2026.1');
    expect(screen.getByTestId('period-name-preview').textContent).toBe('2026.1 · 1º Semestre / 2026');
    fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
    expect(code()).toBe('2026.2');
    fireEvent.change(screen.getByLabelText('Ano Letivo *'), { target: { value: '2027' } });
    expect(code()).toBe('2027.2');
    fireEvent.change(screen.getByLabelText('Regime / Tipo'), { target: { value: 'ANNUAL' } });
    expect(code()).toBe('2027.ANUAL');
    expect(screen.getByTestId('period-name-preview').textContent).toBe('2027.ANUAL · Anual / 2027');
  });

  it('edição manual do código é preservada; limpar retoma a sugestão', () => {
    render(<PeriodCreateInlineModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    const input = screen.getByLabelText('Código / Sigla *') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'minha.sigla' } });
    expect(input.value).toBe('MINHA.SIGLA');
    expect(screen.getByTestId('period-name-preview').textContent).toBe('MINHA.SIGLA · 1º Semestre / 2026');
    fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
    expect(input.value).toBe('MINHA.SIGLA');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('2026.2');
  });

  it('o POST não envia nome', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'x' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PeriodCreateInlineModal open onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
    await screen.findByRole('alert');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty('name');
  });
});
