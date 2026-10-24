import type { OfferingOption } from '../../types';

export const offeringADS: OfferingOption = {
  id: 'csubject0001',
  discipline: { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 },
  class: {
    id: 'cclass00001',
    name: '3º Semestre · ADS',
    semester: 3,
    course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
    academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1' },
  },
};

export const offeringEM: OfferingOption = {
  id: 'csubject0002',
  discipline: { code: 'MAT201', name: 'Matemática II', workloadHours: 60 },
  class: {
    id: 'cclass00002',
    name: '2º Ano · EM',
    semester: 2,
    course: { name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
    academicPeriod: { id: 'cperiod0003', name: 'Ano letivo 2026', code: '2026' },
  },
};

export const LABEL_ADS = 'BD101 · Banco de Dados I · 3º Sem ADS · 2026.1';
export const LABEL_EM = 'MAT201 · Matemática II · 2º Ano EM · 2026';
