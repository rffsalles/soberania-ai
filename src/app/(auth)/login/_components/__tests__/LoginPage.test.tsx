// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from '../LoginPage';

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
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
});
