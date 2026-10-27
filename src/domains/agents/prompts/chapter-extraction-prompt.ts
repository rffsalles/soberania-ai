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
    children: z
      .array(chapterNodeSchema)
      .nullish()
      .transform((v) => v ?? []),
  }),
);

const chapterExtractionSchema = z.object({ chapters: z.array(chapterNodeSchema) });

/**
 * Repara JSON cortado (limite de tokens): corta no último `}` que fechou um objeto dentro de array (um nó de
 * `chapters`/`children`) e anexa os fechamentos pendentes. null quando nenhum nó chegou a fechar.
 */
function repairTruncatedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let cut: { index: number; open: string[] } | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (ch === '}' && stack[stack.length - 1] === '[') cut = { index: i + 1, open: [...stack] };
    }
  }
  if (!cut) return null;
  const closers = cut.open.reverse().map((ch) => (ch === '{' ? '}' : ']')).join('');
  return text.slice(0, cut.index) + closers;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Extrai o primeiro objeto JSON do texto (reparando resposta truncada) e valida; null quando ausente ou inválido. */
export function parseChapterExtraction(raw: string): ChapterNode[] | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  const end = raw.lastIndexOf('}');
  let json = end > start ? parseJson(raw.slice(start, end + 1)) : undefined;
  if (json === undefined) {
    const repaired = repairTruncatedJson(raw.slice(start));
    if (repaired === null) return null;
    json = parseJson(repaired);
  }
  const parsed = chapterExtractionSchema.safeParse(json);
  return parsed.success ? parsed.data.chapters : null;
}
