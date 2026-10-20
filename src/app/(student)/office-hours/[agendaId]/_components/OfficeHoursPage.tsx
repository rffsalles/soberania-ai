'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { UniversalSocraticChat } from '@/components/ai/universal-socratic-chat';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { toAgendaSession } from '@/components/agendas/agenda-session';
import { useAgenda } from '@/components/agendas/use-agenda';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';

interface OfficeHoursPageProps {
  agendaId: string;
}

export default function OfficeHoursPage({ agendaId }: OfficeHoursPageProps) {
  const { agenda, isLoading, error, notFound } = useAgenda(agendaId);

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-[680px] w-full rounded-2xl" />
          </div>
        ) : !agenda ? (
          <AgendaNotFound message={notFound ? undefined : (error ?? undefined)} />
        ) : (
          <>
            <div className="space-y-1 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="teal">Plantão de Dúvidas</Badge>
                <span className="text-xs font-semibold text-slate-500">{agenda.className}</span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{agenda.subject}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
                {agenda.title}
              </h1>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                👨‍🏫 Professor Responsável: {agenda.teacherName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {validateAgendaTimeWindow(toAgendaSession(agenda)).message}
              </p>
            </div>

            <div className="h-[680px]">
              <UniversalSocraticChat agendaType="OFFICE_HOURS" sessionId={agenda.id} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
