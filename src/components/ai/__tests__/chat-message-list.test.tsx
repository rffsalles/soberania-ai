// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ChatMessageList } from '../chat-message-list';
import type { ChatMessage } from '../use-tutor-chat';

const msg = (id: string): ChatMessage =>
  ({ id, sender: 'teacher', text: `texto ${id}`, timestamp: '10:00' }) as ChatMessage;

function setup(messages: ChatMessage[]) {
  const view = render(<ChatMessageList messages={messages} isStreaming={false} />);
  const el = view.container.firstElementChild as HTMLDivElement;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 });
  return { view, el };
}

describe('ChatMessageList rolagem', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('nunca rola a janela', () => {
    const scrollTo = vi.fn();
    const scrollIntoView = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Element.prototype.scrollIntoView = scrollIntoView;
    const { view } = setup([msg('1')]);
    view.rerender(<ChatMessageList messages={[msg('1'), msg('2')]} isStreaming={false} />);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('com o usuário no fim, rola o container até o fim', () => {
    const { view, el } = setup([msg('1')]);
    el.scrollTop = 700;
    fireEvent.scroll(el);
    view.rerender(<ChatMessageList messages={[msg('1'), msg('2')]} isStreaming={false} />);
    expect(el.scrollTop).toBe(1000);
  });

  it('com o usuário longe do fim, não altera scrollTop', () => {
    const { view, el } = setup([msg('1')]);
    el.scrollTop = 50;
    fireEvent.scroll(el);
    view.rerender(<ChatMessageList messages={[msg('1'), msg('2')]} isStreaming={false} />);
    expect(el.scrollTop).toBe(50);
  });
});
