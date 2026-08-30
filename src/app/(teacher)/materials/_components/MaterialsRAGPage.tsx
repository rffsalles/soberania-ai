'use client';

import * as React from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import type { DidacticChunk } from '@/domains/rag/types';
import {
  BookOpen,
  UploadCloud,
  Search,
  FileText,
  Sparkles,
  Layers,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MaterialsRAGPage() {
  const [searchQuery, setSearchQuery] = React.useState('diferença entre INNER JOIN e LEFT JOIN');
  const [searchResults, setSearchResults] = React.useState<DidacticChunk[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
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
            </div>
            <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white">
              Gestão de Apostilas & Sandbox de Busca Híbrida
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Faça upload de livros didáticos homologados. Toda a indexação vetorial e inferência roda 100% on-premises no appliance.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer">
              <UploadCloud className="h-4 w-4" />
              <span>Indexar Novo PDF</span>
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
                  Acervo Didático Oficial Indexado
                </CardTitle>
                <CardDescription className="text-xs">
                  Livros-texto fonte para respostas socráticas e citações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/40 bg-teal-50/50 dark:bg-teal-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      Sistemas de Banco de Dados
                    </span>
                    <Badge variant="teal" className="text-[10px]">7ª Edição</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Silberschatz, Korth & Sudarshan · Campus / Elsevier
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>1.120 páginas</span>
                    <span>•</span>
                    <span>3.480 Chunks Vetoriais</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      Engenharia de Software: Uma Abordagem Profissional
                    </span>
                    <Badge variant="secondary" className="text-[10px]">8ª Edição</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Pressman, Roger S. & Maxim, Bruce R. · McGraw-Hill
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>864 páginas</span>
                    <span>•</span>
                    <span>2.150 Chunks Vetoriais</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dropzone mockup */}
            <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2 bg-white/50 dark:bg-slate-900/50 hover:bg-slate-50 transition-colors">
              <UploadCloud className="h-8 w-8 text-brand-teal mx-auto" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Arraste uma nova apostila ou livro didático em PDF
              </h4>
              <p className="text-xs text-slate-500">
                Processamento por OCR local, chunking com overlap de 15% e embeddings nomic-embed-text.
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
                    Sandbox de Recuperação Híbrida (RRF)
                  </CardTitle>
                  <Badge variant="amber" className="text-xs">
                    Simulador em Tempo Real
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Digite a pergunta ou termo para testar a busca..."
                      className="pl-9 text-sm rounded-xl"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSearching}
                    className="bg-brand-teal hover:bg-brand-teal-dark text-white rounded-xl cursor-pointer"
                  >
                    {isSearching ? 'Buscando...' : 'Testar RAG'}
                  </Button>
                </form>

                {/* Results List */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>{searchResults.length} trecho(s) recuperados com maior score RRF:</span>
                    <span>Top-k: 3</span>
                  </div>

                  {searchResults.map((chunk, index) => (
                    <div
                      key={chunk.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal text-white font-bold text-[10px]">
                            #{index + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {chunk.bookTitle} · pág. {chunk.pageNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <Badge variant="outline" className="text-[10px] text-brand-teal border-brand-teal/40">
                            RRF Score: {(chunk.rrfScore || 0.88).toFixed(3)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] text-brand-orange border-brand-orange/40">
                            Cosine: {(chunk.similarityScore || 0.91).toFixed(2)}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-xs font-mono text-slate-500">
                        Capítulo: {chunk.chapter} {chunk.section && `· ${chunk.section}`}
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200/60 dark:border-slate-700/60 leading-relaxed">
                        &quot;{chunk.content}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
