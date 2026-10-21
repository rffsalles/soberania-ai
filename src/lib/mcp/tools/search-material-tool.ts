import { z } from 'zod';
import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import { defineMcpTool } from '../mcp-tool';

const DEFAULT_TOP_K = 3;
const MAX_TOP_K = 50;

const schema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(MAX_TOP_K).optional(),
  categories: z.array(z.string()).optional(),
});

export const searchDidacticMaterialTool = defineMcpTool({
  name: 'search_didactic_material',
  description:
    'Realiza busca híbrida RRF (vetorial + léxica) no acervo oficial de apostilas e livros adotados pela instituição.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Termo de busca ou dúvida conceitual do estudante.' },
      topK: { type: 'number', description: `Quantidade máxima de trechos a retornar (padrão: ${DEFAULT_TOP_K}).` },
      categories: { type: 'array', items: { type: 'string' }, description: 'Categorias do acervo a considerar.' },
    },
    required: ['query'],
  },
  execute: (input) =>
    executeHybridSearch({ query: input.query, topK: input.topK ?? DEFAULT_TOP_K, categories: input.categories }),
});
