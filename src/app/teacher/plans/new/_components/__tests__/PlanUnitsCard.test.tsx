// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/components/teaching/use-plan-chapters', () => ({
  usePlanChapters: () => ({
    books: [
      {
        materialId: 'm1', title: 'Livro', author: 'Autor', kind: 'BASIC',
        chapters: [
          { id: 'ch1', order: 1, title: 'A', startPage: 1, endPage: 10 },
          { id: 'ch2', order: 2, title: 'B', startPage: 11, endPage: 20 },
        ],
      },
    ],
    isLoading: false,
    error: null,
    reload: () => {},
  }),
}));

import { PlanUnitsCard } from '../PlanUnitsCard';

afterEach(cleanup);

describe('PlanUnitsCard', () => {
  it('mostra título, tópicos por linha e capítulos; editar o título chama onChange', () => {
    const onChange = vi.fn();
    const unit = { unitNumber: 1, title: 'Fundamentos', topics: ['Joins', 'Índices'], chapterIds: ['ch1', 'ch2', 'desconhecido'] };
    render(<PlanUnitsCard planId="p1" units={[unit]} onChange={onChange} />);
    expect(screen.getByText('Cap. 1, 2')).toBeTruthy();
    expect((screen.getByLabelText('Tópicos da unidade 1') as HTMLTextAreaElement).value).toBe('Joins\nÍndices');
    fireEvent.change(screen.getByLabelText('Título da unidade 1'), { target: { value: 'Base' } });
    expect(onChange).toHaveBeenCalledWith([{ ...unit, title: 'Base' }]);
  });

  it('adicionar unidade acrescenta uma vazia numerada em sequência', () => {
    const onChange = vi.fn();
    const unit = { unitNumber: 1, title: 'A', topics: ['x'], chapterIds: ['ch1'] };
    render(<PlanUnitsCard planId="p1" units={[unit]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar unidade' }));
    expect(onChange).toHaveBeenCalledWith([unit, { unitNumber: 2, title: '', topics: [], chapterIds: [] }]);
  });

  it('remover a primeira de duas renumera a restante para 1', () => {
    const onChange = vi.fn();
    const a = { unitNumber: 1, title: 'A', topics: ['x'], chapterIds: ['ch1'] };
    const b = { unitNumber: 2, title: 'B', topics: ['y'], chapterIds: ['ch2'] };
    render(<PlanUnitsCard planId="p1" units={[a, b]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover unidade 1' }));
    expect(onChange).toHaveBeenCalledWith([{ ...b, unitNumber: 1 }]);
  });

  it('sem unidades mostra o botão de adicionar e o campo de título limita 200 caracteres', () => {
    render(<PlanUnitsCard planId="p1" units={[{ unitNumber: 1, title: 'A', topics: [], chapterIds: [] }]} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Título da unidade 1') as HTMLInputElement).maxLength).toBe(200);
    cleanup();
    render(<PlanUnitsCard planId="p1" units={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Adicionar unidade' })).toBeTruthy();
  });

  it('sem unidades mostra o texto de orientação', () => {
    render(<PlanUnitsCard planId="p1" units={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nenhuma unidade cadastrada. Distribua os capítulos no cronograma e use "Gerar unidades do plano".')).toBeTruthy();
  });
});
