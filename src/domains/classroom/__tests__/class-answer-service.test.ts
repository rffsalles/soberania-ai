import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { answerTutorQuestion, getClassPulse, type ClassAnswerDeps } from '../class-answer-service';

const student = { id: 'stu1', role: Role.STUDENT, classId: 'c1' };
const teacher = { id: 't1', role: Role.TEACHER, classId: null };

const mcPayload = {
  kind: 'MULTIPLE_CHOICE',
  origin: 'TUTOR',
  source: 'GENERATED',
  question: {
    id: 'q1',
    topic: 'Geografia',
    enunciation: 'Qual a capital do Brasil?',
    options: [
      { key: 'A', text: 'Rio' },
      { key: 'B', text: 'Brasília' },
      { key: 'C', text: 'Lima' },
      { key: 'D', text: 'Quito' },
    ],
    correctKey: 'B',
    rationale: 'Brasília é a capital.',
  },
};
const openPayload = { kind: 'OPEN', origin: 'TEACHER', text: 'Explique o conceito.' };

function row(seq: number, type: string, payload: unknown, stepIndex = 1) {
  return { seq, type, stepIndex, payload, audience: 'ALL', createdBy: 'TUTOR', createdAt: new Date() };
}

function makeDeps(over: Partial<ClassAnswerDeps> = {}) {
  const deps = {
    getAgenda: vi.fn(async () => ({ id: 'ag1', type: 'CLASSROOM', status: 'LIVE' }) as AgendaDTO),
    findEventBySeq: vi.fn(async () => row(4, 'TUTOR_QUESTION', mcPayload)),
    findEventsAfter: vi.fn(async () => []),
    insertClassAnswer: vi.fn(async () => 'CREATED' as const),
    countClassAnswers: vi.fn(async () => []),
    findClassAnswer: vi.fn(async () => ({ wasCorrect: false })),
    hasSessionEnded: vi.fn(async () => false),
    ...over,
  } as unknown as ClassAnswerDeps;
  return deps;
}

