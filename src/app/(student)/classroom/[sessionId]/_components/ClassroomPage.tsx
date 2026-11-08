'use client';

import * as React from 'react';
import { InteractiveVideoPlayer, type SocraticCheckpoint } from '@/components/classroom/interactive-video-player';
import { SocraticChatPanel } from '@/components/classroom/socratic-chat-panel';
import { DynamicFaqAccordion } from '@/components/classroom/dynamic-faq-accordion';
import { PedagogicalMinutesModal } from '@/components/classroom/pedagogical-minutes-modal';
import { Badge } from '@/components/ui/badge';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { useAgenda } from '@/components/agendas/use-agenda';
import { useFillViewportHeight } from '@/components/classroom/use-fill-viewport-height';
import { useAgendaFaqs, useAgendaLesson } from '@/components/classroom/use-agenda-lesson';
import { resolveMediaType } from '@/domains/teaching/media-type';
import { INSTITUTION_TIMEZONE, LESSON_MEDIA_TYPE } from '@/lib/constants/teaching';
import { Skeleton } from '@/components/ui/skeleton';
import { deriveAgendaStatus } from '@/domains/agendas/agenda-validator';
import { useClassEvents } from '@/components/classroom/use-class-events';
import { NowInClassStrip } from '@/components/classroom/now-in-class-strip';
import { useTutorAnswers } from '@/components/classroom/use-tutor-answers';
import { reduceStudentView } from '@/domains/classroom/class-state';
import { useSessionClock } from '@/components/classroom/use-session-clock';
import { useVideoStepReporter } from '@/components/classroom/use-video-step-reporter';
import { Clock, BookOpen, GraduationCap, Video } from 'lucide-react';

const AGENDA_STATUS_LIVE = 'LIVE';

const STATUS_BADGE: Record<string, { label: string; variant: 'teal' | 'secondary' }> = {
  LIVE: { label: 'AO VIVO', variant: 'teal' },
  SCHEDULED: { label: 'AGENDADA', variant: 'secondary' },
  COMPLETED: { label: 'ENCERRADA', variant: 'secondary' },
  CANCELLED: { label: 'CANCELADA', variant: 'secondary' },
};

const END_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: INSTITUTION_TIMEZONE,
});

const CHAT_COLUMN_CLASSES = 'lg:col-span-5 h-[70vh] lg:sticky lg:top-[6.5rem]';

interface ClassroomPageProps {
  sessionId: string;
}

