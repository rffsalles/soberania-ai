// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const chaptersState = vi.hoisted(() => ({ loading: false }));
vi.mock('@/components/teaching/use-plan-chapters', async () => {
  const { MAT_BOOK } = await import('@/components/teaching/__tests__/chapter-tree-fixtures');
  return {
    usePlanChapters: () =>
      chaptersState.loading
        ? { books: [], isLoading: true, error: null, reload: vi.fn() }
        : { books: [MAT_BOOK], isLoading: false, error: null, reload: vi.fn() },
  };
});
vi.mock('../MediaTabs', () => ({ MediaTabs: () => null }));

import { LessonEditor } from '../LessonEditor';
import type { LessonItem } from '@/components/teaching/use-lessons';

function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}

const BASE = '/api/v1/teacher/lessons/l1';

function makeLesson(patch: Partial<LessonItem> = {}): LessonItem {
  return {
    id: 'l1',
    classNumber: 3,
    classDate: '2026-03-10T22:00:00.000Z',
    topicTitle: 'Aula 3',
    dailyObjective: '',
    timeScript: [],
    methodology: '',
    resourcesNeeded: [],
    fixationExercise: '',
    mediaType: null,
    mediaUrl: null,
    status: 'DRAFT',
    chapters: [],
    courseSchedule: { teachingPlanId: 'plan-1' },
    ...patch,
  } as LessonItem;
}

const GENERATED = {
  dailyObjective: 'Objetivo gerado',
  methodology: 'Metodologia gerada',
  resourcesNeeded: ['Projetor', 'Quadro'],
  fixationExercise: 'Exercício gerado',
  timeScript: [{ timeSeconds: 0, timeRange: '00:00-10:00', activity: 'Abertura', description: 'Descrição' }],
  citations: ['Livro, cap. 1'],
};

