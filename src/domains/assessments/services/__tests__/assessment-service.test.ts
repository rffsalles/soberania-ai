import { describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import type { StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import type { AgendaDTO } from '@/domains/agendas/services/agenda-service';
import { OPTION_KEYS } from '@/lib/constants/assessments';
import { questionSchema, type Question } from '../../question-schema';
import { MAT_BOOK } from '@/components/teaching/__tests__/chapter-tree-fixtures';
import { ASSESSMENT_PUBLISHED, CHAPTER_OUTSIDE_PLAN, NO_INDEXED_CHAPTER_CONTENT } from '@/lib/constants/teaching';
import {
  assessmentMaxTokens,
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
            subject: { discipline: { name: 'Banco de Dados' } },
          }
        : null,
    findAssessment: async (id) =>
      id === 'as1'
        ? {
            id: 'as1',
            title: 'Prova 1',
            durationMinutes: 60,
            status: 'DRAFT',
            teachingPlan: { id: 'plan1', teacherId: 't1', subjectId: 's1' },
          }
        : id === 'pub1'
          ? {
              id: 'pub1',
              title: 'Prova 2',
              durationMinutes: 60,
              status: 'PUBLISHED',
              teachingPlan: { id: 'plan1', teacherId: 't1', subjectId: 's1' },
            }
          : null,
    updateAssessmentById,
    claimAssessmentForPublish: async (id) => (await deps.findAssessment(id))?.status === 'DRAFT',
    search: async () => ({ chunks: [chunk(1), chunk(2), chunk(3)] }),
    streamChat: async function* (): AsyncGenerator<StreamChunk> {
      yield { token: aiText, isComplete: true, fallback };
    },
    createAgenda,
    listPlanChapters: async () => [MAT_BOOK],
    listDescendantIds: vi.fn(async (ids: string[]) => (ids[0] === 'u2' ? ['u2', 's21', 's22', 's221', 's222'] : ids)),
    sampleByChapter: vi.fn(async () => []),
    replaceAssessmentChapters: vi.fn(async () => {}),
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
  const input = { teachingPlanId: 'plan1', chapterIds: ['u2', 'u3'], questionCount: 5, type: 'EXAM' };

  it('uma busca por capítulo, com allowedChapterIds expandidos e topK 4', async () => {
    const { deps } = makeDeps('não é json');
    const search = vi.spyOn(deps, 'search');
    await generateQuestions(teacher, input, deps);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith({ query: 'Unidade 2', allowedChapterIds: ['u2', 's21', 's22', 's221', 's222'], topK: 4 });
    expect(search).toHaveBeenCalledWith({ query: 'Unidade 3', allowedChapterIds: ['u3'], topK: 4 });
  });

  it('duplicata e pai+filho viram uma única busca', async () => {
    const { deps } = makeDeps('não é json');
    const search = vi.spyOn(deps, 'search');
    await generateQuestions(teacher, { ...input, chapterIds: ['u2', 's22', 'u2'] }, deps);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('capítulo fora do plano dá 400', async () => {
    const { deps } = makeDeps('x');
    await expect(generateQuestions(teacher, { ...input, chapterIds: ['zz'] }, deps)).rejects.toMatchObject({
      status: 400,
      message: CHAPTER_OUTSIDE_PLAN,
    });
  });

  it('busca vazia cai em sampleByChapter(expandidos, 4, 12); amostra vazia dá 422', async () => {
    const { deps } = makeDeps('x');
    deps.search = async () => ({ chunks: [] });
    await expect(generateQuestions(teacher, input, deps)).rejects.toMatchObject({ status: 422, message: NO_INDEXED_CHAPTER_CONTENT });
    expect(deps.sampleByChapter).toHaveBeenCalledWith(['u2', 's21', 's22', 's221', 's222', 'u3'], 4, 12);
  });

  it('chapterId fora da seleção é descartado e a questão mantida', async () => {
    const text = JSON.stringify({ questions: [{ ...validQuestion('a'), chapterId: 'u2' }, { ...validQuestion('b'), chapterId: 's22' }] });
    const { deps } = makeDeps(text);
    const out = await generateQuestions(teacher, { ...input, questionCount: 2 }, deps);
    expect(out.fallback).toBe(false);
    expect(out.questions.map((q) => q.chapterId)).toEqual(['u2', undefined]);
  });

  it('rate_limit dá 429 mesmo com JSON válido', async () => {
    const { deps } = makeDeps(JSON.stringify({ questions: [validQuestion('a')] }));
    deps.streamChat = async function* () {
      yield { token: JSON.stringify({ questions: [validQuestion('a')] }), isComplete: true, fallback: true, fallbackReason: 'rate_limit' };
    };
    await expect(generateQuestions(teacher, { ...input, questionCount: 1 }, deps)).rejects.toMatchObject({ status: 429 });
  });

  it('maxTokens segue assessmentMaxTokens e temperatura 0.4', async () => {
    const { deps } = makeDeps('x');
    const spy = vi.spyOn(deps, 'streamChat');
    await generateQuestions(teacher, input, deps);
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ temperature: 0.4, maxTokens: 2050 }));
    expect(assessmentMaxTokens(40)).toBe(8000);
  });

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
    expect(updateAssessmentById).not.toHaveBeenCalled();
  });

  it('rejects publishing an already published assessment with 409', async () => {
    const { deps, createAgenda } = makeDeps('x');
    await expect(publishAssessment('pub1', teacher, body, deps)).rejects.toMatchObject({ status: 409 });
    expect(createAgenda).not.toHaveBeenCalled();
  });

  it('returns 409 when the atomic claim loses the race', async () => {
    const { deps, createAgenda } = makeDeps('x');
    deps.claimAssessmentForPublish = async () => false;
    await expect(publishAssessment('as1', teacher, body, deps)).rejects.toMatchObject({ status: 409 });
    expect(createAgenda).not.toHaveBeenCalled();
  });

  it('rethrows the original error even when the revert fails', async () => {
    const { deps } = makeDeps('x');
    deps.createAgenda = async () => {
      throw new Error('boom');
    };
    deps.updateAssessmentById = async () => {
      throw new Error('revert failed');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(publishAssessment('as1', teacher, body, deps)).rejects.toThrow('boom');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
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
  it('PUBLISHED dá 409 sem gravar', async () => {
    const { deps, updateAssessmentById } = makeDeps('x');
    await expect(updateAssessment('pub1', teacher, { title: 'Nova' }, deps)).rejects.toMatchObject({ status: 409, message: ASSESSMENT_PUBLISHED });
    expect(updateAssessmentById).not.toHaveBeenCalled();
  });
  it('grava chapterIds normalizados', async () => {
    const { deps } = makeDeps('x');
    await updateAssessment('as1', teacher, { chapterIds: ['u2', 's22', 'u2'] }, deps);
    expect(deps.replaceAssessmentChapters).toHaveBeenCalledWith('as1', ['u2']);
  });
  it('capítulo fora do plano dá 400 antes de gravar', async () => {
    const { deps, updateAssessmentById } = makeDeps('x');
    await expect(updateAssessment('as1', teacher, { chapterIds: ['zz'] }, deps)).rejects.toMatchObject({ status: 400 });
    expect(updateAssessmentById).not.toHaveBeenCalled();
  });
  it('sem a chave chapterIds não toca a junção', async () => {
    const { deps } = makeDeps('x');
    await updateAssessment('as1', teacher, { title: 'Nova' }, deps);
    expect(deps.replaceAssessmentChapters).not.toHaveBeenCalled();
  });
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
