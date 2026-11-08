import * as React from 'react';
import { API_ROUTES } from '@/lib/constants/routes';
import { RequestError, requestJson } from '@/components/assessments/use-assessments';
import type { PreparedStep } from '@/domains/classroom/tutor-draft-service';

const HTTP_CONFLICT = 409;
/** 409 que vale para a aula inteira: não adianta tentar os outros passos. */
const LESSON_LEVEL_CODES = new Set(['CLASS_ENDED', 'NO_AGENDA', 'LESSON_NOT_PUBLISHED']);

type StepResult =
  | PreparedStep
  | { stepIndex: number; status: 'ERROR'; message: string | null }
  | { status: 'ABORTED'; message: string };

function lessonLevelConflict(err: unknown): err is RequestError {
  if (!(err instanceof RequestError) || err.status !== HTTP_CONFLICT) return false;
  const code = (err.details as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && LESSON_LEVEL_CODES.has(code);
}

const STATUS_TEXT = {
  MUTED: 'tutora em silêncio.',
  NO_MATERIAL: 'sem trecho do material.',
  BUSY: 'em preparo por outra requisição; tente de novo em 1 minuto.',
  ERROR: 'não foi possível preparar.',
} as const;

export function prepareSummary(results: StepResult[]): string[] {
  const aborted = results.find((r) => r.status === 'ABORTED');
  if (aborted) return [`Tutora não preparada: ${aborted.message}`];
  const steps = results as Array<Exclude<StepResult, { status: 'ABORTED' }>>;
  const ready = steps.filter((r) => r.status === 'READY').length;
  const lines = [`Tutora preparada: ${ready} de ${steps.length} passos com conteúdo pronto.`];
  for (const r of steps) {
    if (r.status === 'READY') continue;
    let text: string;
    if (r.status === 'FAILED') text = r.message ?? STATUS_TEXT.ERROR;
    else if (r.status === 'ERROR') text = r.message ? `${STATUS_TEXT.ERROR} ${r.message}` : STATUS_TEXT.ERROR;
    else text = STATUS_TEXT[r.status];
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
          } catch (err) {
            if (lessonLevelConflict(err)) {
              results.push({ status: 'ABORTED', message: err.message });
              break;
            }
            results.push({ stepIndex: i, status: 'ERROR', message: err instanceof RequestError ? err.message : null });
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

  const clearSummary = React.useCallback(() => setSummary(null), []);

  return { run, running, progress, summary, clearSummary };
}
