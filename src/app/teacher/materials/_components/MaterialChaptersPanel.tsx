'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, IndentDecrease, IndentIncrease, Plus, Trash2 } from 'lucide-react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequestError } from '@/components/assessments/use-assessments';
import { useCurrentUser } from '@/components/layout/use-current-user';
import {
  addChild,
  addSibling,
  canIndent,
  canOutdent,
  countDescendants,
  endPagesOf,
  fromChapterDtos,
  indentNode,
  moveNode,
  newChapterKey,
  numberEditable,
  outdentNode,
  removeNode,
  toChapterPayload,
  validateEditable,
  type EditableChapter,
  type TreeValidation,
} from '@/components/teaching/chapter-tree-edit';
import { CHAPTER_TITLE_MAX, MAX_CHAPTER_DEPTH } from '@/domains/rag/constants';
import {
  CHAPTER_SOURCE_LABEL,
  extractMaterialChapters,
  fetchMaterialChapters,
  saveMaterialChapters,
  type ChapterDTO,
  type ChapterSaveResult,
  type LinkConflict,
} from './use-material-chapters';

export { CHAPTER_SOURCE_LABEL };

interface MaterialChaptersPanelProps {
  material: { id: string; title: string; totalPages: number; mimeType?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ChapterPatch = Partial<Pick<EditableChapter, 'title' | 'startPage'>>;

function patchNode(nodes: EditableChapter[], key: string, patch: ChapterPatch): EditableChapter[] {
  return nodes.map((node) =>
    node.key === key ? { ...node, ...patch } : { ...node, children: patchNode(node.children, key, patch) },
  );
}

interface TreeActions {
  change: (key: string, patch: ChapterPatch) => void;
  edit: (fn: (prev: EditableChapter[]) => EditableChapter[]) => void;
  remove: (node: EditableChapter) => void;
}

interface ChapterNodeRowProps {
  node: EditableChapter;
  depth: number;
  index: number;
  siblingCount: number;
  nodes: EditableChapter[];
  numbers: Map<string, string>;
  endPages: Map<string, number | null>;
  validation: TreeValidation;
  totalPages: number;
  actions: TreeActions;
}

function ChapterNodeRow({
  node,
  depth,
  index,
  siblingCount,
  nodes,
  numbers,
  endPages,
  validation,
  totalPages,
  actions,
}: ChapterNodeRowProps) {
  const number = numbers.get(node.key) ?? '';
  const message = validation.byKey.get(node.key);
  const messageId = `capitulo-${node.key}-erro`;
  const endPage = endPages.get(node.key) ?? null;
  const blank = (): EditableChapter => ({ key: newChapterKey(), title: '', startPage: node.startPage, children: [] });

  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-10 text-xs font-medium text-text-muted">{number}</span>
        <Input
          className="min-w-40 flex-1"
          aria-label={`Título do capítulo ${number}`}
          maxLength={CHAPTER_TITLE_MAX}
          aria-describedby={message ? messageId : undefined}
          aria-invalid={message ? true : undefined}
          value={node.title}
          onChange={(e) => actions.change(node.key, { title: e.target.value })}
        />
        <Input
          aria-label={`Página inicial do capítulo ${number}`}
          aria-describedby={message ? messageId : undefined}
          aria-invalid={message ? true : undefined}
          type="number"
          min={1}
          max={totalPages}
          className="w-24"
          value={node.startPage}
          onChange={(e) => actions.change(node.key, { startPage: e.target.value })}
        />
        <span aria-label={`Página final do capítulo ${number}`} className="w-12 text-sm text-text-muted">
          {endPage ?? '—'}
        </span>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Adicionar capítulo abaixo de ${number}`}
            onClick={() => actions.edit((prev) => addSibling(prev, node.key, blank()))}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Adicionar subcapítulo em ${number}`}
            disabled={depth >= MAX_CHAPTER_DEPTH}
            onClick={() => actions.edit((prev) => addChild(prev, node.key, blank()))}
          >
            <CornerDownRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Mover ${number} para cima`}
            disabled={index === 0}
            onClick={() => actions.edit((prev) => moveNode(prev, node.key, -1))}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Mover ${number} para baixo`}
            disabled={index === siblingCount - 1}
            onClick={() => actions.edit((prev) => moveNode(prev, node.key, 1))}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Recuar ${number}`}
            disabled={!canIndent(nodes, node.key)}
            onClick={() => actions.edit((prev) => indentNode(prev, node.key))}
          >
            <IndentIncrease className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Desrecuar ${number}`}
            disabled={!canOutdent(nodes, node.key)}
            onClick={() => actions.edit((prev) => outdentNode(prev, node.key))}
          >
            <IndentDecrease className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remover capítulo ${number}`}
            onClick={() => actions.remove(node)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {message && (
        <p id={messageId} className="text-xs text-danger">
          {message}
        </p>
      )}
      {node.children.length > 0 && (
        <ul className="space-y-2 border-l border-border pl-4">
          {node.children.map((child, i) => (
            <ChapterNodeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              index={i}
              siblingCount={node.children.length}
              nodes={nodes}
              numbers={numbers}
              endPages={endPages}
              validation={validation}
              totalPages={totalPages}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface Conflict {
  items: LinkConflict[];
  retry: () => void;
}

export function MaterialChaptersPanel({ material, open, onOpenChange }: MaterialChaptersPanelProps) {
  const [nodes, setNodes] = React.useState<EditableChapter[]>([]);
  const [source, setSource] = React.useState<ChapterDTO['source'] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<Conflict | null>(null);
  const { user } = useCurrentUser();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setStatus(null);
    setConflict(null);
    fetchMaterialChapters(material.id)
      .then((chapters) => {
        if (cancelled) return;
        setNodes(fromChapterDtos(chapters));
        setSource(chapters[0]?.source ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar capítulos.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, material.id]);

  const applyResult = (result: ChapterSaveResult) => {
    setNodes(fromChapterDtos(result.chapters));
    setSource(result.chapters[0]?.source ?? null);
  };

  const run = async (action: (force?: boolean) => Promise<ChapterSaveResult>, emptyMessage?: string, force?: boolean) => {
    setIsBusy(true);
    setError(null);
    setConflict(null);
    setStatus(null);
    try {
      const result = await action(force);
      if (emptyMessage && result.source === null) {
        setStatus(emptyMessage);
        return;
      }
      applyResult(result);
      if (result.lostLessonLinks > 0) {
        setStatus(`${result.lostLessonLinks} aula(s) perderam o vínculo com os capítulos deste livro.`);
      }
    } catch (err: unknown) {
      if (err instanceof RequestError && err.status === 409 && Array.isArray(err.details)) {
        setConflict({
          items: err.details as LinkConflict[],
          retry: () => void run(action, emptyMessage, true),
        });
      }
      setError(err instanceof Error ? err.message : 'Falha ao processar capítulos.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = () => run((force) => saveMaterialChapters(material.id, toChapterPayload(nodes), force));

  const handleExtract = () =>
    run(
      (force) => extractMaterialChapters(material.id, force),
      'Nenhum capítulo encontrado; os capítulos atuais foram mantidos.',
    );

  const numbers = React.useMemo(() => numberEditable(nodes), [nodes]);
  const endPages = React.useMemo(() => endPagesOf(nodes, material.totalPages), [nodes, material.totalPages]);
  const validation = React.useMemo(() => validateEditable(nodes, material.totalPages), [nodes, material.totalPages]);
  const isInvalid = validation.global !== null || validation.byKey.size > 0;

  const edit = (fn: (prev: EditableChapter[]) => EditableChapter[]) => {
    setConflict(null);
    setNodes(fn);
  };

  const actions: TreeActions = {
    change: (key, patch) => edit((prev) => patchNode(prev, key, patch)),
    edit,
    remove: (node) => {
      const count = countDescendants(nodes, node.key);
      if (count > 0 && !window.confirm(`Remover "${node.title}" e ${count} subcapítulo(s)?`)) return;
      edit((prev) => removeNode(prev, node.key));
    },
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Capítulos"
      description={`${material.title} (${material.totalPages} páginas)`}
      footer={
        <Button type="button" onClick={handleSave} disabled={isBusy || isLoading || isInvalid}>
          Salvar capítulos
        </Button>
      }
    >
      <div className="space-y-3">
        {source && <Badge variant="secondary">{CHAPTER_SOURCE_LABEL[source]}</Badge>}

        {isLoading ? (
          <p className="text-sm text-text-muted">Carregando...</p>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-text-muted">Sem capítulos</p>
        ) : (
          <div className="space-y-2">
            {validation.global && <p className="text-xs text-danger">{validation.global}</p>}
            <ul className="space-y-2">
              {nodes.map((node, i) => (
                <ChapterNodeRow
                  key={node.key}
                  node={node}
                  depth={0}
                  index={i}
                  siblingCount={nodes.length}
                  nodes={nodes}
                  numbers={numbers}
                  endPages={endPages}
                  validation={validation}
                  totalPages={material.totalPages}
                  actions={actions}
                />
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              edit((prev) => [...prev, { key: newChapterKey(), title: '', startPage: '1', children: [] }])
            }
          >
            Adicionar capítulo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExtract} disabled={isBusy}>
            Extrair de novo
          </Button>
        </div>

        {status && (
          <p role="status" className="text-sm text-text-muted">
            {status}
          </p>
        )}
        {error && conflict && (
          <div role="alert" className="space-y-2 text-sm text-danger">
            <p>{error}</p>
            <ul className="list-disc pl-5">
              {conflict.items.map((c, i) => (
                <li key={i}>{`${c.disciplina} · ${c.turma} · Aula ${c.classNumber}: ${c.topicTitle} (${c.professor})`}</li>
              ))}
            </ul>
            {user?.role === 'ADMIN' && (
              <Button type="button" variant="outline" size="sm" onClick={conflict.retry} disabled={isBusy}>
                Forçar mesmo assim
              </Button>
            )}
          </div>
        )}
        {error && !conflict && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </AdaptiveModal>
  );
}