export default function ClassroomPage({ sessionId }: ClassroomPageProps) {
  const [minutesModalOpen, setMinutesModalOpen] = React.useState(false);

  const [activeCheckpoint, setActiveCheckpoint] = React.useState<SocraticCheckpoint | null>(null);

  const { agenda: session, isLoading, error, notFound } = useAgenda(sessionId);
  const { lesson, isLoading: lessonLoading } = useAgendaLesson(sessionId);
  const { events, state, lastSeq, status: eventsStatus } = useClassEvents(sessionId);
  const { answers, submit: submitAnswer, pendingSeq, error: answerError } = useTutorAnswers(sessionId);
  const view = React.useMemo(() => reduceStudentView(events, answers), [events, answers]);
  const [chatDraft, setChatDraft] = React.useState<{ text: string; nonce: number } | undefined>(undefined);
  const onContinueInChat = React.useCallback((text: string) => setChatDraft({ text, nonce: Date.now() }), []);
  // '' antes de a sessão carregar: nextBoundaryDelay devolve null e nenhum timer é armado.
  const now = useSessionClock(session?.startTime ?? '', session?.endTime ?? '', state.phase);
  const [repliesDone, setRepliesDone] = React.useState(0);
  const onReplyDone = React.useCallback(() => setRepliesDone((n) => n + 1), []);
  const { faqs, isLoading: faqsLoading } = useAgendaFaqs(sessionId, `${lastSeq}:${repliesDone}`);

  const chatColumnRef = React.useRef<HTMLDivElement>(null);
  useFillViewportHeight(chatColumnRef, 16, 360, Boolean(session));

  const checkpoints = React.useMemo<SocraticCheckpoint[]>(
    () =>
      (lesson?.timeScript ?? []).flatMap((item) =>
        item.socraticQuestion
          ? [{ timeSeconds: item.timeSeconds, question: item.socraticQuestion, label: item.activity }]
          : []
      ),
    [lesson]
  );

  const lessonVideoUrl = lesson?.videoUrl ?? session?.videoUrl ?? null;
  const lessonMediaType = lesson?.mediaType ?? resolveMediaType(session?.videoUrl);
  const stepTimes = React.useMemo(() => (lesson?.timeScript ?? []).map((s) => s.timeSeconds), [lesson]);
  // Aula gravada só na reprise: até o fim da janela a aula ainda pode acontecer ao vivo (o servidor dá 409 CLASS_NOT_OVER).
  const afterClassWindow = session ? now.getTime() > new Date(session.endTime).getTime() : false;
  const reportStepEnabled =
    state.phase === 'NOT_STARTED' &&
    afterClassWindow &&
    Boolean(lessonVideoUrl) &&
    lessonMediaType !== LESSON_MEDIA_TYPE.NONE &&
    stepTimes.length > 0;
  const reportStep = useVideoStepReporter(sessionId, reportStepEnabled);

  if (isLoading || !session) {
    return (
      <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
        <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className={`${CHAT_COLUMN_CLASSES.replace("lg:col-span-5 ", "")} lg:h-[calc(100vh-7.5rem)] w-full rounded-2xl`} />
            </div>
          ) : (
            <AgendaNotFound message={notFound ? undefined : (error ?? undefined)} />
          )}
        </main>
      </div>
    );
  }

  const status =
    state.phase === 'ENDED' ? 'COMPLETED' : state.phase === 'RUNNING' ? 'LIVE' : deriveAgendaStatus(session, now);
  const statusBadge = STATUS_BADGE[status] ?? STATUS_BADGE.SCHEDULED;
  const endsAt = END_TIME_FORMAT.format(new Date(session.endTime));

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Session Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadge.variant} className="gap-1 px-2.5 py-0.5">
                {status === AGENDA_STATUS_LIVE && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
                {statusBadge.label}
              </Badge>
              <span className="text-xs font-semibold text-slate-500">
                {session.className}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {session.subject}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold font-heading text-slate-900 dark:text-white">
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
              <span>até {endsAt}</span>
            </div>
          </div>
        </div>

        <NowInClassStrip
          view={view}
          status={eventsStatus}
          onAnswer={(seq, input) => void submitAnswer(seq, input)}
          answerPending={pendingSeq !== null}
          answerError={answerError}
          onContinueInChat={onContinueInChat}
        />

        {/* 2-Column Responsive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Video Player & Material Accordion (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {lessonLoading ? (
              <Skeleton className="aspect-video w-full rounded-2xl" />
            ) : (
              <InteractiveVideoPlayer
                videoUrl={lessonVideoUrl}
                mediaType={lessonMediaType}
                checkpoints={checkpoints}
                onTriggerCheckpoint={setActiveCheckpoint}
                stepTimes={stepTimes}
                onStepCross={reportStepEnabled ? reportStep : undefined}
              />
            )}
            {activeCheckpoint && (
              <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-4 py-2 text-sm text-slate-800 dark:text-slate-100">
                Pausa socrática: {activeCheckpoint.question}
              </div>
            )}
            <DynamicFaqAccordion faqs={faqs} isLoading={faqsLoading} />
          </div>

          {/* Right Column: Socratic Chat Panel with Tutora Lucy (5 cols) */}
          <div ref={chatColumnRef} className={CHAT_COLUMN_CLASSES}>
            <SocraticChatPanel
              agendaType="CLASSROOM"
              agendaId={session.id}
              suggestions={activeCheckpoint ? [activeCheckpoint.question] : undefined}
              onOpenMinutesModal={() => setMinutesModalOpen(true)}
              onReplyDone={onReplyDone}
              draft={chatDraft}
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
