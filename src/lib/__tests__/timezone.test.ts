import { describe, it, expect } from 'vitest';
import { localDateTimeToUtc, toLocalDateTimeInput } from '../timezone';
import { resolveInstitutionTimeZone } from '../constants/teaching';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';

describe('localDateTimeToUtc', () => {
  it('converte 19:00 em São Paulo (UTC-3) para 22:00 UTC', () => {
    expect(localDateTimeToUtc('2026-03-02', '19:00', SAO_PAULO).toISOString()).toBe('2026-03-02T22:00:00.000Z');
  });

  it('cruza a meia-noite UTC quando o horário local é tarde da noite', () => {
    expect(localDateTimeToUtc('2026-03-02', '22:30', SAO_PAULO).toISOString()).toBe('2026-03-03T01:30:00.000Z');
  });

  it('usa UTC sem deslocamento', () => {
    expect(localDateTimeToUtc('2026-03-02', '08:15', 'UTC').toISOString()).toBe('2026-03-02T08:15:00.000Z');
  });

  it('respeita o horário de verão vigente na data (Nova York, EDT = UTC-4)', () => {
    expect(localDateTimeToUtc('2026-07-01', '09:00', NEW_YORK).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localDateTimeToUtc('2026-01-15', '09:00', NEW_YORK).toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('horário inexistente (salto do horário de verão) avança pelo tamanho do salto', () => {
    // 02:30 não existe em 08/03/2026 em Nova York; vira 03:30 EDT.
    expect(localDateTimeToUtc('2026-03-08', '02:30', NEW_YORK).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    // São Paulo 04/11/2018: 00:00 não existiu; vira 01:00 BRST (UTC-2).
    expect(localDateTimeToUtc('2018-11-04', '00:00', SAO_PAULO).toISOString()).toBe('2018-11-04T03:00:00.000Z');
  });

  it('horário ambíguo (fim do horário de verão) usa a primeira ocorrência', () => {
    // 01:30 ocorre duas vezes em 01/11/2026 em Nova York; vale a de EDT.
    expect(localDateTimeToUtc('2026-11-01', '01:30', NEW_YORK).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('rejeita data ou horário malformados', () => {
    expect(() => localDateTimeToUtc('2026-02-30', '19:00', SAO_PAULO)).toThrow(RangeError);
    expect(() => localDateTimeToUtc('2026-03-02', '24:00', SAO_PAULO)).toThrow(RangeError);
    expect(() => localDateTimeToUtc('02/03/2026', '19:00', SAO_PAULO)).toThrow(RangeError);
  });
});

describe('toLocalDateTimeInput', () => {
  it('formata um instante como valor de datetime-local no fuso informado', () => {
    expect(toLocalDateTimeInput(new Date('2026-03-02T22:00:00Z'), SAO_PAULO)).toBe('2026-03-02T19:00');
  });

  it('é o inverso de localDateTimeToUtc', () => {
    const instant = localDateTimeToUtc('2026-07-01', '07:45', NEW_YORK);
    expect(toLocalDateTimeInput(instant, NEW_YORK)).toBe('2026-07-01T07:45');
  });
});

describe('resolveInstitutionTimeZone', () => {
  it('mantém um fuso IANA válido', () => {
    expect(resolveInstitutionTimeZone('America/Manaus')).toBe('America/Manaus');
  });

  it('cai no padrão quando o fuso é vazio ou inválido', () => {
    expect(resolveInstitutionTimeZone(undefined)).toBe(SAO_PAULO);
    expect(resolveInstitutionTimeZone('Marte/Olympus')).toBe(SAO_PAULO);
  });
});
