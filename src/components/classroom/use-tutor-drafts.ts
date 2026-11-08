'use client';

import { useEffect, useState } from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import type { TutorDraftView } from '@/domains/classroom/tutor-draft-service';

/**
 * Rascunhos da tutora do plano de aula: lê na montagem e a cada `reloadKey`, sem polling.
 * Sem `lessonPlanId` não busca; falha mantém a lista anterior.
 */
export function useTutorDrafts(lessonPlanId: string | null, reloadKey: number | null): { drafts: TutorDraftView[] } {
  const [drafts, setDrafts] = useState<TutorDraftView[]>([]);

  useEffect(() => {
    if (!lessonPlanId) {
      setDrafts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_ROUTES.TEACHER_LESSONS}/${encodeURIComponent(lessonPlanId)}/tutor-drafts`);
        const body = await res.json().catch(() => null);
        if (
          !cancelled &&
          res.ok &&
          body?.success &&
          Array.isArray(body.drafts)
        ) {
          setDrafts(body.drafts as TutorDraftView[]);
        }
      } catch {
        // mantém a lista anterior
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonPlanId, reloadKey]);

  return { drafts };
}
