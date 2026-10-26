'use client';

import * as React from 'react';
import { BookOpen, Plus, Trash2, ShieldCheck, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DocumentReference } from '../types';

interface PlanBibliographyCardProps {
  references: DocumentReference[];
  onOpenModal: () => void;
  onRemoveReference: (id: string) => void;
}

export function PlanBibliographyCard({
  references,
  onOpenModal,
  onRemoveReference,
}: PlanBibliographyCardProps) {
  return (
    <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800 shadow-soft-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-base font-heading flex items-center gap-2 text-slate-900 dark:text-white">
            <BookOpen className="h-4 w-4 text-brand-teal" />
            <span>Biblioteca de Referências & Documentos Vinculados (RAG)</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] text-brand-teal border-brand-teal/30">
              {references.length} material(is) no RAG
            </Badge>
            <Button
              type="button"
              size="sm"
              onClick={onOpenModal}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white text-xs rounded-xl gap-1 cursor-pointer h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Adicionar Referência</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {references.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
            <Sparkles className="h-6 w-6 text-brand-orange mx-auto opacity-80" />
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Nenhuma referência vinculada ainda. Adicione categorias de livros, artigos científicos ou documentos institucionais para alimentar a IA Socrática com RAG antes da geração.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenModal}
              className="text-xs rounded-xl cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-brand-teal" />
              Explorar Acervo ou Enviar Documento
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {references.map((ref) => (
              <div
                key={ref.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-start justify-between gap-2"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">
                      {ref.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 border-brand-teal/30 text-brand-teal">
                      {ref.category}
                    </Badge>
                    {ref.kind === 'COMPLEMENTARY' && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1 border-brand-orange/40 text-brand-orange">
                        Complementar
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">
                    {ref.author} {ref.totalChunks ? `· ${ref.totalChunks} chunks` : ''}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Indexado no RAG local</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveReference(ref.id)}
                  title="Remover referência do plano"
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
