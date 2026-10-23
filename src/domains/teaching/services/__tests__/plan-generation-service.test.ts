import { describe, it, expect } from 'vitest';
import { DomainError } from '@/lib/api/domain-error';
import type { StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk, RAGSearchQuery } from '@/domains/rag/types';
import { generatePlanSuggestion, type PlanGenerationDeps } from '../plan-generation-service';

const chunk = (n: number, materialId = 'm1'): DidacticChunk => ({
  id: `c${n}`,
  materialId,
  bookTitle: 'Sistemas de Banco de Dados',
  author: 'Elmasri',
  chapter: `Cap. ${n}: Tópico ${n}`,
  pageNumber: 10 * n,
  content: `Conteúdo do trecho ${n}`,
});

const aiJson = JSON.stringify({
  syllabus: 'Ementa gerada pelo modelo',
  generalObjectives: 'Objetivos gerados pelo modelo',
  bloomLevels: ['Nível 2: Compreender', 'Nível 3: Aplicar'],
  methodology: 'Metodologia gerada pelo modelo',
});

function makeDeps(opts: { aiText?: string; fallback?: boolean; chunks?: DidacticChunk[]; throws?: boolean } = {}) {
  const searches: RAGSearchQuery[] = [];
  const deps: PlanGenerationDeps = {
    search: async (q) => {
      searches.push(q);
      return { chunks: opts.chunks ?? [chunk(1), chunk(2)] };
    },
    streamChat: async function* (): AsyncGenerator<StreamChunk> {
      if (opts.throws) throw new Error('rede caiu');
      yield { token: opts.aiText ?? aiJson, isComplete: true, fallback: opts.fallback ?? false };
    },
  };
  return { deps, searches };
}

const input = {
  subjectName: 'Filosofia Antiga',
  courseName: 'Filosofia',
  academicPeriod: '2026.2',
  references: [{ id: 'm1', title: 'Sistemas de Banco de Dados', author: 'Elmasri', category: 'Livros' }],
};

describe('plan-generation-service', () => {
  it('devolve exatamente o que o modelo escreveu, sem modelos por palavra-chave', async () => {
    const { deps } = makeDeps();
    const result = await generatePlanSuggestion(input, deps);
    expect(result.syllabus).toBe('Ementa gerada pelo modelo');
    expect(result.generalObjectives).toBe('Objetivos gerados pelo modelo');
    expect(result.bloomLevels).toEqual(['Nível 2: Compreender', 'Nível 3: Aplicar']);
    expect(result.methodology).toBe('Metodologia gerada pelo modelo');
    expect(result.syllabus).not.toMatch(/Inteligência Artificial/);
  });

  it('as citações vêm só dos trechos RAG reais (título · capítulo, página), sem páginas inventadas', async () => {
    const { deps } = makeDeps({ chunks: [chunk(1), chunk(2), chunk(1)] });
    const result = await generatePlanSuggestion(input, deps);
    expect(result.citations).toEqual([
      '[Sistemas de Banco de Dados · Cap. 1, pág. 10]',
      '[Sistemas de Banco de Dados · Cap. 2, pág. 20]',
    ]);
  });

  it('sem trechos no acervo, devolve citações vazias em vez de inventar', async () => {
    const { deps } = makeDeps({ chunks: [] });
    const result = await generatePlanSuggestion(input, deps);
    expect(result.citations).toEqual([]);
  });

  it('restringe a busca RAG aos materiais selecionados e à disciplina', async () => {
    const { deps, searches } = makeDeps();
    await generatePlanSuggestion(input, deps);
    expect(searches.length).toBeGreaterThan(0);
    for (const q of searches) {
      expect(q.allowedMaterialIds).toEqual(['m1']);
      expect(q.subjectName).toBe('Filosofia Antiga');
    }
  });

  it('não filtra por material quando as referências não trazem id', async () => {
    const { deps, searches } = makeDeps();
    await generatePlanSuggestion({ ...input, references: [{ title: 'X', author: 'Y' }] }, deps);
    for (const q of searches) expect(q.allowedMaterialIds).toBeUndefined();
  });

  it('lança 503 quando o provedor devolve o stream determinístico de fallback', async () => {
    const { deps } = makeDeps({ fallback: true });
    await expect(generatePlanSuggestion(input, deps)).rejects.toMatchObject({ status: 503 });
    await expect(generatePlanSuggestion(input, deps)).rejects.toBeInstanceOf(DomainError);
  });

  it('lança 503 quando a resposta do modelo não é o JSON esperado', async () => {
    const { deps } = makeDeps({ aiText: 'Desculpe, não consigo ajudar.' });
    await expect(generatePlanSuggestion(input, deps)).rejects.toMatchObject({ status: 503 });
  });

  it('lança 503 quando a chamada ao provedor falha', async () => {
    const { deps } = makeDeps({ throws: true });
    await expect(generatePlanSuggestion(input, deps)).rejects.toMatchObject({ status: 503 });
  });
});
