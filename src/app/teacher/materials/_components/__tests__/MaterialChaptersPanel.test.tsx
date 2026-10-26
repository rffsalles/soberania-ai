// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MaterialChaptersPanel } from '../MaterialChaptersPanel';

const BASE = '/api/v1/library/materials/m1/chapters';
const material = { id: 'm1', title: 'Livro', totalPages: 300, mimeType: 'application/pdf' };

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}

let fetchMock: ReturnType<typeof routeFetch>;
function stubFetch(handlers: Record<string, unknown>) {
  fetchMock = routeFetch(handlers);
  vi.stubGlobal('fetch', fetchMock);
}

function renderPanel() {
  return render(<MaterialChaptersPanel material={material} open onOpenChange={() => {}} />);
}

const chapter = { id: 'c1', order: 1, title: 'Intro', startPage: 1, endPage: 10, source: 'OUTLINE' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MaterialChaptersPanel', () => {
  it('material sem capítulos mostra "Sem capítulos" e extrair de novo chama POST extract', async () => {
    stubFetch({
      [`GET ${BASE}`]: { success: true, chapters: [] },
      [`POST ${BASE}/extract`]: { success: true, source: null, chapters: [], lostLessonLinks: 0 },
    });
    renderPanel();
    expect(await screen.findByText('Sem capítulos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar capítulo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Extrair de novo' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      'Nenhum capítulo encontrado; os capítulos atuais foram mantidos.',
    );
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/extract`, expect.objectContaining({ method: 'POST' }));
  });

  it('mostra a origem e salva a lista editada com PUT { chapters: [{ title, startPage }] }', async () => {
    stubFetch({
      [`GET ${BASE}`]: { success: true, chapters: [chapter] },
      [`PUT ${BASE}`]: { success: true, source: 'MANUAL', chapters: [chapter], lostLessonLinks: 0 },
    });
    renderPanel();
    expect(await screen.findByText('Marcadores do PDF')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Título do capítulo 1'), { target: { value: 'Introdução' } });
    fireEvent.change(screen.getByLabelText('Página inicial do capítulo 1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        BASE,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ chapters: [{ title: 'Introdução', startPage: 2 }] }),
        }),
      ),
    );
  });

  it('avisa quantas aulas perderam vínculo', async () => {
    stubFetch({
      [`GET ${BASE}`]: { success: true, chapters: [chapter] },
      [`PUT ${BASE}`]: { success: true, source: 'MANUAL', chapters: [chapter], lostLessonLinks: 3 },
    });
    renderPanel();
    await screen.findByText('Marcadores do PDF');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
    expect((await screen.findByRole('status')).textContent).toBe(
      '3 aula(s) perderam o vínculo com os capítulos deste livro.',
    );
  });

  describe('conflito de vínculos (409)', () => {
    const CONFLICT_MSG = 'Alterar o número de capítulos desfaz vínculos de aulas de outros professores.';
    const conflict = {
      success: false,
      error: CONFLICT_MSG,
      details: [{ disciplina: 'BD', turma: 'A', classNumber: 4, topicTitle: 'Joins', professor: 'Ana' }],
    };

    function stubConflict(role: string, forced: { status: number; body: unknown }) {
      fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? 'GET'} ${url}`;
        const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
        if (key === `GET ${BASE}`) return json(200, { success: true, chapters: [chapter] });
        if (key === 'GET /api/v1/auth/me') return json(200, { user: { id: 'u1', role } });
        if (key === `PUT ${BASE}`) return json(409, conflict);
        if (key === `PUT ${BASE}?force=1`) return json(forced.status, forced.body);
        throw new Error(`fetch inesperado: ${key}`);
      });
      vi.stubGlobal('fetch', fetchMock);
    }

    it('409 mostra as aulas afetadas e o professor não vê o botão de forçar', async () => {
      stubConflict('TEACHER', { status: 200, body: {} });
      renderPanel();
      await screen.findByText('Marcadores do PDF');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('BD · A · Aula 4: Joins (Ana)');
      expect(alert.textContent).toContain(CONFLICT_MSG);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me'));
      expect(screen.queryByRole('button', { name: 'Forçar mesmo assim' })).toBeNull();
    });

    it('admin força e o painel repete o PUT com force=1', async () => {
      stubConflict('ADMIN', {
        status: 200,
        body: { success: true, source: 'MANUAL', chapters: [chapter], lostLessonLinks: 0 },
      });
      renderPanel();
      await screen.findByText('Marcadores do PDF');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Forçar mesmo assim' }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          `${BASE}?force=1`,
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ chapters: [{ title: 'Intro', startPage: 1 }] }),
          }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });
});
