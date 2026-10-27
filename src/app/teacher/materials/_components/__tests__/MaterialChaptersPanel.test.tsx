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

const chapter = {
  id: 'c1',
  order: 1,
  number: '1',
  title: 'Intro',
  startPage: 1,
  endPage: 10,
  parentId: null,
  depth: 0,
  source: 'OUTLINE',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    const CONFLICT_MSG = 'Esta alteração desfaz vínculos de aulas de outros professores.';
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

    it('editar uma linha após o 409 remove o botão de forçar', async () => {
      stubConflict('ADMIN', { status: 200, body: {} });
      renderPanel();
      await screen.findByText('Marcadores do PDF');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
      await screen.findByRole('button', { name: 'Forçar mesmo assim' });
      fireEvent.change(screen.getByLabelText('Título do capítulo 1'), { target: { value: 'Outro' } });
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

  describe('editor de árvore', () => {
    const TREE = [
      { id: 'u1', order: 1, number: '1', title: 'Unidade 1', startPage: 15, endPage: 42, parentId: null, depth: 0, source: 'AI' },
      { id: 'u2', order: 2, number: '2', title: 'Unidade 2', startPage: 43, endPage: 66, parentId: null, depth: 0, source: 'AI' },
      { id: 's21', order: 3, number: '2.1', title: 'Produtos notáveis', startPage: 43, endPage: 47, parentId: 'u2', depth: 1, source: 'AI' },
      { id: 's22', order: 4, number: '2.2', title: 'Frações', startPage: 48, endPage: 66, parentId: 'u2', depth: 1, source: 'AI' },
      { id: 's221', order: 5, number: '2.2.1', title: 'Operações com frações', startPage: 51, endPage: 66, parentId: 's22', depth: 2, source: 'AI' },
      { id: 'u3', order: 6, number: '3', title: 'Unidade 3', startPage: 67, endPage: 174, parentId: null, depth: 0, source: 'AI' },
    ];
    const renderTree = () =>
      render(<MaterialChaptersPanel material={{ ...material, totalPages: 174 }} open onOpenChange={() => {}} />);

    it('mostra número, página final derivada e recua/desrecua', async () => {
      stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
      renderTree();
      expect((await screen.findByLabelText('Página final do capítulo 2.2')).textContent).toBe('66');
      expect((screen.getByRole('button', { name: 'Recuar 2.1' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Recuar 2.2' }));
      expect(screen.getByLabelText('Título do capítulo 2.1.1')).toBeTruthy();
      expect(screen.getByLabelText('Título do capítulo 2.1.1.1')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Desrecuar 2.1.1' }));
      expect((screen.getByLabelText('Título do capítulo 2.2') as HTMLInputElement).value).toBe('Frações');
    });

    it('remover subárvore pede confirmação; cancelar mantém tudo', async () => {
      stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      renderTree();
      await screen.findByLabelText('Título do capítulo 2');
      fireEvent.click(screen.getByRole('button', { name: 'Remover capítulo 2' }));
      expect(confirm).toHaveBeenCalledWith('Remover "Unidade 2" e 3 subcapítulo(s)?');
      expect(screen.getByLabelText('Título do capítulo 2.2.1')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remover capítulo 2' }));
      expect(screen.queryByLabelText('Título do capítulo 2.1')).toBeNull();
      expect((screen.getByLabelText('Título do capítulo 2') as HTMLInputElement).value).toBe('Unidade 3');
    });

    it('validação por nó bloqueia o salvar', async () => {
      stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
      renderTree();
      fireEvent.change(await screen.findByLabelText('Página inicial do capítulo 2.1'), { target: { value: '40' } });
      expect(screen.getByText('Começa antes do capítulo pai.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Salvar capítulos' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('adiciona subcapítulo e salva a árvore inteira no PUT', async () => {
      stubFetch({
        [`GET ${BASE}`]: { success: true, chapters: TREE },
        [`PUT ${BASE}`]: { success: true, source: 'MANUAL', chapters: TREE, lostLessonLinks: 0 },
      });
      renderTree();
      fireEvent.click(await screen.findByRole('button', { name: 'Adicionar subcapítulo em 2.1' }));
      fireEvent.change(screen.getByLabelText('Título do capítulo 2.1.1'), { target: { value: 'Quadrado da soma' } });
      fireEvent.change(screen.getByLabelText('Página inicial do capítulo 2.1.1'), { target: { value: '44' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(BASE, expect.objectContaining({ method: 'PUT' })));
      const body = JSON.parse((fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')![1]!.body) as string);
      expect(body.chapters[1]).toEqual({
        title: 'Unidade 2', startPage: 43,
        children: [
          { title: 'Produtos notáveis', startPage: 43, children: [{ title: 'Quadrado da soma', startPage: 44 }] },
          { title: 'Frações', startPage: 48, children: [{ title: 'Operações com frações', startPage: 51 }] },
        ],
      });
    });
  });
});
