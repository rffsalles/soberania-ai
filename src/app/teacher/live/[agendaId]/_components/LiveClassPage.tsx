'use client';

import * as React from 'react';
import Link from 'next/link';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { useAgenda } from '@/components/agendas/use-agenda';
import { useAgendaLesson } from '@/components/classroom/use-agenda-lesson';
import { useClassEvents } from '@/components/classroom/use-class-events';
import { useLiveClassActions } from '@/components/classroom/use-live-class-actions';
import { LiveStatusIndicator } from '@/components/classroom/live-status-indicator';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { liveControls } from '@/domains/classroom/live-controls';
import { ROUTES } from '@/lib/constants/routes';
import { LessonScriptPanel } from './LessonScriptPanel';

const CONFIRM_END =
  'Encerrar a aula? A turma verá a aula como encerrada e as atas dos alunos serão geradas.';

export default function LiveClassPage({ agendaId }: { agendaId: string }) {
  const { agenda, isLoading, error: agendaError, notFound } = useAgenda(agendaId);
  const { lesson, isLoading: lessonLoading } = useAgendaLesson(agendaId);
  const { state, status } = useClassEvents(agendaId);
  const { send, pending, error } = useLiveClassActions(agendaId);

  const script = lesson?.timeScript ?? [];
  const controls = liveControls(state, script.length, pending !== null);
  const busy = pending !== null;

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
    if (window.confirm(CONFIRM_END)) void send({ type: 'SESSION_ENDED' });
  };

  return (
    <main className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {header}

      {state.phase === 'ENDED' ? (
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aula encerrada.</p>
          <Link href={ROUTES.REPORTS} className="text-sm underline text-brand-orange">
            Ver relatórios
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {state.phase === 'NOT_STARTED' ? (
              <Button type="button" disabled={!controls.canStart} onClick={() => void send({ type: 'SESSION_STARTED' })}>
                {pending === 'SESSION_STARTED' ? 'Iniciando...' : 'Iniciar aula'}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={controls.prevIndex === null}
                  onClick={() =>
                    controls.prevIndex !== null && void send({ type: 'STEP_CHANGED', stepIndex: controls.prevIndex })
                  }
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={controls.nextIndex === null}
                  onClick={() =>
                    controls.nextIndex !== null && void send({ type: 'STEP_CHANGED', stepIndex: controls.nextIndex })
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
              onGoTo={(i) => void send({ type: 'STEP_CHANGED', stepIndex: i })}
            />
          )}
        </section>
      </div>
    </main>
  );
}
