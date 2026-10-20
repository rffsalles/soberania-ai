import { describe, expect, it, vi } from 'vitest';
import { AgendaType, Role } from '@prisma/client';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { getExamForStudent, submitExam, type ExamDeps } from '../exam-service';

const student = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const START = new Date('2026-10-20T10:00:00Z');
const END = new Date('2026-10-20T11:00:00Z');
const at = (ms: number) => new Date(END.getTime() + ms);

const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  enunciation: `Enunciado da questão ${n}`,
  options: ['A', 'B', 'C', 'D'].map((key) => ({ key, text: `Opção ${key}` })),
  correctKey: 'A',
  rationale: 'Porque sim.',
  topic: 'Tema',
}));

function makeDeps(opts: { now: Date; type?: AgendaType; assessmentId?: string | null; submitted?: boolean }) {
  const agenda = {
    id: 'ag1',
    title: 'Prova',
    subject: 'BD',
    type: opts.type ?? AgendaType.EXAM,
    status: 'LIVE',
    startTime: START.toISOString(),
    endTime: END.toISOString(),
    classId: 'c1',
    className: 'Turma',
    teacherName: 'Prof',
    ...(opts.assessmentId === null ? {} : { assessmentId: opts.assessmentId ?? 'as1' }),
  } as AgendaDTO;
  let stored: { score: number; maxScore: number; submittedAt: Date } | null = opts.submitted
    ? { score: 5, maxScore: 10, submittedAt: new Date('2026-10-20T10:30:00Z') }
    : null;
  const createSubmission = vi.fn(async (data: { score: number; maxScore?: number }) => {
    stored = { score: data.score, maxScore: data.maxScore ?? 10, submittedAt: opts.now };
    return data;
  });
  const deps: ExamDeps = {
    getAgenda: async () => agenda,
    findAssessment: async () => ({ id: 'as1', questions, maxScore: 10, durationMinutes: 60 }),
    findSubmission: async () => stored,
    createSubmission,
    now: () => opts.now,
  };
  return { deps, createSubmission };
}

type Key = 'A' | 'B' | 'C' | 'D';
const answers = (keys: string[]) =>
  keys.map((chosenKey, i) => ({ questionId: `q${i + 1}`, chosenKey: chosenKey as Key, timeSpentSeconds: 10 }));
const log = { blurEvents: 1, guardrailBlocks: 0 };

describe('getExamForStudent', () => {
  it('não expõe correctKey nem rationale', async () => {
    const { deps } = makeDeps({ now: new Date('2026-10-20T10:10:00Z') });
    const exam = await getExamForStudent(student, 'ag1', deps);
    expect(exam.questions).toHaveLength(3);
    expect(JSON.stringify(exam.questions)).not.toMatch(/correctKey|rationale/);
    expect(exam.alreadySubmitted).toBe(false);
    expect(exam.durationMinutes).toBe(60);
    expect(exam.serverNow).toBe('2026-10-20T10:10:00.000Z');
  });

  it('retorna 422 fora da janela', async () => {
    const { deps } = makeDeps({ now: at(1000) });
    await expect(getExamForStudent(student, 'ag1', deps)).rejects.toMatchObject({ status: 422 });
  });

  it('retorna 404 se não for prova ou sem avaliação', async () => {
    const now = new Date('2026-10-20T10:10:00Z');
    await expect(
      getExamForStudent(student, 'ag1', makeDeps({ now, type: AgendaType.CLASSROOM }).deps)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getExamForStudent(student, 'ag1', makeDeps({ now, assessmentId: null }).deps)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('já enviada fora da janela devolve a nota em vez de 422', async () => {
    const { deps } = makeDeps({ now: at(3_600_000), submitted: true });
    const exam = await getExamForStudent(student, 'ag1', deps);
    expect(exam.alreadySubmitted).toBe(true);
    expect(exam.submission).toMatchObject({ score: 5, maxScore: 10 });
  });
});

describe('submitExam', () => {
  it('2 de 3 certas com maxScore 10 resulta em 6.67 e grava gabarito', async () => {
    const { deps, createSubmission } = makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    const result = await submitExam(student, 'ag1', { answers: answers(['A', 'A', 'B']), integrityLog: log }, deps);
    expect(result).toEqual({ score: 6.67, maxScore: 10, correct: 2, total: 3 });
    const saved = createSubmission.mock.calls[0][0] as unknown as { answers: { correctKey: string }[] };
    expect(saved.answers.every((a) => a.correctKey === 'A')).toBe(true);
  });

  it('não respondidas contam como erradas e ids desconhecidos são ignorados', async () => {
    const { deps } = makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    const result = await submitExam(
      student,
      'ag1',
      {
        answers: [
          { questionId: 'q1', chosenKey: 'A', timeSpentSeconds: 1 },
          { questionId: 'zzz', chosenKey: 'A', timeSpentSeconds: 1 },
        ],
        integrityLog: log,
      },
      deps
    );
    expect(result).toMatchObject({ correct: 1, total: 3, score: 3.33 });
  });

  it('após endTime + 61 s retorna 422; dentro da tolerância aceita', async () => {
    await expect(
      submitExam(student, 'ag1', { answers: answers(['A']), integrityLog: log }, makeDeps({ now: at(61_000) }).deps)
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      submitExam(student, 'ag1', { answers: answers(['A']), integrityLog: log }, makeDeps({ now: at(59_000) }).deps)
    ).resolves.toBeDefined();
  });

  it('segunda submissão retorna 409', async () => {
    const { deps } = makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    await submitExam(student, 'ag1', { answers: answers(['A']), integrityLog: log }, deps);
    await expect(
      submitExam(student, 'ag1', { answers: answers(['A']), integrityLog: log }, deps)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('várias respostas para a mesma questão: vale a última', async () => {
    const mk = () => makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    const gamed = ['A', 'B', 'C', 'D'].map((k) => ({ questionId: 'q1', chosenKey: k as Key, timeSpentSeconds: 1 }));
    const first = mk();
    expect(
      await submitExam(student, 'ag1', { answers: gamed, integrityLog: log }, first.deps)
    ).toMatchObject({ correct: 0 });
    const saved = first.createSubmission.mock.calls[0][0] as unknown as { answers: unknown[] };
    expect(saved.answers).toHaveLength(1);
    const lastCorrect = mk();
    expect(
      await submitExam(student, 'ag1', { answers: [...gamed.slice(1), gamed[0]], integrityLog: log }, lastCorrect.deps)
    ).toMatchObject({ correct: 1 });
  });

  it('alternativa fora das opções da questão retorna 422', async () => {
    const { deps } = makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    await expect(
      submitExam(student, 'ag1', { answers: answers(['Z']), integrityLog: log }, deps)
    ).rejects.toMatchObject({ status: 422 });
  });

  it('professor não pode submeter (403)', async () => {
    const { deps } = makeDeps({ now: new Date('2026-10-20T10:50:00Z') });
    await expect(
      submitExam(teacher, 'ag1', { answers: [], integrityLog: log }, deps)
    ).rejects.toMatchObject({ status: 403 });
  });
});
