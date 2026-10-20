import { describe, it, expect, vi } from 'vitest';
import { AgendaStatus, AgendaType, InteractionType, Role } from '@prisma/client';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { StreamChunk } from '@/lib/ai-provider';
import type { MetricInteraction } from '../../minute-metrics';
import { generateMinute, generateMinutesForAgenda, listMinutes, type MinutesDeps } from '../minutes-service';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const student = { id: 'stu1', role: Role.STUDENT, classId: 'c1' };
const teacher = { id: 't1', role: Role.TEACHER, classId: null };

const agenda: AgendaDTO = {
  id: 'ag1',
  title: 'Aula de JOIN',
  subject: 'BD',
  type: AgendaType.CLASSROOM,
  status: AgendaStatus.COMPLETED,
  startTime: '2026-10-20T11:00:00.000Z',
  endTime: '2026-10-20T13:00:00.000Z',
  classId: 'c1',
  className: 'Turma A',
  teacherName: 'Prof',
};

function interaction(o: Partial<MetricInteraction> = {}): MetricInteraction {
  return {
    type: InteractionType.QUESTION,
    guardrailBlocked: false,
    wasCorrect: null,
    latencyMs: 2000,
    ragSourceBook: 'BD',
    ragSourcePage: 5,
    ...o,
  };
}

function makeDeps(opts: { interactions?: MetricInteraction[]; ai?: string; fallback?: boolean } = {}) {
  const upsertMinute = vi.fn(async (data: Record<string, unknown>) => ({
    id: 'm1',
    ...data,
    createdAt: NOW,
    student: { name: 'Lucas' },
    agenda: { subject: 'BD', subjectRef: { name: 'Banco de Dados' }, class: { name: 'Turma A' } },
  }));
  const listMinutesRepo = vi.fn(async () => []);
  const deps = {
    getAgenda: vi.fn(async () => agenda),
    findStudent: vi.fn(async (id: string) => ({ id, name: 'Lucas', classId: 'c1' })),
    listInteractions: vi.fn(async () => opts.interactions ?? []),
    listStudentIds: vi.fn(async () => ['stu1', 'stu2']),
    findTeacherSubjectIds: vi.fn(async () => ['sub1']),
    upsertMinute,
    listMinutes: listMinutesRepo,
    streamChat: vi.fn(async function* (): AsyncGenerator<StreamChunk> {
      yield { token: opts.ai ?? '', isComplete: false, fallback: opts.fallback ?? true };
      yield { token: '', isComplete: true, fallback: opts.fallback ?? true };
    }),
    now: () => NOW,
  } as unknown as MinutesDeps;
  return { deps, upsertMinute, listMinutesRepo };
}

describe('generateMinute', () => {
  it('aluno não gera ata de outro aluno (403)', async () => {
    const { deps } = makeDeps();
    await expect(generateMinute(student, { agendaId: 'ag1', studentId: 'other' }, deps)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('sem interações: engajamento 40 e tópicos vazios', async () => {
    const { deps, upsertMinute } = makeDeps();
    const minute = await generateMinute(student, { agendaId: 'ag1' }, deps);
    expect(minute.engagementScore).toBe(40);
    expect(minute.hesitationIndex).toBe(0);
    expect(minute.topicsStruggled).toEqual([]);
    expect(minute.sessionTitle).toBe('Aula de JOIN');
    expect(minute.subjectName).toBe('Banco de Dados');
    expect(minute.className).toBe('Turma A');
    expect(upsertMinute).toHaveBeenCalledTimes(1);
  });

  it('calcula métricas e usa o texto da IA quando o provider é real', async () => {
    const { deps } = makeDeps({
      interactions: [
        interaction({ wasCorrect: true }),
        interaction({ type: InteractionType.SOCRATIC_CHALLENGE, ragSourcePage: 9, wasCorrect: false }),
      ],
      ai: 'Texto: {"rawSummary":"Resumo IA","actionableAdvice":"Conselho IA"}',
      fallback: false,
    });
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(minute.engagementScore).toBe(56);
    expect(minute.totalQuestionsAsked).toBe(1);
    expect(minute.socraticChallengesAnswered).toBe(1);
    expect(minute.topicsStruggled).toEqual(['BD, pág. 9']);
    expect(minute.rawSummary).toBe('Resumo IA');
    expect(minute.actionableAdvice).toBe('Conselho IA');
  });

  it('usa fallback determinístico quando a IA devolve lixo', async () => {
    const { deps } = makeDeps({ interactions: [interaction()], ai: 'não é json', fallback: false });
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(minute.rawSummary.length).toBeGreaterThan(0);
    expect(minute.actionableAdvice.length).toBeGreaterThan(0);
  });
});

describe('generateMinutesForAgenda', () => {
  it('gera para cada aluno e segue após falha individual', async () => {
    const { deps, upsertMinute } = makeDeps();
    upsertMinute.mockRejectedValueOnce(new Error('boom'));
    const res = await generateMinutesForAgenda('ag1', teacher, deps);
    expect(res.generated).toBe(1);
    expect(res.failed).toEqual([{ studentId: 'stu1', error: 'boom' }]);
  });
});

describe('listMinutes', () => {
  it('aluno ignora studentId alheio do filtro', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(student, { studentId: 'other' }, deps);
    const where = JSON.stringify(listMinutesRepo.mock.calls[0]);
    expect(where).toContain('"studentId":"stu1"');
    expect(where).not.toContain('other');
  });

  it('professor é limitado às suas disciplinas', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(teacher, { agendaId: 'ag1' }, deps);
    const where = JSON.stringify(listMinutesRepo.mock.calls[0]);
    expect(where).toContain('sub1');
    expect(where).toContain('"teacherId":"t1"');
  });
});
