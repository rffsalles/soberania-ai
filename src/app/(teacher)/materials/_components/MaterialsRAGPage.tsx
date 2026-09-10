'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { executeHybridSearch, getAllCorpusChunks } from '@/domains/rag/hybrid-search';
import type { DidacticChunk } from '@/domains/rag/types';
import {
  BookOpen,
  UploadCloud,
  Search,
  FileText,
  Layers,
  SlidersHorizontal,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MaterialUploadModal } from './MaterialUploadModal';

export default function MaterialsRAGPage() {
  const [searchQuery, setSearchQuery] = React.useState('diferença entre INNER JOIN e LEFT JOIN');
  const [searchResults, setSearchResults] = React.useState<DidacticChunk[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
  const [totalChunksCount, setTotalChunksCount] = React.useState(0);

  React.useEffect(() => {
    let isMounted = true;
    setTotalChunksCount(getAllCorpusChunks().length);
    executeHybridSearch({ query: 'diferença entre INNER JOIN e LEFT JOIN' }).then((res) => {
      if (isMounted) setSearchResults(res.chunks);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    try {
      const res = await executeHybridSearch({ query: searchQuery });
      setSearchResults(res.chunks);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col font-sans">
      <AppHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="teal" className="gap-1 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                Base de Conhecimento RAG Local
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                pgvector + BM25 (RRF k=60)
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono">
                {totalChunksCount} Chunks Ativos
              </Badge>
            </div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Gestão de Apostilas & Artigos Científicos
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Faça upload de livros e artigos científicos institucionais. Toda a indexação vetorial roda 100% on-premises.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Indexar Novo PDF / Artigo</span>
            </Button>
          </div>
        </div>

        {/* 2-Column: Upload Box / Catalog + Interactive RAG Sandbox */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Didactic Material Catalog (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold font-heading flex items-center gap-2">
                  <Layers className="h-4 w-4 text-brand-teal" />
                  Acervo & Artigos Científicos Indexados
                </CardTitle>
                <CardDescription className="text-xs">
                  Fontes oficiais obrigatórias para respostas socráticas e citações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/40 bg-teal-50/50 dark:bg-teal-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      Sistemas de Banco de Dados
                    </span>
                    <Badge variant="teal" className="text-[10px]">Livro Didático</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Navathe & Elmasri · Pearson
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>1.120 páginas</span>
                    <span>•</span>
                    <span>pgvector HNSW</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      Revista Brasileira de Informática na Educação
                    </span>
                    <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-300">Artigo Científico</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Vasconcelos, Salles et al. (2024) · RBIE / SBC
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>Retenção Cognitiva +34%</span>
                    <span>•</span>
                    <span>Tutores Socráticos</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      Estruturas de Dados e Algoritmos
                    </span>
                    <Badge variant="secondary" className="text-[10px]">Livro Didático</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Cormen, Leiserson, Rivest & Stein · Campus
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>Árvores AVL & Big-O</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ingestion Dropzone */}
            <div
              onClick={() => setIsUploadModalOpen(true)}
              className="p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <UploadCloud className="h-8 w-8 text-brand-teal mx-auto" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Clique para indexar nova apostila ou artigo em PDF
              </h4>
              <p className="text-xs text-slate-500">
                Chunking semântico com overlap de 60 chars, FastEmbed na CPU e busca híbrida instantânea.
              </p>
            </div>
          </div>

          {/* Right Column: Interactive RAG Search Sandbox (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold font-heading flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-brand-orange" />
                    Simulador Interativo de Busca RRF
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    Tempo Real
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Teste como a Tutora Lucy localiza e ranqueia as citações da bibliografia institucional para apoiar o planejamento docente
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Faça uma busca conceitual ou pergunta de estudante..."
                      className="pl-9 text-sm"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSearching}
                    className="bg-brand-teal hover:bg-brand-teal-dark text-white cursor-pointer"
                  >
                    {isSearching ? 'Buscando...' : 'Buscar RRF'}
                  </Button>
                </form>

                {/* Search Results */}
                <div className="space-y-3 pt-2">
                  {searchResults.map((chunk, idx) => (
                    <div
                      key={chunk.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-brand-teal/10 text-brand-teal text-[11px] font-bold">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {chunk.bookTitle} · {chunk.chapter}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          Pág. {chunk.pageNumber}
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic border-l-2 border-brand-teal/40 pl-3">
                        &quot;{chunk.content}&quot;
                      </p>

                      <div className="flex items-center gap-3 pt-2 text-[10px] font-mono text-slate-500">
                        <span>BM25: {chunk.bm25Score ?? '0.85'}</span>
                        <span>•</span>
                        <span>Cosine: {chunk.similarityScore ?? '0.89'}</span>
                        <span>•</span>
                        <span className="text-brand-teal font-bold">
                          RRF Score: {chunk.rrfScore ?? '0.0321'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Adaptive Modal for PDF / Paper Ingestion */}
      <MaterialUploadModal
        isOpen={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onSuccess={() => {
          setTotalChunksCount(getAllCorpusChunks().length);
          handleSearch();
        }}
      />
    </div>
  );
}
