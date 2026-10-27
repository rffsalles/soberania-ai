import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import {
  generateLessonContent,
  refineLessonField,
  NO_INDEXED_CHAPTER_CONTENT,
  type LessonGenerationDeps,
} from '../lesson-generation-service';
import { LESSON_AI_RATE_LIMITED_MESSAGE, LESSON_AI_UNAVAILABLE_MESSAGE, NO_LESSON_CHAPTERS } from '@/lib/constants/teaching';
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
      { chapter: { id: 'ch3', order: 3, number: '3', title: 'Modelagem', startPage: 40, endPage: 60, material: { title: 'Sistemas de Banco de Dados', author: 'Elmasri' } } },
    ],
  };
}

const text = (durations: number[]) =>
  JSON.stringify({
    dailyObjective: 'Objetivo', methodology: 'Método', resourcesNeeded: ['Projetor'], fixationExercise: 'Exercício',
    steps: durations.map((d, i) => ({ activity: `Etapa ${i + 1}`, description: 'Desc', durationMinutes: d })),
  });

function makeDeps(opts: {
  lesson?: unknown; chunks?: DidacticChunk[]; text?: string; fallback?: boolean; fallbackReason?: 'rate_limit' | 'provider_error'; throws?: boolean;
  sample?: DidacticChunk[]; descendants?: string[];
} = {}) {
  const search = vi.fn().mockResolvedValue({ chunks: opts.chunks ?? [chunk] });
  const sampleByChapter = vi.fn().mockResolvedValue(opts.sample ?? []);
  const streamChat = vi.fn().mockImplementation(async function* () {
    if (opts.throws) throw new Error('boom');
    yield { token: opts.text ?? text([20, 50, 30]), fallback: opts.fallback, fallbackReason: opts.fallbackReason };
  });
  const deps = {
    findLesson: vi.fn().mockResolvedValue(opts.lesson === undefined ? lesson() : opts.lesson),
    listDescendantIds: vi.fn(async (ids: string[]) => opts.descendants ?? ids),
    search, streamChat, sampleByChapter,
  } as unknown as LessonGenerationDeps;
  return { deps, search, streamChat, sampleByChapter };
}

const fracoes = {
  ...lesson(),
  chapters: [{ chapter: { id: 's22', order: 4, number: '2.2', title: 'Frações', startPage: 48, endPage: 66,
    material: { title: 'Matemática Básica', author: 'Silva' } } }],
};

describe('subárvore expandida', () => {
  it('expande os nós escolhidos com os descendentes no filtro e rotula só o escolhido', async () => {
    const { deps, search, streamChat } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'] });
    await generateLessonContent('l1', teacher, deps);
    expect(deps.listDescendantIds).toHaveBeenCalledWith(['s22']);
    expect(search.mock.calls.every((c) => JSON.stringify(c[0].allowedChapterIds) === '["s22","s221","s222"]')).toBe(true);
    const user = streamChat.mock.calls[0][0][1].content as string;
    expect(user).toContain('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66');
    expect(user).not.toContain('Operações com frações');
  });

  it('amostragem de fallback usa o conjunto expandido', async () => {
    const { deps, sampleByChapter } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'], chunks: [], sample: [chunk] });
    await generateLessonContent('l1', teacher, deps);
    expect(sampleByChapter).toHaveBeenCalledWith(['s22', 's221', 's222'], 4, 12);
  });

  it('raiz salva expande para toda a subárvore', async () => {
    const raiz = { ...fracoes, chapters: [{ chapter: { ...fracoes.chapters[0].chapter, id: 'u2', number: '2', title: 'Unidade 2', startPage: 43 } }] };
    const { deps, search } = makeDeps({ lesson: raiz, descendants: ['u2', 's21', 's22', 's221', 's222'] });
    await generateLessonContent('l1', teacher, deps);
    expect(search.mock.calls[0][0].allowedChapterIds).toEqual(['u2', 's21', 's22', 's221', 's222']);
  });

  it('expansão vazia mantém os capítulos escolhidos na geração e no refino (nunca abre o escopo)', async () => {
    const gen = makeDeps({ lesson: fracoes, descendants: [] });
    await generateLessonContent('l1', teacher, gen.deps);
    expect(gen.search.mock.calls.every((c) => JSON.stringify(c[0].allowedChapterIds) === '["s22"]')).toBe(true);
    const ref = makeDeps({ lesson: fracoes, descendants: [], text: 'Novo texto' });
    await refineLessonField('l1', teacher, { field: 'methodology', instruction: 'mais curto', current: 'x' }, ref.deps);
    expect(ref.search.mock.calls[0][0].allowedChapterIds).toEqual(['s22']);
  });

  it('refino filtra pelo conjunto expandido e rotula sem páginas', async () => {
    const { deps, search, streamChat } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'], text: 'Novo texto' });
    await refineLessonField('l1', teacher, { field: 'methodology', instruction: 'mais curto', current: 'x' }, deps);
    expect(search.mock.calls[0][0].allowedChapterIds).toEqual(['s22', 's221', 's222']);
    const user = streamChat.mock.calls[0][0][1].content as string;
    expect(user).toContain('Cap. 2.2: Frações — Matemática Básica (Silva)');
    expect(user).not.toContain('p. 48');
  });
});

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

  it('topicTitle do modelo é devolvido', async () => {
    const t = JSON.stringify({ ...JSON.parse(text([20, 50, 30])), topicTitle: 'Modelagem Entidade-Relacionamento' });
    const { deps } = makeDeps({ text: t });
    const r = await generateLessonContent('l1', teacher, deps);
    expect(r.topicTitle).toBe('Modelagem Entidade-Relacionamento');
  });

  it('sem topicTitle: título padrão fica ausente; título próprio é mantido', async () => {
    const dflt = makeDeps({ lesson: lesson({ topicTitle: 'Aula 3' }) });
    expect(await generateLessonContent('l1', teacher, dflt.deps)).not.toHaveProperty('topicTitle');
    const own = makeDeps({ lesson: lesson({ topicTitle: 'Modelo ER' }) });
    expect((await generateLessonContent('l1', teacher, own.deps)).topicTitle).toBe('Modelo ER');
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

describe('limite de uso do provedor', () => {
  const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
  const input = { field: 'methodology' as const, instruction: 'mais prática', current: 'Aula expositiva' };

  it('generate: fallback por rate_limit → 429 com a mensagem de limite; provider_error segue 503', async () => {
    const w = warn();
    await expect(
      generateLessonContent('l1', teacher, makeDeps({ fallback: true, fallbackReason: 'rate_limit' }).deps)
    ).rejects.toMatchObject({ status: 429, message: LESSON_AI_RATE_LIMITED_MESSAGE });
    await expect(
      generateLessonContent('l1', teacher, makeDeps({ fallback: true, fallbackReason: 'provider_error' }).deps)
    ).rejects.toMatchObject({ status: 503, message: LESSON_AI_UNAVAILABLE_MESSAGE });
    w.mockRestore();
  });

  it('refine: fallback por rate_limit → 429 com a mensagem de limite', async () => {
    const w = warn();
    await expect(
      refineLessonField('l1', teacher, input, makeDeps({ fallback: true, fallbackReason: 'rate_limit' }).deps)
    ).rejects.toMatchObject({ status: 429, message: LESSON_AI_RATE_LIMITED_MESSAGE });
    w.mockRestore();
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
