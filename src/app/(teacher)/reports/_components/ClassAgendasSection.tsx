'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { changeAgendaStatus, generateClassMinutes } from '@/components/agendas/agenda-actions';
import { teacherLivePath } from '@/lib/constants/routes';
import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { AgendaMinutesResult } from '@/domains/pedagogy/services/minutes-service';

const STATUS_LABEL: Record<AgendaDTO['status'], string> = {
  SCHEDULED: 'Agendada',
  LIVE: 'Ao vivo',
  COMPLETED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

const TYPE_LABEL: Record<AgendaDTO['type'], string> = {
  CLASSROOM: 'Aula',
  STUDY_GROUP: 'Grupo de estudos',
  EXAM: 'Prova',
  OFFICE_HOURS: 'Plantão',
  DRAFT_REVIEW: 'Revisão de rascunho',
};

type Action = 'complete' | 'cancel' | 'minutes';

const CONFIRM_TEXT: Record<Action, string> = {
  complete: 'Encerrar esta agenda? As atas dos alunos serão geradas em seguida.',
  cancel: 'Cancelar esta agenda? Os alunos não poderão mais acessá-la.',
  minutes: 'Gerar (ou regenerar) as atas de todos os alunos que interagiram nesta agenda?',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, dateStyle: 'short', timeStyle: 'short' });

function describeMinutes(result: AgendaMinutesResult | undefined): string {
  if (!result) return 'Agenda encerrada.';
  const failed = result.failed.length ? ` ${result.failed.length} falharam.` : '';
  return `${result.generated} ata(s) gerada(s).${failed}`;
}

interface Props {
  agendas: AgendaDTO[];
  isLoading: boolean;
  error: string | null;
  /** Chamado após qualquer ação concluída, para recarregar agendas e atas. */
  onChanged: () => void;
}

/** Agendas visíveis ao professor (GET /agendas já filtra por papel) com as ações de encerramento e atas. */
export function ClassAgendasSection({ agendas, isLoading, error, onChanged }: Props) {
  const [pending, setPending] = React.useState<{ id: string; action: Action } | null>(null);
  const [feedback, setFeedback] = React.useState<{ id: string; text: string; isError: boolean } | null>(null);

  async function run(agenda: AgendaDTO, action: Action) {
    if (!window.confirm(CONFIRM_TEXT[action])) return;
    setPending({ id: agenda.id, action });
    setFeedback(null);
    try {
      let text: string;
      if (action === 'minutes') {
        text = describeMinutes(await generateClassMinutes(agenda.id));
      } else if (action === 'complete') {
        text = describeMinutes((await changeAgendaStatus(agenda.id, 'COMPLETED')).minutesResult);
      } else {
        await changeAgendaStatus(agenda.id, 'CANCELLED');
        text = 'Agenda cancelada.';
      }
      setFeedback({ id: agenda.id, text, isError: false });
      onChanged();
    } catch (err) {
      setFeedback({ id: agenda.id, text: err instanceof Error ? err.message : 'Falha na ação.', isError: true });
    } finally {
      setPending(null);
    }
  }

  const busy = (id: string, action: Action) => pending?.id === id && pending.action === action;

  return (
    <section className="print-hidden space-y-3 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <CalendarCheck2 className="h-5 w-5 text-brand-teal" />
        <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">Agendas da turma</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Encerre ou cancele sessões e gere as atas da turma inteira. Encerrar já gera as atas.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : agendas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma agenda nas suas disciplinas.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agenda</TableHead>
              <TableHead>Turma</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agendas.map((agenda) => {
              const open = agenda.status === 'SCHEDULED' || agenda.status === 'LIVE';
              const disabled = pending !== null;
              return (
                <TableRow key={agenda.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900 dark:text-white">{agenda.title}</span>
                      <span className="text-xs text-slate-500">
                        {TYPE_LABEL[agenda.type]} · {agenda.subject}
                      </span>
                      {feedback?.id === agenda.id && (
                        <span
                          role={feedback.isError ? 'alert' : 'status'}
                          className={feedback.isError ? 'text-xs text-red-600' : 'text-xs text-emerald-600'}
                        >
                          {feedback.text}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{agenda.className}</TableCell>
                  <TableCell className="text-sm">{formatWhen(agenda.startTime)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_LABEL[agenda.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {agenda.type === 'CLASSROOM' && agenda.status === 'LIVE' && (
                        <Button size="sm" asChild>
                          <Link href={teacherLivePath(agenda.id)}>Conduzir aula</Link>
                        </Button>
                      )}
                      {open && (
                        <>
                          <Button size="sm" variant="outline" disabled={disabled} onClick={() => run(agenda, 'complete')}>
                            {busy(agenda.id, 'complete') ? 'Encerrando...' : 'Encerrar'}
                          </Button>
                          <Button size="sm" variant="outline" disabled={disabled} onClick={() => run(agenda, 'cancel')}>
                            {busy(agenda.id, 'cancel') ? 'Cancelando...' : 'Cancelar'}
                          </Button>
                        </>
                      )}
                      {(agenda.status === 'LIVE' || agenda.status === 'COMPLETED') && (
                        <Button
                          size="sm"
                          disabled={disabled}
                          className="bg-brand-teal hover:bg-brand-teal-dark text-white"
                          onClick={() => run(agenda, 'minutes')}
                        >
                          {busy(agenda.id, 'minutes') ? 'Gerando...' : 'Gerar atas'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
