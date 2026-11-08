'use client';

import * as React from 'react';

export const MAX_TIMEOUT_MS = 2_147_483_647;

/** Milissegundos até a próxima fronteira (início ou fim), limitado ao teto do setTimeout; null se já passou do fim. */
export function nextBoundaryDelay(startTime: string, endTime: string, now: number): number | null {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  // deriveAgendaStatus: LIVE em t >= start; COMPLETED só em t > end, então o fim cruza em end + 1.
  const target = now < start ? start : now <= end ? end + 1 : null;
  return target === null ? null : Math.min(target - now, MAX_TIMEOUT_MS);
}

/**
 * Relógio da sessão sem tique periódico: um único setTimeout até a próxima fronteira
 * (início ou fim) e, ao disparar, atualiza a data e agenda a seguinte.
 * `resetKey` força o recálculo (ex.: mudança de fase da aula).
 */
export function useSessionClock(startTime: string, endTime: string, resetKey: unknown): Date {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const current = new Date();
      setNow(current);
      const delay = nextBoundaryDelay(startTime, endTime, current.getTime());
      if (delay !== null) timer = setTimeout(schedule, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [startTime, endTime, resetKey]);

  return now;
}
