/**
 * Conversão entre horário de parede de um fuso IANA e instantes UTC, só com `Intl` (sem dependência).
 * Módulo puro: usado pelo servidor e pelo cliente.
 */

import { HH_MM_PATTERN } from './constants/teaching';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Campos do horário de parede de `instant` no fuso. */
function wallClock(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return parts;
}

/** Deslocamento (ms) do fuso em relação ao UTC no instante dado. */
function offsetAt(instantMs: number, timeZone: string): number {
  const p = wallClock(new Date(instantMs), timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Instante UTC do horário local `dateISO` (AAAA-MM-DD) + `time` (HH:mm) no fuso `timeZone`.
 *
 * Transições de horário de verão seguem a política "compatible" do Temporal:
 * - horário inexistente (salto para frente): avança pelo tamanho do salto (02:30 → 03:30);
 * - horário ambíguo (recuo): usa a primeira ocorrência (o deslocamento anterior à transição).
 *
 * Lança `RangeError` para data/horário malformados ou fuso desconhecido.
 */
export function localDateTimeToUtc(dateISO: string, time: string, timeZone: string): Date {
  const date = ISO_DATE.exec(dateISO);
  if (!date || !HH_MM_PATTERN.test(time)) throw new RangeError(`Data/horário inválidos: ${dateISO} ${time}`);
  const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Data inexistente: ${dateISO}`);
  }

  // Deslocamentos um dia antes e um dia depois cobrem qualquer transição perto da data.
  const before = offsetAt(wall - MS_PER_DAY, timeZone);
  const after = offsetAt(wall + MS_PER_DAY, timeZone);
  const candidates = [wall - before, wall - after].filter((instant) => offsetAt(instant, timeZone) === wall - instant);
  if (candidates.length === 0) return new Date(wall - before); // salto: o deslocamento antigo cai depois do salto
  return new Date(Math.min(...candidates)); // ambíguo: a primeira ocorrência
}

/** Valor `AAAA-MM-DDTHH:mm` de um `<input type="datetime-local">` para `instant` no fuso. */
export function toLocalDateTimeInput(instant: Date, timeZone: string): string {
  const p = wallClock(instant, timeZone);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
