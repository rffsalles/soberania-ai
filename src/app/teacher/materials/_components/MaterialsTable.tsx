'use client';

import * as React from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Download,
  Trash2,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ListTree,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { MaterialChaptersPanel } from './MaterialChaptersPanel';
import {
  formatDate,
  formatFileSize,
  type DidacticMaterialItem,
} from './materials-constants';

interface MaterialsTableProps {
  materials: DidacticMaterialItem[];
  onDeleteSuccess: () => void;
}

export function MaterialsTable({
  materials,
  onDeleteSuccess,
}: MaterialsTableProps) {
  const [materialToDelete, setMaterialToDelete] =
    React.useState<DidacticMaterialItem | null>(null);
  const [chaptersMaterial, setChaptersMaterial] =
    React.useState<DidacticMaterialItem | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    if (!materialToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      const res = await fetch(
        `/api/v1/library/materials/${materialToDelete.id}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Falha ao excluir o material.');
      }
      setMaterialToDelete(null);
      onDeleteSuccess();
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : 'Erro ao tentar remover arquivo.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const getFileIcon = (filename?: string | null) => {
    if (!filename) return <FileText className="h-5 w-5 text-brand-teal" />;
    if (filename.endsWith('.pdf'))
      return <FileText className="h-5 w-5 text-rose-500" />;
    if (filename.endsWith('.docx'))
      return <FileSpreadsheet className="h-5 w-5 text-blue-500" />;
    return <FileCode className="h-5 w-5 text-brand-teal" />;
  };

  return (
    <>
      <div className="glass rounded-2xl overflow-hidden border border-border/40">
        <Table>
          <TableHeader className="bg-surface-elevated/30">
            <TableRow className="border-b border-border/30 hover:bg-transparent">
              <TableHead className="font-heading font-semibold text-text-secondary text-xs">
                Material / Arquivo
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs">
                Categoria
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs text-center">
                Chunks RAG
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs">
                Tamanho
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs">
                Extração
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs">
                Data
              </TableHead>
              <TableHead className="font-heading font-semibold text-text-secondary text-xs text-right pr-4">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {materials.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-44 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 py-8">
                    <div className="h-12 w-12 rounded-full bg-surface-elevated/50 flex items-center justify-center text-text-muted">
                      <FileText className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-text-primary">
                      Nenhum material didático encontrado
                    </p>
                    <p className="text-xs text-text-muted max-w-md">
                      Faça o upload de apostilas, e-books em PDF ou arquivos DOCX
                      para indexar no motor de IA e enriquecer a geração de planos
                      de ensino.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              materials.map((item) => (
                <TableRow
                  key={item.id}
                  className="hover:bg-surface-elevated/30 transition-colors border-b border-border/30 last:border-0"
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 p-2 rounded-xl bg-surface-elevated/50">
                        {getFileIcon(item.originalFilename)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <span>{item.author}</span>
                          {item.originalFilename && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] text-brand-teal truncate max-w-[140px]">
                                {item.originalFilename}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3">
                    <Badge
                      variant="outline"
                      className="text-[11px] bg-surface-elevated/40 border-border/40 text-text-secondary font-medium"
                    >
                      {item.category || 'Geral'}
                    </Badge>
                  </TableCell>

                  <TableCell className="py-3 text-center">
                    <Badge
                      variant="outline"
                      className="gap-1 text-[11px] bg-brand-teal/10 text-brand-teal border-brand-teal/30 font-medium"
                    >
                      <Layers className="h-3 w-3" />
                      {item.totalChunks} chunks
                    </Badge>
                  </TableCell>

                  <TableCell className="py-3 text-xs text-text-secondary font-mono">
                    {formatFileSize(item.fileSize)}
                  </TableCell>

                  <TableCell className="py-3">
                    {item.isOcrApplied ? (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[11px] bg-warning/15 text-warning border-warning/30 font-medium"
                      >
                        <Cpu className="h-3 w-3" />
                        OCR Tesseract
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[11px] bg-success/15 text-success border-success/30 font-medium"
                      >
                        <Sparkles className="h-3 w-3" />
                        Texto Nativo
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="py-3 text-xs text-text-muted">
                    {formatDate(item.createdAt)}
                  </TableCell>

                  <TableCell className="py-3 text-right pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.originalFilename ? (
                        <a
                          href={`/api/v1/library/materials/${item.id}/download`}
                          download
                          title="Baixar arquivo original"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 cursor-pointer text-text-muted hover:text-brand-teal hover:bg-brand-teal/10"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled
                          className="h-8 w-8 p-0 opacity-40 cursor-not-allowed"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}

                      {item.mimeType === 'application/pdf' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setChaptersMaterial(item)}
                          title="Capítulos"
                          className="h-8 w-8 p-0 cursor-pointer text-text-muted"
                        >
                          <ListTree className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMaterialToDelete(item)}
                        title="Remover material"
                        className="h-8 w-8 p-0 cursor-pointer text-text-muted hover:text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation Modal for Deletion */}
      <AdaptiveModal
        open={Boolean(materialToDelete)}
        onOpenChange={(val) => !val && setMaterialToDelete(null)}
        title="Excluir Material Didático"
        description="Esta ação removerá o arquivo original e todos os fragmentos indexados no banco vetorial RAG."
      >
        <div className="space-y-4 pt-2">
          {materialToDelete && (
            <div className="p-3 rounded-xl bg-surface-elevated/40 border border-border/40 text-xs space-y-1">
              <p className="font-semibold text-text-primary">
                {materialToDelete.title}
              </p>
              <p className="text-text-muted">
                {materialToDelete.totalChunks} fragmentos RAG indexados •{' '}
                {formatFileSize(materialToDelete.fileSize)}
              </p>
            </div>
          )}

          {deleteError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMaterialToDelete(null)}
              disabled={isDeleting}
              className="text-xs rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-danger hover:bg-danger/90 text-white text-xs rounded-xl cursor-pointer"
            >
              {isDeleting ? 'Removendo...' : 'Confirmar Exclusão'}
            </Button>
          </div>
        </div>
      </AdaptiveModal>

      {chaptersMaterial && (
        <MaterialChaptersPanel
          material={chaptersMaterial}
          open
          onOpenChange={(open) => {
            if (!open) setChaptersMaterial(null);
          }}
        />
      )}
    </>
  );
}
