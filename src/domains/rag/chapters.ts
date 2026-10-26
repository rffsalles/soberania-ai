import type { OutlineEntry } from '@/domains/rag/types';
import { MIN_EXTRACTED_CHAPTERS } from '@/domains/rag/constants';

export type ChapterDraft = { title: string; startPage: number };
export type ChapterRow = { title: string; order: number; startPage: number; endPage: number };
export type ChunkAssignment = { order: number | null; title: string | null; fromPage: number; toPage: number };
export type ChapterLinks = { order: number; lessonPlanIds: string[] };

const GENERIC_OUTLINE_PATTERNS = [
  /^p[áa]gina( em branco)?(\s*\d+)?$/i,
  /^blank page/i,
  /^untitled$/i,
  /^sem t[íi]tulo$/i,
  /^sin t[íi]tulo$/i,
  /\.pdf$/i,
];

/** Títulos de bookmark sem informação (páginas em branco, nome de arquivo, "sem título"). */
export function isGenericOutlineTitle(title: string): boolean {
  const t = title.trim();
  return t === '' || GENERIC_OUTLINE_PATTERNS.some((re) => re.test(t));
}

const MIN_NESTED_OUTLINE_CHAPTERS = 3;

function draftsAtDepth(entries: OutlineEntry[], depth: number): ChapterDraft[] {
  const drafts: ChapterDraft[] = [];
  let last = 0;
  for (const entry of entries) {
    if (entry.depth !== depth) continue;
    const title = entry.title.trim();
    if (entry.pageNumber === null || isGenericOutlineTitle(title)) continue;
    if (entry.pageNumber <= last) continue;
    drafts.push({ title, startPage: entry.pageNumber });
    last = entry.pageNumber;
  }
  return drafts;
}

/** Converte o outline do PDF em rascunhos (nível 0; cai para o nível 1 quando a raiz é só o título do livro). */
export function outlineToDrafts(entries: OutlineEntry[]): ChapterDraft[] | null {
  const root = draftsAtDepth(entries, 0);
  if (root.length >= MIN_EXTRACTED_CHAPTERS) return root;
  const nested = draftsAtDepth(entries, 1);
  return nested.length >= MIN_NESTED_OUTLINE_CHAPTERS ? nested : null;
}

const HEADING_SCAN_LINES = 3;
const HEADING_PATTERN = /^(Unidade|Cap[íi]tulo|Cap\.|Parte|M[óo]dulo)\s+(\d+)\b(.*)$/i;
/** Linha de sumário: líder de pontos/reticências ou número de página após espaçamento largo. */
const TOC_LINE_PATTERN = /(\.{3,}|…|\.\s\.\s\.)|(\s{2,}|\t)\d+\s*$/;

/**
 * Detecta cabeçalhos "Unidade N", "Capítulo N"... no topo das páginas. Exige numeração sequencial
 * a partir de 1 e páginas crescentes; ≥ 2 acertos ou null. Repetições do mesmo número ficam na 1ª ocorrência.
 */
export function headingsToDrafts(pages: { pageNumber: number; text: string }[]): ChapterDraft[] | null {
  const drafts: ChapterDraft[] = [];
  let lastPage = 0;
  for (const page of pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, HEADING_SCAN_LINES);
    for (const raw of lines) {
      if (TOC_LINE_PATTERN.test(raw)) continue;
      const line = raw.replace(/\s+/g, ' ');
      const m = HEADING_PATTERN.exec(line);
      if (!m) continue;
      const num = Number(m[2]);
      if (num === drafts.length + 1 && page.pageNumber > lastPage) {
        drafts.push({ title: line, startPage: page.pageNumber });
        lastPage = page.pageNumber;
      } else if (num > drafts.length + 1) {
        return null;
      }
      break;
    }
  }
  return drafts.length >= MIN_EXTRACTED_CHAPTERS ? drafts : null;
}

export function isValidChapterSequence(drafts: ChapterDraft[], totalPages: number, minCount: number): boolean {
  if (drafts.length < minCount) return false;
  let prev = 0;
  for (const d of drafts) {
    if (!Number.isInteger(d.startPage) || d.startPage < 1 || d.startPage > totalPages) return false;
    if (d.startPage <= prev) return false;
    prev = d.startPage;
  }
  return true;
}

export function toChapterRows(drafts: ChapterDraft[], totalPages: number): ChapterRow[] {
  return drafts.map((d, i) => ({
    title: d.title,
    order: i + 1,
    startPage: d.startPage,
    endPage: i + 1 < drafts.length ? drafts[i + 1].startPage - 1 : totalPages,
  }));
}

export function buildChunkAssignments(rows: ChapterRow[], totalPages: number): ChunkAssignment[] {
  if (rows.length === 0) return [{ order: null, title: null, fromPage: 1, toPage: totalPages }];
  const result: ChunkAssignment[] = [];
  if (rows[0].startPage > 1) result.push({ order: null, title: null, fromPage: 1, toPage: rows[0].startPage - 1 });
  for (const r of rows) result.push({ order: r.order, title: r.title, fromPage: r.startPage, toPage: r.endPage });
  return result;
}

export function relinkByOrder(
  old: ChapterLinks[],
  newCount: number,
): { relinks: { order: number; lessonPlanId: string }[]; lostLessonLinks: number } {
  if (old.length === newCount) {
    return {
      relinks: old.flatMap((c) => c.lessonPlanIds.map((lessonPlanId) => ({ order: c.order, lessonPlanId }))),
      lostLessonLinks: 0,
    };
  }
  return { relinks: [], lostLessonLinks: new Set(old.flatMap((c) => c.lessonPlanIds)).size };
}
