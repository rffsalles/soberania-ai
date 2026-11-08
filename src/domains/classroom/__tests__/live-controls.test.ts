import { describe, expect, it } from 'vitest';
import { liveControls, stepTarget } from '../live-controls';

const run = (i: number | null) => ({ phase: 'RUNNING' as const, currentStepIndex: i });

describe('liveControls', () => {
  it('antes de iniciar só Iniciar', () => {
    expect(liveControls({ phase: 'NOT_STARTED', currentStepIndex: null }, 3, false))
      .toEqual({ canStart: true, canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null, highlightedIndex: null });
  });
  it('meio do roteiro', () => {
    expect(liveControls(run(1), 3, false)).toMatchObject({ prevIndex: 0, nextIndex: 2, highlightedIndex: 1, canEnd: true, canStart: false });
  });
  it('primeiro e último passo', () => {
    expect(liveControls(run(0), 3, false).prevIndex).toBeNull();
    expect(liveControls(run(2), 3, false).nextIndex).toBeNull();
  });
  it('passo atual além do roteiro', () => {
    expect(liveControls(run(5), 3, false)).toMatchObject({ nextIndex: null, prevIndex: 2, highlightedIndex: null });
  });
  it('pendente desabilita tudo', () => {
    expect(liveControls(run(1), 3, true)).toMatchObject({ canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null });
    expect(liveControls({ phase: 'NOT_STARTED', currentStepIndex: null }, 3, true).canStart).toBe(false);
  });
  it('encerrada trava tudo', () => {
    expect(liveControls({ phase: 'ENDED', currentStepIndex: 2 }, 3, false))
      .toMatchObject({ canStart: false, canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null });
  });
  it('stepTarget ignora o passo atual e índices fora do roteiro', () => {
    const c = liveControls(run(1), 3, false);
    expect([0, 1, 2, 3].map((i) => stepTarget(c, i))).toEqual([0, null, 2, null]);
  });
});
