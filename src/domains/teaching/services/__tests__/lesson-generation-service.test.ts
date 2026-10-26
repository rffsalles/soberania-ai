import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import {
  generateLessonContent,
  refineLessonField,
  NO_INDEXED_CHAPTER_CONTENT,
  type LessonGenerationDeps,
} from '../lesson-generation-service';
import { LESSON_AI_UNAVAILABLE_MESSAGE, NO_LESSON_CHAPTERS } from '@/lib/constants/teaching';
import type { DidacticChunk } from '@/domains/rag/types';

const teacher = { id: 't1', role: Role.TEACHER };
const chunk: DidacticChunk = {
  id: 'c1', materialId: 'm1', bookTitle: 'Sistemas de Banco de Dados', author: 'Elmasri', chapter: 'Cap. 3: Modelagem',
  pageNumber: 41, content: 'Texto.',
};

function lesson(opts: { chapters?: boolean; teacherId?: string; topicTitle?: string } = {}) {
  return {
    id: 'l1', classNumber: 3, topicTitle: opts.topicTitle ?? 'Modelagem',
    courseSchedule: {
      totalClasses: 20,
      teachingPlan: {
        teacherId: opts.teacherId ?? 't1', syllabus: 'Ementa', generalObjectives: 'Objetivos gerais',
        subject: { discipline: { name: 'Banco de Dados' } },
      },
    },
    chapters: opts.chapters === false ? [] : [
      { chapter: { id: 'ch3', order: 3, title: 'Modelagem', startPage: 40, endPage: 60, material: { title: 'Sistemas de Banco de Dados', author: 'Elmasri' } } },
    ],
  };
}

const text = (durations: number[]) =>
  JSON.stringify({
    dailyObjective: 'Objetivo', methodology: 'Método', resourcesNeeded: ['Projetor'], fixationExercise: 'Exercício',
    steps: durations.map((d, i) => ({ activity: `Etapa ${i + 1}`, description: 'Desc', durationMinutes: d })),
  });

function makeDeps(opts: {
  lesson?: ReturnType<typeof lesson> | null; chunks?: DidacticChunk[]; text?: string; fallback?: boolean; throws?: boolean;
  sample?: DidacticChunk[];
} = {}) {
  const search = vi.fn().mockResolvedValue({ chunks: opts.chunks ?? [chunk] });
  const sampleByChapter = vi.fn().mockResolvedValue(opts.sample ?? []);
  const streamChat = vi.fn().mockImplementation(async function* () {
    if (opts.throws) throw new Error('boom');
    yield { token: opts.text ?? text([20, 50, 30]), fallback: opts.fallback };
  });
  const deps = {
    findLesson: vi.fn().mockResolvedValue(opts.lesson === undefined ? lesson() : opts.lesson),
    search, streamChat, sampleByChapter,
  } as unknown as LessonGenerationDeps;
  return { deps, search, streamChat, sampleByChapter };
}

describe('generateLessonContent', () => {
  it('saída válida vira roteiro com início acumulado e citações', async () => {
    const { deps, streamChat } = makeDeps();
    const r = await generateLessonContent('l1', teacher, deps);
    expect(r.timeScript.map((s) => [s.timeSeconds, s.timeRange])).toEqual([
      [0, '00:00-20:00'], [1200, '20:00-70:00'], [4200, '70:00-100:00'],
    ]);
    expect(r.citations).toEqual(['[Sistemas de Banco de Dados · Cap. 3, pág. 41]']);
    expect(r.dailyObjective).toBe('Objetivo');
    expect(r).not.toHaveProperty('steps');
    expect(streamChat.mock.calls[0][1]).toMatchObject({ temperature: 0.3, maxTokens: 2000 });
  });

  it('faz 3 buscas filtradas pelos capítulos da aula', async () => {
    const { deps, search } = makeDeps();
    await generateLessonContent('l1', teacher, deps);
    expect(search.mock.calls.map((c) => c[0])).toEqual([
      { query: 'Modelagem', allowedChapterIds: ['ch3'], topK: 4 },
      { query: 'Objetivos gerais', allowedChapterIds: ['ch3'], topK: 4 },
      { query: 'exemplos e exercícios de Modelagem', allowedChapterIds: ['ch3'], topK: 4 },
    ]);
  });

  it('deduplica chunks e citações repetidas', async () => {
    const { deps } = makeDeps({ chunks: [chunk, chunk] });
    const r = await generateLessonContent('l1', teacher, deps);
    expect(r.citations).toHaveLength(1);
  });

  it('soma dos tempos fora da tolerância → 503', async () => {
    for (const d of [[20, 50], [20, 50, 41], [20, 50, 19]]) {
      const { deps } = makeDeps({ text: text(d) });
      await expect(generateLessonContent('l1', teacher, deps)).rejects.toMatchObject({ status: 503, message: LESSON_AI_UNAVAILABLE_MESSAGE });
    }
  });

  it('limites da tolerância (90 e 110 min) são aceitos', async () => {
    for (const d of [[90], [110], [108]]) {
      const { deps } = makeDeps({ text: text(d) });
      await expect(generateLessonContent('l1', teacher, deps)).resolves.toBeDefined();
    }
  });

  it('busca vazia usa a amostra por capítulo e cita a amostra; busca não vazia não amostra', async () => {
    const empty = makeDeps({ chunks: [], sample: [{ ...chunk, id: 's1', pageNumber: 50 }] });
    const r = await generateLessonContent('l1', teacher, empty.deps);
    expect(r.citations).toEqual(['[Sistemas de Banco de Dados · Cap. 3, pág. 50]']);
    expect(empty.sampleByChapter).toHaveBeenCalledWith(['ch3'], 4, 12);
    const full = makeDeps();
    await generateLessonContent('l1', teacher, full.deps);
    expect(full.sampleByChapter).not.toHaveBeenCalled();
  });

  it('sem chunks → 422 com a mensagem exata', async () => {
    const { deps, streamChat } = makeDeps({ chunks: [] });
    await expect(generateLessonContent('l1', teacher, deps)).rejects.toMatchObject({ status: 422, message: NO_INDEXED_CHAPTER_CONTENT });
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('aula inexistente → 404; sem capítulos → 400; outro professor → 403', async () => {
    await expect(generateLessonContent('x', teacher, makeDeps({ lesson: null }).deps)).rejects.toMatchObject({ status: 404, message: 'Plano de aula não encontrado.' });
    await expect(generateLessonContent('l1', teacher, makeDeps({ lesson: lesson({ chapters: false }) }).deps)).rejects.toMatchObject({ status: 400, message: NO_LESSON_CHAPTERS });
    const other = makeDeps({ lesson: lesson({ teacherId: 't2' }) });
    await expect(generateLessonContent('l1', teacher, other.deps)).rejects.toMatchObject({ status: 403 });
    expect(other.search).not.toHaveBeenCalled();
  });

  it('fallback, exceção ou JSON inválido → 503', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const o of [{ fallback: true }, { throws: true }, { text: 'lixo' }]) {
      await expect(generateLessonContent('l1', teacher, makeDeps(o).deps)).rejects.toMatchObject({ status: 503, message: LESSON_AI_UNAVAILABLE_MESSAGE });
    }
    warn.mockRestore();
  });
});

