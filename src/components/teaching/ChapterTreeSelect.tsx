'use client';

import * as React from 'react';
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ClientPlanChapter, ClientPlanChapterBook } from './chapter-combobox-item';
import { ancestorsOf, checkState, indexChapters, toggleNode, visibleForQuery } from './chapter-tree';

export type ChapterTreeSelectProps = {
  id: string;
  label: string;
  books: ClientPlanChapterBook[];
  selectedIds: string[];
  onSelectionChange(ids: string[]): void; // sempre a seleção normalizada
  disabled?: boolean;
};

const ARIA_CHECKED = { checked: 'true', mixed: 'mixed', unchecked: 'false' } as const;

export function ChapterTreeSelect({
  id,
  label,
  books,
  selectedIds,
  onSelectionChange,
  disabled = false,
}: ChapterTreeSelectProps) {
  const index = React.useMemo(() => indexChapters(books.flatMap((b) => b.chapters)), [books]);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(selectedIds.flatMap((s) => ancestorsOf(s, index))),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLLIElement>());
  const focusRequest = React.useRef<string | null>(null);
  const selectedRef = React.useRef(selectedIds);
  selectedRef.current = selectedIds;

  // Os livros podem chegar depois da montagem: abre os ancestrais da seleção
  // sem recolher o que o professor já abriu.
  React.useEffect(() => {
    const needed = selectedRef.current.flatMap((s) => ancestorsOf(s, index));
    setExpanded((prev) => (needed.every((a) => prev.has(a)) ? prev : new Set([...prev, ...needed])));
  }, [index]);

  const visible = React.useMemo(() => visibleForQuery(query, index), [query, index]);
  const searching = visible !== null;
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  const isShown = (nodeId: string) => !visible || visible.has(nodeId);
  const shownChildren = (nodeId: string) => (index.childrenOf.get(nodeId) ?? []).filter(isShown);
  const isExpanded = (nodeId: string) =>
    searching ? shownChildren(nodeId).length > 0 : expanded.has(nodeId);

  // Itens visíveis em pré-ordem, na ordem em que aparecem na tela.
  const flat = index.order.filter(
    (nodeId) => isShown(nodeId) && ancestorsOf(nodeId, index).every((a) => isExpanded(a)),
  );
  const tabStop = activeId && flat.includes(activeId) ? activeId : flat[0];

  React.useEffect(() => {
    const target = focusRequest.current;
    if (!target) return;
    focusRequest.current = null;
    itemRefs.current.get(target)?.focus();
  });

  function setNodeExpanded(nodeId: string, open: boolean) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
    if (!open && activeId && ancestorsOf(activeId, index).includes(nodeId)) setActiveId(nodeId);
  }

  function moveTo(nodeId: string | undefined) {
    if (!nodeId) return;
    setActiveId(nodeId);
    focusRequest.current = nodeId;
  }

  function toggle(nodeId: string) {
    setActiveId(nodeId);
    onSelectionChange(toggleNode(selectedIds, nodeId, index));
  }

  function handleKeyDown(e: React.KeyboardEvent, nodeId: string) {
    e.stopPropagation();
    if (disabled) return;
    const pos = flat.indexOf(nodeId);
    const hasChildren = shownChildren(nodeId).length > 0;
    const open = isExpanded(nodeId);
    switch (e.key) {
      case ' ':
      case 'Enter':
        // Enter/espaço vindos do botão de expandir não alternam a seleção.
        if (e.target !== e.currentTarget) return;
        toggle(nodeId);
        break;
      case 'Home':
        moveTo(flat[0]);
        break;
      case 'End':
        moveTo(flat[flat.length - 1]);
        break;
      case 'ArrowDown':
        moveTo(flat[pos + 1]);
        break;
      case 'ArrowUp':
        moveTo(flat[pos - 1]);
        break;
      case 'ArrowRight':
        if (!hasChildren) break;
        if (!open) setNodeExpanded(nodeId, true);
        else moveTo(shownChildren(nodeId)[0]);
        break;
      case 'ArrowLeft':
        if (hasChildren && open && !searching) setNodeExpanded(nodeId, false);
        else moveTo(ancestorsOf(nodeId, index)[0]);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function renderNode(chapter: ClientPlanChapter): React.ReactNode {
    const children = shownChildren(chapter.id);
    const hasChildren = children.length > 0;
    const open = hasChildren && isExpanded(chapter.id);
    const state = checkState(chapter.id, selected, index);
    return (
      <li
        key={chapter.id}
        ref={(el) => {
          if (el) itemRefs.current.set(chapter.id, el);
          else itemRefs.current.delete(chapter.id);
        }}
        // Árvore com checkbox: o APG usa aria-checked, não aria-selected.
        // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
        role="treeitem"
        aria-label={`${chapter.number} ${chapter.title}`}
        aria-level={chapter.depth + 1}
        aria-checked={ARIA_CHECKED[state]}
        aria-expanded={hasChildren ? open : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={chapter.id === tabStop ? 0 : -1}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) toggle(chapter.id);
        }}
        onKeyDown={(e) => handleKeyDown(e, chapter.id)}
      >
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg py-1.5 pr-2 text-sm',
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800',
          )}
          style={{ paddingLeft: `${chapter.depth * 1.25 + 0.25}rem` }}
        >
          {hasChildren && !searching ? (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`${open ? 'Recolher' : 'Expandir'} ${chapter.number}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={(e) => {
                e.stopPropagation();
                setNodeExpanded(chapter.id, !open);
              }}
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              state === 'unchecked'
                ? 'border-slate-300 dark:border-slate-600'
                : 'border-brand-teal bg-brand-teal text-white',
            )}
          >
            {state === 'checked' && <Check className="h-3 w-3" />}
            {state === 'mixed' && <Minus className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-slate-100">
            {chapter.number} {chapter.title}
          </span>
          <Badge variant="outline" className="shrink-0 font-normal">
            {chapter.endPage != null ? `p. ${chapter.startPage} a ${chapter.endPage}` : `p. ${chapter.startPage}`}
          </Badge>
        </div>
        {open && (
          <ul role="group">
            {children.map((childId) => renderNode(index.byId.get(childId)!))}
          </ul>
        )}
      </li>
    );
  }

  const isRoot = (c: ClientPlanChapter) => c.parentId == null || !index.byId.has(c.parentId);

  return (
    <div className="space-y-2">
      <label id={`${id}-label`} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {index.order.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum capítulo nos livros do plano.</p>
      ) : (
        <>
          <Input
            aria-label="Buscar capítulos"
            placeholder="Buscar capítulos..."
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
          />
          {flat.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum capítulo encontrado.</p>
          ) : (
            <ul
              role="tree"
              aria-labelledby={`${id}-label`}
              aria-multiselectable="true"
              aria-disabled={disabled || undefined}
              className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700"
            >
              {books.map((book) => {
                const roots = book.chapters.filter((c) => isRoot(c) && isShown(c.id));
                if (roots.length === 0) return null;
                return (
                  <li key={book.materialId} role="none">
                    <div aria-hidden="true" className="px-1 pb-1 text-xs font-semibold text-slate-500">
                      {`${book.title} (${book.author})`}
                    </div>
                    <ul role="group" aria-label={`${book.title} (${book.author})`}>
                      {roots.map(renderNode)}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
