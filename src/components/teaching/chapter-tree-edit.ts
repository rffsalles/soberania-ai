import { CHAPTER_TITLE_MAX, MAX_CHAPTER_DEPTH, MAX_CHAPTER_NODES } from '@/domains/rag/constants';

/** Nó editável da árvore de capítulos (startPage como texto do input). */
export type EditableChapter = { key: string; title: string; startPage: string; children: EditableChapter[] };
/** Formato recursivo aceito pelo PUT de capítulos. */
export type ChapterNodeInput = { title: string; startPage: number; children?: ChapterNodeInput[] };
export type TreeValidation = { byKey: Map<string, string>; global: string | null };

let keySeq = 0;
export function newChapterKey(): string {
  keySeq += 1;
  return `novo-${keySeq}`;
}

/** Monta a árvore a partir dos DTOs em pré-ordem (key = id). */
export function fromChapterDtos(
  dtos: { id: string; parentId: string | null; title: string; startPage: number }[],
): EditableChapter[] {
  const roots: EditableChapter[] = [];
  const byId = new Map<string, EditableChapter>();
  for (const dto of dtos) {
    const node: EditableChapter = { key: dto.id, title: dto.title, startPage: String(dto.startPage), children: [] };
    byId.set(dto.id, node);
    const parent = dto.parentId ? byId.get(dto.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export function toChapterPayload(nodes: EditableChapter[]): ChapterNodeInput[] {
  return nodes.map((node) => {
    const out: ChapterNodeInput = { title: node.title.trim(), startPage: Number(node.startPage) };
    if (node.children.length > 0) out.children = toChapterPayload(node.children);
    return out;
  });
}

export function numberEditable(nodes: EditableChapter[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: EditableChapter[], prefix: string) =>
    list.forEach((node, i) => {
      const number = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      out.set(node.key, number);
      walk(node.children, number);
    });
  walk(nodes, '');
  return out;
}

function parsePage(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * Página final derivada: max(startPage, próximo irmão - 1); o último filho herda o fim do pai;
 * a última raiz termina em totalPages. null quando alguma página envolvida não é inteiro válido.
 */
export function endPagesOf(nodes: EditableChapter[], totalPages: number): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const walk = (list: EditableChapter[], parentEnd: number | null) =>
    list.forEach((node, i) => {
      const start = parsePage(node.startPage);
      let end: number | null;
      if (start === null) end = null;
      else if (i === list.length - 1) end = parentEnd === null ? null : Math.max(start, parentEnd);
      else {
        const next = parsePage(list[i + 1].startPage);
        end = next === null ? null : Math.max(start, next - 1);
      }
      out.set(node.key, end);
      walk(node.children, end);
    });
  walk(nodes, totalPages);
  return out;
}

function findPath(nodes: EditableChapter[], key: string): number[] | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].key === key) return [i];
    const sub = findPath(nodes[i].children, key);
    if (sub) return [i, ...sub];
  }
  return null;
}

function nodeAt(nodes: EditableChapter[], path: number[]): EditableChapter {
  let node = nodes[path[0]];
  for (const i of path.slice(1)) node = node.children[i];
  return node;
}

/** Substitui a lista de irmãos no caminho `parentPath` ([] = raízes), copiando só os ancestrais. */
function updateAt(
  nodes: EditableChapter[],
  parentPath: number[],
  fn: (siblings: EditableChapter[]) => EditableChapter[],
): EditableChapter[] {
  if (parentPath.length === 0) return fn(nodes);
  const [head, ...rest] = parentPath;
  return nodes.map((node, i) => (i === head ? { ...node, children: updateAt(node.children, rest, fn) } : node));
}

export function depthOf(nodes: EditableChapter[], key: string): number {
  const path = findPath(nodes, key);
  return path ? path.length - 1 : -1;
}

export function subtreeHeight(node: EditableChapter): number {
  return node.children.reduce((max, child) => Math.max(max, 1 + subtreeHeight(child)), 0);
}

export function countDescendants(nodes: EditableChapter[], key: string): number {
  const path = findPath(nodes, key);
  if (!path) return 0;
  const count = (node: EditableChapter): number => node.children.reduce((sum, c) => sum + 1 + count(c), 0);
  return count(nodeAt(nodes, path));
}

export function addSibling(nodes: EditableChapter[], key: string, node: EditableChapter): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path) return nodes;
  const idx = path[path.length - 1];
  return updateAt(nodes, path.slice(0, -1), (siblings) => [...siblings.slice(0, idx + 1), node, ...siblings.slice(idx + 1)]);
}

