'use client';

import { useCallback, useRef, useState } from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { AnswerOutcome } from '@/domains/classroom/class-state';

export const ANSWER_ERROR = 'Não foi possível enviar sua resposta. Tente novamente.';

export type AnswerInput = { optionKey?: string; text?: string };

export function useTutorAnswers(agendaId: string) {
  const [answers, setAnswers] = useState<Record<number, AnswerOutcome>>({});
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (seq: number, input: AnswerInput): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPendingSeq(seq);
      setError(null);
      try {
        const res = await fetch(`${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/events/${seq}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.success && body.result) {
          setAnswers((prev) => ({ ...prev, [seq]: body.result }));
        } else if (res.status === 409 && body?.details?.code === 'ALREADY_ANSWERED') {
          setAnswers((prev) => ({ ...prev, [seq]: { alreadyAnswered: true } }));
        } else {
          setError(typeof body?.error === 'string' ? body.error : ANSWER_ERROR);
        }
      } catch {
        setError(ANSWER_ERROR);
      } finally {
        inFlight.current = false;
        setPendingSeq(null);
      }
    },
    [agendaId],
  );

  return { answers, submit, pendingSeq, error };
}
