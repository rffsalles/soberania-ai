import { z } from 'zod';
import { ingestTextDocument } from '@/domains/rag/services/library-service';
import { defineMcpTool } from '../mcp-tool';

const MAX_PAGES = 500;

const schema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  subject: z.string().min(1),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        chapter: z.string().optional(),
        text: z.string().min(1),
      })
    )
    .min(1)
    .max(MAX_PAGES),
});

export const ingestDidacticMaterialTool = defineMcpTool({
  name: 'ingest_didactic_material',
  description:
    'Ingesta e indexa materiais didáticos oficiais ou artigos científicos para busca do RAG Híbrido.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título do livro ou artigo' },
      author: { type: 'string', description: 'Autor(es) do material' },
      subject: { type: 'string', description: 'Disciplina ou área temática' },
      pages: {
        type: 'array',
        description: `Lista de páginas (1 a ${MAX_PAGES}) contendo pageNumber, chapter e text`,
        items: {
          type: 'object',
          properties: {
            pageNumber: { type: 'number' },
            chapter: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['pageNumber', 'text'],
        },
      },
    },
    required: ['title', 'author', 'subject', 'pages'],
  },
  execute: (input) =>
    ingestTextDocument({
      title: input.title,
      author: input.author,
      categories: [input.subject],
      pages: input.pages,
    }),
});
