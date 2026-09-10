'use client';

import * as React from 'react';
import { AdaptiveModal } from '@/components/adaptive/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { documentIngestionService } from '@/domains/rag/ingestion';
import { Sparkles, CheckCircle2 } from 'lucide-react';

interface MaterialUploadModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function MaterialUploadModal({
  isOpen,
  onOpenChange,
  onSuccess,
}: MaterialUploadModalProps) {
  const [docTitle, setDocTitle] = React.useState('');
  const [docAuthor, setDocAuthor] = React.useState('');
  const [docContent, setDocContent] = React.useState('');
  const [uploadSuccess, setUploadSuccess] = React.useState(false);

  const handleIngestSamplePaper = () => {
    setDocTitle('Avaliação de SLMs no Ensino de Algoritmos (Artigo Científico 2026)');
    setDocAuthor('Salles, R. F. F. et al.');
    setDocContent(
      'A aplicação de Small Language Models (SLMs) quantizados em hardware on-premises garante privacidade estrita sob a LGPD ao eliminar qualquer tráfego de inferência para a nuvem. Em testes com 120 estudantes, a utilização de RAG híbrido com Reciprocal Rank Fusion elevou a assertividade pedagógica para 96.8% em questionamentos sobre complexidade assintótica e algoritmos gulosos.'
    );
  };

  const handleConfirmIngestion = () => {
    if (!docTitle.trim() || !docContent.trim()) return;

    documentIngestionService.ingestMaterial({
      title: docTitle,
      author: docAuthor || 'Autor Institucional',
      subject: 'Ciência da Computação & Pedagogia',
      materialType: 'SCIENTIFIC_PAPER',
      pages: [
        {
          pageNumber: 1,
          chapter: 'Artigo Científico: Inovação Pedagógica',
          section: '1.1 Resultados & Métricas',
          text: docContent,
        },
      ],
    });

    setUploadSuccess(true);
    setTimeout(() => {
      setUploadSuccess(false);
      onOpenChange(false);
      setDocTitle('');
      setDocAuthor('');
      setDocContent('');
      onSuccess();
    }, 900);
  };

  return (
    <AdaptiveModal
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Indexação de Bibliografia & Artigos Científicos"
      description="Carregue materiais em PDF para disponibilização imediata nas aulas e plantões socráticos."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleIngestSamplePaper}
            className="text-xs cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-brand-orange" />
            Preencher Artigo Científico Demo
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmIngestion}
              disabled={!docTitle.trim() || !docContent.trim() || uploadSuccess}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
            >
              {uploadSuccess ? (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                  Indexado com Sucesso!
                </span>
              ) : (
                'Indexar no RAG'
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Título da Obra ou Artigo Científico
          </label>
          <Input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Ex: Introdução à Álgebra Relacional ou Artigo RBIE 2026"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Autor(es) / Instituição
          </label>
          <Input
            value={docAuthor}
            onChange={(e) => setDocAuthor(e.target.value)}
            placeholder="Ex: Navathe & Elmasri ou Equipe Pedagógica"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Conteúdo Extraído do PDF (ou Parágrafos para Indexação)
          </label>
          <Textarea
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            rows={5}
            placeholder="Cole o trecho textual da apostila ou artigo para gerar os chunks..."
            className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-sans focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>
      </div>
    </AdaptiveModal>
  );
}
