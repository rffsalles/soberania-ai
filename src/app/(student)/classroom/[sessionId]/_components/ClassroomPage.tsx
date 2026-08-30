'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { InteractiveVideoPlayer } from '@/components/classroom/interactive-video-player';
import { SocraticChatPanel } from '@/components/classroom/socratic-chat-panel';
import { DynamicFaqAccordion } from '@/components/classroom/dynamic-faq-accordion';
import { PedagogicalMinutesModal } from '@/components/classroom/pedagogical-minutes-modal';
import { Badge } from '@/components/ui/badge';
import { getMockAgendaById } from '@/domains/agendas/agenda-service';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import { Clock, BookOpen, GraduationCap, Video } from 'lucide-react';

interface ClassroomPageProps {
  sessionId: string;
}

export default function ClassroomPage({ sessionId }: ClassroomPageProps) {
  const [minutesModalOpen, setMinutesModalOpen] = React.useState(false);

  const session = getMockAgendaById(sessionId) || {
    id: sessionId,
    title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
    subject: 'Banco de Dados I',
    type: 'CLASSROOM' as const,
    status: 'LIVE' as const,
    startTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 70 * 60 * 1000).toISOString(),
    classId: 'class-ads-3a',
    className: '3º Semestre · Análise e Desenv. de Sistemas',
    instructorName: 'Profª. Luci',
  };

  const timeValidation = validateAgendaTimeWindow(session);

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

          {/* Right Column: Socratic Chat Panel with Prof. Luci (5 cols) */}
          <div className="lg:col-span-5 h-[680px]">
            <SocraticChatPanel
              agendaType="CLASSROOM"
              sessionId={session.id}
              onOpenMinutesModal={() => setMinutesModalOpen(true)}
            />
          </div>
        </div>
      </main>

      {/* Pedagogical Minutes Output Modal */}
      <PedagogicalMinutesModal
        open={minutesModalOpen}
        onOpenChange={setMinutesModalOpen}
        agendaId={session.id}
        sessionTitle={session.title}
      />
    </div>
  );
}
