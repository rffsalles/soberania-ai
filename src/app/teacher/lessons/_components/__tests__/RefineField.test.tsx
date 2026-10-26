// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RefineField } from '../RefineField';

afterEach(cleanup);

function openAndSubmit() {
  fireEvent.click(screen.getByRole('button', { name: 'Refinar metodologia' }));
  fireEvent.change(screen.getByLabelText('Instrução para refinar metodologia'), { target: { value: 'mais prática' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
}

describe('RefineField', () => {
  it('aplica o texto refinado, mostra o anterior e desfaz uma vez', async () => {
    const onApply = vi.fn();
    render(<RefineField label="metodologia" value="Expositiva" onApply={onApply} request={async () => 'Prática guiada'} />);
    openAndSubmit();
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('Prática guiada'));
    expect(screen.getByText('Antes:')).toBeTruthy();
    expect(screen.getByText('Expositiva')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onApply).toHaveBeenLastCalledWith('Expositiva');
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('erro do servidor aparece em alert e não altera o campo', async () => {
    const onApply = vi.fn();
    render(
      <RefineField
        label="metodologia"
        value="Expositiva"
        onApply={onApply}
        request={async () => {
          throw new Error('Falha ao refinar');
        }}
      />,
    );
    openAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toContain('Falha ao refinar');
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('fica desabilitado quando disabled', () => {
    render(<RefineField label="metodologia" value="x" onApply={vi.fn()} request={async () => 'y'} disabled />);
    expect((screen.getByRole('button', { name: 'Refinar metodologia' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
