import type { OutlineEntry } from '@/domains/rag/types';
import { MAX_CHAPTER_DEPTH, MAX_CHAPTER_NODES, MIN_EXTRACTED_CHAPTERS } from '@/domains/rag/constants';

export type ChapterNode = { title: string; startPage: number; children: ChapterNode[] };
export type ChapterRow = {
  title: string;
  order: number;
  depth: number;
  parentOrder: number | null;
  startPage: number;
  endPage: number;
};
/** @deprecated Ponte da fase 1: formato plano dos extratores atuais. A fase 2 remove. */
export type ChapterDraft = { title: string; startPage: number };
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

/** Filhos (nível 1) de cada raiz (nível 0), na ordem do outline; a raiz vem junto para saber se é válida. */
function childrenByRoot(entries: OutlineEntry[]): { rootValid: boolean; children: OutlineEntry[] }[] {
  const groups: { rootValid: boolean; children: OutlineEntry[] }[] = [];
  for (const entry of entries) {
    if (entry.depth === 0) {
      const valid = entry.pageNumber !== null && !isGenericOutlineTitle(entry.title.trim());
      groups.push({ rootValid: valid, children: [] });
    } else if (entry.depth === 1 && groups.length > 0) {
      groups[groups.length - 1].children.push(entry);
    }
  }
  return groups;
}

/**
 * Converte o outline do PDF em rascunhos. Fica no nível 0 quando há 2+ raízes válidas; com 0 ou 1,
 * cai para o nível 1 usando só os filhos de UMA raiz (a válida única ou, sem válidas, a com mais filhos válidos).
 */
export function outlineToDrafts(entries: OutlineEntry[]): ChapterDraft[] | null {
  const root = draftsAtDepth(entries, 0);
  if (root.length >= MIN_EXTRACTED_CHAPTERS) return root;
  const groups = childrenByRoot(entries);
  const validRoots = groups.filter((g) => g.rootValid);
  const candidates = validRoots.length === 1 ? validRoots : groups;
  let best: ChapterDraft[] = [];
  for (const g of candidates) {
    const drafts = draftsAtDepth(g.children, 1);
    if (drafts.length > best.length) best = drafts;
  }
  return best.length >= MIN_NESTED_OUTLINE_CHAPTERS ? best : null;
}

const HEADING_SCAN_LINES = 3;
const HEADING_PATTERN = /^(Unidade|Cap[íi]tulo|Cap\.|Parte|M[óo]dulo)\s+(\d+)\b(.*)$/i;
const TOC_PAGE_MIN_LINES = 3;
const HEADING_TITLE_LOOKAHEAD = 3;
/** Linha de sumário: líder de pontos (juntos ou separados por espaço)/reticências seguido do número de página no fim. */
const TOC_LINE_PATTERN = /(\.{3,}|…|(?:\.\s+){2,}\.)\s*\d+\s*$/;

/**
 * Detecta cabeçalhos "Unidade N", "Capítulo N"... no topo das páginas. Exige numeração sequencial
 * a partir de 1 e páginas crescentes; ≥ 2 acertos ou null. Repetições do mesmo número ficam na 1ª ocorrência.
 */
export function headingsToDrafts(pages: { pageNumber: number; text: string }[]): ChapterDraft[] | null {
  const drafts: ChapterDraft[] = [];
  let lastPage = 0;
  for (const page of pages) {
    const allLines = page.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (allLines.filter((l) => TOC_LINE_PATTERN.test(l)).length >= TOC_PAGE_MIN_LINES) continue;
    for (const raw of allLines.slice(0, HEADING_SCAN_LINES)) {
      if (TOC_LINE_PATTERN.test(raw)) continue;
      const line = raw.replace(/\s+/g, ' ');
      const m = HEADING_PATTERN.exec(line);
      if (!m) continue;
      const num = Number(m[2]);
      if (num === drafts.length + 1 && page.pageNumber > lastPage) {
        drafts.push({ title: line, startPage: page.pageNumber });
        lastPage = page.pageNumber;
      } else if (num > 0 && num === drafts.length) {
        // Página divisória só com "UNIDADE N": adota o título completo da página seguinte.
        const last = drafts[drafts.length - 1];
        const bare = /^\S+\s+\d+$/.test(last.title);
        if (bare && line.length > last.title.length && page.pageNumber - last.startPage <= HEADING_TITLE_LOOKAHEAD) {
          last.title = line;
        }
      } else if (num > drafts.length + 1) {
        return null;
      }
      break;
    }
  }
  return drafts.length >= MIN_EXTRACTED_CHAPTERS ? drafts : null;
}

