// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

import { StudentFormModal } from '../StudentFormModal';

function fill(password = 'senha1234') {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@x.br' } });
  fireEvent.change(screen.getByLabelText('Matrícula'), { target: { value: 'A001' } });
  fireEvent.change(screen.getByLabelText('Senha inicial'), { target: { value: password } });
}

function setup(fetchImpl: () => Promise<Response> | Response) {
  const fn = vi.fn(async () => fetchImpl());
  vi.stubGlobal('fetch', fn);
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<StudentFormModal open onOpenChange={onOpenChange} classId="cclass00001" onSuccess={onSuccess} />);
  return { fn, onOpenChange, onSuccess };
}

describe('StudentFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('bloqueia senha curta no cliente', async () => {
    const { fn } = setup(() => new Response('{}'));
    fill('curta');
    fireEvent.submit(screen.getByLabelText('Nome completo').closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('A senha deve ter no mínimo 8 caracteres.');
    expect(fn).not.toHaveBeenCalled();
  });

  it('envia POST com payload e classId e notifica sucesso', async () => {
    const student = { id: 's1', name: 'Ana Souza', email: 'ana@x.br', enrollment: 'A001', classId: 'cclass00001', createdAt: '' };
    const { fn, onOpenChange, onSuccess } = setup(() => new Response(JSON.stringify({ success: true, student }), { status: 201 }));
    fill();
    fireEvent.submit(screen.getByLabelText('Nome completo').closest('form')!);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(student));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/students');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ana Souza', email: 'ana@x.br', enrollment: 'A001', password: 'senha1234', classId: 'cclass00001',
    });
  });

  it('mostra erro da API em role=alert', async () => {
    const { onSuccess } = setup(() => new Response(JSON.stringify({ success: false, error: 'E-mail já cadastrado' }), { status: 409 }));
    fill();
    fireEvent.submit(screen.getByLabelText('Nome completo').closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('E-mail já cadastrado');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('mostra erro de conexão em falha de rede', async () => {
    setup(() => { throw new Error('rede'); });
    fill();
    fireEvent.submit(screen.getByLabelText('Nome completo').closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Erro ao conectar com servidor.');
  });
});
