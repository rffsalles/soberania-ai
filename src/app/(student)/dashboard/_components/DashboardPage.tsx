'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { PedagogicalMinutesModal } from '@/components/classroom/pedagogical-minutes-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgendas } from '@/components/agendas/use-agenda';
import { useCurrentUser } from '@/components/layout/use-current-user';
import { getAgendaLink } from '@/lib/constants/routes';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { useMinutes } from '@/components/pedagogy/use-minutes';
import { RetentionScore } from '@/components/pedagogy/retention-score';
import {
  Calendar,
  Video,
  Users,
  FileCheck2,
  Clock,
  Sparkles,
  BookOpen,
  Award,
  ArrowRight,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';

const AGENDA_ICONS: Record<AgendaDTO['type'], typeof Video> = {
  CLASSROOM: Video,
  STUDY_GROUP: Users,
  EXAM: FileCheck2,
  OFFICE_HOURS: BookOpen,
  DRAFT_REVIEW: FileText,
};

const AGENDA_STATUS_LABEL: Record<AgendaDTO['status'], string> = {
  LIVE: 'SESSÃO AO VIVO',
  SCHEDULED: 'AGENDADA',
  COMPLETED: 'ENCERRADA',
  CANCELLED: 'CANCELADA',
};

function formatTimeWindow(agenda: AgendaDTO): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: INSTITUTION_TIMEZONE, hour: '2-digit', minute: '2-digit' };
  const start = new Date(agenda.startTime).toLocaleTimeString('pt-BR', options);
  const end = new Date(agenda.endTime).toLocaleTimeString('pt-BR', options);
  return `${start} – ${end}`;
}

