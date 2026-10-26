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

  it('sem unidades mostra o texto de orientação', () => {
    render(<PlanUnitsCard planId="p1" units={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nenhuma unidade cadastrada. Distribua os capítulos no cronograma e use "Gerar unidades do plano".')).toBeTruthy();
  });
});
