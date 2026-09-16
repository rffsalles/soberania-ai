'use client';

import * as React from 'react';
import {
  FileText,
  Upload,
  Video,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Plus,
  Play,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function LessonPlanEditorPage() {
  const [topicTitle, setTopicTitle] = React.useState(
    'Aula 05: Joins Avançados, Subqueries e Operações de Conjunto'
  );
  const [dailyObjective, setDailyObjective] = React.useState(
    'Compreender a diferença prática e sintática entre INNER, LEFT e FULL JOIN, e diagnosticar anomalias de produto cartesiano utilizando o sandbox PostgreSQL 16.'
  );
  const [youtubeUrl, setYoutubeUrl] = React.useState(
    'https://www.youtube.com/watch?v=sql_deep_dive_05'
  );
  const [s3File, setS3File] = React.useState<File | null>(null);
  const [uploadingS3, setUploadingS3] = React.useState(false);

  const handleS3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setS3File(file);
    setUploadingS3(true);

    try {
      // Solicita URL de upload S3 presigned via API
      const res = await fetch('/api/v1/teacher/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestS3Upload: true,
          fileName: file.name,
          fileType: file.type,
          subjectCode: 'BD101',
          classNumber: 5,
        }),
      });
      const data = await res.json();
      if (data.success && data.uploadData) {
        console.log('Presigned Upload URL:', data.uploadData.uploadUrl);
      }
    } catch {
      // Ignorar erro no mock
    } finally {
      setUploadingS3(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 3 do Pipeline Pedagógico
            </Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              ✓ Etapas 1 e 2 Homologadas
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Editor de Plano de Aula Diário & Central de Mídias S3 / YouTube
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Detalhamento micro do encontro com suporte a anexos de vídeo e roteiro socrático.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => (window.location.href = '/teacher/assessments')}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl text-xs"
          >
            <span>Avançar para Avaliações (Etapa 4)</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Grid: Form 70% + Attachments 30% */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center justify-between">
                <span>1. Identificação do Encontro</span>
                <Badge variant="secondary">Aula #05 • 100 minutos</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Título do Tópico de Aula
                </label>
                <Input
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  className="rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Objetivo Específico Diário (Taxonomia de Bloom)
                </label>
                <Textarea
                  value={dailyObjective}
                  onChange={(e) => setDailyObjective(e.target.value)}
                  rows={3}
                  className="rounded-xl text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Roteiro Pedagógico em 3 Fases */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-orange" />
                2. Roteiro Pedagógico por Etapas (Total: 100 min)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge className="bg-brand-teal text-white">15 min</Badge>
                  <span className="font-semibold text-slate-900">Etapa 1: Acolhimento Socrático & Revisão de Chaves</span>
                </div>
                <span className="text-slate-500">Discussão em grupo</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge className="bg-brand-orange text-white">60 min</Badge>
                  <span className="font-semibold text-slate-900">Etapa 2: Prática Investigativa de JOINs em Sandbox SQL</span>
                </div>
                <span className="text-slate-500">Laboratório Presencial</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white">25 min</Badge>
                  <span className="font-semibold text-slate-900">Etapa 3: Fechamento & Emissão de Ata Pedagógica</span>
                </div>
                <span className="text-slate-500">Mediação Tutora Lucy</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Attachments (1 col) */}
        <div className="space-y-6">
          {/* Upload S3 MinIO */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Upload className="h-4 w-4 text-brand-teal" />
                Upload de Mídia S3 Institucional
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center space-y-2 hover:border-brand-teal transition-colors">
                <Upload className="h-6 w-6 text-brand-teal mx-auto" />
                <p className="text-xs text-slate-600">Arraste ou selecione arquivos (.pdf, .sql, .mp4)</p>
                <input
                  type="file"
                  onChange={handleS3Upload}
                  className="hidden"
                  id="s3-file-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('s3-file-input')?.click()}
                  className="text-xs rounded-xl cursor-pointer"
                >
                  {uploadingS3 ? 'Gerando Presigned URL...' : 'Selecionar Arquivo'}
                </Button>
              </div>

              {s3File && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                  <span className="font-mono truncate max-w-[180px]">{s3File.name}</span>
                  <Badge className="bg-emerald-600 text-white text-[10px]">Indexado S3</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* YouTube Embed */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Video className="h-4 w-4 text-brand-orange" />
                Anexo de Vídeo-aula YouTube
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="rounded-xl text-xs"
              />

              <div className="aspect-video bg-slate-900 rounded-xl flex items-center justify-center text-white relative overflow-hidden group">
                <Play className="h-10 w-10 text-brand-orange group-hover:scale-110 transition-transform cursor-pointer" />
                <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-white">
                  Preview 16:9 • Transcrito RAG Local
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
