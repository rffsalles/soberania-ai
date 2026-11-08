import type { ClassState } from './class-state';

export type LiveControls = {
  canStart: boolean;
  canEnd: boolean;
  canSelectStep: boolean;
  prevIndex: number | null; // null = botão desabilitado
  nextIndex: number | null;
  highlightedIndex: number | null; // passo destacado no roteiro (null se fora do roteiro)
  stepCount: number;
};

export function liveControls(
  state: Pick<ClassState, 'phase' | 'currentStepIndex'>,
  stepCount: number,
  pending: boolean,
): LiveControls {
  const result: LiveControls = {
    canStart: false,
    canEnd: false,
    canSelectStep: false,
    prevIndex: null,
    nextIndex: null,
    highlightedIndex: null,
    stepCount,
  };

  if (state.phase === 'NOT_STARTED') {
    result.canStart = !pending;
    return result;
  }
  if (state.phase === 'ENDED') return result;

  result.canEnd = !pending;
  result.canSelectStep = !pending && stepCount > 0;

  const i = state.currentStepIndex;
  let prev: number | null = null;
  let next: number | null = null;
  if (i === null) {
    next = stepCount > 0 ? 0 : null;
  } else if (i >= stepCount) {
    prev = stepCount > 0 ? stepCount - 1 : null;
  } else {
    result.highlightedIndex = i;
    prev = i > 0 ? i - 1 : null;
    next = i < stepCount - 1 ? i + 1 : null;
  }
  if (!pending) {
    result.prevIndex = prev;
    result.nextIndex = next;
  }
  return result;
}

export function stepTarget(controls: LiveControls, stepIndex: number): number | null {
  if (!controls.canSelectStep) return null;
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= controls.stepCount) return null;
  if (stepIndex === controls.highlightedIndex) return null;
  return stepIndex;
}
