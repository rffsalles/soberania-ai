import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { generateUnitsFromDistribution, type PlanUnitsDeps } from '../plan-units-service';
import { NO_DISTRIBUTED_CHAPTERS, PLAN_UNITS_AI_UNAVAILABLE_MESSAGE } from '@/lib/constants/teaching';
import type { PlanChapterBook } from '../plan-chapters-service';

const teacher = { id: 't1', role: Role.TEACHER };
const books: PlanChapterBook[] = [
  {
    materialId: 'm1', title: 'Livro A', author: 'Autor', kind: 'BASIC',
    chapters: [1, 2, 3, 4].map((n) => ({ id: `ch${n}`, order: n, title: `Cap ${n}`, startPage: n * 10, endPage: n * 10 + 9, parentId: null, depth: 0, number: String(n) })),
  },
];

function schedule(withChapters = true, teacherId = 't1', chapterOf: (n: number) => string[] = (n) => [`ch${n}`]) {
  return {
    id: 'sch1',
    teachingPlan: {
      id: 'p1', teacherId, syllabus: 'Ementa', generalObjectives: 'Geral', specificObjectives: 'Específicos',
      subject: { discipline: { name: 'Banco de Dados' } },
    },
    lessonPlans: [1, 2, 3, 4, 5].map((n) => ({
      id: `l${n}`, classNumber: n, classDate: new Date(Date.UTC(2026, 2, 1 + n, 15)), status: 'DRAFT',
      topicTitle: `Aula ${n}`,
      chapters: withChapters && n <= 4 ? chapterOf(n).map((chapterId) => ({ chapterId })) : [],
    })),
  };
}

const units = [
  { unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['ch1'] },
  { unitNumber: 2, title: 'U2', topics: ['b'], chapterIds: ['ch2'] },
  { unitNumber: 3, title: 'U3', topics: ['c'], chapterIds: ['ch3', 'ch4'] },
];
const split = [
  { unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['ch1'] },
  { unitNumber: 2, title: 'U2', topics: ['b'], chapterIds: ['ch2'] },
];

function makeDeps(opts: { sch?: ReturnType<typeof schedule> | null; text?: string; fallback?: boolean; throws?: boolean } = {}) {
  const saveUnits = vi.fn().mockResolvedValue(undefined);
  const streamChat = vi.fn().mockImplementation(async function* () {
    if (opts.throws) throw new Error('boom');
    yield { token: opts.text ?? '', fallback: opts.fallback };
  });
  const listPlanChapters = vi.fn().mockResolvedValue(books);
  const deps = {
    findSchedule: vi.fn().mockResolvedValue(opts.sch === undefined ? schedule() : opts.sch),
    listPlanChapters,
    saveUnits,
    streamChat,
  } as unknown as PlanUnitsDeps;
  return { deps, saveUnits, streamChat, listPlanChapters };
}

describe('plan-units-service', () => {
  it('resposta válida grava unitsContent e devolve as unidades', async () => {
    const { deps, saveUnits, streamChat } = makeDeps({ text: JSON.stringify({ units }) });
    expect(await generateUnitsFromDistribution('sch1', teacher, deps)).toEqual(units);
    expect(saveUnits).toHaveBeenCalledWith('p1', units);
    expect(streamChat.mock.calls[0][1]).toEqual({ temperature: 0.2, maxTokens: 1500 });
  });

  it('só 2 grupos de aulas (aulas-ponte): 2 unidades válidas são gravadas', async () => {
    const bridged = schedule(true, 't1', (n) => [['ch1'], ['ch1', 'ch2'], ['ch3'], ['ch3', 'ch4']][n - 1]);
    const two = [
      { unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['ch1', 'ch2'] },
      { unitNumber: 2, title: 'U2', topics: ['b'], chapterIds: ['ch3', 'ch4'] },
    ];
    const { deps, saveUnits, streamChat } = makeDeps({ sch: bridged, text: JSON.stringify({ units: two }) });
    expect(await generateUnitsFromDistribution('sch1', teacher, deps)).toEqual(two);
    expect(saveUnits).toHaveBeenCalledWith('p1', two);
    expect(streamChat.mock.calls[0][0][0].content).toContain('Crie de 2 a 6 unidades');
  });

  it('sem aulas com capítulos → 422', async () => {
    const { deps, saveUnits, streamChat, listPlanChapters } = makeDeps({ sch: schedule(false) });
    await expect(generateUnitsFromDistribution('sch1', teacher, deps)).rejects.toMatchObject({ status: 422, message: NO_DISTRIBUTED_CHAPTERS });
    expect(streamChat).not.toHaveBeenCalled();
    expect(listPlanChapters).not.toHaveBeenCalled();
    expect(saveUnits).not.toHaveBeenCalled();
  });

  it('cronograma inexistente → 404; outro professor → 403', async () => {
    await expect(generateUnitsFromDistribution('x', teacher, makeDeps({ sch: null }).deps)).rejects.toMatchObject({
      status: 404, message: 'Cronograma não encontrado.',
    });
    await expect(generateUnitsFromDistribution('sch1', teacher, makeDeps({ sch: schedule(true, 'outro') }).deps)).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ['aula dividida entre unidades', { text: JSON.stringify({ units: split }) }],
    ['fallback', { text: JSON.stringify({ units }), fallback: true }],
    ['gerador que lança', { throws: true }],
    ['texto não JSON', { text: 'nada' }],
  ])('%s → 503 sem gravar', async (_n, opts) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, saveUnits } = makeDeps(opts);
    await expect(generateUnitsFromDistribution('sch1', teacher, deps)).rejects.toMatchObject({
      status: 503, message: PLAN_UNITS_AI_UNAVAILABLE_MESSAGE,
    });
    expect(saveUnits).not.toHaveBeenCalled();
  });
});