function AgendaCard({ agenda }: { agenda: AgendaDTO }) {
  const Icon = AGENDA_ICONS[agenda.type];
  const isLive = agenda.status === 'LIVE';
  const isClosed = agenda.status === 'COMPLETED' || agenda.status === 'CANCELLED';

  return (
    <Card
      className={cn(
        'rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between',
        isLive
          ? 'border-brand-orange/50 bg-white dark:bg-slate-900 shadow-soft-sm'
          : 'border-slate-200 dark:border-slate-800'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant={isLive ? 'amber' : 'secondary'} className="text-xs font-semibold">
            {AGENDA_STATUS_LABEL[agenda.status]}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">{agenda.subject}</span>
        </div>

        <div className="flex items-start gap-3 pt-2">
          <div className={cn('p-2 rounded-xl shrink-0', isLive ? 'bg-brand-orange/10 text-brand-orange' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base font-semibold leading-snug">{agenda.title}</CardTitle>
            <div className="flex flex-col gap-0.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                👨‍🏫 {agenda.teacherName}
              </span>
              <span className="text-[11px] text-slate-500">{agenda.className}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-mono">
            <Clock className="h-3.5 w-3.5 text-brand-teal" />
            <span>{formatTimeWindow(agenda)}</span>
          </div>

          {!isClosed && (
            <Link href={getAgendaLink(agenda)}>
              <Button
                size="sm"
                variant={isLive ? 'default' : 'outline'}
                className={cn(
                  'text-xs h-8 cursor-pointer gap-1',
                  isLive && 'bg-brand-teal hover:bg-brand-teal-dark text-white'
                )}
              >
                <span>Entrar</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AgendaGroup({ title, agendas }: { title: string; agendas: AgendaDTO[] }) {
  if (agendas.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {agendas.map((agenda) => (
          <AgendaCard key={agenda.id} agenda={agenda} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [selectedMinuteAgenda, setSelectedMinuteAgenda] = React.useState<string | null>(null);
  const { agendas, isLoading: agendasLoading, error: agendasError } = useAgendas();
  const { user } = useCurrentUser();
  const { data: minutesHistory, isLoading: minutesLoading, error: minutesError } = useMinutes();

  const liveAgendas = agendas.filter((a) => a.status === 'LIVE');
  const upcomingAgendas = agendas.filter((a) => a.status === 'SCHEDULED');
  const closedAgendas = agendas.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED');
  const firstLive = liveAgendas[0];
  const completedCount = agendas.filter((a) => a.status === 'COMPLETED').length;
  const averageEngagement = minutesHistory.length
    ? (minutesHistory.reduce((sum, m) => sum + m.engagementScore, 0) / minutesHistory.length).toFixed(1)
    : null;
  const totalQuestions = minutesHistory.reduce((sum, m) => sum + m.totalQuestionsAsked, 0);

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header with Multi-Agendas Summary */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-brand-teal via-brand-teal-dark to-slate-900 text-white shadow-md">
          <div className="space-y-1.5">
            {user?.class && (
              <Badge className="bg-white/20 hover:bg-white/25 text-white border-0 text-xs font-semibold backdrop-blur-xs">
                {user.class.academicPeriod.name}
              </Badge>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold font-heading">
              {user ? `Bem-vindo, ${user.name}!` : 'Bem-vindo!'}
            </h1>
            <p className="text-sm text-teal-100 max-w-xl">
              {agendasLoading
                ? 'Carregando suas agendas...'
                : `Você possui ${liveAgendas.length} sessão(ões) ao vivo e ${upcomingAgendas.length} agendada(s).`}
            </p>
          </div>

          {firstLive && (
            <div className="flex items-center gap-3">
              <Link href={getAgendaLink(firstLive)}>
                <Button size="lg" className="bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer shadow-lg">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Entrar na Sessão Agora
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Metrics Quick Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Aulas Concluídas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  {completedCount} / {agendas.length}
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-brand-teal/10 flex items-center justify-center text-brand-teal">
                <Video className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Média de Engajamento</p>
                <h3 className="text-2xl font-bold font-heading text-emerald-600 dark:text-emerald-400 mt-1">
                  {averageEngagement ? `${averageEngagement}%` : '—'}
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Dúvidas Socráticas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  {totalQuestions} Enviadas
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange">
                <Sparkles className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Atas Pedagógicas</p>
                <h3 className="text-2xl font-bold font-heading text-slate-900 dark:text-white mt-1">
                  {minutesHistory.length} Emitidas
                </h3>
              </div>
              <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <FileText className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 1: Multi-Agendas Sessions Carousel/Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-teal" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Sua Grade de Multi-Agendas
              </h2>
            </div>
          </div>

          {agendasLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ) : agendasError ? (
            <p className="text-sm text-red-600">{agendasError}</p>
          ) : agendas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma sessão agendada para você.</p>
          ) : (
            <div className="space-y-6">
              <AgendaGroup title="Ao vivo agora" agendas={liveAgendas} />
              <AgendaGroup title="Próximas" agendas={upcomingAgendas} />
              <AgendaGroup title="Encerradas" agendas={closedAgendas} />
            </div>
          )}
        </div>

        {/* Section 2: Historical Pedagogical Minutes Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-brand-orange" />
              <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
                Histórico de Atas Pedagógicas
              </h2>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aula / Sessão</TableHead>
                  <TableHead>Engajamento</TableHead>
                  <TableHead>Pontos Fortes</TableHead>
                  <TableHead>Recomendação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {minutesLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {minutesError && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-red-600">
                      {minutesError}
                    </TableCell>
                  </TableRow>
                )}
                {!minutesLoading && !minutesError && minutesHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-slate-500">
                      Nenhuma ata emitida até o momento.
                    </TableCell>
                  </TableRow>
                )}
                {minutesHistory.map((m) => (
                  <TableRow
                    key={m.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedMinuteAgenda(m.agendaId)}
                  >
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      <div>
                        <p>{m.sessionTitle}</p>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RetentionScore score={m.engagementScore} />
                        <Progress value={m.engagementScore} className="w-16 h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {m.topicsMastered.slice(0, 2).map((t) => (
                          <Badge key={t} variant="teal" className="text-[10px] py-0">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {m.aiGenerated ? m.actionableAdvice : <span className="text-amber-600">Parecer pendente (IA indisponível)</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-brand-teal hover:text-brand-teal-dark cursor-pointer gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMinuteAgenda(m.agendaId);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Ver Ata</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      {/* Ata Modal Viewer */}
      {selectedMinuteAgenda && (
        <PedagogicalMinutesModal
          open
          onOpenChange={(open) => !open && setSelectedMinuteAgenda(null)}
          agendaId={selectedMinuteAgenda}
        />
      )}
    </div>
  );
}
