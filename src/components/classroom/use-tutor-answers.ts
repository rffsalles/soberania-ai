'use client';

import { useCallback, useRef, useState } from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { AnswerOutcome } from '@/domains/classroom/class-state';

export const ANSWER_ERROR = 'Não foi possível enviar sua resposta. Tente novamente.';

export type AnswerInput = { optionKey?: string; text?: string };
/** Erro do último envio, preso à pergunta (`seq`) que falhou. */
export type AnswerError = { seq: number; message: string };

export function useTutorAnswers(agendaId: string) {
  const [answers, setAnswers] = useState<Record<number, AnswerOutcome>>({});
  const [pendingSeq, setPendingSeq] = useState<number | null>(null);
  const [error, setError] = useState<AnswerError | null>(null);
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
          // 201 = resposta nova; 200 com alreadyAnswered = resultado da resposta já gravada.
          setAnswers((prev) => ({ ...prev, [seq]: body.result as AnswerOutcome }));
        } else {
          setError({ seq, message: typeof body?.error === 'string' ? body.error : ANSWER_ERROR });
        }
      } catch {
        setError({ seq, message: ANSWER_ERROR });
      } finally {
        inFlight.current = false;
        setPendingSeq(null);
      }
    },
    [agendaId],
  );

  return { answers, submit, pendingSeq, error };
}
