'use client';

import * as React from 'react';
import { AgendaNotFound } from '@/components/agendas/agenda-not-found';
import { toAgendaSession } from '@/components/agendas/agenda-session';
import { useAgenda } from '@/components/agendas/use-agenda';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { validateAgendaTimeWindow } from '@/domains/agendas/agenda-validator';
import { DRAFT_ALLOWED_EXTENSIONS, DRAFT_MAX_SCORE, DRAFT_MIN_CHARS } from '@/lib/constants/assessments';
import { API_ROUTES } from '@/lib/constants/routes';

interface DraftReviewPageProps {
  agendaId: string;
}

interface RubricScore {
  criterion: string;
  score: number | null;
  comment: string;
}

interface DraftEntry {
  id: string;
  feedback: string | null;
  rubricScores: RubricScore[] | null;
  /** true = a IA não estava disponível: sem feedback nem notas. */
  fallback: boolean;
  createdAt: string;
}

const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.';
const AI_UNAVAILABLE =
  'A Tutora Lucy não estava disponível: o rascunho foi registrado, mas não recebeu feedback nem notas. Envie novamente mais tarde.';
const ACCEPT = DRAFT_ALLOWED_EXTENSIONS.join(',');

function FeedbackView({
  feedback,
  rubricScores,
  fallback,
}: {
  feedback: string | null;
  rubricScores: RubricScore[] | null;
  fallback: boolean;
}) {
  if (fallback) {
    return <p className="text-sm text-amber-700 dark:text-amber-300">{AI_UNAVAILABLE}</p>;
  }
  return (
    <div className="space-y-3">
      {feedback && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">{feedback}</p>}
      {rubricScores && rubricScores.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Critério</TableHead>
              <TableHead>Nota indicativa</TableHead>
              <TableHead>Comentário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rubricScores.map((r) => (
              <TableRow key={r.criterion}>
                <TableCell className="font-medium">{r.criterion}</TableCell>
                <TableCell>
                  {r.score === null ? '—' : `${r.score}/${DRAFT_MAX_SCORE}`}
                </TableCell>
                <TableCell className="text-xs text-slate-600 dark:text-slate-300">{r.comment}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function DraftReviewPage({ agendaId }: DraftReviewPageProps) {
  const { agenda, isLoading, error, notFound } = useAgenda(agendaId);
  const [content, setContent] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [latest, setLatest] = React.useState<Pick<DraftEntry, 'feedback' | 'rubricScores' | 'fallback'> | null>(null);
  const [drafts, setDrafts] = React.useState<DraftEntry[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const loadDrafts = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_ROUTES.DRAFTS}?agendaId=${encodeURIComponent(agendaId)}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success) setDrafts(body.drafts as DraftEntry[]);
    } catch {
      // histórico é opcional; a tela continua utilizável sem ele
    }
  }, [agendaId]);

  React.useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const canSubmit = !isSending && (file !== null || content.trim().length >= DRAFT_MIN_CHARS);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSending(true);
    setSendError(null);
    try {
      const form = new FormData();
      form.set('agendaId', agendaId);
      if (file) form.set('file', file);
      else form.set('content', content);
      const res = await fetch(API_ROUTES.DRAFTS, { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setSendError(typeof body?.error === 'string' ? body.error : GENERIC_ERROR);
        return;
      }
      setLatest({ feedback: body.feedback, rubricScores: body.rubricScores, fallback: body.fallback === true });
      setContent('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await loadDrafts();
    } catch {
      setSendError(GENERIC_ERROR);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex-1 bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : !agenda ? (
          <AgendaNotFound message={notFound ? undefined : (error ?? undefined)} />
        ) : (
          <>
            <div className="space-y-1 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="teal">Orientação de Trabalho</Badge>
                <span className="text-xs font-semibold text-slate-500">{agenda.className}</span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{agenda.subject}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-slate-900 dark:text-white">
                {agenda.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {validateAgendaTimeWindow(toAgendaSession(agenda)).message}
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enviar rascunho</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={file !== null || isSending}
                    rows={10}
                    placeholder={`Cole o texto do seu trabalho (mínimo de ${DRAFT_MIN_CHARS} caracteres) ou anexe um arquivo.`}
                    aria-label="Texto do rascunho"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPT}
                      aria-label="Arquivo do rascunho"
                      disabled={isSending}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                    <span className="text-xs text-slate-500">Formatos aceitos: {DRAFT_ALLOWED_EXTENSIONS.join(', ')}</span>
                  </div>
                  {sendError && (
                    <p role="alert" className="text-sm text-red-600">
                      {sendError}
                    </p>
                  )}
                  <Button type="submit" disabled={!canSubmit}>
                    {isSending ? 'Avaliando...' : 'Solicitar feedback'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {latest && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Feedback da Tutora Lucy</CardTitle>
                </CardHeader>
                <CardContent>
                  <FeedbackView feedback={latest.feedback} rubricScores={latest.rubricScores} fallback={latest.fallback} />
                </CardContent>
              </Card>
            )}

            {drafts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rascunhos anteriores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {drafts.map((d) => (
                    <div key={d.id} className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 first:border-0 first:pt-0">
                      <p className="text-xs font-mono text-slate-500">
                        {new Date(d.createdAt).toLocaleString('pt-BR')}
                      </p>
                      <FeedbackView feedback={d.feedback} rubricScores={d.rubricScores} fallback={d.fallback} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
