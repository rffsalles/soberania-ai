import type { OutlineEntry } from '@/domains/rag/types';
import { CHAPTER_TOC_EXTRA_PAGES, MAX_CHAPTER_DEPTH, MAX_CHAPTER_NODES, MIN_EXTRACTED_CHAPTERS } from '@/domains/rag/constants';

export type ChapterNode = { title: string; startPage: number; children: ChapterNode[] };
export type ChapterRow = {
  title: string;
  order: number;
  depth: number;
  parentOrder: number | null;
  startPage: number;
  endPage: number;
};
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

type RawOutlineNode = { title: string; page: number | null; children: RawOutlineNode[] };

/** Promove títulos genéricos e resolve páginas ausentes (herda a do primeiro descendente; sem página nem filhos, some). */
function resolveOutlineNodes(nodes: RawOutlineNode[]): ChapterNode[] {
  const result: ChapterNode[] = [];
  for (const raw of nodes) {
    const children = resolveOutlineNodes(raw.children);
    if (isGenericOutlineTitle(raw.title)) {
      result.push(...children);
      continue;
    }
    const startPage = raw.page ?? children[0]?.startPage;
    if (startPage === undefined) continue;
    result.push({ title: raw.title, startPage, children });
  }
  return result;
}

/** Descarta (com a subárvore) os nós que violariam os invariantes de isValidChapterTree. Páginas iguais são mantidas. */
function enforceOutlineOrder(nodes: ChapterNode[], parentPage: number, parentEnd: number, state: { maxSoFar: number }): ChapterNode[] {
  const kept: ChapterNode[] = [];
  let previous = parentPage;
  nodes.forEach((node, i) => {
    const { startPage } = node;
    if (startPage < previous || startPage < state.maxSoFar || startPage > parentEnd) return;
    state.maxSoFar = startPage;
    previous = startPage;
    const next = nodes.slice(i + 1).find((sibling) => sibling.startPage >= startPage);
    const childrenEnd = next ? Math.min(parentEnd, next.startPage - 1) : parentEnd;
    kept.push({ ...node, children: enforceOutlineOrder(node.children, startPage, childrenEnd, state) });
  });
  return kept;
}

/**
 * Converte o outline do PDF (pré-ordem com depth) em árvore de capítulos. Nunca devolve null: lista vazia quando
 * nada sobra. A validade é decidida por isValidChapterTree. Raiz única com 3+ filhos é descartada (os filhos viram raízes).
 */
export function outlineToTree(entries: OutlineEntry[]): ChapterNode[] {
  const roots: RawOutlineNode[] = [];
  const stack: { depth: number; node: RawOutlineNode }[] = [];
  for (const entry of entries) {
    const node: RawOutlineNode = { title: entry.title.trim(), page: entry.pageNumber, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ depth: entry.depth, node });
  }
  const tree = enforceOutlineOrder(resolveOutlineNodes(roots), 0, Infinity, { maxSoFar: 0 });
  return tree.length === 1 && tree[0].children.length >= MIN_NESTED_OUTLINE_CHAPTERS ? tree[0].children : tree;
}

const HEADING_SCAN_LINES = 3;
const HEADING_PATTERN = /^(Unidade|Cap[íi]tulo|Cap\.|Parte|M[óo]dulo)\s+(\d+)\b(.*)$/i;
/** Título numerado de subnível: "1.1 Texto", "1.2.3 Texto". A profundidade vem da quantidade de pontos. */
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)+)\s+(\S.{2,})$/;
const TOC_PAGE_MIN_LINES = 3;
const HEADING_TITLE_LOOKAHEAD = 3;
/** Linha de sumário: líder de pontos (juntos ou separados por espaço)/reticências seguido do número de página no fim. */
const TOC_LINE_PATTERN = /(\.{3,}|…|(?:\.\s+){2,}\.)\s*\d+\s*$/;

/** true quando a página tem ao menos TOC_PAGE_MIN_LINES linhas de sumário. */
export function isTocPage(text: string): boolean {
  const tocLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && TOC_LINE_PATTERN.test(l)).length;
  return tocLines >= TOC_PAGE_MIN_LINES;
}

/**
 * Páginas a enviar à extração de capítulos: as `windowSize` primeiras, mais até `maxExtra` páginas de sumário
 * detectadas depois delas (sumários podem vir após capa, prefácio e apresentação), na ordem original.
 */
