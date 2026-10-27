'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { generateMeetings } from '@/domains/teaching/schedule-generator';
import { formatChapterShortList } from '@/components/teaching/chapter-combobox-item';
import type { ScheduleItem, ScheduleLesson } from '@/components/teaching/use-schedules';

const ISO_DATE_LENGTH = 10;
const LESSON_CREATED = 'Criada';
const LESSON_PENDING = 'Pendente';

const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

type Props = { schedule: ScheduleItem; lessons: ScheduleLesson[] };

export function MeetingsTable({ schedule, lessons }: Props) {
  const meetings = React.useMemo(
    () => {
      try {
        return generateMeetings({
          startDate: schedule.startDate.slice(0, ISO_DATE_LENGTH),
          endDate: schedule.endDate.slice(0, ISO_DATE_LENGTH),
          weekdays: schedule.holidays?.weekdays ?? [],
          holidays: schedule.holidays?.holidays ?? [],
        });
      } catch {
        // Cronograma legado sem regras de calendário: nada a listar.
        return [];
      }
    },
    [schedule]
  );
  const created = new Set(lessons.map((l) => l.classNumber));
  const chaptersByClass = new Map(lessons.map((l) => [l.classNumber, formatChapterShortList(l.chapters.map((c) => c.chapter.number))]));

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-slate-500">
          <th className="py-2">Aula</th>
          <th className="py-2">Data</th>
          <th className="py-2">Plano de aula</th>
          <th className="py-2">Capítulos</th>
        </tr>
      </thead>
      <tbody>
        {meetings.map((m) => (
          <tr key={m.classNumber} className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-2 font-semibold">#{m.classNumber}</td>
            <td className="py-2">{formatDate(m.date)}</td>
            <td className="py-2">
              <Badge variant={created.has(m.classNumber) ? 'secondary' : 'outline'}>
                {created.has(m.classNumber) ? LESSON_CREATED : LESSON_PENDING}
              </Badge>
            </td>
            <td className="py-2">{chaptersByClass.get(m.classNumber) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
