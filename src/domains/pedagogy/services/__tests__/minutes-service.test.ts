import { describe, it, expect, vi } from 'vitest';
import { AgendaStatus, AgendaType, InteractionType, Role } from '@prisma/client';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import type { StreamChunk } from '@/lib/ai-provider';
import type { MetricInteraction } from '../../minute-metrics';
import {
  generateMinute,
  generateMinutesForAgenda,
  listMinutes,
  requestMinutes,
  type MinutesDeps,
} from '../minutes-service';

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
    isSocraticChallenge: false,
    wasCorrect: null,
    latencyMs: 2000,
    createdAt: NOW,
    ragSourceBook: 'BD',
    ragSourcePage: 5,
    ...o,
  };
}

function makeDeps(
  opts: {
    interactions?: MetricInteraction[];
    ai?: string;
    fallback?: boolean;
    newInteractions?: number;
  } = {}
) {
  const upsertMinute = vi.fn(async (data: Record<string, unknown>) => ({
    id: 'm1',
    ...data,
    createdAt: NOW,
    updatedAt: NOW,
    student: { name: 'Lucas' },
    agenda: {
      subject: 'BD',
      subjectRef: { discipline: { name: 'Banco de Dados' } },
      class: { name: 'Turma A' },
    },
  }));
  const listMinutesRepo = vi.fn(async (_where: unknown) => []);
  const deps = {
    getAgenda: vi.fn(async () => agenda),
    findStudent: vi.fn(async (id: string) => ({
      id,
      name: 'Lucas',
      classId: 'c1',
    })),
    listInteractions: vi.fn(async () => opts.interactions ?? []),
    countInteractionsSince: vi.fn(async () => opts.newInteractions ?? 0),
    listStudentIds: vi.fn(async () => ['stu1', 'stu2']),
    findTeacherSubjectIds: vi.fn(async () => ['sub1']),
    upsertMinute,
    listMinutes: listMinutesRepo,
    streamChat: vi.fn(async function* (): AsyncGenerator<StreamChunk> {
      yield {
        token: opts.ai ?? '',
        isComplete: false,
        fallback: opts.fallback ?? true,
      };
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

  it('sem interações: engajamento 0 e tópicos vazios', async () => {
    const { deps, upsertMinute } = makeDeps();
    const minute = await generateMinute(student, { agendaId: 'ag1' }, deps);
    expect(minute.engagementScore).toBe(0);
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
        // A tutora respondeu com um desafio; a interação seguinte é a resposta do aluno.
        interaction({ wasCorrect: true, isSocraticChallenge: true }),
        interaction({
          type: InteractionType.SOCRATIC_CHALLENGE,
          ragSourcePage: 9,
          wasCorrect: false,
          createdAt: new Date(NOW.getTime() + 60_000),
        }),
      ],
      ai: 'Texto: {"rawSummary":"Resumo IA","actionableAdvice":"Conselho IA"}',
      fallback: false,
    });
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(minute.engagementScore).toBe(16);
    expect(minute.totalQuestionsAsked).toBe(1);
    expect(minute.socraticChallengesAnswered).toBe(1);
    expect(minute.topicsStruggled).toEqual(['BD, pág. 9']);
    expect(minute.rawSummary).toBe('Resumo IA');
    expect(minute.actionableAdvice).toBe('Conselho IA');
    expect(minute.aiGenerated).toBe(true);
    expect(deps.upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ aiFallback: false }));
  });

  it('grava a ata sem parecer (aiGenerated false) quando a IA devolve lixo', async () => {
    const { deps, upsertMinute } = makeDeps({
      interactions: [interaction()],
      ai: 'não é json',
      fallback: false,
    });
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(minute.rawSummary).toBe('');
    expect(minute.actionableAdvice).toBe('');
    expect(minute.aiGenerated).toBe(false);
    expect(minute.totalQuestionsAsked).toBe(1);
    expect(upsertMinute).toHaveBeenCalledWith(
      expect.objectContaining({ rawSummary: '', actionableAdvice: '', aiFallback: true })
    );
  });

  it('grava a ata sem parecer quando o provedor devolve o stream de fallback', async () => {
    const { deps } = makeDeps({ interactions: [interaction()], ai: '{"rawSummary":"x","actionableAdvice":"y"}' });
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(minute.aiGenerated).toBe(false);
    expect(minute.rawSummary).toBe('');
  });
});