export function selectTocPages<T extends { pageNumber: number; text: string }>(
  pages: T[],
  windowSize: number,
  maxExtra: number = CHAPTER_TOC_EXTRA_PAGES,
): T[] {
  const head = pages.slice(0, windowSize);
  const extra = pages.slice(windowSize).filter((p) => isTocPage(p.text)).slice(0, maxExtra);
  return [...head, ...extra];
}

/**
 * Árvore a partir do texto: raízes "Unidade/Capítulo N" e, dentro de cada uma,
 * títulos numerados "N.M ..." como filhos (profundidade = pontos). Numerado exige pai existente, primeiro número
 * igual ao índice da raiz atual e páginas não decrescentes; repetição fica na 1ª ocorrência. < MIN_EXTRACTED_CHAPTERS raízes → null.
 */
export function headingsToTree(pages: { pageNumber: number; text: string }[]): ChapterNode[] | null {
  const roots: ChapterNode[] = [];
  let byNumber = new Map<string, ChapterNode>();
  let lastPage = 0;
  for (const page of pages) {
    if (isTocPage(page.text)) continue;
    const allLines = page.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const raw of allLines.slice(0, HEADING_SCAN_LINES)) {
      if (TOC_LINE_PATTERN.test(raw)) continue;
      const line = raw.replace(/\s+/g, ' ');
      const m = HEADING_PATTERN.exec(line);
      if (!m) {
        const n = NUMBERED_HEADING.exec(line);
        if (n && roots.length > 0) {
          const parts = n[1].split('.');
          const parent = parts.length === 2 ? roots[roots.length - 1] : byNumber.get(parts.slice(0, -1).join('.'));
          if (Number(parts[0]) === roots.length && parent && !byNumber.has(n[1]) && page.pageNumber >= lastPage) {
            const node: ChapterNode = { title: line, startPage: page.pageNumber, children: [] };
            parent.children.push(node);
            byNumber.set(n[1], node);
            lastPage = page.pageNumber;
          }
        }
        continue;
      }
      const num = Number(m[2]);
      if (num === roots.length + 1 && page.pageNumber > lastPage) {
        roots.push({ title: line, startPage: page.pageNumber, children: [] });
        byNumber = new Map();
        lastPage = page.pageNumber;
      } else if (num > 0 && num === roots.length) {
        // Página divisória só com "UNIDADE N": adota o título completo da página seguinte.
        const last = roots[roots.length - 1];
        const bare = /^\S+\s+\d+$/.test(last.title);
        if (bare && line.length > last.title.length && page.pageNumber - last.startPage <= HEADING_TITLE_LOOKAHEAD) {
          last.title = line;
        }
      } else if (num > roots.length + 1) {
        return null;
      }
      break;
    }
  }
  return roots.length >= MIN_EXTRACTED_CHAPTERS ? roots : null;
}

const ALIGN_PAGES_BEFORE = 1;
const ALIGN_PAGES_AFTER = 6;
const ALIGN_MIN_WORD_LENGTH = 4;
const ALIGN_MIN_WORD_RATIO = 0.6;
const ALIGN_MIN_MAJORITY = 0.5;

const stripAccents = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Versalete extraído vira "c onjunto": junta letra isolada à palavra seguinte. */
const collapseSmallCaps = (t: string) => stripAccents(t).replace(/\b([a-z]) (?=[a-z]{2,})/g, '$1');

function normalizedWords(text: string): string[] {
  return stripAccents(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

function topLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, HEADING_SCAN_LINES);
}

/** Regra 1: palavras do topo = UNIÃO do texto normal com o texto de versalete colapsado. */
function pageTopWords(text: string): Set<string> {
  const top = topLines(text).join(' ');
  return new Set([...normalizedWords(top), ...normalizedWords(collapseSmallCaps(top))]);
}

function titleWords(title: string): string[] {
  return normalizedWords(title).filter((w) => w.length >= ALIGN_MIN_WORD_LENGTH);
}

function topHasTitle(top: Set<string> | undefined, words: string[]): boolean {
  if (!top || words.length === 0) return false;
  return words.filter((w) => top.has(w)).length / words.length >= ALIGN_MIN_WORD_RATIO;
}

