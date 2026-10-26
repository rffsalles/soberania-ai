'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const REFINE_ERROR = 'Não foi possível refinar o texto. Tente novamente.';

type Props = {
  label: string;
  value: string;
  onApply: (text: string) => void;
  request: (instruction: string) => Promise<string>;
  disabled?: boolean;
};

/** Refina um campo por instrução livre; guarda o texto anterior para um único desfazer. */
export function RefineField({ label, value, onApply, request, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previous, setPrevious] = React.useState<string | null>(null);

  async function apply() {
    if (!instruction.trim()) return;
    const before = value;
    setBusy(true);
    setError(null);
    try {
      const refined = await request(instruction.trim());
      if (!refined.trim()) throw new Error(REFINE_ERROR);
      onApply(refined);
      setPrevious(before);
      setInstruction('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : REFINE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    if (previous === null) return;
    onApply(previous);
    setPrevious(null);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        disabled={disabled || busy}
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {`Refinar ${label}`}
      </Button>
      {open && (
        <div className="flex gap-2">
          <Input
            aria-label={`Instrução para refinar ${label}`}
            placeholder="Ex.: mais prática, mais curto"
            value={instruction}
            disabled={busy}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void apply();
              }
            }}
          />
          <Button type="button" size="sm" disabled={busy || !instruction.trim()} onClick={() => void apply()}>
            {busy ? 'Refinando...' : 'Aplicar'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {previous !== null && (
        <div className="flex items-start gap-2 text-xs text-slate-500">
          <span className="font-semibold">Antes:</span>
          <span className="flex-1 whitespace-pre-wrap">{previous}</span>
          <Button type="button" variant="outline" size="sm" onClick={undo}>
            Desfazer
          </Button>
        </div>
      )}
    </div>
  );
}
