// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NowInClassStrip } from '../now-in-class-strip';

afterEach(cleanup);

describe('NowInClassStrip', () => {
  it('sem passo não renderiza nada', () => {
    const { container } = render(<NowInClassStrip stepIndex={null} activity={null} status="live" />);
    expect(container.innerHTML).toBe('');
  });
  it('mostra a activity e o indicador', () => {
    render(<NowInClassStrip stepIndex={1} activity="INNER JOIN e LEFT JOIN na prática" status="live" />);
    expect(screen.getByTestId('now-in-class-strip').textContent).toContain('Agora na aula');
    expect(screen.getByText('INNER JOIN e LEFT JOIN na prática')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Ao vivo');
  });
  it('sem activity usa Passo N; polling mostra Atualizando', () => {
    render(<NowInClassStrip stepIndex={2} activity={null} status="polling" />);
    expect(screen.getByText('Passo 3')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Atualizando');
  });
  it('offline mostra Reconectando', () => {
    render(<NowInClassStrip stepIndex={0} activity="x" status="offline" />);
    expect(screen.getByRole('status').textContent).toContain('Reconectando');
  });
});
