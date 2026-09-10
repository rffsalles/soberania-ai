import { documentIngestionService } from '@/domains/rag/ingestion';
import type { RawDocumentPage } from '@/domains/rag/types';

export const ingestDidacticMaterialTool = {
  name: 'ingest_didactic_material',
  description:
    'Ingesta e indexa materiais didáticos oficiais ou artigos científicos para busca do RAG Híbrido.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título do livro ou artigo' },
      author: { type: 'string', description: 'Autor(es) do material' },
      subject: { type: 'string', description: 'Disciplina ou área temática' },
      pages: {
        type: 'array',
        description: 'Lista de páginas contendo pageNumber, chapter e text',
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
  execute: async (args: {
    title: string;
    author: string;
    subject: string;
    pages: RawDocumentPage[];
  }) => {
    return documentIngestionService.ingestMaterial({
      title: args.title,
      author: args.author,
      subject: args.subject,
      pages: args.pages,
    });
  },
};