const ALIGN_PAGES_BEFORE = 1;
const ALIGN_PAGES_AFTER = 6;
const ALIGN_MIN_WORD_LENGTH = 4;
const ALIGN_MIN_WORD_RATIO = 0.6;
const ALIGN_MIN_MAJORITY = 0.5;

function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function pageTopWords(text: string): Set<string> {
  const top = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, HEADING_SCAN_LINES)
    .join(' ');
  return new Set(normalizedWords(top));
}

/**
 * Corrige páginas de capítulos (ex.: impressas em vez de físicas) procurando o título no topo das
 * páginas vizinhas. Se a maioria dos rascunhos se realinha com o mesmo deslocamento, os demais o herdam.
 */
export function alignDraftsToText(
  drafts: ChapterDraft[],
  pages: { pageNumber: number; text: string }[],
): ChapterDraft[] {
  const tops = new Map(pages.map((p) => [p.pageNumber, pageTopWords(p.text)]));
  const offsets: (number | null)[] = drafts.map((d) => {
    const words = normalizedWords(d.title).filter((w) => w.length >= ALIGN_MIN_WORD_LENGTH);
    if (words.length === 0) return null;
    for (let page = d.startPage - ALIGN_PAGES_BEFORE; page <= d.startPage + ALIGN_PAGES_AFTER; page++) {
      const top = tops.get(page);
      if (!top) continue;
      const hits = words.filter((w) => top.has(w)).length;
      if (hits / words.length >= ALIGN_MIN_WORD_RATIO) return page - d.startPage;
    }
    return null;
  });

  const counts = new Map<number, number>();
  for (const o of offsets) if (o !== null) counts.set(o, (counts.get(o) ?? 0) + 1);
  let majority: number | null = null;
  let best = 0;
  for (const [offset, n] of counts) {
    if (n > best) {
      best = n;
      majority = offset;
    }
  }
  const inherit = majority !== null && best / drafts.length >= ALIGN_MIN_MAJORITY ? majority : 0;

  const result: ChapterDraft[] = [];
  drafts.forEach((d, i) => {
    const startPage = d.startPage + (offsets[i] ?? inherit);
    if (offsets[i] === null && (startPage < 1 || startPage > pages.length)) return;
    result.push({ ...d, startPage });
  });
  return result;
}

/** Ponte da fase 1: cada rascunho plano vira uma raiz sem filhos. */
export function draftsToTree(drafts: ChapterDraft[]): ChapterNode[] {
  return drafts.map((d) => ({ title: d.title, startPage: d.startPage, children: [] }));
}

/**
 * Achata a árvore em pré-ordem (order 1..N). O endPage de um nó é o início do próximo irmão - 1
 * (nunca antes do próprio startPage); o último irmão herda o endPage do pai, e a última raiz vai até totalPages.
 */
export function toChapterRows(tree: ChapterNode[], totalPages: number): ChapterRow[] {
  const rows: ChapterRow[] = [];
  const walk = (nodes: ChapterNode[], depth: number, parentOrder: number | null, parentEnd: number): void => {
    nodes.forEach((node, i) => {
      const next = nodes[i + 1];
      const endPage = next ? Math.max(node.startPage, next.startPage - 1) : parentEnd;
      const order = rows.length + 1;
      rows.push({ title: node.title, order, depth, parentOrder, startPage: node.startPage, endPage });
      walk(node.children, depth + 1, order, endPage);
    });
  };
  walk(tree, 0, null, totalPages);
  return rows;
}

