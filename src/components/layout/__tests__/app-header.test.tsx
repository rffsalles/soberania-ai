// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ROUTES } from '@/lib/constants/routes';

type TestUser = { id: string; name: string; email: string; role: string; enrollment: string | null };

const nav = vi.hoisted(() => ({ pathname: '/' }));
const auth = vi.hoisted(() => ({ user: null as TestUser | null, isLoading: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../use-current-user', () => ({ useCurrentUser: () => auth }));
vi.mock('../telemetry-badge', () => ({ TelemetryBadge: () => null }));

import { AppHeader } from '../app-header';

const teacher: TestUser = { id: 't1', name: 'Prof. Carlos', email: 'p@x', role: 'TEACHER', enrollment: 'PROF001' };
const student: TestUser = { id: 's1', name: 'Maria', email: 'm@x', role: 'STUDENT', enrollment: '202601001' };
const admin: TestUser = { id: 'a1', name: 'Admin', email: 'a@x', role: 'ADMIN', enrollment: null };

function setup(user: TestUser | null, pathname: string, isLoading = false) {
  auth.user = user;
  auth.isLoading = isLoading;
  nav.pathname = pathname;
  render(<AppHeader />);
}

const navLinkNames = () =>
  screen
    .getAllByRole('link')
    .map((a) => a.textContent?.trim())
    .filter((t) => t && !t.includes('Soberania'));

const activeLink = () => document.querySelector('a[aria-current="page"]');

describe('AppHeader', () => {
  afterEach(() => cleanup());

  it('professor vê os seis links e o botão Sair', () => {
    setup(teacher, ROUTES.TEACHER_PLANS);
    expect(navLinkNames()).toEqual([
      'Planos de Ensino',
      'Cronogramas',
      'Aulas',
      'Avaliações',
      'Acervo RAG',
      'Relatórios',
    ]);
    expect(screen.getByRole('button', { name: /Sair/ })).toBeTruthy();
  });

  it('aluno vê só o Painel', () => {
    setup(student, ROUTES.DASHBOARD);
    expect(navLinkNames()).toEqual(['Painel']);
  });

  it('logo aponta para a rota padrão do papel', () => {
    setup(admin, ROUTES.ADMIN_SUBJECTS);
    const logo = screen.getByRole('link', { name: /Soberania/ });
    expect(logo.getAttribute('href')).toBe(ROUTES.APPLIANCE);
  });

  it('logo aponta para a raiz sem usuário', () => {
    setup(null, '/');
    expect(screen.getByRole('link', { name: /Soberania/ }).getAttribute('href')).toBe(ROUTES.HOME);
  });

  it('marca ativo o link cujo caminho é prefixo do pathname', () => {
    setup(teacher, ROUTES.TEACHER_PLANS_NEW);
    expect(activeLink()?.textContent).toContain('Planos de Ensino');
    cleanup();
    setup(teacher, ROUTES.TEACHER_LESSONS);
    expect(activeLink()?.textContent).toContain('Aulas');
    expect(activeLink()?.textContent).not.toContain('Planos');
  });

  it('nenhum link ativo quando o admin está numa rota fora do menu', () => {
    setup(admin, ROUTES.DASHBOARD);
    expect(activeLink()).toBeNull();
  });

  it('não renderiza links enquanto o usuário carrega', () => {
    setup(null, ROUTES.TEACHER_PLANS, true);
    expect(navLinkNames()).toEqual([]);
  });
});
