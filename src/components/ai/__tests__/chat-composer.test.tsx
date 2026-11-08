// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChatComposer } from '../chat-composer';

afterEach(cleanup);

describe('ChatComposer draft', () => {
  it('draft novo preenche e foca o campo sem enviar', () => {
    const onSend = vi.fn();
    const { rerender } = render(<ChatComposer onSend={onSend} />);
    const box = screen.getByRole('textbox') as HTMLInputElement;
    expect(box.value).toBe('');
    rerender(<ChatComposer onSend={onSend} draft={{ text: 'Sobre a pergunta', nonce: 1 }} />);
    expect(box.value).toBe('Sobre a pergunta');
    expect(document.activeElement).toBe(box);
    expect(onSend).not.toHaveBeenCalled();
  });
  it('mesmo texto com nonce novo preenche de novo', () => {
    const { rerender } = render(<ChatComposer onSend={vi.fn()} draft={{ text: 'a', nonce: 1 }} />);
    const box = screen.getByRole('textbox') as HTMLInputElement;
    expect(box.value).toBe('a');
    rerender(<ChatComposer onSend={vi.fn()} draft={{ text: 'b', nonce: 2 }} />);
    expect(box.value).toBe('b');
  });
});
