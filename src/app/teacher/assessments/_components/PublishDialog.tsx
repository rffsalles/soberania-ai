'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { HTTP_CONFLICT, RequestError, publishAssessment } from '@/components/assessments/use-assessments';

type Props = {
  assessmentId: string;
  classOptions: { id: string; name: string }[];
  onClose: () => void;
  onPublished: (notice?: string) => void;
};

const ALREADY_PUBLISHED = 'Esta avaliação já foi publicada.';

export function PublishDialog({ assessmentId, classOptions, onClose, onPublished }: Props) {
  const [classId, setClassId] = React.useState(classOptions[0]?.id ?? '');
  const [startLocal, setStartLocal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await publishAssessment(assessmentId, { classId, startTime: new Date(startLocal).toISOString() });
      onPublished();
    } catch (err) {
      if (err instanceof RequestError && err.status === HTTP_CONFLICT) {
        // Já publicada em outra sessão: atualiza a lista e fecha o diálogo.
        onPublished(ALREADY_PUBLISHED);
        return;
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdaptiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Publicar avaliação"
      description="A prova será agendada como EXAM para a turma, com a duração configurada."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !classId || !startLocal}>
            {busy ? 'Publicando...' : 'Publicar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="publish-class">Turma</Label>
          <select
            id="publish-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="publish-start">Início</Label>
          <Input
            id="publish-start"
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </AdaptiveModal>
  );
}
