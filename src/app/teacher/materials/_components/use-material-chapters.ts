import { requestJson } from '@/components/assessments/use-assessments';
import { API_ROUTES } from '@/lib/constants/routes';

export type ChapterSource = 'OUTLINE' | 'AI' | 'MANUAL';

export interface ChapterDTO {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
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
} as const;

const chaptersUrl = (id: string) => `${API_ROUTES.LIBRARY}/materials/${id}/chapters`;

export async function fetchMaterialChapters(id: string): Promise<ChapterDTO[]> {
  const body = await requestJson<{ chapters: ChapterDTO[] }>(chaptersUrl(id), 'GET');
  return body.chapters;
}

export function saveMaterialChapters(
  id: string,
  chapters: { title: string; startPage: number }[],
): Promise<ChapterSaveResult> {
  return requestJson<ChapterSaveResult>(chaptersUrl(id), 'PUT', { chapters });
}

export function extractMaterialChapters(id: string): Promise<ChapterSaveResult> {
  return requestJson<ChapterSaveResult>(`${chaptersUrl(id)}/extract`, 'POST');
}
