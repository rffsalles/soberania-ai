import type { AgendaSession } from './types';

// Sessões de demonstração em tempo real configuradas no appliance
const MOCK_SESSIONS: AgendaSession[] = [
  {
    id: 'session-live-01',
    title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)',
    subject: 'Banco de Dados I',
    type: 'CLASSROOM',
    status: 'LIVE',
    startTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Player interativo
    classId: 'class-ads-3a',
    className: '3º Semestre · Análise e Desenv. de Sistemas',
    instructorName: 'Prof. Carlos Eduardo',
    teacherResponsible: 'Prof. Carlos Eduardo',
    tutorSupport: 'Tutora Lucy (Apoio IA)',
  },
  {
    id: 'group-study-01',
    title: 'Desafio Prático: Normalização 3FN em Equipe',
    subject: 'Banco de Dados I',
    type: 'STUDY_GROUP',
    status: 'LIVE',
    startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
    classId: 'class-ads-3a',
    className: '3º Semestre · Análise e Desenv. de Sistemas',
    instructorName: 'Prof. Carlos Eduardo',
    teacherResponsible: 'Prof. Carlos Eduardo',
    tutorSupport: 'Tutora Lucy (Mediação IA)',
  },
  {
    id: 'exam-01',
    title: 'Avaliação Diagnóstica 01: Álgebra Relacional e SQL',
    subject: 'Banco de Dados I',
    type: 'EXAM',
    status: 'SCHEDULED',
    startTime: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 180 * 60 * 1000).toISOString(),
    classId: 'class-ads-3a',
    className: '3º Semestre · Análise e Desenv. de Sistemas',
    instructorName: 'Prof. Carlos Eduardo',
    teacherResponsible: 'Prof. Carlos Eduardo',
    tutorSupport: 'Tutora Lucy (Fiscalização IA)',
  },
  {
    id: 'office-hours-01',
    title: 'Plantão de Dúvidas: Modelagem ER e Dependências',
    subject: 'Banco de Dados I',
    type: 'OFFICE_HOURS',
    status: 'SCHEDULED',
    startTime: new Date(Date.now() + 300 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 360 * 60 * 1000).toISOString(),
    classId: 'class-ads-3a',
    className: '3º Semestre · Análise e Desenv. de Sistemas',
    instructorName: 'Profª. Dra. Helena Salles',
    teacherResponsible: 'Profª. Dra. Helena Salles',
    tutorSupport: 'Tutora Lucy (Tutoria Socrática)',
  },
];

export function getMockAgendas(): AgendaSession[] {
  return MOCK_SESSIONS;
}

export function getMockAgendaById(id: string): AgendaSession | undefined {
  return MOCK_SESSIONS.find((s) => s.id === id);
}
