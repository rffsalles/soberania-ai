'use client';

import * as React from 'react';
import Link from 'next/link';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { useAgenda } from '@/components/agendas/use-agenda';
import { useAgendaLesson } from '@/components/classroom/use-agenda-lesson';
import { useClassEvents } from '@/components/classroom/use-class-events';
import { useClassPulse } from '@/components/classroom/use-class-pulse';
import { useLiveClassActions } from '@/components/classroom/use-live-class-actions';
import { LiveStatusIndicator } from '@/components/classroom/live-status-indicator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { reduceTeacherView } from '@/domains/classroom/class-state';
import { liveControls } from '@/domains/classroom/live-controls';
import { ROUTES } from '@/lib/constants/routes';
import { LessonScriptPanel } from './LessonScriptPanel';
import { TutorPanel } from './TutorPanel';

const AWAIT_EVENT_TIMEOUT_MS = 6000;

const CONFIRM_END = 'Encerrar a aula? A turma verá a aula como encerrada e as atas dos alunos serão geradas.';

export default function LiveClassPage({ agendaId }: { agendaId: string }) {
  const { agenda, isLoading, error: agendaError, notFound } = useAgenda(agendaId);
  const { lesson, isLoading: lessonLoading } = useAgendaLesson(agendaId);
  const { events, state, status, lastSeq } = useClassEvents(agendaId);
  const { send, pending, error, warning, clearError } = useLiveClassActions(agendaId);
  const [awaitedSeq, setAwaitedSeq] = React.useState<number | null>(null);

  // Após o POST, mantém os controles travados até o evento chegar pelo stream/polling (ou 6 s).
  const run = React.useCallback(
    async (cmd: Parameters<typeof send>[0]) => {
      const seq = await send(cmd);
      if (seq !== null) setAwaitedSeq(seq);
    },
    [send]
  );
  const waiting = awaitedSeq !== null && lastSeq < awaitedSeq;

  React.useEffect(() => {
    if (awaitedSeq === null) return;
    if (lastSeq >= awaitedSeq) {
      setAwaitedSeq(null);
      return;
    }
    const t = setTimeout(() => setAwaitedSeq(null), AWAIT_EVENT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [awaitedSeq, lastSeq]);

  // Um erro de ação deixa de valer quando o estado da aula muda.
  React.useEffect(() => {
    clearError();
  }, [state.phase, state.currentStepIndex, clearError]);

  const script = lesson?.timeScript ?? [];
  const baseView = reduceTeacherView(events, [], script.length);
  const { pulse } = useClassPulse(agendaId, lastSeq, baseView.questionSeq !== null);
  const controls = liveControls(state, script.length, pending !== null || waiting);
  const busy = pending !== null || waiting;
  const view = reduceTeacherView(events, pulse, script.length);

  if (isLoading || !agenda) {
    return (
      <main className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </>
        ) : (
          <AgendaNotFound message={notFound ? undefined : (agendaError ?? undefined)} />
        )}
      </main>
    );
  }

  const header = (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="space-y-1">
        <h1 className="text-lg sm:text-xl font-bold font-heading text-slate-900 dark:text-white">{agenda.title}</h1>
        <p className="text-xs text-slate-500">
          {agenda.className} · {agenda.subject}
        </p>
      </div>
      <LiveStatusIndicator status={status} />
    </div>
  );

  if (agenda.type !== 'CLASSROOM') {
    return (
      <main className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {header}
        <p className="text-sm text-slate-600 dark:text-slate-300">Só aulas podem ser conduzidas por esta tela.</p>
      </main>
    );
  }

  const endClass = () => {
    if (window.confirm(CONFIRM_END)) void run({ type: 'SESSION_ENDED' });
  };

  return (
    <main className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {header}

      {state.phase === 'ENDED' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aula encerrada.</p>
            <Link href={ROUTES.REPORTS} className="text-sm underline text-brand-orange">
              Ver relatórios
            </Link>
          </div>
          {warning && (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
              {warning}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {state.phase === 'NOT_STARTED' ? (
              <Button type="button" disabled={!controls.canStart} onClick={() => void run({ type: 'SESSION_STARTED' })}>
                {pending === 'SESSION_STARTED' ? 'Iniciando...' : 'Iniciar aula'}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={controls.prevIndex === null}
                  onClick={() =>
                    controls.prevIndex !== null &&
                    void run({
                      type: 'STEP_CHANGED',
                      stepIndex: controls.prevIndex,
                    })
                  }
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={controls.nextIndex === null}
                  onClick={() =>
                    controls.nextIndex !== null &&
                    void run({
                      type: 'STEP_CHANGED',
                      stepIndex: controls.nextIndex,
                    })
                  }
                >
                  Próximo
                </Button>
                <Button type="button" variant="destructive" disabled={!controls.canEnd || busy} onClick={endClass}>
                  {pending === 'SESSION_ENDED' ? 'Encerrando...' : 'Encerrar aula'}
                </Button>
              </>
            )}
          </div>
          {state.phase === 'NOT_STARTED' && (
            <p className="text-sm text-slate-500">A turma verá o primeiro passo assim que você iniciar a aula.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 space-y-3">
          {lessonLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : lesson === null ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Esta agenda não tem plano de aula vinculado.</p>
          ) : script.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Este plano de aula não tem roteiro. Você pode iniciar e encerrar a aula, mas não há passos para conduzir.
            </p>
          ) : (
            <LessonScriptPanel
              script={script}
              controls={controls}
              onGoTo={(i) => void run({ type: 'STEP_CHANGED', stepIndex: i })}
            />
          )}
        </section>
        <aside className="lg:col-span-5">
          <TutorPanel
            view={view}
            nextActivity={view.nextStepIndex !== null ? (script[view.nextStepIndex]?.activity ?? null) : null}
            disabled={busy || state.phase !== 'RUNNING'}
            onNote={(cmd) => void run(cmd)}
          />
        </aside>
      </div>
    </main>
  );
}
