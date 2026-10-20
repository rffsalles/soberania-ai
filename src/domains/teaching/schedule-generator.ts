import { DomainError } from '@/lib/api/domain-error';

export type Meeting = { classNumber: number; date: string };

export type MeetingRules = {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** 0 = Sunday .. 6 = Saturday */
  weekdays: number[];
  /** YYYY-MM-DD */
  holidays: string[];
};

const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

const parseUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/** Lists the class meetings between two dates (inclusive), skipping holidays. All math is UTC to avoid timezone drift. */
export function generateMeetings(rules: MeetingRules): Meeting[] {
  const start = parseUtc(rules.startDate).getTime();
  const end = parseUtc(rules.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new DomainError(400, 'O período do cronograma é inválido.');
  }
  if (rules.weekdays.length === 0) {
    throw new DomainError(400, 'Selecione ao menos um dia da semana.');
  }

  const weekdays = new Set(rules.weekdays);
  const holidays = new Set(rules.holidays);
  const meetings: Meeting[] = [];
  for (let time = start; time <= end; time += MS_PER_DAY) {
    const day = new Date(time);
    const date = day.toISOString().slice(0, ISO_DATE_LENGTH);
    if (weekdays.has(day.getUTCDay()) && !holidays.has(date)) {
      meetings.push({ classNumber: meetings.length + 1, date });
    }
  }
  return meetings;
}
