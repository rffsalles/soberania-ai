// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { InteractiveVideoPlayer, stepTimeIndex } from '../interactive-video-player';

afterEach(cleanup);

describe('stepTimeIndex', () => {
  it('devolve o maior índice com início <= segundos', () => {
    expect(stepTimeIndex([0, 600, 1800], 599)).toBe(0);
    expect(stepTimeIndex([0, 600, 1800], 1800)).toBe(2);
    expect(stepTimeIndex([30], 10)).toBe(-1);
  });
});

function setup(onStepCross?: (s: number) => void) {
  const { container } = render(
    <InteractiveVideoPlayer
      videoUrl="/api/v1/teacher/lessons/x/video"
      mediaType="S3_UPLOAD"
      checkpoints={[]}
      stepTimes={[0, 600, 1800]}
      onStepCross={onStepCross}
    />
  );
  const video = container.querySelector('video') as HTMLVideoElement;
  const at = (t: number) => {
    Object.defineProperty(video, 'currentTime', { value: t, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
  };
  return { at };
}

describe('InteractiveVideoPlayer passo da aula gravada', () => {
  it('reporta ao cruzar um passo e não repete no mesmo índice', () => {
    const onStepCross = vi.fn();
    const { at } = setup(onStepCross);
    at(5.7);
    at(10);
    at(700);
    expect(onStepCross.mock.calls).toEqual([[5], [700]]);
  });
  it('salto de vários passos reporta só o final; voltar reporta de novo', () => {
    const onStepCross = vi.fn();
    const { at } = setup(onStepCross);
    at(5);
    at(2000);
    at(100);
    expect(onStepCross.mock.calls).toEqual([[5], [2000], [100]]);
  });
  it('sem onStepCross não reporta nada', () => {
    const { at } = setup(undefined);
    expect(() => at(700)).not.toThrow();
  });
});
