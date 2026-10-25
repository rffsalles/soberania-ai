import { formatPeriodName } from './period-label';

const BASE_PERIODS = [
  { code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' },
  { code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' },
  { code: '2026.ANUAL', year: 2026, semester: null, type: 'ANNUAL' },
  { code: '2026.T1', year: 2026, semester: 1, type: 'TERM' },
  { code: '2026.INT', year: 2026, semester: 2, type: 'INTENSIVE' },
] as const;

export const DEFAULT_PERIODS = BASE_PERIODS.map((p) => ({ ...p, name: formatPeriodName(p) }));
