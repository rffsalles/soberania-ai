export const DEFAULT_PERIODS = [
  { name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' },
  { name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' },
  { name: 'Ano Letivo 2026 (Anual)', code: '2026.ANUAL', year: 2026, semester: null, type: 'ANNUAL' },
  { name: '1º Trimestre / 2026', code: '2026.T1', year: 2026, semester: 1, type: 'TERM' },
  { name: 'Intensivo de Férias (Julho / 2026)', code: '2026.INT', year: 2026, semester: 2, type: 'INTENSIVE' },
] as const;
