'use client';

import * as React from 'react';

const HTTP_CONFLICT = 409;

export function useVideoStepReporter(agendaId: string, enabled: boolean): (videoSeconds: number) => void {
  const disabledByServer = React.useRef(false);
  const inFlight = React.useRef<Set<number>>(new Set());

  return React.useCallback(
    (videoSeconds: number) => {
      if (!enabled || disabledByServer.current || inFlight.current.has(videoSeconds)) return;
      inFlight.current.add(videoSeconds);
      fetch(`/api/v1/agendas/${agendaId}/events/video-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoSeconds }),
      })
        .then((res) => {
          if (res.status === HTTP_CONFLICT) disabledByServer.current = true;
        })
        .catch((err: unknown) => console.warn('video-step: falha de rede', err))
        .finally(() => inFlight.current.delete(videoSeconds));
    },
    [agendaId, enabled]
  );
}