afterEach(() => {
  chaptersState.loading = false;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LessonEditor', () => {
  it('enquanto os capítulos carregam mostra "Carregando capítulos..."; depois abre a seleção salva', () => {
    chaptersState.loading = true;
    const lesson = makeLesson({ chapters: [{ chapterId: 's221', chapter: { order: 5, number: '2.2.1' } }] });
    const { rerender } = render(<LessonEditor lesson={lesson} onSaved={() => {}} />);
    expect(screen.getByText('Carregando capítulos...')).toBeTruthy();
    expect(screen.queryByText('Nenhum capítulo nos livros do plano.')).toBeNull();
    chaptersState.loading = false;
    rerender(<LessonEditor lesson={lesson} onSaved={() => {}} />);
    expect(screen.getByRole('treeitem', { name: '2.2.1 Operações com frações' })).toBeTruthy();
  });

  it('"Gerar" bloqueado sem capítulo salvo e com seleção não salva, cada um com seu motivo', () => {
    const { rerender } = render(<LessonEditor lesson={makeLesson()} onSaved={() => {}} />);
    const button = screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Selecione e salve ao menos um capítulo para gerar a aula.')).toBeTruthy();

    rerender(<LessonEditor lesson={makeLesson({ chapters: [{ chapterId: 'u1', chapter: { order: 1, number: '1' } }] })} onSaved={() => {}} />);
    expect((screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
    expect((screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Salve os capítulos selecionados antes de gerar.')).toBeTruthy();
  });

  it('gerar com conteúdo existente pede confirmação e preenche o formulário com a resposta', async () => {
    const fetchMock = routeFetch({ [`POST ${BASE}/generate`]: { success: true, data: GENERATED } });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <LessonEditor
        lesson={makeLesson({ dailyObjective: 'Antigo', chapters: [{ chapterId: 'u1', chapter: { order: 1, number: '1' } }] })}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gerar aula com IA' }));
    await waitFor(() => expect((screen.getByLabelText('Objetivo diário') as HTMLTextAreaElement).value).toBe('Objetivo gerado'));
    expect(confirm).toHaveBeenCalledWith('Gerar com IA substitui o conteúdo atual do formulário. Continuar?');
    expect((screen.getByLabelText('Metodologia') as HTMLTextAreaElement).value).toBe('Metodologia gerada');
    expect((screen.getByLabelText('Recursos necessários (um por linha)') as HTMLTextAreaElement).value).toBe('Projetor\nQuadro');
    expect((screen.getByLabelText('Exercício de fixação') as HTMLTextAreaElement).value).toBe('Exercício gerado');
    expect((screen.getByLabelText('Atividade da etapa 1') as HTMLInputElement).value).toBe('Abertura');
    expect(screen.getByText('Fontes: Livro, cap. 1')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gerar aplica o topicTitle retornado; sem topicTitle o título não muda', async () => {
    const chapters = [{ chapterId: 'u1', chapter: { order: 1, number: '1' } }];
    vi.stubGlobal('fetch', routeFetch({ [`POST ${BASE}/generate`]: { success: true, data: { ...GENERATED, topicTitle: 'Modelagem ER' } } }));
    render(<LessonEditor lesson={makeLesson({ chapters })} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar aula com IA' }));
    await waitFor(() => expect((screen.getByLabelText('Título do tópico') as HTMLInputElement).value).toBe('Modelagem ER'));

    cleanup();
    vi.stubGlobal('fetch', routeFetch({ [`POST ${BASE}/generate`]: { success: true, data: GENERATED } }));
    render(<LessonEditor lesson={makeLesson({ chapters })} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar aula com IA' }));
    await waitFor(() => expect((screen.getByLabelText('Objetivo diário') as HTMLTextAreaElement).value).toBe('Objetivo gerado'));
    expect((screen.getByLabelText('Título do tópico') as HTMLInputElement).value).toBe('Aula 3');
  });

  it('"Publicar" bloqueado mostra o que falta; aula completa publica com PUT status', async () => {
    render(<LessonEditor lesson={makeLesson()} onSaved={() => {}} />);
    expect((screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Defina um título diferente de "Aula N".')).toBeTruthy();
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Incompleta')).toBeTruthy();

    cleanup();
    const fetchMock = routeFetch({ [`PUT ${BASE}/status`]: { success: true, lesson: makeLesson({ status: 'PUBLISHED' }) } });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(
      <LessonEditor
        lesson={makeLesson({ topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: GENERATED.timeScript })}
        onSaved={onSaved}
      />,
    );
    const publish = screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({ status: 'PUBLISHED' });
  });

  it('após gerar (formulário não salvo) bloqueia "Publicar"; após salvar, publica o que foi salvo', async () => {
    const SAVED = [{ chapterId: 'u1', chapter: { order: 1, number: '1' } }];
    const initial = makeLesson({ topicTitle: 'Modelagem', chapters: SAVED });
    const fetchMock = routeFetch({
      [`POST ${BASE}/generate`]: { success: true, data: GENERATED },
      [`PUT ${BASE}`]: { success: true, lesson: initial },
      [`PUT ${BASE}/status`]: { success: true, lesson: initial },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    const { rerender } = render(<LessonEditor lesson={initial} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar aula com IA' }));
    await waitFor(() => expect((screen.getByLabelText('Objetivo diário') as HTMLTextAreaElement).value).toBe('Objetivo gerado'));
    const publish = () => screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement;
    expect(publish().disabled).toBe(true);
    expect(screen.getByText('Salve as alterações antes de publicar.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    rerender(
      <LessonEditor
        lesson={makeLesson({
          topicTitle: 'Modelagem',
          chapters: SAVED,
          dailyObjective: GENERATED.dailyObjective,
          methodology: GENERATED.methodology,
          resourcesNeeded: GENERATED.resourcesNeeded,
          fixationExercise: GENERATED.fixationExercise,
          timeScript: GENERATED.timeScript,
        })}
        onSaved={onSaved}
      />,
    );
    expect(publish().disabled).toBe(false);
    fireEvent.click(publish());
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === `${BASE}/status`)).toBe(true));
  });

  it('estado salvo normalizado (mídia null/NONE, recursos com linhas vazias) não é "não salvo"', () => {
    render(
      <LessonEditor
        lesson={makeLesson({ topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: GENERATED.timeScript, resourcesNeeded: ['A'], mediaType: 'NONE' as never })}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Recursos necessários (um por linha)'), { target: { value: 'A\n\n  ' } });
    expect((screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Salve as alterações antes de publicar.')).toBeNull();
  });

  it('rascunho completo mostra o selo "Pronta para publicar"', () => {
    render(
      <LessonEditor
        lesson={makeLesson({ topicTitle: 'Modelagem', dailyObjective: 'Obj', timeScript: GENERATED.timeScript })}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByText('Pronta para publicar')).toBeTruthy();
    expect(screen.queryByText('Incompleta')).toBeNull();
  });

  it('aula publicada mostra badge "Publicada" e botão "Despublicar"', () => {
    render(<LessonEditor lesson={makeLesson({ status: 'PUBLISHED' })} onSaved={() => {}} />);
    expect(screen.getByText('Publicada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Despublicar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull();
  });

  it('salvar envia chapterIds selecionados', async () => {
    const fetchMock = routeFetch({ [`PUT ${BASE}`]: { success: true, lesson: makeLesson() } });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<LessonEditor lesson={makeLesson({ topicTitle: 'Modelagem' })} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string).chapterIds).toEqual(['u2']);
    expect(screen.getByRole('status').textContent).toBe('Aula salva.');
  });

  it('após salvar a seleção, o aviso de capítulos não salvos some', async () => {
    const U1 = { chapterId: 'u1', chapter: { order: 1, number: '1' } };
    const saved = makeLesson({ topicTitle: 'Modelagem', chapters: [U1, { chapterId: 'u2', chapter: { order: 2, number: '2' } }] });
    vi.stubGlobal('fetch', routeFetch({ [`PUT ${BASE}`]: { success: true, lesson: saved } }));
    const onSaved = vi.fn();
    const { rerender } = render(<LessonEditor lesson={makeLesson({ topicTitle: 'Modelagem', chapters: [U1] })} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
    expect(screen.getByText('Salve os capítulos selecionados antes de gerar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    rerender(<LessonEditor lesson={saved} onSaved={onSaved} />);
    expect(screen.queryByText('Salve os capítulos selecionados antes de gerar.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('marcar a unidade com uma seção salva troca a seção pela unidade ao salvar', async () => {
    const fetchMock = routeFetch({ [`PUT ${BASE}`]: { success: true, lesson: makeLesson() } });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<LessonEditor lesson={makeLesson({ chapters: [{ chapterId: 's21', chapter: { order: 3, number: '2.1' } }] })} onSaved={onSaved} />);
    expect(screen.getByRole('treeitem', { name: '2 Unidade 2' }).getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
    expect(screen.getByText('Salve os capítulos selecionados antes de gerar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).chapterIds).toEqual(['u2']);
  });

  describe('refino por etapa', () => {
    const TWO_STEPS = [
      { timeSeconds: 0, timeRange: '00:00-10:00', activity: 'A1', description: 'Desc 1' },
      { timeSeconds: 600, timeRange: '10:00-20:00', activity: 'A2', description: 'Desc 2' },
    ];
    const SAVED = [{ chapterId: 'u1', chapter: { order: 1, number: '1' } }];

    function startRefine(label: string) {
      fireEvent.click(screen.getByRole('button', { name: `Refinar ${label}` }));
      fireEvent.change(screen.getByLabelText(`Instrução para refinar ${label}`), { target: { value: 'mais curto' } });
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    }

    it('refina a descrição da etapa 2 sem tocar na etapa 1', async () => {
      const fetchMock = routeFetch({ [`POST ${BASE}/refine`]: { success: true, text: 'Desc 2 refinada' } });
      vi.stubGlobal('fetch', fetchMock);
      render(<LessonEditor lesson={makeLesson({ chapters: SAVED, timeScript: TWO_STEPS })} onSaved={() => {}} />);
      startRefine('etapa 2');
      await waitFor(() => expect((screen.getByLabelText('Descrição da etapa 2') as HTMLTextAreaElement).value).toBe('Desc 2 refinada'));
      expect((screen.getByLabelText('Descrição da etapa 1') as HTMLTextAreaElement).value).toBe('Desc 1');
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init!.body as string)).toEqual({
        field: 'timeScript',
        stepIndex: 1,
        instruction: 'mais curto',
        current: 'Desc 2',
      });
    });

    it('remover a etapa 1 durante o pedido aplica o texto na etapa certa e não vaza uiKey ao salvar', async () => {
      let resolveRefine: (r: Response) => void = () => {};
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return new Promise<Response>((res) => (resolveRefine = res));
        return Promise.resolve(new Response(JSON.stringify({ success: true, lesson: makeLesson() }), { status: 200 }));
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<LessonEditor lesson={makeLesson({ chapters: SAVED, timeScript: TWO_STEPS, topicTitle: 'Modelagem' })} onSaved={() => {}} />);
      startRefine('etapa 2');
      fireEvent.click(screen.getByRole('button', { name: 'Remover etapa 1' }));
      resolveRefine(new Response(JSON.stringify({ success: true, text: 'Desc 2 refinada' }), { status: 200 }));
      await waitFor(() => expect((screen.getByLabelText('Descrição da etapa 1') as HTMLTextAreaElement).value).toBe('Desc 2 refinada'));
      expect(screen.queryByLabelText('Descrição da etapa 2')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
      await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
      const saved = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
      expect(saved.timeScript).toEqual([{ ...TWO_STEPS[1], description: 'Desc 2 refinada' }]);
    });
  });
});
