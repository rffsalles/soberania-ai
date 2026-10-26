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
      { id: 'ch1', order: 1, title: 'Introdução', startPage: 12, endPage: 24 },
      { id: 'ch2', order: 2, title: 'Modelos', startPage: 25, endPage: 40 },
    ],
  },
];

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