/** Numeração hierárquica ("1", "1.2", "1.2.1") alinhada ao índice de `rows`, que vem em pré-ordem. */
export function numberNodes(rows: { order: number; parentOrder: number | null }[]): string[] {
  const numberByOrder = new Map<number, string>();
  const childCount = new Map<number | null, number>();
  return rows.map((r) => {
    const index = (childCount.get(r.parentOrder) ?? 0) + 1;
    childCount.set(r.parentOrder, index);
    const parent = r.parentOrder === null ? undefined : numberByOrder.get(r.parentOrder);
    const num = parent ? `${parent}.${index}` : String(index);
    numberByOrder.set(r.order, num);
    return num;
  });
}

/** Deriva `number` de linhas do banco (em `order` crescente), resolvendo `parentId` para `parentOrder`. */
export function numberChapters<T extends { id: string; order: number; parentId: string | null }>(
  chapters: T[],
): (T & { number: string })[] {
  const orderById = new Map(chapters.map((c) => [c.id, c.order]));
  const numbers = numberNodes(
    chapters.map((c) => ({ order: c.order, parentOrder: c.parentId === null ? null : (orderById.get(c.parentId) ?? null) })),
  );
  return chapters.map((c, i) => ({ ...c, number: numbers[i] }));
}

/**
 * Segmentos disjuntos que cobrem 1..totalPages em ordem de página. Cada página fica com o ÚLTIMO nó em
 * pré-ordem cuja faixa a cobre (o mais profundo/o último irmão); páginas antes da primeira raiz ficam nulas.
 */
export function chunkAssignmentsFromRows(rows: ChapterRow[], totalPages: number): ChunkAssignment[] {
  if (rows.length === 0) return [{ order: null, title: null, fromPage: 1, toPage: totalPages }];
  const owner: (ChapterRow | null)[] = new Array(totalPages + 1).fill(null);
  for (const r of rows) {
    for (let page = Math.max(1, r.startPage); page <= Math.min(totalPages, r.endPage); page++) owner[page] = r;
  }
  const result: ChunkAssignment[] = [];
  for (let page = 1; page <= totalPages; page++) {
    const r = owner[page];
    const last = result[result.length - 1];
    if (last && last.order === (r?.order ?? null)) {
      last.toPage = page;
    } else {
      result.push({ order: r?.order ?? null, title: r?.title ?? null, fromPage: page, toPage: page });
    }
  }
  return result;
}

export type RelinkResult = {
  relinks: { order: number; lessonPlanId: string }[];
  lostLessonLinks: number;
  lostLessonPlanIds: string[];
};

function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Re-vincula aulas por título normalizado (sem acentos, caixa, pontuação e espaços extras):
 * 1º mesmo título e página; 2º título único entre os restantes; 3º (renomeação) mesma página e mesmo
 * nível, quando o par (startPage, depth) é único entre os novos livres e entre os antigos restantes.
 */
