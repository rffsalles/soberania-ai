// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ROUTES } from '@/lib/constants/routes';

const nav = vi.hoisted(() => ({ push: vi.fn(), redirect: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.redirect ? { redirect: nav.redirect } : {}),
}));

import LoginPage from '../LoginPage';

async function submitAs(role: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ user: { role } }), { status: 200 }))
  );
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText(/Matrícula/), { target: { value: 'x' } });
  fireEvent.change(screen.getByLabelText(/Senha/), { target: { value: 'y' } });
  fireEvent.click(screen.getByRole('button', { name: /Acessar Ambiente/ }));
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    nav.push.mockClear();
    nav.redirect = '';
  });

  it('não renderiza os atalhos de demonstração fora do demo mode', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
    render(<LoginPage />);
    expect(screen.queryByText(/Atalhos para Demonstração/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  });

  it('renderiza os atalhos com NEXT_PUBLIC_DEMO_MODE=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    render(<LoginPage />);
    expect(await screen.findByRole('button', { name: 'Admin' })).toBeTruthy();
  });

  it.each([
    ['TEACHER', ROUTES.TEACHER_PLANS],
    ['STUDENT', ROUTES.DASHBOARD],
    ['ADMIN', ROUTES.APPLIANCE],
  ])('%s sem redirect vai para a rota padrão do papel', async (role, expected) => {
    await submitAs(role);
    expect(nav.push).toHaveBeenCalledWith(expected);
  });

  it('redirect válido tem prioridade sobre a rota padrão', async () => {
    nav.redirect = ROUTES.TEACHER_MATERIALS;
    await submitAs('TEACHER');
    expect(nav.push).toHaveBeenCalledWith(ROUTES.TEACHER_MATERIALS);
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example'])(
    'ignora redirect externo ou protocol-relative (%s) e usa a rota padrão',
    async (target) => {
      nav.redirect = target;
      await submitAs('TEACHER');
      expect(nav.push).toHaveBeenCalledWith(ROUTES.TEACHER_PLANS);
    }
  );
});
