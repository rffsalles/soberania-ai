'use client';

import * as React from 'react';
import {
  Sparkles,
  FileCheck,
  CheckCircle2,
  Lock,
  Download,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AssessmentGeneratorPage() {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerateExam = async () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Stepper */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-brand-teal border-brand-teal/30">
              Etapa 4 do Pipeline Pedagógico
            </Badge>
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              ✓ Etapas 1, 2 e 3 Homologadas
            </Badge>
          </div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white mt-1">
            Gerador de Avaliações & Provas Supervisionadas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Criação de instrumentos de avaliação com gabarito socrático e rubricas formais de correção.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 text-xs rounded-xl">
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Caderno ABNT (PDF)</span>
          </Button>
          <Button
            onClick={handleGenerateExam}
            disabled={isGenerating}
            className="bg-brand-teal hover:bg-brand-teal-dark text-white gap-2 cursor-pointer rounded-xl text-xs"
          >
            <Sparkles className="h-4 w-4 text-brand-orange" />
            <span>{isGenerating ? 'IA Gerando Prova Local...' : 'Gerar Prova com IA Local'}</span>
          </Button>
        </div>
      </div>

      {/* Meta Card */}
      <div className="p-4 rounded-xl border border-brand-teal/30 bg-brand-teal/5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-brand-teal uppercase">Avaliação Bimestral P1</span>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
            Modelagem Relacional, Álgebra e Normalização
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Turma: ADS-2025/1A • Peso: 30% da Média Final • Duração: 120 minutos
          </p>
        </div>

        <Badge className="bg-emerald-600 text-white gap-1.5 py-1.5 px-3">
          <Lock className="h-3.5 w-3.5" />
          <span>Modo Fiscal Anti-Fraude Ativo</span>
        </Badge>
      </div>

      {/* Grid: Questions 70% + Fiscal Guardrails 30% */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Questions (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Questão 1 (Objetiva) */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center justify-between">
                <span>Questão 1 (Múltipla Escolha • 2.0 pts)</span>
                <Badge variant="outline" className="text-xs">Bloom: Compreender</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium text-slate-900 dark:text-white">
                Considere um esquema de tabela de Funcionários onde o atributo CódigoDepartamento determina o NomeDepartamento. Qual anomalia de normalização essa dependência transitiva causa?
              </p>

              <div className="space-y-1.5 text-xs">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium flex items-center justify-between">
                  <span>A) Anomalia de Inserção e Atualização (3FN violada)</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                  B) Violação da 1FN por atributos multivalorados
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                  C) Perda de chave primária composta
                </div>
              </div>

              <div className="p-3 rounded-xl bg-brand-teal/5 border border-brand-teal/20 text-xs space-y-1">
                <span className="font-bold text-brand-teal">Gabarito Comentado pela Tutora Lucy:</span>
                <p className="text-slate-600">
                  A dependência de um atributo não-chave em outro não-chave viola a Terceira Forma Normal (3FN), gerando anomalias de atualização e redundância.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Questão 2 (Prática Sandbox SQL) */}
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center justify-between">
                <span>Questão 2 (Prática no Sandbox SQL • 4.0 pts)</span>
                <Badge variant="outline" className="text-xs text-brand-orange border-brand-orange/30">
                  Bloom: Aplicar & Analisar
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium text-slate-900 dark:text-white">
                Escreva uma consulta SQL que retorne o nome do cliente e a soma total de faturas apenas para clientes que possuem mais de 3 compras no ano de 2025.
              </p>

              <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-1">
                <div className="text-slate-400">Rubrica de Avaliação Gradual:</div>
                <div>0.0 - 1.0 pt: Sintaxe SELECT básica com INNER JOIN</div>
                <div>1.1 - 2.5 pts: Agrupamento GROUP BY e ordenação</div>
                <div>2.6 - 4.0 pts: Cláusula HAVING com filtro de agregação correto</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Guardrails (1 col) */}
        <div className="space-y-6">
          <Card className="glass rounded-xl border border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-brand-orange" />
                Parâmetros da Tutora Lucy na Prova
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span>Bloqueio de Resposta Direta</span>
                <Badge className="bg-emerald-600 text-white">Ativo</Badge>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span>Dica Socrática sob Demanda</span>
                <span className="font-bold text-slate-700">-0.2 pts por dica</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
                <span>Monitoramento de Aba (Anti-Cola)</span>
                <span className="font-bold text-slate-700">Tolera 3 avisos</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
