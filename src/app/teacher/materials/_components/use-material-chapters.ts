import { requestJson } from '@/components/assessments/use-assessments';
import { API_ROUTES } from '@/lib/constants/routes';
import type { ChapterNodeInput } from '@/components/teaching/chapter-tree-edit';

export type ChapterSource = 'OUTLINE' | 'AI' | 'MANUAL' | 'HEADINGS';

export interface ChapterDTO {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
  parentId: string | null;
  depth: number;
  number: string;
  source: ChapterSource;
}

export interface ChapterSaveResult {
  success: boolean;
  source: ChapterSource | null;
  chapters: ChapterDTO[];
  lostLessonLinks: number;
}

export const CHAPTER_SOURCE_LABEL = {
  OUTLINE: 'Marcadores do PDF',
  AI: 'Extraído por IA',
  MANUAL: 'Manual',
  HEADINGS: 'Títulos no texto',
} as const;

const chaptersUrl = (id: string) => `${API_ROUTES.LIBRARY}/materials/${id}/chapters`;

export async function fetchMaterialChapters(id: string): Promise<ChapterDTO[]> {
  const body = await requestJson<{ chapters: ChapterDTO[] }>(chaptersUrl(id), 'GET');
  return body.chapters;
}

export type LinkConflict = {
  disciplina: string;
  turma: string;
  classNumber: number;
  topicTitle: string;
  professor: string;
};

const withForce = (url: string, force?: boolean) => (force ? `${url}?force=1` : url);

export function saveMaterialChapters(
  id: string,
  chapters: ChapterNodeInput[],
  force?: boolean,
): Promise<ChapterSaveResult> {
  return requestJson<ChapterSaveResult>(withForce(chaptersUrl(id), force), 'PUT', { chapters });
}

export function extractMaterialChapters(id: string, force?: boolean): Promise<ChapterSaveResult> {
  return requestJson<ChapterSaveResult>(withForce(`${chaptersUrl(id)}/extract`, force), 'POST');
}