export function addChild(nodes: EditableChapter[], key: string, node: EditableChapter): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path || path.length - 1 >= MAX_CHAPTER_DEPTH) return nodes;
  const idx = path[path.length - 1];
  return updateAt(nodes, path.slice(0, -1), (siblings) =>
    siblings.map((s, i) => (i === idx ? { ...s, children: [...s.children, node] } : s)),
  );
}

export function removeNode(nodes: EditableChapter[], key: string): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path) return nodes;
  const idx = path[path.length - 1];
  return updateAt(nodes, path.slice(0, -1), (siblings) => siblings.filter((_, i) => i !== idx));
}

export function moveNode(nodes: EditableChapter[], key: string, delta: -1 | 1): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path) return nodes;
  const idx = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const siblingCount = parentPath.length === 0 ? nodes.length : nodeAt(nodes, parentPath).children.length;
  const target = idx + delta;
  if (target < 0 || target >= siblingCount) return nodes;
  return updateAt(nodes, parentPath, (siblings) => {
    const next = [...siblings];
    [next[idx], next[target]] = [next[target], next[idx]];
    return next;
  });
}

export function indentNode(nodes: EditableChapter[], key: string): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path) return nodes;
  const idx = path[path.length - 1];
  if (idx === 0) return nodes;
  const node = nodeAt(nodes, path);
  if (path.length - 1 + 1 + subtreeHeight(node) > MAX_CHAPTER_DEPTH) return nodes;
  return updateAt(nodes, path.slice(0, -1), (siblings) => {
    const prev = siblings[idx - 1];
    const next = siblings.filter((_, i) => i !== idx);
    next[idx - 1] = { ...prev, children: [...prev.children, node] };
    return next;
  });
}

export function outdentNode(nodes: EditableChapter[], key: string): EditableChapter[] {
  const path = findPath(nodes, key);
  if (!path || path.length < 2) return nodes;
  const idx = path[path.length - 1];
  const parentIdx = path[path.length - 2];
  const node = nodeAt(nodes, path);
  return updateAt(nodes, path.slice(0, -2), (siblings) => {
    const parent = siblings[parentIdx];
    const newParent = { ...parent, children: parent.children.filter((_, i) => i !== idx) };
    return [...siblings.slice(0, parentIdx), newParent, node, ...siblings.slice(parentIdx + 1)];
  });
}

export function canIndent(nodes: EditableChapter[], key: string): boolean {
  return indentNode(nodes, key) !== nodes;
}

export function canOutdent(nodes: EditableChapter[], key: string): boolean {
  return outdentNode(nodes, key) !== nodes;
}

/** Valida cada nó (primeira violação) e o total de nós. */
export function validateEditable(nodes: EditableChapter[], totalPages: number): TreeValidation {
  const byKey = new Map<string, string>();
  const endPages = endPagesOf(nodes, totalPages);
  let count = 0;

  const check = (node: EditableChapter, depth: number, parent: EditableChapter | null, prev: EditableChapter | null) => {
    if (!node.title.trim()) return 'Informe o título.';
    if (node.title.trim().length > CHAPTER_TITLE_MAX) return `O título admite no máximo ${CHAPTER_TITLE_MAX} caracteres.`;
    const start = parsePage(node.startPage);
    if (start === null || start < 1 || start > totalPages) return `A página deve estar entre 1 e ${totalPages}.`;
    const parentStart = parent ? parsePage(parent.startPage) : null;
    if (parentStart !== null && start < parentStart) return 'Começa antes do capítulo pai.';
    const prevStart = prev ? parsePage(prev.startPage) : null;
    if (prevStart !== null && start < prevStart) return 'Não pode começar antes do capítulo anterior.';
    const parentEnd = parent ? endPages.get(parent.key) ?? null : null;
    if (parentEnd !== null && start > parentEnd) return 'Começa depois do fim do capítulo pai.';
    if (depth > MAX_CHAPTER_DEPTH) return `Ultrapassa o limite de ${MAX_CHAPTER_DEPTH + 1} níveis.`;
    return null;
  };

  const walk = (list: EditableChapter[], depth: number, parent: EditableChapter | null) =>
    list.forEach((node, i) => {
      count += 1;
      const message = check(node, depth, parent, i > 0 ? list[i - 1] : null);
      if (message) byKey.set(node.key, message);
      walk(node.children, depth + 1, node);
    });
  walk(nodes, 0, null);

  return { byKey, global: count > MAX_CHAPTER_NODES ? `Máximo de ${MAX_CHAPTER_NODES} capítulos por material.` : null };
}
