'use client';

import * as React from 'react';

const HTTP_CONFLICT = 409;

/**
 * Reporta o passo do vídeo (fire-and-forget para a UI). Resolve true no 2xx e false em qualquer outro caso;
 * nunca rejeita. O primeiro 409 desliga o reporter até a página recarregar.
 */
export function useVideoStepReporter(
  agendaId: string,
  enabled: boolean
): (videoSeconds: number) => Promise<boolean> {
  const disabledByServer = React.useRef(false);
  const inFlight = React.useRef<Set<number>>(new Set());

  return React.useCallback(
    (videoSeconds: number): Promise<boolean> => {
      if (!enabled || disabledByServer.current || inFlight.current.has(videoSeconds)) return Promise.resolve(false);
      inFlight.current.add(videoSeconds);
      return fetch(`/api/v1/agendas/${agendaId}/events/video-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoSeconds }),
      })
        .then((res) => {
          if (res.ok) return true;
          if (res.status === HTTP_CONFLICT) disabledByServer.current = true;
          else console.warn(`video-step: resposta ${res.status}`);
          return false;
        })
        .catch((err: unknown) => {
          console.warn('video-step: falha de rede', err);
          return false;
        })
        .finally(() => inFlight.current.delete(videoSeconds));
    },
    [agendaId, enabled]
  );
}
