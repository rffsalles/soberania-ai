import { executeHybridSearch } from '@/domains/rag/hybrid-search';

export const searchDidacticMaterialTool = {
  name: 'search_didactic_material',
  description:
    'Realiza busca híbrida RRF (vetorial + léxica BM25) no acervo oficial de apostilas e livros adotados pela instituição.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Termo de busca ou dúvida conceitual do estudante.',
      },
      topK: {
        type: 'number',
        description: 'Quantidade máxima de trechos a retornar (padrão: 3).',
      },
    },
    required: ['query'],
  },
  execute: async (args: { query: string; topK?: number }) => {
    return await executeHybridSearch({
      query: args.query,
      topK: args.topK ?? 3,
    });
  },
};
