import { INSTITUTION_TIMEZONE } from '@/lib/constants/teaching';

function parts(date: Date, timeZone: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

/** HH:mm no mesmo dia; dd/MM HH:mm no mesmo ano; dd/MM/yyyy HH:mm caso contrário (no fuso dado). */
export function formatChatTimestamp(
  iso: string,
  now: Date = new Date(),
  timeZone: string = INSTITUTION_TIMEZONE,
): string {
  const d = parts(new Date(iso), timeZone);
  const n = parts(now, timeZone);
  const time = `${d.hour}:${d.minute}`;
  if (d.year === n.year && d.month === n.month && d.day === n.day) return time;
  if (d.year === n.year) return `${d.day}/${d.month} ${time}`;
  return `${d.day}/${d.month}/${d.year} ${time}`;
}
