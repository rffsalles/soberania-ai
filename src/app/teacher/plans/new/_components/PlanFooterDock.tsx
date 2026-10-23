'use client';

import * as React from 'react';
import { Save, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlanFooterDockProps {
  isSaving: boolean;
  saveStatusMessage: string | null;
  onSaveDraft: () => void;
  onApprove: () => void;
  canSave: boolean;
}

export function PlanFooterDock({
  isSaving,
  saveStatusMessage,
  onSaveDraft,
  onApprove,
  canSave,
}: PlanFooterDockProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 glass rounded-xl border border-slate-200 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {saveStatusMessage}
      </span>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onSaveDraft}
          disabled={isSaving || !canSave}
          className="rounded-xl text-xs cursor-pointer gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Salvar Rascunho</span>
        </Button>

        <Button
          type="button"
          onClick={onApprove}
          disabled={isSaving || !canSave}
          className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 rounded-xl text-xs cursor-pointer"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <span>Aprovar e Avançar para Cronograma (Etapa 2)</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