describe('generateMinute com IA indisponível', () => {
  const realMinute = {
    id: 'm-real',
    agendaId: 'ag1',
    studentId: 'stu1',
    sessionTitle: 'Aula de JOIN',
    engagementScore: 70,
    hesitationIndex: 10,
    topicsMastered: [],
    topicsStruggled: [],
    totalQuestionsAsked: 3,
    socraticChallengesAnswered: 1,
    rawSummary: 'parecer real da IA',
    actionableAdvice: 'conselho real',
    aiFallback: false,
    createdAt: NOW,
    updatedAt: NOW,
    student: { name: 'Lucas' },
    agenda: { subject: 'BD', subjectRef: { discipline: { name: 'Banco de Dados' } }, class: { name: 'Turma A' } },
  };

  it('regeneração pelo professor preserva o parecer real e atualiza só as métricas', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({ interactions: [interaction()], fallback: true });
    listMinutesRepo.mockResolvedValue([realMinute] as never);
    const minute = await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(upsertMinute).toHaveBeenCalledWith(
      expect.objectContaining({
        rawSummary: 'parecer real da IA',
        actionableAdvice: 'conselho real',
        aiFallback: false,
        totalQuestionsAsked: 1,
      })
    );
    expect(minute.aiGenerated).toBe(true);
  });

  it('sem ata anterior grava a ata sem parecer', async () => {
    const { deps, upsertMinute } = makeDeps({ interactions: [interaction()], fallback: true });
    await generateMinute(teacher, { agendaId: 'ag1', studentId: 'stu1' }, deps);
    expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ rawSummary: '', aiFallback: true }));
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

  it('verifica o acesso à agenda antes de gerar, mesmo sem alunos com interações', async () => {
    const { deps } = makeDeps();
    (deps.listStudentIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (deps.getAgenda as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error('nope'), { status: 403 }));
    await expect(generateMinutesForAgenda('ag1', teacher, deps)).rejects.toMatchObject({ status: 403 });
  });
});

