// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { InteractiveVideoPlayer, stepTimeIndex } from '../interactive-video-player';

afterEach(cleanup);

describe('stepTimeIndex', () => {
  it('devolve o maior índice com início <= segundos', () => {
    expect(stepTimeIndex([0, 600, 1800], 599)).toBe(0);
    expect(stepTimeIndex([0, 600, 1800], 1800)).toBe(2);
    expect(stepTimeIndex([30], 10)).toBe(-1);
  });
});

const STEP_TIMES = [0, 600, 1800];

function setup(onStepCross?: (s: number) => Promise<boolean>) {
  const ui = (videoUrl: string, stepTimes: number[]) => (
    <InteractiveVideoPlayer
      videoUrl={videoUrl}
      mediaType="S3_UPLOAD"
      checkpoints={[]}
      stepTimes={stepTimes}
      onStepCross={onStepCross}
    />
  );
  const { container, rerender } = render(ui('/api/v1/teacher/lessons/x/video', STEP_TIMES));
  const at = async (t: number) => {
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: t, configurable: true, writable: true });
    await act(async () => {
      fireEvent.timeUpdate(video);
    });
  };
  return { at, rerender: (videoUrl: string, stepTimes: number[]) => rerender(ui(videoUrl, stepTimes)) };
}

describe('InteractiveVideoPlayer passo da aula gravada', () => {
  it('reporta ao cruzar um passo e não repete no mesmo índice', async () => {
    const onStepCross = vi.fn(async () => true);
    const { at } = setup(onStepCross);
    await at(5.7);
    await at(10);
    await at(700);
    expect(onStepCross.mock.calls).toEqual([[5], [700]]);
  });
  it('salto de vários passos reporta só o final; voltar reporta de novo', async () => {
    const onStepCross = vi.fn(async () => true);
    const { at } = setup(onStepCross);
    await at(5);
    await at(2000);
    await at(100);
    expect(onStepCross.mock.calls).toEqual([[5], [2000], [100]]);
  });
  it('POST que falhou é tentado de novo no próximo timeupdate; o sucesso para de repetir', async () => {
    const onStepCross = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { at } = setup(onStepCross);
    await at(700);
    await at(701);
    await at(702);
    expect(onStepCross.mock.calls).toEqual([[700], [701]]);
  });
  it('enquanto o POST do passo está em voo, não reporta o mesmo passo de novo', async () => {
    let resolve: (ok: boolean) => void = () => undefined;
    const onStepCross = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const { at } = setup(onStepCross);
    await at(700);
    await at(701);
    expect(onStepCross).toHaveBeenCalledTimes(1);
    await act(async () => resolve(true));
    await at(702);
    expect(onStepCross).toHaveBeenCalledTimes(1);
  });
  it('trocar vídeo ou roteiro volta a reportar o passo atual', async () => {
    const onStepCross = vi.fn(async () => true);
    const { at, rerender } = setup(onStepCross);
    await at(700);
    rerender('/api/v1/teacher/lessons/y/video', [0, 600, 1800]);
    await at(705);
    expect(onStepCross.mock.calls).toEqual([[700], [705]]);
  });
  it('sem onStepCross não reporta nada', async () => {
    const { at } = setup(undefined);
    await expect(at(700)).resolves.toBeUndefined();
  });
});
