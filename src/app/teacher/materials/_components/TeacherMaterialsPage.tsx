'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Layers,
  Cpu,
  HardDrive,
  Plus,
  Search,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MaterialsTable } from './MaterialsTable';
import { MaterialUploadModal } from './MaterialUploadModal';
import {
  formatFileSize,
  type DidacticMaterialItem,
  type MaterialsStats,
  type MaterialsResponse,
} from './materials-constants';
import type { CategoryOption } from '@/app/teacher/plans/new/_components/CategoryCreateInlineModal';

export default function TeacherMaterialsPage() {
  const [materials, setMaterials] = React.useState<DidacticMaterialItem[]>([]);
  const [stats, setStats] = React.useState<MaterialsStats>({
    totalMaterials: 0,
    totalChunks: 0,
    ocrCount: 0,
    totalBytes: 0,
  });
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);

  const fetchCategories = React.useCallback(async () => {
    try {
      const res = await fetch('/api/v1/library/categories');
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch {
      // Fallback
    }
  }, []);

  const fetchMaterials = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedCategory && selectedCategory !== 'all') {
        params.set('category', selectedCategory);
      }

      const res = await fetch(`/api/v1/library/materials?${params.toString()}`);
      const data: MaterialsResponse = await res.json();
      if (data.success) {
        setMaterials(data.materials || []);
        setStats(
          data.stats || {
            totalMaterials: 0,
            totalChunks: 0,
            ocrCount: 0,
            totalBytes: 0,
          }
        );
      } else {
        throw new Error('Falha ao carregar repositório de materiais.');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar dados do repositório.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchMaterials();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchMaterials]);

  return (
    <div className="flex-1 bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/teacher/plans"
              className="text-xs font-semibold text-text-muted hover:text-brand-teal transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar aos Planos
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-text-primary tracking-tight flex items-center gap-2.5">
            <BookOpen className="h-7 w-7 text-brand-teal" />
            Repositório de Materiais & RAG
          </h1>
          <p className="text-sm text-text-secondary max-w-2xl">
            Gerencie PDFs, apostilas em DOCX e anotações técnicas indexadas no
            banco vetorial para geração dos planos de ensino.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchMaterials()}
            disabled={isLoading}
            className="rounded-xl text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            Atualizar
          </Button>
          <Button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white rounded-xl text-xs gap-1.5 cursor-pointer shadow-soft-sm"
          >
            <Plus className="h-4 w-4" />
            Enviar Material (PDF / DOCX)
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass rounded-2xl p-4 flex items-center gap-3.5 border border-border/40">
          <div className="p-3 rounded-xl bg-brand-teal/10 text-brand-teal shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">
              Total de Materiais
            </p>
            <p className="text-xl font-bold font-heading text-text-primary">
              {isLoading ? (
                <Skeleton className="h-6 w-12 mt-1" />
              ) : (
                stats.totalMaterials
              )}
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center gap-3.5 border border-border/40">
          <div className="p-3 rounded-xl bg-brand-orange/10 text-brand-orange shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">
              Fragmentos RAG (Chunks)
            </p>
            <p className="text-xl font-bold font-heading text-text-primary">
              {isLoading ? (
                <Skeleton className="h-6 w-16 mt-1" />
              ) : (
                stats.totalChunks
              )}
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center gap-3.5 border border-border/40">
          <div className="p-3 rounded-xl bg-warning/10 text-warning shrink-0">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">
              OCR Tesseract Aplicado
            </p>
            <p className="text-xl font-bold font-heading text-text-primary">
              {isLoading ? (
                <Skeleton className="h-6 w-12 mt-1" />
              ) : (
                `${stats.ocrCount} doc(s)`
              )}
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 flex items-center gap-3.5 border border-border/40">
          <div className="p-3 rounded-xl bg-brand-emerald/10 text-brand-emerald shrink-0">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">
              Armazenamento Total
            </p>
            <p className="text-xl font-bold font-heading text-text-primary">
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                formatFileSize(stats.totalBytes)
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass rounded-2xl p-3.5 border border-border/40 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Pesquisar por título, autor ou nome do arquivo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs rounded-xl bg-surface-elevated/40"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-text-muted shrink-0 hidden sm:block" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-xl bg-surface-elevated/40 border border-border/40 px-3 py-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-teal w-full sm:w-48 cursor-pointer"
          >
            <option value="all">Todas as Categorias</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content / Table */}
      {isLoading ? (
        <div className="glass rounded-2xl p-6 border border-border/40 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-8 border border-danger/30 text-center space-y-3">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchMaterials()}
            className="text-xs rounded-xl cursor-pointer"
          >
            Tentar Novamente
          </Button>
        </div>
      ) : (
        <MaterialsTable
          materials={materials}
          onDeleteSuccess={() => fetchMaterials()}
        />
      )}

      {/* Upload Modal */}
      <MaterialUploadModal
        open={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        categories={categories}
        onCategoryCreated={(newCat) => setCategories((prev) => [...prev, newCat])}
        onSuccess={() => {
          fetchMaterials();
          fetchCategories();
        }}
      />
    </div>
  );
}
