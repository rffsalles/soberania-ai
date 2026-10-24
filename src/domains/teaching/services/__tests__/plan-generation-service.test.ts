import { describe, it, expect, vi } from 'vitest';
import { DomainError } from '@/lib/api/domain-error';
import type { StreamChunk } from '@/lib/ai-provider';
import type { DidacticChunk, RAGSearchQuery } from '@/domains/rag/types';
import { generatePlanSuggestion, isReferencePertinent, type PlanGenerationDeps } from '../plan-generation-service';

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

function makeDeps(
  opts: { aiText?: string; fallback?: boolean; chunks?: DidacticChunk[]; sampled?: DidacticChunk[]; throws?: boolean } = {}
) {
  const searches: RAGSearchQuery[] = [];
  const deps: PlanGenerationDeps = {
    listChunks: vi.fn(async () => opts.sampled ?? []),
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

describe('generatePlanSuggestion carga horária', () => {
  it('repassa a carga horária da matriz ao prompt', async () => {
    const { deps } = makeDeps();
    const streamChat = vi.spyOn(deps, 'streamChat');
    await generatePlanSuggestion({ ...input, workloadHours: 80 }, deps);
    expect(streamChat.mock.calls[0][0][1].content).toContain('Carga horária: 80h');
  });
});

describe('isReferencePertinent', () => {
  it('título ou categoria cobrindo todas as palavras da disciplina (ignorando numerais e conectivos)', () => {
    expect(isReferencePertinent('Banco de Dados I', { title: 'Sistemas de Banco de Dados', category: 'Livros' })).toBe(true);
    expect(isReferencePertinent('Banco de Dados I', { title: 'Obra', category: 'Banco de Dados' })).toBe(true);
    expect(isReferencePertinent('Estrutura de Dados', { title: 'Estruturas de Dados e Algoritmos' })).toBe(true);
  });

  it('coincidência parcial ("dados") ou área diferente não conta', () => {
    expect(isReferencePertinent('Banco de Dados I', { title: 'Estruturas de Dados e Algoritmos', category: 'Algoritmos' })).toBe(false);
    expect(isReferencePertinent('Banco de Dados I', { title: 'Matemática Básica', category: 'Matematic' })).toBe(false);
  });
});

describe('plan-generation-service', () => {
  it('busca sem resultado, mas referência da área da disciplina: usa os trechos do próprio material', async () => {
    const { deps } = makeDeps({ chunks: [], sampled: [chunk(1), chunk(2)] });
    const result = await generatePlanSuggestion(
      { subjectName: 'Banco de Dados I', references: [{ id: 'm1', title: 'Sistemas de Banco de Dados', author: 'Elmasri', category: 'Banco de Dados' }] },
      deps
    );
    expect(deps.listChunks).toHaveBeenCalledWith('m1', expect.any(Number));
    expect(result.citations).toEqual([
      '[Sistemas de Banco de Dados · Cap. 1, pág. 10]',
      '[Sistemas de Banco de Dados · Cap. 2, pág. 20]',
    ]);
  });

  it('referência de outra área sem resultado na busca: 422 sem sequer amostrar o material', async () => {
    const { deps } = makeDeps({ chunks: [], sampled: [chunk(1)] });
    await expect(
      generatePlanSuggestion(
        { subjectName: 'Banco de Dados I', references: [{ id: 'm9', title: 'Matemática Básica', author: 'Guerra', category: 'Matematic' }] },
        deps
      )
    ).rejects.toMatchObject({ status: 422 });
    expect(deps.listChunks).not.toHaveBeenCalled();
  });

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

  it('sem trechos das referências para a disciplina, recusa com 422 antes de chamar o modelo', async () => {
    const { deps } = makeDeps({ chunks: [] });
    const streamChat = vi.spyOn(deps, 'streamChat');
    const err = await generatePlanSuggestion(input, deps).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({ status: 422 });
    expect(err.message).toContain('Filosofia Antiga');
    expect(streamChat).not.toHaveBeenCalled();
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
