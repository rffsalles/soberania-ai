import { beforeEach, describe, expect, it, vi } from 'vitest';

const lessonFindMany = vi.fn();
const lessonFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { lessonPlan: { findMany: (a: never) => lessonFindMany(a), findUnique: (a: never) => lessonFindUnique(a) } },
}));
const chapterNumbersFor = vi.fn();
vi.mock('@/domains/rag/services/chapter-repository', async (orig) => ({
  ...(await orig<typeof import('@/domains/rag/services/chapter-repository')>()),
  chapterNumbersFor: (ids: string[]) => chapterNumbersFor(ids),
}));

import { findLessonForGeneration, findLessonTutorScope, listLessonsBySchedule } from '../lesson-plan-repository';

beforeEach(() => vi.clearAllMocks());

describe('número hierárquico nos repositórios de aula', () => {
  it('listLessonsBySchedule anexa number vindo de chapterNumbersFor', async () => {
    lessonFindMany.mockResolvedValue([{ id: 'l1', chapters: [{ chapterId: 'c1', chapter: { order: 4 } }] }]);
    chapterNumbersFor.mockResolvedValue(new Map([['c1', '2.2']]));
    const [l] = await listLessonsBySchedule({ scheduleId: 's1' });
    expect(chapterNumbersFor).toHaveBeenCalledWith(['c1']);
    expect(l.chapters[0]).toEqual({ chapterId: 'c1', chapter: { order: 4, number: '2.2' } });
  });

  it('findLessonForGeneration anexa number', async () => {
    lessonFindUnique.mockResolvedValue({ id: 'l1', chapters: [{ chapter: { id: 'c1', order: 4, title: 'T' } }] });
    chapterNumbersFor.mockResolvedValue(new Map([['c1', '2.2']]));
    const l = await findLessonForGeneration('l1');
    expect(chapterNumbersFor).toHaveBeenCalledWith(['c1']);
    expect(l?.chapters[0].chapter.number).toBe('2.2');
  });

  it('findLessonTutorScope anexa number', async () => {
    lessonFindUnique.mockResolvedValue({
      chapters: [{ chapter: { id: 'c1', order: 4, title: 'T', material: { title: 'M' } } }],
      courseSchedule: { teachingPlan: { references: [{ materialId: 'm1' }] } },
    });
    chapterNumbersFor.mockResolvedValue(new Map([['c1', '2.2']]));
    const r = await findLessonTutorScope('l1');
    expect(r?.chapters[0].number).toBe('2.2');
    expect(r?.planMaterialIds).toEqual(['m1']);
  });

  it('usa String(order) quando o id falta no mapa', async () => {
    lessonFindUnique.mockResolvedValue({
      chapters: [{ chapter: { id: 'c9', order: 7, title: 'T', material: { title: 'M' } } }],
      courseSchedule: { teachingPlan: { references: [] } },
    });
    chapterNumbersFor.mockResolvedValue(new Map());
    const r = await findLessonTutorScope('l1');
    expect(r?.chapters[0].number).toBe('7');
  });
});
