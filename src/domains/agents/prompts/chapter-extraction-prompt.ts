import { z } from 'zod';
import type { AIMessage } from '@/lib/ai-provider';
import { isTocPage, type ChapterNode } from '@/domains/rag/chapters';
import { CHAPTER_TOC_DETECTED_PAGE_CHARS, CHAPTER_TOC_PAGE_CHARS } from '@/domains/rag/constants';

export const CHAPTER_EXTRACTION_SYSTEM_PROMPT = `
Você analisa as primeiras páginas de um livro em PDF e extrai a árvore de capítulos a partir do sumário.
Cada página é marcada com a página física (posição no arquivo PDF) e, quando houver, a página impressa (numeração do livro).
Informe em startPage a página IMPRESSA exatamente como aparece no sumário; não converta para a página física.
Monte a hierarquia: o nível de cada entrada vem do recuo, da numeração ("2", "2.3", "2.3.1") ou da tipografia (caixa alta, negrito). Subentradas ficam em "children" da entrada acima delas, em qualquer profundidade.
Quando uma entrada de nível superior (por exemplo "Unidade 1 – ...") não tiver página no sumário, use a página da sua primeira subentrada.
Ignore cabeçalhos e rodapés corridos e não use como raiz entradas de apresentação, prefácio ou do próprio sumário.
Não invente capítulos: liste apenas o que consta no sumário, na ordem em que aparece.
Responda APENAS com um objeto JSON no formato:
{"chapters":[{"title":"título","startPage":N,"children":[{"title":"subtítulo","startPage":N,"children":[]}]}]}
`;

export type TocPage = { pageNumber: number; label?: string; text: string };

export function buildChapterExtractionMessages(input: { pages: TocPage[]; totalPages: number }): AIMessage[] {
  const blocks = input.pages.map((p) => {
    const marker = p.label
      ? `--- Página física ${p.pageNumber} (impressa: ${p.label}) ---`
      : `--- Página física ${p.pageNumber} ---`;
    const limit = isTocPage(p.text) ? CHAPTER_TOC_DETECTED_PAGE_CHARS : CHAPTER_TOC_PAGE_CHARS;
    return `${marker}\n${p.text.slice(0, limit)}`;
  });
  const user = `O documento tem ${input.totalPages} páginas físicas.\n\n${blocks.join('\n\n')}\n\nExtraia a árvore de capítulos do sumário com a página impressa de início de cada entrada.`;
  return [
    { role: 'system', content: CHAPTER_EXTRACTION_SYSTEM_PROMPT.trim() },
    { role: 'user', content: user },
  ];
}

const chapterNodeSchema: z.ZodType<ChapterNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1),
    startPage: z.coerce.number().int(),
    children: z.array(chapterNodeSchema).optional().default([]),
  }),
);

const chapterExtractionSchema = z.object({ chapters: z.array(chapterNodeSchema) });

/** Extrai o primeiro objeto JSON do texto e valida; null quando ausente ou inválido. */
export function parseChapterExtraction(raw: string): ChapterNode[] | null {
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
