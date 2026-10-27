import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { distributeChapters, type ChapterDistributionDeps } from '../chapter-distribution-service';
import { DISTRIBUTION_AI_UNAVAILABLE_MESSAGE, NO_PLAN_CHAPTERS, NO_SYNCED_LESSONS } from '@/lib/constants/teaching';
import type { PlanChapterBook } from '../plan-chapters-service';

const teacher = { id: 't1', role: Role.TEACHER };
const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [
      { id: 'ch1', order: 1, title: 'Introdução', startPage: 12, endPage: 24, parentId: null, depth: 0, number: '1' },
      { id: 'ch2', order: 2, title: 'Modelos', startPage: 25, endPage: 40, parentId: null, depth: 0, number: '2' },
    ],
  },
];

const ch = (id: string, order: number, title: string, startPage: number, endPage: number, parentId: string | null, depth: number, number: string) => ({
  id, order, title, startPage, endPage, parentId, depth, number,
});
const book: PlanChapterBook = {
  materialId: 'm1', title: 'Matemática Básica', author: 'Silva', kind: 'BASIC',
  chapters: [
    ch('u1', 1, 'Unidade 1', 15, 42, null, 0, '1'),
    ch('u2', 2, 'Unidade 2', 43, 66, null, 0, '2'),
    ch('s21', 3, 'Produtos notáveis', 43, 47, 'u2', 1, '2.1'),
    ch('s22', 4, 'Frações', 48, 66, 'u2', 1, '2.2'),
    ch('s221', 5, 'Operações com frações', 51, 57, 's22', 2, '2.2.1'),
    ch('s222', 6, 'Frações equivalentes', 58, 66, 's22', 2, '2.2.2'),
    ch('u3', 7, 'Unidade 3', 67, 94, null, 0, '3'),
  ],
};

function schedule(statuses: ('DRAFT' | 'PUBLISHED')[] = ['DRAFT', 'PUBLISHED', 'DRAFT'], teacherId = 't1') {
  return {
    id: 'sch1',
    teachingPlan: {
      id: 'p1', teacherId, syllabus: 'Ementa', generalObjectives: 'Geral', specificObjectives: 'Específicos',
      subject: { discipline: { name: 'Banco de Dados' } },
    },
    lessonPlans: statuses.map((status, i) => ({
      id: `l${i + 1}`, classNumber: i + 1, classDate: new Date(Date.UTC(2026, 2, 2 + i, 15)), status,
    })),
  };
}

function makeDeps(opts: { sch?: ReturnType<typeof schedule> | null; books?: PlanChapterBook[]; text?: string; fallback?: boolean; throws?: boolean } = {}) {
  const apply = vi.fn().mockResolvedValue(undefined);
  const streamChat = vi.fn().mockImplementation(async function* () {
    if (opts.throws) throw new Error('boom');
    yield { token: opts.text ?? '', fallback: opts.fallback };
  });
  const deps = {
    findSchedule: vi.fn().mockResolvedValue(opts.sch === undefined ? schedule() : opts.sch),
    listPlanChapters: vi.fn().mockResolvedValue(opts.books ?? books),
    apply,
    streamChat,
  } as unknown as ChapterDistributionDeps;
  return { deps, apply, streamChat };
}

const validText = JSON.stringify({
  lessons: [
    { classNumber: 1, topicTitle: 'Introdução', chapterIds: ['ch1'] },
    { classNumber: 2, topicTitle: 'Modelos', chapterIds: ['ch2'] },
    { classNumber: 3, topicTitle: 'Modelos II', chapterIds: ['ch2'] },
  ],
});

