'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Tags } from 'lucide-react';

import type { CategoryOption } from '../types';
export type { CategoryOption };

interface CategoryCreateInlineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: CategoryOption) => void;
}

export function CategoryCreateInlineModal({
  open,
  onOpenChange,
  onCreated,
}: CategoryCreateInlineModalProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome da categoria é obrigatório.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch('/api/v1/library/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color: 'teal',
        }),
      });

      const data = await res.json();
      if (data.success && data.category) {
        onCreated({
          id: data.category.id,
          name: data.category.name,
          description: data.category.description,
          color: data.category.color,
        });
        onOpenChange(false);
        setName('');
        setDescription('');
      } else {
        setError(data.error || 'Erro ao cadastrar categoria.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha na comunicação com o servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar Nova Categoria"
      description="Cadastre uma área temática ou categoria para organizar os materiais bibliográficos do RAG."
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="category-name-input"
            className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
          >
            <Tags className="h-3.5 w-3.5 text-brand-teal" />
            <span>Nome da Categoria / Área *</span>
          </label>
          <Input
            id="category-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Computação em Nuvem, Sistemas Distribuídos"
            className="rounded-xl text-xs sm:text-sm"
            disabled={isSubmitting}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="category-desc-input"
            className="text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Descrição ou Escopo Temático (Opcional)
          </label>
          <Textarea
            id="category-desc-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve resumo dos tipos de obras e assuntos cobertos por esta categoria..."
            rows={2}
            className="rounded-xl text-xs sm:text-sm"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl text-xs cursor-pointer"
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 rounded-xl text-xs cursor-pointer shadow-soft-sm"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Cadastrar Categoria</span>
          </Button>
        </div>
      </form>
    </AdaptiveModal>
  );
}
