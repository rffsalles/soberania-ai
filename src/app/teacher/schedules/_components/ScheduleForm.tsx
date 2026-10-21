'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createSchedule } from '@/components/teaching/use-schedules';
import { INSTITUTION_TIMEZONE, SCHEDULE_DEFAULT_START_TIME } from '@/lib/constants/teaching';

const GENERIC_ERROR = 'Não foi possível criar o cronograma. Tente novamente.';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
] as const;

type Props = { planId: string; onCreated: () => void; onCancel: () => void };

export function ScheduleForm({ planId, onCreated, onCancel }: Props) {
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [startTime, setStartTime] = React.useState<string>(SCHEDULE_DEFAULT_START_TIME);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [holidaysText, setHolidaysText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggleWeekday = (value: number) =>
    setWeekdays((current) => (current.includes(value) ? current.filter((d) => d !== value) : [...current, value]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const holidays = holidaysText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (holidays.some((h) => !ISO_DATE.test(h))) {
      setError('Informe os feriados no formato AAAA-MM-DD, um por linha.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSchedule({ teachingPlanId: planId, startDate, endDate, weekdays, holidays, startTime });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          Início
          <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Término
          <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Horário de início
          <Input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <span className="block text-xs font-normal text-slate-500">Fuso {INSTITUTION_TIMEZONE}</span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Dias de aula</legend>
        <div className="flex flex-wrap gap-4">
          {WEEKDAY_OPTIONS.map((day) => (
            <label key={day.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={weekdays.includes(day.value)} onChange={() => toggleWeekday(day.value)} />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm font-medium">
        Feriados (AAAA-MM-DD, um por linha)
        <Textarea rows={3} value={holidaysText} onChange={(e) => setHolidaysText(e.target.value)} />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || weekdays.length === 0} className="bg-brand-teal text-white hover:bg-brand-teal-dark">
          {saving ? 'Criando...' : 'Criar cronograma'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
