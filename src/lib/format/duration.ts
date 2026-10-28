const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 1440;
const MIN_PER_MONTH = 43200;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatRemaining(minutes: number): string {
  if (minutes < 1) return 'menos de 1 min';
  const total = Math.floor(minutes);
  if (total < MIN_PER_HOUR) return `${total} min`;
  if (total < MIN_PER_DAY) {
    const h = Math.floor(total / MIN_PER_HOUR);
    const m = total % MIN_PER_HOUR;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  if (total < MIN_PER_MONTH) {
    const d = Math.floor(total / MIN_PER_DAY);
    const h = Math.floor((total % MIN_PER_DAY) / MIN_PER_HOUR);
    const dias = plural(d, 'dia', 'dias');
    return h === 0 ? dias : `${dias} e ${h} h`;
  }
  const mo = Math.floor(total / MIN_PER_MONTH);
  const d = Math.floor((total % MIN_PER_MONTH) / MIN_PER_DAY);
  const meses = plural(mo, 'mês', 'meses');
  return d === 0 ? meses : `${meses} e ${plural(d, 'dia', 'dias')}`;
}
