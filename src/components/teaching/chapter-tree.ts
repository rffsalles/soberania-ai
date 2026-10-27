import type { ClientPlanChapter } from './chapter-combobox-item';

export type ChapterTreeIndex = {
  order: string[]; // ids em pré-ordem (livros na ordem recebida)
  byId: Map<string, ClientPlanChapter>;
  childrenOf: Map<string | null, string[]>; // null = raízes; pai ausente → raiz
};

export type CheckState = 'checked' | 'mixed' | 'unchecked';

export function indexChapters(chapters: ClientPlanChapter[]): ChapterTreeIndex {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const childrenOf = new Map<string | null, string[]>();
  for (const c of chapters) {
    const parent = c.parentId != null && byId.has(c.parentId) ? c.parentId : null;
    const list = childrenOf.get(parent);
    if (list) list.push(c.id);
    else childrenOf.set(parent, [c.id]);
  }
  const order: string[] = [];
  const visit = (id: string) => {
    order.push(id);
    for (const child of childrenOf.get(id) ?? []) visit(child);
  };
  for (const root of childrenOf.get(null) ?? []) visit(root);
  return { order, byId, childrenOf };
}

/** Ancestrais do nó, do pai até a raiz. */
export function ancestorsOf(id: string, index: ChapterTreeIndex): string[] {
  const result: string[] = [];
  let parent = index.byId.get(id)?.parentId ?? null;
  while (parent != null && index.byId.has(parent) && !result.includes(parent)) {
    result.push(parent);
    parent = index.byId.get(parent)?.parentId ?? null;
  }
  return result;
}

/** Remove duplicados e ids com ancestral selecionado; conhecidos em pré-ordem, desconhecidos no fim. */
export function normalizeSelection(ids: string[], index: ChapterTreeIndex): string[] {
  const set = new Set(ids);
  const known = index.order.filter(
    (id) => set.has(id) && !ancestorsOf(id, index).some((a) => set.has(a)),
  );
  const unknown = [...set].filter((id) => !index.byId.has(id));
  return [...known, ...unknown];
}

function hasSelectedDescendant(id: string, selected: ReadonlySet<string>, index: ChapterTreeIndex): boolean {
  return (index.childrenOf.get(id) ?? []).some(
    (child) => selected.has(child) || hasSelectedDescendant(child, selected, index),
  );
}

export function checkState(id: string, selected: ReadonlySet<string>, index: ChapterTreeIndex): CheckState {
  if (selected.has(id) || ancestorsOf(id, index).some((a) => selected.has(a))) return 'checked';
  if (hasSelectedDescendant(id, selected, index)) return 'mixed';
  return 'unchecked';
}

/** Alterna o nó e devolve a seleção normalizada. */
export function toggleNode(selected: string[], id: string, index: ChapterTreeIndex): string[] {
  const covering = [id, ...ancestorsOf(id, index)].find((a) => selected.includes(a));
  if (covering === id) return normalizeSelection(selected.filter((s) => s !== id), index);
  if (covering) {
    // Troca o ancestral marcado pelos irmãos de cada nó do caminho até `id`.
    const path = [id, ...ancestorsOf(id, index)];
    const upTo = path.indexOf(covering);
    const replacement = path.slice(0, upTo).flatMap((node) => {
      const parent = index.byId.get(node)?.parentId ?? null;
      return (index.childrenOf.get(parent) ?? []).filter((sib) => sib !== node);
    });
    return normalizeSelection([...selected.filter((s) => s !== covering), ...replacement], index);
  }
  return normalizeSelection([...selected, id], index);
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** null para busca vazia; senão ids que casam com `${number} ${title}` mais todos os ancestrais deles. */
export function visibleForQuery(query: string, index: ChapterTreeIndex): Set<string> | null {
  const q = fold(query.trim());
  if (!q) return null;
  const visible = new Set<string>();
  for (const id of index.order) {
    const c = index.byId.get(id)!;
    if (!fold(`${c.number} ${c.title}`).includes(q)) continue;
    visible.add(id);
    for (const a of ancestorsOf(id, index)) visible.add(a);
  }
  return visible;
}
