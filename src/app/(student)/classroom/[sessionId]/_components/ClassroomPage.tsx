'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { InteractiveVideoPlayer } from '@/components/classroom/interactive-video-player';
import { SocraticChatPanel } from '@/components/classroom/socratic-chat-panel';
import { DynamicFaqAccordion } from '@/components/classroom/dynamic-faq-accordion';
import { PedagogicalMinutesModal } from '@/components/classroom/pedagogical-minutes-modal';
import { Badge } from '@/components/ui/badge';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { toAgendaSession } from '@/components/agendas/agenda-session';
import { useAgenda } from '@/components/agendas/use-agenda';
import { Skeleton } from '@/components/ui/skeleton';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import { Clock, BookOpen, GraduationCap, Video } from 'lucide-react';

interface ClassroomPageProps {
  sessionId: string;
}

export default function ClassroomPage({ sessionId }: ClassroomPageProps) {
  const [minutesModalOpen, setMinutesModalOpen] = React.useState(false);

  const { agenda: session, isLoading, error, notFound } = useAgenda(sessionId);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
        <AppHeader />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-[680px] w-full rounded-2xl" />
            </div>
          ) : (
            <AgendaNotFound message={notFound ? undefined : (error ?? undefined)} />
          )}
        </main>
      </div>
    );
  }

  const timeValidation = validateAgendaTimeWindow(toAgendaSession(session));

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Session Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="teal" className="gap-1 px-2.5 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                AO VIVO
              </Badge>
              <span className="text-xs font-semibold text-slate-500">
                {session.className}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {session.subject}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
              {session.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-0.5 flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                👨‍🏫 Professor Responsável: {session.teacherName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Clock className="h-4 w-4 text-brand-orange" />
              <span>{timeValidation.minutesRemaining} min restantes</span>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Video Player & Material Accordion (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <InteractiveVideoPlayer />
            <DynamicFaqAccordion />
          </div>

          {/* Right Column: Socratic Chat Panel with Tutora Lucy (5 cols) */}
          <div className="lg:col-span-5 h-[680px]">
            <SocraticChatPanel
              agendaType="CLASSROOM"
              agendaId={session.id}
              onOpenMinutesModal={() => setMinutesModalOpen(true)}
            />
          </div>
        </div>
      </main>

      {/* Pedagogical Minutes Output Modal */}
      {minutesModalOpen && (
        <PedagogicalMinutesModal
          open={minutesModalOpen}
          onOpenChange={setMinutesModalOpen}
          agendaId={session.id}
        />
      )}
    </div>
  );
}
