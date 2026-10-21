'use client';

import * as React from 'react';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  Loader2,
  X,
  Type,
  FileUp,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdvancedMultiCombobox, type ComboboxItem } from '@/components/ui/advanced-combobox';
import { CategoryCreateInlineModal, type CategoryOption } from './CategoryCreateInlineModal';
import type { DocumentReference } from '../types';

interface ReferenceUploadTabProps {
  categories: CategoryOption[];
  onCategoryCreated: (cat: CategoryOption) => void;
  onSuccess: (newRef: DocumentReference) => void;
  onCancel: () => void;
}

export function ReferenceUploadTab({
  categories,
  onCategoryCreated,
  onSuccess,
  onCancel,
}: ReferenceUploadTabProps) {
  const [uploadMode, setUploadMode] = React.useState<'file' | 'text'>('file');
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [text, setText] = React.useState('');
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isInspecting, setIsInspecting] = React.useState(false);
  const [aiInspected, setAiInspected] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
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
    setUploadError(null);
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    inspectFileWithAI(selectedFile);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) return setUploadError('Título e Autor são obrigatórios.');
    if (uploadMode === 'file' && !file) return setUploadError('Selecione um arquivo PDF, DOCX, TXT ou MD.');
    if (uploadMode === 'text' && !text.trim()) return setUploadError('Informe o texto ou trecho para ingestão.');

    try {
      setIsUploading(true);
      setUploadError(null);
      const resolvedCategories = selectedCategories.length > 0 ? selectedCategories : ['Geral'];

      if (uploadMode === 'file' && file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title.trim());
        formData.append('author', author.trim());
        formData.append('categories', JSON.stringify(resolvedCategories));
        formData.append('category', resolvedCategories.join(', '));
        formData.append('materialType', 'BOOK');

        const res = await fetch('/api/v1/library/documents/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Falha no upload.');

        onSuccess({
          id: data.material.id,
          title: data.material.title,
          author: data.material.author,
          category: data.material.category,
          totalChunks: data.material.totalChunks,
          sampleExcerpt: `Arquivo: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
          isCustomUpload: true,
        });
      } else {
        const res = await fetch('/api/v1/library/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), author: author.trim(), categories: resolvedCategories, category: resolvedCategories.join(', '), text: text.trim(), materialType: 'BOOK' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Falha ao ingerir documento.');

        onSuccess({
          id: data.material.id,
          title: title.trim(),
          author: author.trim(),
          category: resolvedCategories.join(', '),
          totalChunks: data.material.totalChunks,
          sampleExcerpt: text.slice(0, 160) + '...',
          isCustomUpload: true,
        });
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) return <FileText className="h-5 w-5 text-rose-500" />;
    if (fileName.endsWith('.docx')) return <FileSpreadsheet className="h-5 w-5 text-blue-500" />;
    return <FileCode className="h-5 w-5 text-brand-teal" />;
  };

  return (
    <>
      <form onSubmit={handleUploadSubmit} className="space-y-3.5">
        <div className="flex items-center p-1 rounded-xl bg-surface-elevated/40 border border-border/30 w-fit">
          <button
            type="button"
            onClick={() => setUploadMode('file')}
            disabled={isUploading || isInspecting}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${uploadMode === 'file' ? 'bg-brand-teal text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
          >
            <FileUp className="h-3.5 w-3.5" /> Upload de Arquivo (PDF / DOCX)
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('text')}
            disabled={isUploading || isInspecting}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer ${uploadMode === 'text' ? 'bg-brand-teal text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
          >
            <Type className="h-3.5 w-3.5" /> Texto Manual / Resumo
          </button>
        </div>

        {uploadMode === 'file' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${isDragOver ? 'border-brand-teal bg-brand-teal/5' : 'border-border/60 hover:border-brand-teal/60 bg-surface-elevated/20'}`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }} disabled={isUploading || isInspecting} />
            {file ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated/50 border border-border/40">
                <div className="flex items-center gap-2.5 overflow-hidden text-left">
                  {getFileIcon(file.name)}
                  <div className="truncate">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-text-primary truncate">{file.name}</p>
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
                    <p className="text-[11px] text-text-muted">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); setAiInspected(false); }} disabled={isUploading || isInspecting} className="h-7 w-7 p-0 cursor-pointer text-text-muted hover:text-text-primary">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-1">
                <UploadCloud className="h-6 w-6 text-brand-teal" />
                <p className="text-xs font-medium text-text-primary">Arraste ou clique para selecionar PDF, DOCX, TXT ou MD</p>
                <p className="text-[11px] text-text-muted">A IA extrairá automaticamente o título, autores e categorias das primeiras páginas</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-primary block">Título da Obra / Artigo *</label>
              {isInspecting && <Loader2 className="h-3 w-3 animate-spin text-brand-teal" />}
            </div>
            <Input placeholder="Ex: Engenharia de Software Moderna" value={title} onChange={(e) => setTitle(e.target.value)} className="text-xs rounded-xl" required disabled={isUploading} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-primary block">Autor(es) *</label>
              {isInspecting && <Loader2 className="h-3 w-3 animate-spin text-brand-teal" />}
            </div>
            <Input placeholder="Ex: Marco Tulio Valente" value={author} onChange={(e) => setAuthor(e.target.value)} className="text-xs rounded-xl" required disabled={isUploading} />
          </div>
        </div>

        <div className="space-y-1">
          <AdvancedMultiCombobox
            label="Categorias / Áreas Temáticas (N seleções)"
            placeholder="Selecione uma ou mais categorias..."
            searchPlaceholder="Buscar por categoria ou área..."
            items={categoryItems}
            selectedIds={selectedCategories}
            onSelectionChange={(ids) => setSelectedCategories(ids)}
            addNewLabel="+ Cadastrar Nova Categoria..."
            onAddNewClick={() => setIsCategoryModalOpen(true)}
            disabled={isUploading}
          />
        </div>

        {uploadMode === 'text' && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-primary block">Trecho, Resumo ou Texto Completo para Ingestão RAG</label>
            <Textarea placeholder="Cole os capítulos, sumário técnico ou conceitos-chave..." value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-xs rounded-xl" disabled={isUploading} />
          </div>
        )}

        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isUploading} className="text-xs rounded-xl cursor-pointer">
            Cancelar
          </Button>
          <Button type="submit" disabled={isUploading || isInspecting || (uploadMode === 'file' && !file)} className="bg-brand-teal hover:bg-brand-teal-dark text-white text-xs rounded-xl cursor-pointer shadow-soft-sm">
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Indexando no RAG...
              </>
            ) : (
              'Ingerir no RAG & Adicionar ao Plano'
            )}
          </Button>
        </div>
      </form>

      <CategoryCreateInlineModal
        open={isCategoryModalOpen}
        onOpenChange={setIsCategoryModalOpen}
        onCreated={(newCat) => {
          onCategoryCreated(newCat);
          setSelectedCategories((prev) => Array.from(new Set([...prev, newCat.name])));
        }}
      />
    </>
  );
}


