'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequestError } from '@/components/assessments/use-assessments';
import { useCurrentUser } from '@/components/layout/use-current-user';
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

interface Row {
  title: string;
  startPage: string;
}

interface MaterialChaptersPanelProps {
  material: { id: string; title: string; totalPages: number; mimeType?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toRows(chapters: ChapterDTO[]): Row[] {
  return chapters.map((c) => ({ title: c.title, startPage: String(c.startPage) }));
}

interface Conflict {
  items: LinkConflict[];
  retry: () => void;
}

export function MaterialChaptersPanel({ material, open, onOpenChange }: MaterialChaptersPanelProps) {
  const [rows, setRows] = React.useState<Row[]>([]);
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
        setRows(toRows(chapters));
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
    setRows(toRows(result.chapters));
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

  const handleSave = () =>
    run((force) =>
      saveMaterialChapters(
        material.id,
        rows.map((r) => ({ title: r.title.trim(), startPage: Number(r.startPage) })),
        force,
      ),
    );

  const handleExtract = () =>
    run(
      (force) => extractMaterialChapters(material.id, force),
      'Nenhum capítulo encontrado; os capítulos atuais foram mantidos.',
    );

  const updateRow = (index: number, patch: Partial<Row>) => {
    setConflict(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Capítulos"
      description={`${material.title} (${material.totalPages} páginas)`}
      footer={
        <Button type="button" onClick={handleSave} disabled={isBusy || isLoading}>
          Salvar capítulos
        </Button>
      }
    >
      <div className="space-y-3">
        {source && <Badge variant="secondary">{CHAPTER_SOURCE_LABEL[source]}</Badge>}

        {isLoading ? (
          <p className="text-sm text-text-muted">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted">Sem capítulos</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const n = index + 1;
              return (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Título do capítulo ${n}`}
                    value={row.title}
                    onChange={(e) => updateRow(index, { title: e.target.value })}
                  />
                  <Input
                    aria-label={`Página inicial do capítulo ${n}`}
                    type="number"
                    min={1}
                    max={material.totalPages}
                    className="w-24"
                    value={row.startPage}
                    onChange={(e) => updateRow(index, { startPage: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover capítulo ${n}`}
                    onClick={() => {
                      setConflict(null);
                      setRows((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConflict(null);
              setRows((prev) => [...prev, { title: '', startPage: '1' }]);
            }}
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
