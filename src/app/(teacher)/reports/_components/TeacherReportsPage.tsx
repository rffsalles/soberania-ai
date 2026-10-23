'use client';

import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAgendas } from '@/components/agendas/use-agenda';
import { useHeatmap, useMinutes, buildMinuteQuery } from '@/components/pedagogy/use-minutes';
import { RetentionScore } from '@/components/pedagogy/retention-score';
import { API_ROUTES } from '@/lib/constants/routes';
import type { MinuteFilter } from '@/domains/pedagogy/services/minutes-service';
import { BarChart3, Flame, Lightbulb, FileCheck2, Download, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClassAgendasSection } from './ClassAgendasSection';

const HIGH_STRUGGLE_PERCENT = 40;
const END_OF_DAY = 'T23:59:59.999';
const START_OF_DAY = 'T00:00:00.000';
const ALL_OPTION = '';
const SELECT_CLASS =
  'h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-white';

interface SubjectOption {
  id: string;
  name: string;
}

interface FilterState {
  classId: string;
  studentId: string;
  subjectId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: FilterState = { classId: '', studentId: '', subjectId: '', from: '', to: '' };

function toApiFilter(f: FilterState): MinuteFilter {
  return {
    classId: f.classId || undefined,
    studentId: f.studentId || undefined,
    subjectId: f.subjectId || undefined,
    from: f.from ? new Date(`${f.from}${START_OF_DAY}`).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}${END_OF_DAY}`).toISOString() : undefined,
  };
}

function describeFilters(
  f: FilterState,
  classes: SubjectOption[],
  students: SubjectOption[],
  subjects: SubjectOption[]
): string {
  const nameOf = (list: SubjectOption[], id: string, all: string) =>
    id ? (list.find((o) => o.id === id)?.name ?? id) : all;
  const period = f.from || f.to ? `${f.from || '…'} a ${f.to || '…'}` : 'Todo o período';
  return [
    `Turma: ${nameOf(classes, f.classId, 'Todas')}`,
    `Aluno: ${nameOf(students, f.studentId, 'Todos')}`,
    `Disciplina: ${nameOf(subjects, f.subjectId, 'Todas')}`,
    `Período: ${period}`,
  ].join(' | ');
}

function useSubjects(): SubjectOption[] {
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(API_ROUTES.ADMIN_SUBJECTS, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body?.subjects) setSubjects(body.subjects as SubjectOption[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return subjects;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  allLabel: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      <select className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL_OPTION}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function TeacherReportsPage() {
  const [filters, setFilters] = React.useState<FilterState>(EMPTY_FILTERS);
  const apiFilter = React.useMemo(() => toApiFilter(filters), [filters]);

  // Incrementado após encerrar/cancelar agendas ou gerar atas, para recarregar os dados do painel.
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = React.useCallback(() => setReloadKey((k) => k + 1), []);

  const { agendas, isLoading: agendasLoading, error: agendasError } = useAgendas(reloadKey);
  const subjects = useSubjects();
  const { data: minutes, isLoading: minutesLoading, error: minutesError } = useMinutes(apiFilter, reloadKey);
  const { data: heatmap, isLoading: heatmapLoading, error: heatmapError } = useHeatmap(apiFilter, reloadKey);
  // Alunos disponíveis vêm das atas sem filtro de aluno, para o seletor não encolher ao selecionar.
  const { data: allMinutes } = useMinutes({ ...apiFilter, studentId: undefined }, reloadKey);

  const classOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    agendas.forEach((a) => map.set(a.classId, a.className));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [agendas]);

  const studentOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    allMinutes.forEach((m) => map.set(m.studentId, m.studentName));
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [allMinutes]);

  const update = (patch: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...patch }));

  const exportCsv = () => {
    window.open(`${API_ROUTES.PEDAGOGY_EXPORT_CSV}${buildMinuteQuery(apiFilter)}`, '_blank');
  };

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <Badge variant="teal" className="gap-1 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Painel Pedagógico Docente
            </Badge>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Diagnóstico de Dificuldades & Atas Pedagógicas
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Análise gerada pela Tutora Lucy (Apoio Docente) a partir das interações registradas nas sessões sob
              supervisão do professor titular.
            </p>
          </div>

          <div className="print-hidden flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              <span>Imprimir Relatório</span>
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              <span>Exportar CSV</span>
            </Button>
          </div>
        </div>

        <ClassAgendasSection agendas={agendas} isLoading={agendasLoading} error={agendasError} onChanged={reload} />

        <p className="print-only text-sm text-slate-700">{describeFilters(filters, classOptions, studentOptions, subjects)}</p>

        <div className="print-hidden flex flex-wrap items-end gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <FilterSelect
            label="Turma"
            value={filters.classId}
            onChange={(classId) => update({ classId })}
            options={classOptions}
            allLabel="Todas as turmas"
          />
          <FilterSelect
            label="Aluno"
            value={filters.studentId}
            onChange={(studentId) => update({ studentId })}
            options={studentOptions}
            allLabel="Todos os alunos"
          />
          <FilterSelect
            label="Disciplina"
            value={filters.subjectId}
            onChange={(subjectId) => update({ subjectId })}
            options={subjects}
            allLabel="Todas as disciplinas"
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            De
            <input
              type="date"
              className={SELECT_CLASS}
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Até
            <input
              type="date"
              className={SELECT_CLASS}
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-brand-orange" />
            <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">
              Mapa de Calor: Onde a Turma Mais Hesitou
            </h2>
          </div>

          {heatmapLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-36 rounded-2xl" />
              <Skeleton className="h-36 rounded-2xl" />
            </div>
          ) : heatmapError ? (
            <p className="text-sm text-red-600">{heatmapError}</p>
          ) : heatmap.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma dificuldade registrada para os filtros selecionados.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {heatmap.map((item, idx) => (
                <Card
                  key={item.topic}
                  className={cn(
                    'rounded-2xl border transition-all',
                    idx === 0
                      ? 'border-brand-orange/40 bg-brand-orange/5 dark:bg-brand-orange/10'
                      : 'border-slate-200 dark:border-slate-800'
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
                        {item.topic}
                      </span>
                      <Badge
                        variant={item.strugglePercentage > HIGH_STRUGGLE_PERCENT ? 'amber' : 'secondary'}
                        className="font-mono text-xs"
                      >
                        {item.strugglePercentage}% · {item.affectedStudentsCount} aluno(s)
                      </Badge>
                    </div>
                    <div className="pt-2">
                      <Progress
                        value={item.strugglePercentage}
                        className={cn(
                          'h-2',
                          item.strugglePercentage > HIGH_STRUGGLE_PERCENT ? 'bg-amber-100' : 'bg-slate-100'
                        )}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5">
                      <span className="font-semibold text-brand-teal flex items-center gap-1.5">
                        <Lightbulb className="h-4 w-4 text-brand-orange" />
                        Intervenção Pedagógica Recomendada:
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{item.suggestedAction}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-brand-teal" />
            <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-white">Atas Pedagógicas</h2>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estudante</TableHead>
                  <TableHead>Disciplina / Turma</TableHead>
                  <TableHead>Engajamento</TableHead>
                  <TableHead>Hesitação</TableHead>
                  <TableHead>Pontos de Atenção</TableHead>
                  <TableHead>Parecer da Tutora Lucy (Apoio ao Docente)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {minutesLoading && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {minutesError && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-red-600">
                      {minutesError}
                    </TableCell>
                  </TableRow>
                )}
                {!minutesLoading && !minutesError && minutes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-slate-500">
                      Nenhuma ata encontrada para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
                {minutes.map((m) => (
                  <TableRow key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <TableCell className="font-semibold text-slate-900 dark:text-white">{m.studentName}</TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                      {m.subjectName}
                      <span className="block text-[11px] text-slate-400">{m.className}</span>
                    </TableCell>
                    <TableCell>
                      <RetentionScore score={m.engagementScore} />
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-xs text-amber-600 font-mono">{m.hesitationIndex}%</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {m.topicsStruggled.length > 0 ? (
                          m.topicsStruggled.map((t) => (
                            <Badge key={t} variant="amber" className="text-[10px] py-0">
                              {t}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="teal" className="text-[10px] py-0">
                            Nenhuma hesitação crítica
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-sm">
                      {m.rawSummary}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
