import { AgendaStatus, AgendaType } from '@prisma/client';

const MINUTE_MS = 60 * 1000;

export type AgendaSeed = {
  title: string;
  type: AgendaType;
  status: AgendaStatus;
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  videoUrl?: string;
  linkLessonPlan?: boolean;
  linkAssessment?: boolean;
};

/** Offsets em minutos a partir do momento do seed. */
export const DEMO_AGENDAS: readonly AgendaSeed[] = [
  {
    title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
    type: AgendaType.CLASSROOM,
    status: AgendaStatus.LIVE,
    startOffsetMinutes: -25,
    endOffsetMinutes: 65,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    linkLessonPlan: true,
  },
  {
    title: 'Desafio Prático: Normalização 3FN em Equipe',
    type: AgendaType.STUDY_GROUP,
    status: AgendaStatus.LIVE,
    startOffsetMinutes: -10,
    endOffsetMinutes: 50,
  },
  {
    title: 'Avaliação Diagnóstica 01: Álgebra Relacional e SQL',
    type: AgendaType.EXAM,
    status: AgendaStatus.SCHEDULED,
    startOffsetMinutes: 120,
    endOffsetMinutes: 180,
    linkAssessment: true,
  },
  {
    title: 'Plantão de Dúvidas: Modelagem ER e Dependências',
    type: AgendaType.OFFICE_HOURS,
    status: AgendaStatus.SCHEDULED,
    startOffsetMinutes: 300,
    endOffsetMinutes: 360,
  },
];

export function offsetDate(base: number, minutes: number): Date {
  return new Date(base + minutes * MINUTE_MS);
}
