export type PeriodType = 'SEMESTER' | 'ANNUAL' | 'TERM' | 'INTENSIVE' | (string & {});

export type PeriodLabelInput = {
  code: string;
  year: number;
  semester?: number | null;
  type: PeriodType;
};

function typeLabel(type: PeriodType, semester?: number | null): string {
  switch (type) {
    case 'SEMESTER':
      return semester ? `${semester}º Semestre` : 'Semestre';
    case 'TERM':
      return semester ? `${semester}º Trimestre` : 'Trimestre';
    case 'ANNUAL':
      return 'Anual';
    case 'INTENSIVE':
      return 'Intensivo';
    default:
      return 'Período';
  }
}

/** Nome do período derivado do código e dos campos estruturados (nunca digitado à mão). */
export function formatPeriodName({ code, year, semester, type }: PeriodLabelInput): string {
  const label = `${typeLabel(type, semester)} / ${year}`;
  return code ? `${code} · ${label}` : label;
}

/** Código sugerido para o período a partir de ano, semestre e tipo. */
export function suggestPeriodCode({ year, semester, type }: Omit<PeriodLabelInput, 'code'>): string {
  switch (type) {
    case 'SEMESTER':
      return semester ? `${year}.${semester}` : `${year}`;
    case 'TERM':
      return semester ? `${year}.T${semester}` : `${year}`;
    case 'ANNUAL':
      return `${year}.ANUAL`;
    case 'INTENSIVE':
      return `${year}.INT`;
    default:
      return `${year}`;
  }
}