describe('requestMinutes', () => {
  const storedMinute = {
    id: 'm-old',
    agendaId: 'ag1',
    studentId: 'stu1',
    sessionTitle: 'Aula de JOIN',
    engagementScore: 70,
    hesitationIndex: 10,
    topicsMastered: [],
    topicsStruggled: [],
    totalQuestionsAsked: 3,
    socraticChallengesAnswered: 1,
    rawSummary: 'resumo antigo',
    actionableAdvice: 'conselho antigo',
    aiFallback: false,
    createdAt: NOW,
    updatedAt: NOW,
    student: { name: 'Lucas' },
    agenda: { subject: 'BD', subjectRef: { discipline: { name: 'Banco de Dados' } }, class: { name: 'Turma A' } },
  };

  it('professor sem studentId gera as atas da turma inteira e devolve o resumo', async () => {
    const { deps, upsertMinute } = makeDeps();
    const res = await requestMinutes(teacher, { agendaId: 'ag1' }, deps);
    expect(res).toEqual({ kind: 'agenda', summary: { generated: 2, failed: [] } });
    expect(upsertMinute).toHaveBeenCalledTimes(2);
  });

  it('professor com studentId regenera a ata daquele aluno', async () => {
    const { deps, upsertMinute } = makeDeps();
    const res = await requestMinutes(teacher, { agendaId: 'ag1', studentId: 'stu2' }, deps);
    expect(res.kind).toBe('minute');
    expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'stu2' }));
  });

  it('aluno recebe a ata já existente sem nova geração pela IA', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps();
    listMinutesRepo.mockResolvedValueOnce([storedMinute] as never);
    const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(res).toMatchObject({ kind: 'minute', minute: { id: 'm-old', rawSummary: 'resumo antigo' } });
    expect(listMinutesRepo).toHaveBeenCalledWith({ agendaId: 'ag1', studentId: 'stu1' });
    expect(deps.getAgenda).toHaveBeenCalledWith('ag1', student);
    expect(deps.streamChat).not.toHaveBeenCalled();
    expect(upsertMinute).not.toHaveBeenCalled();
  });

  it('aluno sem ata gera a própria uma vez', async () => {
    const { deps, upsertMinute } = makeDeps();
    const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(res.kind).toBe('minute');
    expect(upsertMinute).toHaveBeenCalledOnce();
    expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'stu1' }));
  });

  it('aluno com ata anterior em fallback recebe nova geração quando a IA responde', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({
      interactions: [interaction()],
      ai: '{"rawSummary":"Novo resumo","actionableAdvice":"Novo conselho"}',
      fallback: false,
    });
    listMinutesRepo.mockResolvedValue([{ ...storedMinute, aiFallback: true, rawSummary: '', actionableAdvice: '' }] as never);
    const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(res.kind).toBe('minute');
    expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ aiFallback: false, rawSummary: 'Novo resumo' }));
  });

  it('aluno com ata anterior em fallback e IA ainda indisponível recebe a ata existente sem regravar', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({ interactions: [interaction()], fallback: true });
    listMinutesRepo.mockResolvedValue([{ ...storedMinute, aiFallback: true, rawSummary: '', actionableAdvice: '' }] as never);
    const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(res.kind === 'minute' && res.minute.id).toBe('m-old');
    expect(upsertMinute).not.toHaveBeenCalled();
  });

  it('aluno com ata válida não dispara nova geração', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps();
    listMinutesRepo.mockResolvedValue([storedMinute] as never);
    await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(upsertMinute).not.toHaveBeenCalled();
  });

  it('aluno com ata válida e sem interações novas não regenera', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({ newInteractions: 0 });
    listMinutesRepo.mockResolvedValue([storedMinute] as never);
    await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(deps.countInteractionsSince).toHaveBeenCalledWith('ag1', 'stu1', NOW);
    expect(deps.streamChat).not.toHaveBeenCalled();
    expect(upsertMinute).not.toHaveBeenCalled();
  });

  it('aluno com ata válida e interação mais nova que a ata regenera', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({
      newInteractions: 2,
      interactions: [interaction()],
      ai: '{"rawSummary":"Resumo atualizado","actionableAdvice":"Conselho novo"}',
      fallback: false,
    });
    listMinutesRepo.mockResolvedValue([storedMinute] as never);
    await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ studentId: 'stu1', rawSummary: 'Resumo atualizado' }));
  });

  it('aluno com conversa nova e IA indisponível mantém a ata anterior', async () => {
    const { deps, upsertMinute, listMinutesRepo } = makeDeps({ newInteractions: 1, interactions: [interaction()], fallback: true });
    listMinutesRepo.mockResolvedValue([storedMinute] as never);
    const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
    expect(res.kind === 'minute' && res.minute.id).toBe('m-old');
    expect(upsertMinute).not.toHaveBeenCalled();
  });

  it('aluno não pede a ata de outro aluno (403)', async () => {
    const { deps } = makeDeps();
    await expect(requestMinutes(student, { agendaId: 'ag1', studentId: 'stu2' }, deps)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('listMinutes', () => {
  it('aluno ignora studentId alheio do filtro', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(student, { studentId: 'other' }, deps);
    const where = listMinutesRepo.mock.calls[0][0] as unknown as {
      AND: unknown[];
    };
    expect(where.AND).toEqual([{ studentId: 'stu1' }]);
  });

  it('professor é limitado às suas disciplinas ou agendas próprias', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(teacher, { agendaId: 'ag1', studentId: 'stu9' }, deps);
    const where = listMinutesRepo.mock.calls[0][0] as unknown as {
      AND: unknown[];
    };
    expect(where.AND).toEqual([
      {
        agenda: { OR: [{ subjectId: { in: ['sub1'] } }, { teacherId: 't1' }] },
      },
      { agendaId: 'ag1' },
      { studentId: 'stu9' },
    ]);
  });

  it('filtra por turma via agenda.classId', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(teacher, { classId: 'class-1' }, deps);
    const where = listMinutesRepo.mock.calls[0][0] as unknown as { AND: unknown[] };
    expect(where.AND).toContainEqual({ agenda: { classId: 'class-1' } });
  });

  it('aluno mantém o escopo forçado ao filtrar por turma', async () => {
    const { deps, listMinutesRepo } = makeDeps();
    await listMinutes(student, { classId: 'class-1', studentId: 'other' }, deps);
    const where = listMinutesRepo.mock.calls[0][0] as unknown as { AND: unknown[] };
    expect(where.AND).toEqual([{ studentId: 'stu1' }, { agenda: { classId: 'class-1' } }]);
  });
});
