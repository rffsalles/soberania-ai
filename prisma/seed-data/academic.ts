import { generateMeetings } from '../../src/domains/teaching/schedule-generator';
import {
  DEFAULT_NDE_COMPLIANCE_STATUS,
  ASSESSMENT_STATUS,
  ASSESSMENT_TYPE,
  INSTITUTION_TIMEZONE,
  PLAN_STATUS,
  SCHEDULE_DEFAULT_START_TIME,
} from '../../src/lib/constants/teaching';
import { localDateTimeToUtc } from '../../src/lib/timezone';

export const DEMO_CLASS = {
  code: 'ADS-2026-3A',
  name: '3º Semestre · ADS',
  semester: 3,
  year: 2026,
} as const;

export const DEMO_SUBJECT = {
  code: 'BD101',
  name: 'Banco de Dados I',
  courseName: 'ADS',
  academicYear: 2026,
  semester: 3,
} as const;

export const DEMO_PERIOD_CODE = '2026.1';

export const DEMO_TEACHING_PLAN = {
  totalHours: 80,
  theoryHours: 60,
  practiceHours: 20,
  // Explícito: nenhum plano de demonstração nasce "alinhado às DCNs" sem parecer humano.
  ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
  status: PLAN_STATUS.DRAFT,
  syllabus:
    'Visão geral da arquitetura de SGBDs relacionais e vetoriais. Modelagem conceitual com Diagramas Entidade-Relacionamento (DER). Mapeamento lógico para esquemas relacionais normalizados (1FN até 3FN). Álgebra Relacional e Linguagem SQL DDL/DML avançada. Transações com propriedades ACID, índices B-Tree/Hash e integração com acervos RAG estruturados.',
  generalObjectives:
    'Capacitar o estudante a conceber, modelar, normalizar e consultar bancos de dados relacionais e vetoriais com suporte a RAG On-Premises, garantindo integridade transacional ACID e conformidade com as DCNs de Computação.',
  specificObjectives:
    'Compreender a arquitetura ANSI/SPARC e as propriedades ACID; aplicar consultas SQL, JOINs e Views; analisar dependências funcionais e a 3FN.',
  unitsContent: [
    { unitNumber: 1, title: 'Modelagem Conceitual e Relacional', topics: ['DER', 'Mapeamento lógico', 'Normalização (1FN a 3FN)'] },
    { unitNumber: 2, title: 'SQL e Álgebra Relacional', topics: ['Projeção e seleção', 'JOINs', 'Subqueries'] },
    { unitNumber: 3, title: 'Transações e Desempenho', topics: ['Propriedades ACID', 'Índices B-Tree', 'EXPLAIN'] },
  ],
  methodology:
    'Aulas expositivas dialogadas integradas à mediação socrática local. Laboratórios práticos em duplas utilizando sandbox PostgreSQL 16 local, análise de planos de execução (EXPLAIN) e sessões de questionamento reflexivo com tutoria de IA local.',
  assessmentCriteria:
    'Avaliação diagnóstica, prova bimestral supervisionada e atividades práticas de laboratório, com nota final de 0 a 10.',
  basicBibliography: ['Navathe & Elmasri. Sistemas de Banco de Dados.'],
  complementaryBiblio: ['Cormen et al. Estruturas de Dados e Algoritmos.'],
};

export const DEMO_SCHEDULE = {
  startDate: new Date('2026-02-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  holidays: { weekdays: [1, 3], holidays: [] as string[] },
  startTime: SCHEDULE_DEFAULT_START_TIME,
};

const DEMO_MEETINGS = generateMeetings({
  startDate: '2026-02-01',
  endDate: '2026-06-30',
  weekdays: DEMO_SCHEDULE.holidays.weekdays,
  holidays: DEMO_SCHEDULE.holidays.holidays,
});

export const DEMO_TOTAL_CLASSES = DEMO_MEETINGS.length;

const DEMO_LESSON_TOPICS = [
  'Apresentação da Ementa e Arquitetura ANSI/SPARC de SGBD',
  'Mapeamento Entidade-Relacionamento no PostgreSQL Local',
  'Joins Avançados, Subqueries e Operações de Conjunto',
  'Prova Bimestral P1 Supervisionada com Anti-Fraude',
];

/** Demo lessons follow the schedule's own calendar rules, so the sync never conflicts with them. */
export const DEMO_LESSON_PLANS = DEMO_LESSON_TOPICS.map((topicTitle, index) => ({
  classNumber: DEMO_MEETINGS[index].classNumber,
  // Mesmo instante que a sincronização do cronograma gravaria: data + horário de início no fuso da instituição.
  classDate: localDateTimeToUtc(DEMO_MEETINGS[index].date, DEMO_SCHEDULE.startTime, INSTITUTION_TIMEZONE),
  topicTitle,
}));

export const DEMO_ASSESSMENT = {
  title: 'Avaliação Diagnóstica 01: Álgebra Relacional e SQL',
  type: ASSESSMENT_TYPE.EXAM,
  status: ASSESSMENT_STATUS.PUBLISHED,
  durationMinutes: 60,
  rubrics: {},
  questions: [
    {
      id: 1,
      enunciation:
        'Considere duas relações: Estudantes(id, nome) e Matriculas(id, estudante_id, disciplina). Qual consulta SQL retorna todos os estudantes, independentemente de estarem ou não matriculados em alguma disciplina?',
      options: [
        { key: 'A', text: 'SELECT * FROM Estudantes INNER JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
        { key: 'B', text: 'SELECT * FROM Estudantes LEFT OUTER JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
        { key: 'C', text: 'SELECT * FROM Estudantes RIGHT JOIN Matriculas ON Estudantes.id = Matriculas.estudante_id;' },
        { key: 'D', text: 'SELECT * FROM Estudantes CROSS JOIN Matriculas;' },
      ],
      correctKey: 'B',
      topic: 'LEFT OUTER JOIN',
    },
    {
      id: 2,
      enunciation: 'Uma relação está na 3ª Forma Normal (3FN) quando:',
      options: [
        { key: 'A', text: 'Não possui atributos multivalorados e está na 1FN.' },
        { key: 'B', text: 'Está na 2FN e nenhum atributo não-chave depende transitivamente de uma chave primária.' },
        { key: 'C', text: 'Possui chave primária composta e todas as colunas são dependentes parciais.' },
        { key: 'D', text: 'Todas as tuplas são duplicadas para garantir redundância e alta disponibilidade.' },
      ],
      correctKey: 'B',
      topic: 'Terceira Forma Normal (3FN)',
    },
    {
      id: 3,
      enunciation:
        'Qual propriedade ACID assegura que, em caso de falha de energia durante uma transação financeira, nenhuma alteração parcial permaneça no banco de dados?',
      options: [
        { key: 'A', text: 'Atomicidade' },
        { key: 'B', text: 'Consistência' },
        { key: 'C', text: 'Isolamento' },
        { key: 'D', text: 'Durabilidade' },
      ],
      correctKey: 'A',
      topic: 'Propriedades ACID',
    },
  ],
};
