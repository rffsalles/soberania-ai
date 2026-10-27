// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'cclass00001' }) }));
vi.mock('@/components/layout/provider-badge', () => ({ ProviderBadge: () => null }));
vi.mock('../_components/StudentFormModal', () => ({ StudentFormModal: () => null }));
vi.mock('../_components/EnrollStudentModal', () => ({ EnrollStudentModal: () => null }));

import ClassStudentsPage from '../page';

const klass = {
  id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3,
  courseId: 'ccourse00001', academicPeriodId: 'cperiod0001',
  course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 },
};
const ana = { id: 'cstud00001', name: 'Ana Souza', email: 'ana@x.br', enrollment: 'A001', classId: klass.id, createdAt: '2026-01-01' };
const bia = { id: 'cstud00002', name: 'Bia Lima', email: 'bia@x.br', enrollment: 'A002', classId: klass.id, createdAt: '2026-01-02' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stub(extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const custom = extra?.(url, init);
    if (custom) return custom;
    if (url === '/api/v1/admin/classes') return json({ success: true, classes: [klass] });
    if (url === `/api/v1/admin/students?classId=${klass.id}`) return json({ success: true, students: [ana, bia] });
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ClassStudentsPage', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('lista os alunos da turma com cabeçalho e link de volta', async () => {
    stub();
    render(<ClassStudentsPage />);
    await screen.findByText('Ana Souza');
    expect(screen.getByText('Bia Lima')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '3º Semestre · ADS' })).toBeTruthy();
    expect(screen.getByText('ADS-2026-3A · Análise e Desenvolvimento de Sistemas')).toBeTruthy();
    expect(screen.getByText('2 alunos')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Turmas/ }).getAttribute('href')).toBe('/admin/classes');
  });

  it('filtra por nome, e-mail e matrícula', async () => {
    stub();
    render(<ClassStudentsPage />);
    await screen.findByText('Ana Souza');
    const input = screen.getByPlaceholderText(/Buscar/);
    fireEvent.change(input, { target: { value: 'a002' } });
    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('Bia Lima')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'ana@x' } });
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('Bia Lima')).toBeNull();
  });

  it('remove da turma após confirmação com PUT classId null', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fn = stub((url, init) => {
      if (url === '/api/v1/admin/students' && init?.method === 'PUT') return json({ success: true, student: { ...ana, classId: null } });
    });
    render(<ClassStudentsPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover da turma' })[0]);
    expect(window.confirm).toHaveBeenCalledWith('Remover Ana Souza da turma?');
    await waitFor(() => {
      const put = fn.mock.calls.find(([, i]) => i?.method === 'PUT');
      expect(put).toBeTruthy();
      expect(JSON.parse(put![1]!.body as string)).toEqual({ id: ana.id, classId: null });
    });
  });

  it('não remove quando a confirmação é negada', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fn = stub();
    render(<ClassStudentsPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover da turma' })[0]);
    expect(fn.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false);
  });

  it('mostra erro de carregamento com tentar novamente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    render(<ClassStudentsPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
  });

  it('mostra Turma não encontrada quando o id não existe', async () => {
    stub((url) => (url === '/api/v1/admin/classes' ? json({ success: true, classes: [] }) : undefined));
    render(<ClassStudentsPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Turma não encontrada.');
  });

  it('mostra estado vazio', async () => {
    stub((url) => (url.startsWith('/api/v1/admin/students') ? json({ success: true, students: [] }) : undefined));
    render(<ClassStudentsPage />);
    await screen.findByText('Nenhum aluno matriculado.');
  });
});
