'use client';

import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CategoryOption, DocumentReference } from '../types';

interface ReferenceCategoryTabProps {
  categories: CategoryOption[];
  documents: DocumentReference[];
  selectedDocIds: Set<string>;
  alreadySelectedIds: string[];
  onSelectCategory: (categoryName: string) => void;
}

export function ReferenceCategoryTab({
  categories,
  documents,
  selectedDocIds,
  alreadySelectedIds,
  onSelectCategory,
}: ReferenceCategoryTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Selecione uma categoria inteira para vincular todos os seus livros, artigos e diretrizes de uma só vez:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
        {categories.map((cat) => {
          const docsInCat = documents.filter((d) => d.category === cat.name);
          const isAllSelected =
            docsInCat.length > 0 &&
            docsInCat.every(
              (d) => selectedDocIds.has(d.id) || alreadySelectedIds.includes(d.id)
            );

          return (
            <div
              key={cat.name}
              onClick={() => onSelectCategory(cat.name)}
              className={`p-3 rounded-xl border transition-colors flex flex-col justify-between ${
                docsInCat.length === 0
                  ? 'border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                  : isAllSelected
                  ? 'border-brand-teal bg-brand-teal/10 cursor-pointer'
                  : 'border-slate-200 dark:border-slate-800 hover:border-brand-teal/50 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">
                    {cat.name}
                  </span>
                  {isAllSelected && <Check className="h-4 w-4 text-brand-teal" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {cat.documentCount} obra(s) · {cat.chunkCount} fragmentos RAG
                </p>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={docsInCat.length === 0}
                  className="text-[11px] h-7 rounded-lg cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCategory(cat.name);
                  }}
                >
                  {docsInCat.length === 0 ? (
                    'Sem obras'
                  ) : isAllSelected ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-brand-teal" />
                      Selecionado
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar Todos
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