describe('refineLessonField', () => {
  const input = { field: 'methodology' as const, instruction: 'mais prática', current: 'Aula expositiva' };
  const er = () => lesson({ topicTitle: 'Modelo ER' });

  it('refino usa 2 chunks dos capítulos, temperatura 0.4 e devolve o texto aparado', async () => {
    const { deps, search, streamChat } = makeDeps({ lesson: er(), text: '  Metodologia refinada \n' });
    const r = await refineLessonField('l1', teacher, input, deps);
    expect(r).toEqual({ text: 'Metodologia refinada' });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'mais prática Modelo ER', topK: 2, allowedChapterIds: ['ch3'] }));
    expect(streamChat.mock.calls[0][1]).toMatchObject({ temperature: 0.4, maxTokens: 600 });
  });

  it('timeScript refina a descrição da etapa stepIndex + 1', async () => {
    const { deps, streamChat } = makeDeps({ lesson: er(), text: 'Nova descrição' });
    const r = await refineLessonField('l1', teacher, { field: 'timeScript', stepIndex: 1, instruction: 'mais curta', current: 'Antiga' }, deps);
    expect(r).toEqual({ text: 'Nova descrição' });
    const user = streamChat.mock.calls[0][0].find((m: { role: string }) => m.role === 'user').content as string;
    expect(user).toContain('etapa 2');
  });

  it('refino: busca vazia usa a amostra; amostra vazia → 422 sem chamar o modelo', async () => {
    const ok = makeDeps({ lesson: er(), chunks: [], sample: [chunk], text: 'Refinado' });
    await expect(refineLessonField('l1', teacher, input, ok.deps)).resolves.toEqual({ text: 'Refinado' });
    expect(ok.sampleByChapter).toHaveBeenCalledWith(['ch3'], 4, 12);
    const none = makeDeps({ lesson: er(), chunks: [], sample: [] });
    await expect(refineLessonField('l1', teacher, input, none.deps)).rejects.toMatchObject({ status: 422, message: NO_INDEXED_CHAPTER_CONTENT });
    expect(none.streamChat).not.toHaveBeenCalled();
  });

  it('sem chunks → 422; sem chamar o modelo', async () => {
    const { deps, streamChat } = makeDeps({ lesson: er(), chunks: [] });
    await expect(refineLessonField('l1', teacher, input, deps)).rejects.toMatchObject({ status: 422, message: NO_INDEXED_CHAPTER_CONTENT });
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('resposta vazia, fallback ou exceção → 503', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const o of [{ text: '   ' }, { fallback: true }, { throws: true }]) {
      await expect(refineLessonField('l1', teacher, input, makeDeps({ lesson: er(), ...o }).deps)).rejects.toMatchObject({ status: 503, message: LESSON_AI_UNAVAILABLE_MESSAGE });
    }
    warn.mockRestore();
  });

  it('aula inexistente → 404; sem capítulos → 400; outro professor → 403', async () => {
    await expect(refineLessonField('x', teacher, input, makeDeps({ lesson: null }).deps)).rejects.toMatchObject({ status: 404 });
    await expect(refineLessonField('l1', teacher, input, makeDeps({ lesson: lesson({ chapters: false }) }).deps)).rejects.toMatchObject({ status: 400, message: NO_LESSON_CHAPTERS });
    await expect(refineLessonField('l1', teacher, input, makeDeps({ lesson: lesson({ teacherId: 't2' }) }).deps)).rejects.toMatchObject({ status: 403 });
  });
});