describe('answerTutorQuestion', () => {
  it('acerto em múltipla escolha grava e devolve o gabarito', async () => {
    const deps = makeDeps();
    const res = await answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B', videoSeconds: 12 }, deps);
    expect(res).toEqual({ wasCorrect: true, correctKey: 'B', rationale: 'Brasília é a capital.' });
    expect(deps.insertClassAnswer).toHaveBeenCalledWith({
      agendaId: 'ag1',
      studentId: 'stu1',
      type: 'SOCRATIC_CHALLENGE',
      isSocraticChallenge: true,
      questionText: 'Qual a capital do Brasil?',
      responseText: 'B) Brasília',
      wasCorrect: true,
      timestampInVideo: 12,
      agendaType: 'CLASSROOM',
      classEventSeq: 4,
    });
  });

  it('erro em múltipla escolha grava wasCorrect false', async () => {
    const deps = makeDeps();
    const res = await answerTutorQuestion(student, 'ag1', 4, { optionKey: 'A' }, deps);
    expect(res.wasCorrect).toBe(false);
    expect(deps.insertClassAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ wasCorrect: false, responseText: 'A) Rio', timestampInVideo: null }),
    );
  });

  it('pergunta aberta grava wasCorrect null e devolve nulos', async () => {
    const deps = makeDeps({ findEventBySeq: vi.fn(async () => row(9, 'TUTOR_QUESTION', openPayload)) as never });
    const res = await answerTutorQuestion(student, 'ag1', 9, { text: '  minha resposta ' }, deps);
    expect(res).toEqual({ wasCorrect: null, correctKey: null, rationale: null });
    expect(deps.insertClassAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ questionText: 'Explique o conceito.', responseText: 'minha resposta', wasCorrect: null }),
    );
  });

  it('professor recebe 403', async () => {
    await expect(answerTutorQuestion(teacher, 'ag1', 4, { optionKey: 'B' }, makeDeps())).rejects.toMatchObject({
      status: 403,
      message: 'Apenas alunos respondem às perguntas da tutora.',
    });
  });

  it('propaga 404 de escopo da agenda', async () => {
    const deps = makeDeps({
      getAgenda: vi.fn(async () => {
        throw new DomainError(404, 'Agenda não encontrada.');
      }),
    });
    await expect(answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('TUTOR_CARD ou evento invisível ao aluno vira 404', async () => {
    const card = makeDeps({ findEventBySeq: vi.fn(async () => row(4, 'TUTOR_CARD', {})) as never });
    await expect(answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, card)).rejects.toMatchObject({
      status: 404,
      message: 'Pergunta não encontrada.',
    });
    const none = makeDeps({ findEventBySeq: vi.fn(async () => null) as never });
    await expect(answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, none)).rejects.toMatchObject({ status: 404 });
    expect(none.findEventBySeq).toHaveBeenCalledWith('ag1', 4, ['ALL', 'stu1']);
  });

  it('optionKey inválida vira 400 INVALID_ANSWER', async () => {
    const deps = makeDeps();
    for (const input of [{ optionKey: 'E' }, {}]) {
      await expect(answerTutorQuestion(student, 'ag1', 4, input, deps)).rejects.toMatchObject({
        status: 400,
        message: 'Escolha uma das alternativas.',
        details: { code: 'INVALID_ANSWER' },
      });
    }
    expect(deps.insertClassAnswer).not.toHaveBeenCalled();
  });

  it('texto vazio ou de 1001 caracteres vira 400 INVALID_ANSWER', async () => {
    const deps = makeDeps({ findEventBySeq: vi.fn(async () => row(9, 'TUTOR_QUESTION', openPayload)) as never });
    for (const text of ['x'.repeat(1001), '   ', undefined]) {
      await expect(answerTutorQuestion(student, 'ag1', 9, { text }, deps)).rejects.toMatchObject({
        status: 400,
        message: 'Escreva uma resposta de até 1000 caracteres.',
        details: { code: 'INVALID_ANSWER' },
      });
    }
    await expect(answerTutorQuestion(student, 'ag1', 9, { text: 'x'.repeat(1000) }, deps)).resolves.toBeTruthy();
  });

  it('DUPLICATE devolve o resultado da resposta gravada com alreadyAnswered', async () => {
    const deps = makeDeps({ insertClassAnswer: vi.fn(async () => 'DUPLICATE') as never });
    const res = await answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, deps);
    expect(res).toEqual({
      wasCorrect: false,
      correctKey: 'B',
      rationale: 'Brasília é a capital.',
      alreadyAnswered: true,
    });
    expect(deps.findClassAnswer).toHaveBeenCalledWith('ag1', 'stu1', 4);
  });

  it('DUPLICATE em pergunta aberta devolve nulos com alreadyAnswered', async () => {
    const deps = makeDeps({
      findEventBySeq: vi.fn(async () => row(9, 'TUTOR_QUESTION', openPayload)) as never,
      insertClassAnswer: vi.fn(async () => 'DUPLICATE') as never,
      findClassAnswer: vi.fn(async () => ({ wasCorrect: null })),
    });
    expect(await answerTutorQuestion(student, 'ag1', 9, { text: 'oi' }, deps)).toEqual({
      wasCorrect: null,
      correctKey: null,
      rationale: null,
      alreadyAnswered: true,
    });
  });

  it('aula encerrada (SESSION_ENDED) vira 409 CLASS_ENDED sem gravar', async () => {
    const deps = makeDeps({ hasSessionEnded: vi.fn(async () => true) });
    await expect(answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, deps)).rejects.toMatchObject({
      status: 409,
      message: 'A aula já foi encerrada.',
      details: { code: 'CLASS_ENDED' },
    });
    expect(deps.insertClassAnswer).not.toHaveBeenCalled();
  });

  it.each(['COMPLETED', 'CANCELLED'])('agenda %s vira 409 CLASS_ENDED', async (status) => {
    const deps = makeDeps({ getAgenda: vi.fn(async () => ({ id: 'ag1', type: 'CLASSROOM', status }) as AgendaDTO) });
    await expect(answerTutorQuestion(student, 'ag1', 4, { optionKey: 'B' }, deps)).rejects.toMatchObject({
      status: 409,
      details: { code: 'CLASS_ENDED' },
    });
    expect(deps.insertClassAnswer).not.toHaveBeenCalled();
  });
});

describe('getClassPulse', () => {
  it('uma entrada por pergunta, em ordem de seq, sem respostas = 0', async () => {
    const deps = makeDeps({
      findEventsAfter: vi.fn(async () => [
        row(2, 'TUTOR_CARD', {}),
        row(4, 'TUTOR_QUESTION', mcPayload, 1),
        row(9, 'TUTOR_QUESTION', openPayload, 2),
      ]) as never,
      countClassAnswers: vi.fn(async () => [{ seq: 4, answered: 3, correct: 2 }]),
    });
    const pulse = await getClassPulse(teacher, 'ag1', deps);
    expect(pulse).toEqual([
      { seq: 4, stepIndex: 1, kind: 'MULTIPLE_CHOICE', answered: 3, correct: 2 },
      { seq: 9, stepIndex: 2, kind: 'OPEN', answered: 0, correct: null },
    ]);
    expect(deps.countClassAnswers).toHaveBeenCalledWith('ag1', [4, 9]);
    expect(deps.findEventsAfter).toHaveBeenCalledWith('ag1', 0, ['ALL'], expect.any(Number));
  });

  it('sem perguntas devolve vazio sem contar', async () => {
    const deps = makeDeps();
    expect(await getClassPulse(teacher, 'ag1', deps)).toEqual([]);
    expect(deps.countClassAnswers).not.toHaveBeenCalled();
  });

  it('aluno recebe 403', async () => {
    await expect(getClassPulse(student, 'ag1', makeDeps())).rejects.toMatchObject({
      status: 403,
      message: 'Apenas o professor vê o pulso da turma.',
    });
  });
});
