'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar as CalendarIcon, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ROUTES } from '@/lib/constants/routes';
import { useTeacherPlans } from '@/components/assessments/use-assessments';
import { syncSchedule, useScheduleLessons, useSchedules, type ScheduleItem } from '@/components/teaching/use-schedules';
import { AdvancedCombobox } from '@/components/ui/advanced-combobox';
import { planToComboboxItem } from '@/components/teaching/plan-combobox-item';
import { MeetingsTable } from './MeetingsTable';
import { ScheduleForm } from './ScheduleForm';

const SYNC_ERROR = 'Não foi possível sincronizar o calendário. Tente novamente.';

const formatPeriod = (s: ScheduleItem) =>
  `${new Date(s.startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${new Date(s.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`;

export function SchedulesPage() {
  const { plans, isLoading: plansLoading, error: plansError } = useTeacherPlans();
  const [planId, setPlanId] = React.useState<string | null>(null);
  const [scheduleId, setScheduleId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const { schedules, isLoading, error, reload } = useSchedules(planId);
  const { lessons, reload: reloadLessons } = useScheduleLessons(scheduleId);

  const planItems = React.useMemo(() => plans.map(planToComboboxItem), [plans]);
  const schedule = schedules.find((s) => s.id === scheduleId) ?? null;

  async function sync() {
    if (!scheduleId) return;
    setSyncing(true);
    setSyncError(null);
    setNotice(null);
    try {
      const result = await syncSchedule(scheduleId);
      setNotice(`Calendário sincronizado: ${result.created} aulas criadas, ${result.existing} já existiam.`);
      reloadLessons();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : SYNC_ERROR);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold font-heading">
          <CalendarIcon className="h-6 w-6 text-brand-teal" /> Cronograma de aulas
        </h1>
        <p className="text-sm text-slate-500">Gere as datas das aulas a partir do calendário e sincronize os planos de aula.</p>
      </header>

      <div className="space-y-1">
        <label htmlFor="plan-select" className="text-sm font-medium">
          Plano de ensino
        </label>
        <AdvancedCombobox
          id="plan-select"
          placeholder={plansLoading ? 'Carregando planos...' : 'Selecione um plano'}
          searchPlaceholder="Buscar por disciplina, curso, turma ou período..."
          emptyMessage="Nenhum plano encontrado."
          items={planItems}
          selectedId={planId}
          onSelect={(id) => {
            setPlanId(id || null);
            setScheduleId(null);
            setCreating(false);
            setNotice(null);
          }}
        />
        {plansError && (
          <p role="alert" className="text-sm text-red-600">
            {plansError}
          </p>
        )}
      </div>

      {planId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Cronogramas
              {!creating && (
                <Button size="sm" onClick={() => setCreating(true)} className="gap-1">
                  <Plus className="h-4 w-4" /> Novo cronograma
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {creating && (
              <ScheduleForm
                planId={planId}
                onCreated={() => {
                  setCreating(false);
                  reload();
                }}
                onCancel={() => setCreating(false)}
              />
            )}
            {isLoading && <p className="text-sm text-slate-500">Carregando cronogramas...</p>}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            {!isLoading && !error && schedules.length === 0 && (
              <p className="text-sm text-slate-500">Nenhum cronograma criado para este plano.</p>
            )}
            {schedules.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScheduleId(s.id);
                  setNotice(null);
                }}
                className={`w-full rounded-xl border p-3 text-left text-sm ${
                  s.id === scheduleId ? 'border-brand-teal bg-brand-teal/5' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <span className="font-semibold">{formatPeriod(s)}</span>
                <span className="ml-2 text-slate-500">{s.totalClasses} aulas</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              Encontros
              <span className="flex gap-2">
                <Button variant="outline" size="sm" onClick={sync} disabled={syncing} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {syncing ? 'Sincronizando...' : 'Sincronizar calendário'}
                </Button>
                <Button asChild size="sm" className="gap-2 bg-brand-teal text-white hover:bg-brand-teal-dark">
                  <Link href={`${ROUTES.TEACHER_LESSONS}?planId=${encodeURIComponent(schedule.teachingPlanId)}&scheduleId=${encodeURIComponent(schedule.id)}`}>
                    Ir para planos de aula <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
            {syncError && (
              <p role="alert" className="text-sm text-red-600">
                {syncError}
              </p>
            )}
            <MeetingsTable schedule={schedule} lessons={lessons} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
