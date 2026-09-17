'use client';

import * as React from 'react';
import {
  UploadCloud,
  FileText,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdvancedMultiCombobox, type ComboboxItem } from '@/components/ui/advanced-combobox';
import {
  CategoryCreateInlineModal,
  type CategoryOption,
} from '@/app/teacher/plans/new/_components/CategoryCreateInlineModal';
import { formatFileSize } from './materials-constants';

interface MaterialUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryOption[];
  onCategoryCreated?: (category: CategoryOption) => void;
  onSuccess: () => void;
}

export function MaterialUploadModal({
  open,
  onOpenChange,
  categories,
  onCategoryCreated,
  onSuccess,
}: MaterialUploadModalProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isInspecting, setIsInspecting] = React.useState(false);
  const [aiInspected, setAiInspected] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const categoryItems: ComboboxItem[] = React.useMemo(
    () => categories.map((cat) => ({ id: cat.name, title: cat.name, subtitle: cat.description || undefined, badge: 'Área Temática' })),
    [categories]
  );

  const inspectFileWithAI = async (selectedFile: File) => {
    try {
      setIsInspecting(true);
      setAiInspected(false);
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/v1/library/documents/inspect', { method: 'POST', body: formData });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.metadata) {
        if (data.metadata.title) setTitle(data.metadata.title);
        if (data.metadata.author) setAuthor(data.metadata.author);
        if (Array.isArray(data.metadata.categories) && data.metadata.categories.length > 0) {
          const matched = categories
            .filter((c) => data.metadata.categories.some((cat: string) => cat.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(cat.toLowerCase())))
            .map((c) => c.name);
          if (matched.length > 0) setSelectedCategories(matched);
        }
        setAiInspected(true);
      }
    } catch {
      // Ignore inspection error silently
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setErrorMessage(null);
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    inspectFileWithAI(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
  };

  const handleCategoryCreated = (newCat: CategoryOption) => {
    onCategoryCreated?.(newCat);
    setSelectedCategories((prev) => Array.from(new Set([...prev, newCat.name])));
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setAuthor('');
    setSelectedCategories([]);
    setErrorMessage(null);
    setIsUploading(false);
    setIsInspecting(false);
    setAiInspected(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setErrorMessage('Selecione um arquivo para envio.');
    if (!title.trim() || !author.trim()) return setErrorMessage('Título e autor são campos obrigatórios.');

    try {
      setIsUploading(true);
      setErrorMessage(null);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('author', author.trim());
      const resolvedCategories = selectedCategories.length > 0 ? selectedCategories : ['Geral'];
      formData.append('categories', JSON.stringify(resolvedCategories));
      formData.append('category', resolvedCategories.join(', '));
      formData.append('materialType', 'BOOK');

      const res = await fetch('/api/v1/library/documents/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erro ao processar o arquivo.');

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha na ingestão do arquivo.');
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) return <FileText className="h-6 w-6 text-rose-500" />;
    if (fileName.endsWith('.docx')) return <FileSpreadsheet className="h-6 w-6 text-blue-500" />;
    return <FileCode className="h-6 w-6 text-brand-teal" />;
  };

  return (
    <>
      <AdaptiveModal
        open={open}
        onOpenChange={(val) => {
          if (!isUploading && !isInspecting) {
            onOpenChange(val);
            if (!val) resetForm();
          }
        }}
        title="Enviar Material Didático (RAG)"
        description="Carregue documentos em PDF, DOCX, TXT ou MD. A IA extrai autores, título e categorias automaticamente."
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer ${
              isDragOver
                ? 'border-brand-teal bg-brand-teal/5 dark:bg-brand-teal/10'
                : 'border-slate-300 dark:border-slate-700 hover:border-brand-teal/60 bg-slate-50/50 dark:bg-slate-900/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }}
              disabled={isUploading || isInspecting}
            />

            {file ? (
              <div className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated/40 border border-border/40">
                <div className="flex items-center gap-3 overflow-hidden text-left">
                  {getFileIcon(file.name)}
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                      {isInspecting && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-brand-teal font-medium animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" /> IA Extraindo...
                        </span>
                      )}
                      {aiInspected && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-brand-teal bg-brand-teal/10 border border-brand-teal/20 px-1.5 py-0.5 rounded-full font-medium">
                          <Sparkles className="h-2.5 w-2.5" /> IA Preenchido
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setAiInspected(false); }}
                  disabled={isUploading || isInspecting}
                  className="h-8 w-8 p-0 cursor-pointer text-text-muted hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-brand-teal/10 dark:bg-brand-teal/20 flex items-center justify-center text-brand-teal">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Clique para selecionar ou arraste o arquivo aqui</p>
                  <p className="text-xs text-text-muted mt-0.5">Formatos suportados: PDF, DOCX, TXT, MD (Extração de metadados via IA)</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-primary block">Título da Obra / Documento *</label>
                {isInspecting && <Loader2 className="h-3 w-3 animate-spin text-brand-teal" />}
              </div>
              <Input placeholder="Ex: Apostila de Algoritmos" value={title} onChange={(e) => setTitle(e.target.value)} className="text-xs rounded-xl" required disabled={isUploading} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-primary block">Autor(es) / Organização *</label>
                {isInspecting && <Loader2 className="h-3 w-3 animate-spin text-brand-teal" />}
              </div>
              <Input placeholder="Ex: Prof. Dr. Silva, Ed. LTC" value={author} onChange={(e) => setAuthor(e.target.value)} className="text-xs rounded-xl" required disabled={isUploading} />
            </div>
          </div>

          <div className="space-y-1">
            <AdvancedMultiCombobox
              label="Categorias / Áreas de Conhecimento"
              placeholder="Selecione as categorias..."
              searchPlaceholder="Buscar categorias..."
              items={categoryItems}
              selectedIds={selectedCategories}
              onSelectionChange={setSelectedCategories}
              addNewLabel="+ Cadastrar Nova Categoria..."
              onAddNewClick={() => setIsCategoryModalOpen(true)}
              disabled={isUploading}
            />
          </div>

          <div className="rounded-xl p-3 bg-brand-teal/5 border border-brand-teal/20 text-xs text-text-secondary flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-teal shrink-0 mt-0.5" />
            <p>O motor de IA lê automaticamente as primeiras 4 páginas para sugerir Título, Autores e Categorias.</p>
          </div>

          {errorMessage && (
            <div className="rounded-xl p-3 bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/30">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading || isInspecting} className="text-xs rounded-xl cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isUploading || isInspecting || !file} className="bg-brand-teal hover:bg-brand-teal-dark text-white text-xs rounded-xl cursor-pointer">
              {isUploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Processando & Indexando...
                </>
              ) : (
                'Iniciar Ingestão no RAG'
              )}
            </Button>
          </div>
        </form>
      </AdaptiveModal>

      <CategoryCreateInlineModal
        open={isCategoryModalOpen}
        onOpenChange={setIsCategoryModalOpen}
        onCreated={handleCategoryCreated}
      />
    </>
  );
}

