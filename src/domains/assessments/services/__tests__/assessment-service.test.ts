import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import type { StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { OPTION_KEYS, questionSchema, type Question } from '../../question-schema';
import {
  generateQuestions,
  publishAssessment,
  updateAssessment,
  type AssessmentDeps,
} from '../assessment-service';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const other = { id: 't2', role: Role.TEACHER, classId: null };

const chunk = (n: number): DidacticChunk => ({
  id: `c${n}`,
  materialId: 'm1',
  bookTitle: 'Livro',
  author: 'Autor',
  chapter: `Capítulo ${n}`,
  pageNumber: n,
  content: `Conceito ${n} é fundamental para a disciplina. Outra ideia ${n} complementa o tema.`,
});

function makeDeps(aiText: string, fallback = false) {
  const createAgenda = vi.fn(
    async (_u: unknown, input: { title: string }) => ({ id: 'ag1', title: input.title }) as AgendaDTO
  );
  const updateAssessmentById = vi.fn(async (id: string, data: unknown) => ({ id, ...(data as object) }));
  const deps: AssessmentDeps = {
    findPlan: async (id) =>
      id === 'plan1'
        ? {
            id: 'plan1',
            teacherId: 't1',
            subjectId: 's1',
            syllabus: 'Ementa',
            unitsContent: [{ unitNumber: 1, title: 'Unidade um', topics: ['a'] }],
            subject: { name: 'Banco de Dados' },
          }
        : null,
    findAssessment: async (id) =>
      id === 'as1'
        ? {
            id: 'as1',
            title: 'Prova 1',
            durationMinutes: 60,
            status: 'DRAFT',
            teachingPlan: { teacherId: 't1', subjectId: 's1' },
          }
        : id === 'pub1'
          ? {
              id: 'pub1',
              title: 'Prova 2',
              durationMinutes: 60,
              status: 'PUBLISHED',
              teachingPlan: { teacherId: 't1', subjectId: 's1' },
            }
          : null,
    updateAssessmentById,
    search: async () => ({ chunks: [chunk(1), chunk(2), chunk(3)] }),
    streamChat: async function* (): AsyncGenerator<StreamChunk> {
      yield { token: aiText, isComplete: true, fallback };
    },
    createAgenda,
  };
  return { deps, createAgenda, updateAssessmentById };
}

const validQuestion = (id: string): Question => ({
  id,
  enunciation: 'Qual afirmação está correta?',
  options: OPTION_KEYS.map((key) => ({ key, text: `opção ${key}` })),
  correctKey: OPTION_KEYS[0],
  rationale: 'porque sim',
  topic: 'tema',
});

describe('generateQuestions', () => {
  const input = { teachingPlanId: 'plan1', unitNumbers: [1], questionCount: 5, type: 'EXAM' };

  it('falls back to chunk-based questions when the AI returns invalid JSON', async () => {
    const { deps } = makeDeps('isto não é json');
    const out = await generateQuestions(teacher, input, deps);
    expect(out.fallback).toBe(true);
    expect(out.questions).toHaveLength(5);
    for (const q of out.questions) expect(questionSchema.safeParse(q).success).toBe(true);
    expect(out.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
  });

  it('builds valid questions with 4 distinct options from a single chunk', async () => {
    const { deps } = makeDeps('não é json');
    deps.search = async () => ({ chunks: [chunk(1)] });
    const out = await generateQuestions(teacher, input, deps);
    expect(out.questions).toHaveLength(5);
    for (const q of out.questions) {
      expect(questionSchema.safeParse(q).success).toBe(true);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    }
  });

  it('dedupes options when chunks have identical content', async () => {
    const { deps } = makeDeps('não é json');
    const same = (n: number) => ({ ...chunk(1), id: `same${n}` });
    deps.search = async () => ({ chunks: [same(1), same(2), same(3)] });
    const out = await generateQuestions(teacher, input, deps);
    for (const q of out.questions) {
      expect(questionSchema.safeParse(q).success).toBe(true);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    }
  });

  it('falls back when the provider chunks are flagged as fallback', async () => {
    const { deps } = makeDeps(JSON.stringify({ questions: [validQuestion('x')] }), true);
    const out = await generateQuestions(teacher, { ...input, questionCount: 1 }, deps);
    expect(out.fallback).toBe(true);
  });

  it('uses valid AI output and normalizes ids', async () => {
    const text = JSON.stringify({ questions: [validQuestion('a'), validQuestion('b')], rubrics: [] });
    const { deps } = makeDeps(text);
    const out = await generateQuestions(teacher, { ...input, questionCount: 2 }, deps);
    expect(out.fallback).toBe(false);
    expect(out.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
  });

  it('rejects a teacher who does not own the plan', async () => {
    const { deps } = makeDeps('x');
    await expect(generateQuestions(other, input, deps)).rejects.toMatchObject({ status: 403 });
  });
});

describe('publishAssessment', () => {
  const body = { classId: 'cl1', startTime: '2026-11-01T10:00:00.000Z' };

  it('creates an EXAM agenda ending startTime + duration and publishes', async () => {
    const { deps, createAgenda, updateAssessmentById } = makeDeps('x');
    const agenda = await publishAssessment('as1', teacher, body, deps);
    expect(agenda.id).toBe('ag1');
    expect(createAgenda).toHaveBeenCalledWith(
      teacher,
      expect.objectContaining({
        type: 'EXAM',
        classId: 'cl1',
        subjectId: 's1',
        assessmentId: 'as1',
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T11:00:00.000Z',
      })
    );
    expect(updateAssessmentById).toHaveBeenCalledWith('as1', { status: 'PUBLISHED' });
  });

  it('rejects publishing an already published assessment with 409', async () => {
    const { deps, createAgenda } = makeDeps('x');
    await expect(publishAssessment('pub1', teacher, body, deps)).rejects.toMatchObject({ status: 409 });
    expect(createAgenda).not.toHaveBeenCalled();
  });

  it('reverts the status to DRAFT when agenda creation fails', async () => {
    const { deps, updateAssessmentById } = makeDeps('x');
    deps.createAgenda = async () => {
      throw new Error('boom');
    };
    await expect(publishAssessment('as1', teacher, body, deps)).rejects.toThrow('boom');
    expect(updateAssessmentById).toHaveBeenLastCalledWith('as1', { status: 'DRAFT' });
  });

  it('rejects a teacher who does not own the plan', async () => {
    const { deps, createAgenda } = makeDeps('x');
    await expect(publishAssessment('as1', other, body, deps)).rejects.toMatchObject({ status: 403 });
    expect(createAgenda).not.toHaveBeenCalled();
  });
});

describe('updateAssessment', () => {
  it('rejects a question with 3 options', async () => {
    const { deps, updateAssessmentById } = makeDeps('x');
    const bad = { ...validQuestion('q1'), options: validQuestion('q1').options.slice(0, 3) } as unknown as Question;
    await expect(updateAssessment('as1', teacher, { questions: [bad] }, deps)).rejects.toMatchObject({ status: 400 });
    expect(updateAssessmentById).not.toHaveBeenCalled();
  });

  it('updates with valid data and blocks foreign teachers', async () => {
    const { deps, updateAssessmentById } = makeDeps('x');
    await updateAssessment('as1', teacher, { title: 'Novo título', questions: [validQuestion('q1')] }, deps);
    expect(updateAssessmentById).toHaveBeenCalled();
    await expect(updateAssessment('as1', other, { title: 'Outro' }, deps)).rejects.toMatchObject({ status: 403 });
  });
});
