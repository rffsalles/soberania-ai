import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { requestJson } from '@/components/assessments/use-assessments';
import type { PreparedStep } from '@/domains/classroom/tutor-draft-service';

type StepResult = PreparedStep | { stepIndex: number; status: 'ERROR' };

const STATUS_TEXT = {
  MUTED: 'tutora em silêncio.',
  NO_MATERIAL: 'sem trecho do material.',
  BUSY: 'em preparo por outra requisição; tente de novo em 1 minuto.',
  ERROR: 'não foi possível preparar.',
} as const;

export function prepareSummary(results: StepResult[]): string[] {
  const ready = results.filter((r) => r.status === 'READY').length;
  const lines = [`Tutora preparada: ${ready} de ${results.length} passos com conteúdo pronto.`];
  for (const r of results) {
    if (r.status === 'READY') continue;
    const text = r.status === 'FAILED' ? ((r as PreparedStep).message ?? STATUS_TEXT.ERROR) : STATUS_TEXT[r.status];
    lines.push(`Passo ${r.stepIndex + 1}: ${text}`);
  }
  return lines;
}

export function usePrepareTutor(lessonId: string) {
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = React.useState<string[] | null>(null);
  const inFlight = React.useRef(false);

  const run = React.useCallback(
    async (stepCount: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRunning(true);
      setSummary(null);
      setProgress({ done: 0, total: stepCount });
      const results: StepResult[] = [];
      try {
        for (let i = 0; i < stepCount; i++) {
          try {
            const body = await requestJson<{ step: PreparedStep }>(
              `${API_ROUTES.TEACHER_LESSONS}/${lessonId}/tutor-drafts`,
              'POST',
              { stepIndex: i },
            );
            results.push(body.step);
          } catch {
            results.push({ stepIndex: i, status: 'ERROR' });
          }
          setProgress({ done: i + 1, total: stepCount });
        }
        setSummary(prepareSummary(results));
      } finally {
        inFlight.current = false;
        setRunning(false);
        setProgress(null);
      }
    },
    [lessonId],
  );

  return { run, running, progress, summary };
}
