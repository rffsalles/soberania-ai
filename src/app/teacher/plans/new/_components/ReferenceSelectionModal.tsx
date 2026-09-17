'use client';

import * as React from 'react';
import {
  FolderTree,
  FileText,
  UploadCloud,
  Search,
  Check,
  Plus,
  Loader2,
  BookMarked,
} from 'lucide-react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ReferenceUploadTab } from './ReferenceUploadTab';
import { ReferenceCategoryTab } from './ReferenceCategoryTab';
import type { DocumentReference, CategoryOption } from '../types';

interface ReferenceSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alreadySelectedIds: string[];
  onAddReferences: (refs: DocumentReference[]) => void;
}

type ModalTab = 'category' | 'document' | 'upload';

export function ReferenceSelectionModal({
  open,
  onOpenChange,
  alreadySelectedIds,
  onAddReferences,
}: ReferenceSelectionModalProps) {
  const [activeTab, setActiveTab] = React.useState<ModalTab>('category');
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [documents, setDocuments] = React.useState<DocumentReference[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Selected in category or document tabs
  const [selectedDocIds, setSelectedDocIds] = React.useState<Set<string>>(new Set());

  // Fetch library documents and categories when modal opens
  React.useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setIsLoading(true);

    fetch('/api/v1/library/documents')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setCategories(data.categories || []);
          setDocuments(data.documents || []);
        }
      })
      .catch((err) => {
        console.error('Falha ao buscar documentos do acervo:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open]);

  // Filter documents by search
  const filteredDocuments = React.useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.author.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
    );
  }, [documents, searchQuery]);

  // Toggle individual document selection
  const handleToggleDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Select all documents of a category
  const handleSelectCategory = (categoryName: string) => {
    const docsInCat = documents.filter((d) => d.category === categoryName);
    if (docsInCat.length === 0) return;

    const isAllSelected = docsInCat.every(
      (d) => selectedDocIds.has(d.id) || alreadySelectedIds.includes(d.id)
    );

    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      docsInCat.forEach((d) => {
        if (isAllSelected) {
          next.delete(d.id);
        } else {
          next.add(d.id);
        }
      });
      return next;
    });
  };

  // Submit selected existing docs
  const handleConfirmSelected = () => {
    const selectedList = documents.filter((d) => selectedDocIds.has(d.id));
    onAddReferences(selectedList);
    setSelectedDocIds(new Set());
    onOpenChange(false);
  };

  return (
    <AdaptiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Biblioteca de Documentos & RAG Pedagógico"
      description="Selecione materiais do acervo ou faça ingestão direta para fundamentar a elaboração do plano de ensino pela IA."
      className="max-w-2xl"
    >
      {/* Mode Selector Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2 mb-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('category')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            activeTab === 'category'
              ? 'bg-brand-teal/15 text-brand-teal font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          <span>1. Por Categoria</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('document')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            activeTab === 'document'
              ? 'bg-brand-teal/15 text-brand-teal font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>2. Por Documento</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            activeTab === 'upload'
              ? 'bg-brand-teal/15 text-brand-teal font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          }`}
        >
          <UploadCloud className="h-4 w-4" />
          <span>3. Enviar Novo Documento</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-brand-teal" />
          <span className="text-xs">Consultando acervo indexado no RAG local...</span>
        </div>
      ) : null}

      {/* TAB 1: POR CATEGORIA */}
      {!isLoading && activeTab === 'category' && (
        <ReferenceCategoryTab
          categories={categories}
          documents={documents}
          selectedDocIds={selectedDocIds}
          alreadySelectedIds={alreadySelectedIds}
          onSelectCategory={handleSelectCategory}
        />
      )}

      {/* TAB 2: POR DOCUMENTO INDIVIDUAL */}
      {!isLoading && activeTab === 'document' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <Input
              placeholder="Buscar por título, autor ou assunto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs rounded-xl"
            />
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filteredDocuments.length === 0 ? (
              <p className="text-xs text-center py-6 text-slate-500">
                Nenhum documento encontrado para a busca.
              </p>
            ) : (
              filteredDocuments.map((doc) => {
                const isSelected = selectedDocIds.has(doc.id) || alreadySelectedIds.includes(doc.id);

                return (
                  <div
                    key={doc.id}
                    onClick={() => handleToggleDoc(doc.id)}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-brand-teal bg-brand-teal/5'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <BookMarked className="h-4 w-4 text-brand-teal shrink-0" />
                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {doc.title}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-brand-teal/30 text-brand-teal">
                          {doc.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Autor: {doc.author} · {doc.totalChunks || 1} chunks no RAG
                      </p>
                      {doc.sampleExcerpt && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 italic line-clamp-1">
                          &ldquo;{doc.sampleExcerpt}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 mt-1">
                      <div
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-brand-teal border-brand-teal text-white'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ENVIAR NOVO DOCUMENTO */}
      {!isLoading && activeTab === 'upload' && (
        <ReferenceUploadTab
          categories={categories}
          onCategoryCreated={(newCat) => {
            setCategories((prev) =>
              prev.some((c) => c.name.toLowerCase() === newCat.name.toLowerCase())
                ? prev
                : [...prev, { name: newCat.name, documentCount: 0, chunkCount: 0 }]
            );
          }}
          onSuccess={(newRef) => {
            onAddReferences([newRef]);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      )}

      {/* Footer for Category / Document Tabs */}
      {activeTab !== 'upload' && (
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3 mt-4">
          <span className="text-xs text-slate-500">
            {selectedDocIds.size} documento(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSelected}
              disabled={selectedDocIds.size === 0}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white text-xs rounded-xl cursor-pointer"
            >
              Confirmar e Vincular ({selectedDocIds.size})
            </Button>
          </div>
        </div>
      )}
    </AdaptiveModal>
  );
}