/** Deslocamento da primeira página da janela cujo topo traz o título, ou null. */
function findOffset(node: ChapterNode, tops: Map<number, Set<string>>): number | null {
  const words = titleWords(node.title);
  for (let page = node.startPage - ALIGN_PAGES_BEFORE; page <= node.startPage + ALIGN_PAGES_AFTER; page++) {
    if (topHasTitle(tops.get(page), words)) return page - node.startPage;
  }
  return null;
}

/** Regra 2: deslocamento mais frequente (empate: o primeiro em pré-ordem) se reúne >= 50% dos encontrados. */
function majorityOffset(offsets: (number | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const o of offsets) if (o !== null) counts.set(o, (counts.get(o) ?? 0) + 1);
  let majority: number | null = null;
  let best = 0;
  let found = 0;
  for (const [offset, n] of counts) {
    found += n;
    if (n > best) {
      best = n;
      majority = offset;
    }
  }
  return majority !== null && best / found >= ALIGN_MIN_MAJORITY ? majority : null;
}

/** Regra 4: página divisória acima da raiz ("UNIDADE N" ou o próprio título no topo), sem passar de `floor`. */
function dividerPage(
  root: ChapterNode,
  startPage: number,
  floor: number,
  pagesByNumber: Map<number, string>,
  tops: Map<number, Set<string>>,
): number | null {
  const words = titleWords(root.title);
  const m = HEADING_PATTERN.exec(root.title.trim().replace(/\s+/g, ' '));
  const bare = m ? new RegExp('^' + m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + m[2] + '$', 'i') : null;
  for (let page = startPage - 1; page >= startPage - HEADING_TITLE_LOOKAHEAD && page > floor; page--) {
    const text = pagesByNumber.get(page);
    if (text === undefined) continue;
    if (topHasTitle(tops.get(page), words)) return page;
    if (bare && topLines(text).some((l) => bare.test(l.replace(/\s+/g, ' ')))) return page;
  }
  return null;
}

function preorder(nodes: ChapterNode[]): ChapterNode[] {
  return nodes.flatMap((n) => [n, ...preorder(n.children)]);
}

/**
 * Corrige páginas da árvore (ex.: impressas em vez de físicas) procurando cada título no topo das páginas
 * vizinhas. Com maioria, todos herdam o deslocamento; nós fora do livro saem com a subárvore; raízes cuja página
 * veio do primeiro filho recuam até a divisória da unidade. Não muta a entrada.
 */
export function alignDraftsToText(
  tree: ChapterNode[],
  pages: { pageNumber: number; text: string }[],
): ChapterNode[] {
  const tops = new Map(pages.map((p) => [p.pageNumber, pageTopWords(p.text)]));
  const pagesByNumber = new Map(pages.map((p) => [p.pageNumber, p.text]));
  const flat = preorder(tree);
  const offsets = flat.map((n) => findOffset(n, tops));
  const majority = majorityOffset(offsets);
  const shift = new Map(flat.map((n, i) => [n, majority ?? offsets[i] ?? 0]));
  let previousPage = 0;

  const rebuild = (nodes: ChapterNode[], isRoot: boolean): ChapterNode[] => {
    const result: ChapterNode[] = [];
    for (const node of nodes) {
      let startPage = node.startPage + (shift.get(node) ?? 0);
      if (startPage < 1 || startPage > pages.length) continue;
      if (isRoot && node.children.length > 0 && node.children[0].startPage === node.startPage) {
        startPage = dividerPage(node, startPage, previousPage, pagesByNumber, tops) ?? startPage;
      }
      previousPage = startPage;
      result.push({ ...node, startPage, children: rebuild(node.children, false) });
    }
    return result;
  };
  return rebuild(tree, true);
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

/** Remove o vínculo de uma aula a um nó quando um ancestral do nó (via `parentOrder`) já está vinculado à mesma aula. */
export function normalizeRelinks(
  relinks: RelinkResult['relinks'],
  rows: { order: number; parentOrder: number | null }[],
): RelinkResult['relinks'] {
  const parentByOrder = new Map(rows.map((r) => [r.order, r.parentOrder]));
  const linked = new Set(relinks.map((l) => `${l.order}|${l.lessonPlanId}`));
  return relinks.filter((l) => {
    for (let p = parentByOrder.get(l.order) ?? null; p !== null; p = parentByOrder.get(p) ?? null) {
      if (linked.has(`${p}|${l.lessonPlanId}`)) return false;
    }
    return true;
  });
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