describe('chapter-distribution-service', () => {
  it('prompt lista só as raízes', async () => {
    const { deps, streamChat } = makeDeps({ books: [book], text: JSON.stringify({ lessons: [1, 2, 3].map((n) => ({ classNumber: n, topicTitle: 'T', chapterIds: ['u2'] })) }) });
    await distributeChapters('sch1', teacher, deps);
    const user = streamChat.mock.calls[0][0][1].content as string;
    expect(user).toContain('id=u2 · Cap. 2: Unidade 2 (p. 43 a 66)');
    expect(user).not.toContain('id=s21');
  });

  it('resposta com id de seção é inválida (503) e nada é gravado', async () => {
    const { deps, apply } = makeDeps({ books: [book], text: JSON.stringify({ lessons: [1, 2, 3].map((n) => ({ classNumber: n, topicTitle: 'T', chapterIds: ['s22'] })) }) });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('resposta válida grava só aulas DRAFT e conta as publicadas puladas', async () => {
    const { deps, apply, streamChat } = makeDeps({ text: validText });
    expect(await distributeChapters('sch1', teacher, deps)).toEqual({ updated: 2, skippedPublished: 1 });
    expect(apply).toHaveBeenCalledWith([
      { lessonPlanId: 'l1', topicTitle: 'Introdução', chapterIds: ['ch1'] },
      { lessonPlanId: 'l3', topicTitle: 'Modelos II', chapterIds: ['ch2'] },
    ]);
    expect(streamChat.mock.calls[0][1]).toMatchObject({ temperature: 0.2, maxTokens: 400 + 90 * 3 });
  });

  it('o orçamento de tokens escala com o número de aulas (40 aulas → 4000)', async () => {
    const { deps, streamChat } = makeDeps({ sch: schedule(Array(40).fill('DRAFT')), text: '{}' });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503 });
    expect(streamChat.mock.calls[0][1]).toMatchObject({ maxTokens: 4000 });
  });

  it('chapterIds repetidos na mesma aula são deduplicados antes de gravar', async () => {
    const text = JSON.stringify({
      lessons: [
        { classNumber: 1, topicTitle: 'A', chapterIds: ['ch1', 'ch1'] },
        { classNumber: 2, topicTitle: 'B', chapterIds: ['ch2'] },
        { classNumber: 3, topicTitle: 'C', chapterIds: ['ch2', 'ch2', 'ch1'] },
      ],
    });
    const { deps, apply } = makeDeps({ text });
    await distributeChapters('sch1', teacher, deps);
    expect(apply).toHaveBeenCalledWith([
      { lessonPlanId: 'l1', topicTitle: 'A', chapterIds: ['ch1'] },
      { lessonPlanId: 'l3', topicTitle: 'C', chapterIds: ['ch2', 'ch1'] },
    ]);
  });

  it('aula faltando na resposta → 503 e nada gravado', async () => {
    const text = JSON.stringify({ lessons: [{ classNumber: 1, topicTitle: 'A', chapterIds: ['ch1'] }] });
    const { deps, apply } = makeDeps({ text });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503, message: DISTRIBUTION_AI_UNAVAILABLE_MESSAGE });
    expect(apply).not.toHaveBeenCalled();
  });

  it('capítulo inexistente no plano → 503 e nada gravado', async () => {
    const text = JSON.stringify({
      lessons: [1, 2, 3].map((n) => ({ classNumber: n, topicTitle: 'A', chapterIds: ['nope'] })),
    });
    const { deps, apply } = makeDeps({ text });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('provider em fallback → 503 com DISTRIBUTION_AI_UNAVAILABLE_MESSAGE', async () => {
    const { deps, apply } = makeDeps({ text: validText, fallback: true });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503, message: DISTRIBUTION_AI_UNAVAILABLE_MESSAGE });
    expect(apply).not.toHaveBeenCalled();
  });

  it('exceção do provider → 503', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, apply } = makeDeps({ throws: true });
    await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('cronograma inexistente 404, outro professor 403, sem aulas 400, sem capítulos 422', async () => {
    await expect(distributeChapters('x', teacher, makeDeps({ sch: null }).deps)).rejects.toMatchObject({ status: 404, message: 'Cronograma não encontrado.' });
    await expect(distributeChapters('sch1', teacher, makeDeps({ sch: schedule(['DRAFT'], 'outro') }).deps)).rejects.toMatchObject({ status: 403 });
    await expect(distributeChapters('sch1', teacher, makeDeps({ sch: schedule([]) }).deps)).rejects.toMatchObject({ status: 400, message: NO_SYNCED_LESSONS });
    const noCh = makeDeps({ books: [{ ...books[0], chapters: [] }] });
    await expect(distributeChapters('sch1', teacher, noCh.deps)).rejects.toMatchObject({ status: 422, message: NO_PLAN_CHAPTERS });
    expect(noCh.streamChat).not.toHaveBeenCalled();
  });
});