export function relinkByTitle(
  oldChapters: { order: number; title: string; startPage: number; depth: number }[],
  newRows: ChapterRow[],
  oldLinks: ChapterLinks[],
): RelinkResult {
  const olds = [...oldChapters].sort((a, b) => a.order - b.order);
  const freeNew = new Set(newRows.map((r) => r.order));
  const newByOrder = new Map(newRows.map((r) => [r.order, r]));
  const pairs = new Map<number, number>(); // order antigo -> order novo

  for (const o of olds) {
    const key = normalizeTitle(o.title);
    const match = newRows.find((r) => freeNew.has(r.order) && normalizeTitle(r.title) === key && r.startPage === o.startPage);
    if (match) {
      pairs.set(o.order, match.order);
      freeNew.delete(match.order);
    }
  }

  const remaining = olds.filter((o) => !pairs.has(o.order));
  for (const o of remaining) {
    const key = normalizeTitle(o.title);
    const newMatches = [...freeNew].filter((order) => normalizeTitle(newByOrder.get(order)!.title) === key);
    const oldMatches = remaining.filter((r) => !pairs.has(r.order) && normalizeTitle(r.title) === key);
    if (newMatches.length === 1 && oldMatches.length === 1) {
      pairs.set(o.order, newMatches[0]);
      freeNew.delete(newMatches[0]);
    }
  }

  const unpaired = olds.filter((o) => !pairs.has(o.order));
  for (const o of unpaired) {
    const samePlace = (r: { startPage: number; depth: number }) => r.startPage === o.startPage && r.depth === o.depth;
    const newMatches = [...freeNew].filter((order) => samePlace(newByOrder.get(order)!));
    const oldMatches = unpaired.filter((r) => !pairs.has(r.order) && samePlace(r));
    if (newMatches.length === 1 && oldMatches.length === 1) {
      pairs.set(o.order, newMatches[0]);
      freeNew.delete(newMatches[0]);
    }
  }

  const linksByOrder = new Map(oldLinks.map((l) => [l.order, l.lessonPlanIds]));
  const relinks: RelinkResult['relinks'] = [];
  const lost: string[] = [];
  for (const o of olds) {
    const ids = linksByOrder.get(o.order) ?? [];
    const target = pairs.get(o.order);
    if (target === undefined) {
      for (const id of ids) if (!lost.includes(id)) lost.push(id);
    } else {
      for (const lessonPlanId of ids) relinks.push({ order: target, lessonPlanId });
    }
  }
  return { relinks, lostLessonLinks: lost.length, lostLessonPlanIds: lost };
}

export type ChapterTreeError = { number: string | null; message: string };

function exceedsNodeLimit(tree: ChapterNode[]): boolean {
  let count = 0;
  const stack: ChapterNode[] = [...tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    count++;
    if (count > MAX_CHAPTER_NODES) return true;
    stack.push(...node.children);
  }
  return false;
}

/** Primeiro erro da árvore (checagens e mensagens na ordem da spec), ou null se for válida. */
export function findChapterTreeError(tree: ChapterNode[], totalPages: number, minRoots = 2): ChapterTreeError | null {
  if (exceedsNodeLimit(tree)) {
    return { number: null, message: `O material admite no máximo ${MAX_CHAPTER_NODES} capítulos.` };
  }
  const rows = toChapterRows(tree, totalPages);
  const numbers = numberNodes(rows);
  let prev = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const n = numbers[i];
    if (row.depth > MAX_CHAPTER_DEPTH) {
      return { number: n, message: `Capítulo ${n}: a árvore admite no máximo ${MAX_CHAPTER_DEPTH + 1} níveis.` };
    }
    if (!Number.isInteger(row.startPage) || row.startPage < 1 || row.startPage > totalPages) {
      return { number: n, message: `Capítulo ${n}: a página inicial deve estar entre 1 e ${totalPages}.` };
    }
    if (row.startPage < prev) {
      return {
        number: n,
        message: `Capítulo ${n}: a página inicial (${row.startPage}) não pode ser anterior à do item anterior (${prev}).`,
      };
    }
    if (row.startPage > row.endPage) {
      return { number: n, message: `Capítulo ${n}: começa depois do fim do capítulo pai.` };
    }
    prev = row.startPage;
  }
  if (tree.length < minRoots) {
    return { number: null, message: `São necessários pelo menos ${minRoots} capítulos de primeiro nível.` };
  }
  return null;
}

export function isValidChapterTree(tree: ChapterNode[], totalPages: number, minRoots = 2): boolean {
  return findChapterTreeError(tree, totalPages, minRoots) === null;
}
