import * as React from 'react';

const LG_QUERY = '(min-width: 1024px)';

/**
 * Faz o elemento ocupar da sua posição atual (topo) até o fim da janela,
 * menos `bottomGap`. Só em telas lg+; abaixo disso a classe CSS vale.
 */
export function useFillViewportHeight(
  ref: React.RefObject<HTMLElement | null>,
  bottomGap = 16,
  minHeight = 360,
  /** Reexecuta quando o elemento passa a existir (render condicional). */
  active = true,
): void {
  React.useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      if (!window.matchMedia(LG_QUERY).matches) {
        el.style.height = '';
        return;
      }
      const top = el.getBoundingClientRect().top;
      el.style.height = `${Math.max(minHeight, window.innerHeight - top - bottomGap)}px`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, bottomGap, minHeight, active]);
}
