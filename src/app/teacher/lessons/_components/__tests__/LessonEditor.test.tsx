// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/ui/advanced-multi-combobox', () => ({
  AdvancedMultiCombobox: ({
    items,
    selectedIds,
    onSelectionChange,
    label,
  }: {
    items: { id: string; title: string }[];
    selectedIds: string[];
    onSelectionChange: (ids: string[], items: unknown[]) => void;
    label?: string;
  }) => (
    <fieldset>
      <legend>{label}</legend>
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            aria-label={item.title}
            checked={selectedIds.includes(item.id)}
            onChange={() =>
              onSelectionChange(
                selectedIds.includes(item.id) ? selectedIds.filter((i) => i !== item.id) : [...selectedIds, item.id],
                [],
              )
            }
          />
        </label>
      ))}
    </fieldset>
  ),
}));
vi.mock('@/components/teaching/use-plan-chapters', () => ({
  usePlanChapters: () => ({
    books: [
      {
        materialId: 'm1',
        title: 'Livro',
        author: 'Autor',
        kind: 'BASIC',
        chapters: [
          { id: 'ch1', order: 1, title: 'Intro', startPage: 1, endPage: 10 },
          { id: 'ch2', order: 2, title: 'Modelo', startPage: 11, endPage: 20 },
        ],
      },
    ],
    isLoading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
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
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LessonEditor', () => {
  it('"Gerar" bloqueado sem capítulo salvo e com seleção não salva, cada um com seu motivo', () => {
    const { rerender } = render(<LessonEditor lesson={makeLesson()} onSaved={() => {}} />);
    const button = screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Selecione e salve ao menos um capítulo para gerar a aula.')).toBeTruthy();

    rerender(<LessonEditor lesson={makeLesson({ chapters: [{ chapterId: 'ch1', chapter: { order: 1 } }] })} onSaved={() => {}} />);
    expect((screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByLabelText('Cap. 2: Modelo'));
    expect((screen.getByRole('button', { name: 'Gerar aula com IA' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Salve os capítulos selecionados antes de gerar.')).toBeTruthy();
  });

  it('gerar com conteúdo existente pede confirmação e preenche o formulário com a resposta', async () => {
    const fetchMock = routeFetch({ [`POST ${BASE}/generate`]: { success: true, data: GENERATED } });
    vi.stubGlobal('fetch', fetchMock);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <LessonEditor
        lesson={makeLesson({ dailyObjective: 'Antigo', chapters: [{ chapterId: 'ch1', chapter: { order: 1 } }] })}
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

  it('"Publicar" bloqueado mostra o que falta; aula completa publica com PUT status', async () => {
    const { rerender } = render(<LessonEditor lesson={makeLesson()} onSaved={() => {}} />);
    expect((screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Defina um título diferente de "Aula N".')).toBeTruthy();
    expect(screen.getByText('Rascunho')).toBeTruthy();

    const fetchMock = routeFetch({ [`PUT ${BASE}/status`]: { success: true, lesson: makeLesson({ status: 'PUBLISHED' }) } });
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    rerender(
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
    fireEvent.click(screen.getByLabelText('Cap. 2: Modelo'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string).chapterIds).toEqual(['ch2']);
    expect(screen.getByRole('status').textContent).toBe('Aula salva.');
  });
});
