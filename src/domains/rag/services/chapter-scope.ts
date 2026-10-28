import { listDescendantIds } from './chapter-repository';

export { formatChapterLabel } from '../chapter-label';

export type ChapterScopeDeps = { listDescendantIds(chapterIds: string[]): Promise<string[]> };

/** Escolhidos + descendentes; uma expansão vazia volta aos escolhidos (lista vazia nunca abre o escopo). */
export async function expandChapterScope(
  chapterIds: string[],
  deps: ChapterScopeDeps = { listDescendantIds }
): Promise<string[]> {
  const expanded = await deps.listDescendantIds(chapterIds);
  return expanded.length ? expanded : chapterIds;
}
