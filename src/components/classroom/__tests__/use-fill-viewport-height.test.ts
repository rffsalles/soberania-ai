// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFillViewportHeight } from '../use-fill-viewport-height';

function setup(matches: boolean, innerHeight: number, topRef: { top: number }) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as typeof window.matchMedia;
  window.innerHeight = innerHeight;
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top: topRef.top }) as DOMRect;
  return el;
}

describe('useFillViewportHeight', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preenche do topo até o fim da janela e recalcula no scroll', () => {
    const pos = { top: 243 };
    const el = setup(true, 850, pos);
    renderHook(() => useFillViewportHeight({ current: el }));
    expect(el.style.height).toBe('591px');
    pos.top = 104;
    window.dispatchEvent(new Event('scroll'));
    expect(el.style.height).toBe('730px');
  });

  it('limpa a altura abaixo do breakpoint lg', () => {
    const el = setup(false, 850, { top: 243 });
    el.style.height = '100px';
    renderHook(() => useFillViewportHeight({ current: el }));
    expect(el.style.height).toBe('');
  });

  it('respeita a altura mínima', () => {
    const el = setup(true, 400, { top: 243 });
    renderHook(() => useFillViewportHeight({ current: el }));
    expect(el.style.height).toBe('360px');
  });
});
