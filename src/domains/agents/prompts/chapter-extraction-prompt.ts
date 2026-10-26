import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import type { ChapterDraft } from '@/domains/rag/chapters';
import { CHAPTER_TOC_PAGE_CHARS } from '@/domains/rag/constants';

export const CHAPTER_EXTRACTION_SYSTEM_PROMPT = `
Você analisa as primeiras páginas de um livro em PDF para extrair a lista de capítulos a partir do sumário.
Cada página é marcada com a página física (posição no arquivo PDF) e, quando houver, a página impressa (numeração do livro).
Os números do sumário são páginas impressas; converta-os para a página física usando as marcações e informe SEMPRE a página física.
Não invente capítulos: liste apenas o que consta no sumário, em ordem crescente de página.
Responda APENAS com um objeto JSON no formato:
{"chapters":[{"title":"título do capítulo","startPage":N}]}
`;

export type TocPage = { pageNumber: number; label?: string; text: string };

export function buildChapterExtractionMessages(input: { pages: TocPage[]; totalPages: number }): AIMessage[] {
  const blocks = input.pages.map((p) => {
    const marker = p.label
      ? `--- Página física ${p.pageNumber} (impressa: ${p.label}) ---`
      : `--- Página física ${p.pageNumber} ---`;
    return `${marker}\n${p.text.slice(0, CHAPTER_TOC_PAGE_CHARS)}`;
  });
  const user = `O documento tem ${input.totalPages} páginas físicas.\n\n${blocks.join('\n\n')}\n\nExtraia os capítulos do sumário com a página física de início de cada um.`;
  return [
    { role: 'system', content: CHAPTER_EXTRACTION_SYSTEM_PROMPT.trim() },
    { role: 'user', content: user },
  ];
}

const chapterExtractionSchema = z.object({
  chapters: z.array(
    z.object({
      title: z.string().trim().min(1),
      startPage: z.coerce.number().int(),
    }),
  ),
});

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseChapterExtraction(raw: string): ChapterDraft[] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = chapterExtractionSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
    return parsed.success ? parsed.data.chapters : null;
  } catch {
    return null;
  }
}
