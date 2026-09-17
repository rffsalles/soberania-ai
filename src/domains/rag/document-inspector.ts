import { z } from 'zod';
import { parseDocumentFile } from './file-parser';
import { aiProvider } from '@/lib/ai-provider';

export interface ExtractedDocumentMetadata {
  title: string;
  author: string;
  categories: string[];
  confidence: number;
  summary: string;
}

const extractedMetadataSchema = z.object({
  title: z.string().default(''),
  author: z.string().default(''),
  categories: z.array(z.string()).default([]),
  summary: z.string().default(''),
});

export class DocumentInspectorService {
  /**
   * Inspeciona as primeiras 4 páginas de um documento para extração inteligente
   * de Título, Autores, Categorias e Resumo via IA.
   */
  public async inspectDocumentHeader(
    buffer: Buffer,
    filename: string
  ): Promise<ExtractedDocumentMetadata> {
    const cleanFilename = filename.replace(/\.[^/.]+$/, '').trim();

    try {
      const parseResult = await parseDocumentFile(buffer, filename);
      // Seleciona estritamente as primeiras 4 páginas (capa, rosto, ficha e sumário)
      const headerPages = parseResult.pages.slice(0, 4);
      const combinedText = headerPages.map((p) => p.text).join('\n\n').trim();

      if (!combinedText || combinedText.length < 15 || combinedText === filename) {
        return this.getFallbackMetadata(cleanFilename);
      }

      const promptMessages = [
        {
          role: 'system' as const,
          content: `Você é um bibliotecário especialista em catalogação pedagógica. Analise o texto fornecido (capa e folha de rosto das primeiras 4 páginas do documento) e extraia:
1. "title": Título oficial limpo da obra/artigo (sem códigos de versão ou nomes de arquivo brutos).
2. "author": Nome completo do(s) autor(es) (ex: "Marco Tulio Valente" ou "Ana Silva e Pedro Santos").
3. "categories": Array de 1 a 3 áreas temáticas / disciplinas pedagógicas relacionadas.
4. "summary": Resumo conceitual curto de 1 frase.

Responda EXCLUSIVAMENTE em formato JSON estrito conforme a estrutura:
{"title": "...", "author": "...", "categories": ["..."], "summary": "..."}`,
        },
        {
          role: 'user' as const,
          content: `Nome do arquivo original: ${filename}\n\nTexto das primeiras 4 páginas:\n${combinedText.slice(0, 3500)}`,
        },
      ];

      let fullResponse = '';
      try {
        const stream = aiProvider.streamChat(promptMessages, {
          temperature: 0.1,
          maxTokens: 500,
        });

        for await (const chunk of stream) {
          if (chunk.token) {
            fullResponse += chunk.token;
          }
        }
      } catch (aiErr) {
        console.warn('[DocumentInspector] Falha na chamada de IA para extração de metadados:', aiErr);
      }

      const parsedData = this.parseAiJsonResponse(fullResponse);

      if (parsedData && (parsedData.title || parsedData.author)) {
        return {
          title: parsedData.title.trim() || cleanFilename,
          author: parsedData.author.trim() || 'Autor não identificado',
          categories: parsedData.categories.length > 0 ? parsedData.categories : ['Geral'],
          confidence: 0.95,
          summary: parsedData.summary.trim() || `Material didático: ${cleanFilename}`,
        };
      }

      // Fallback heurístico inteligente se o JSON da IA não contiver dados suficientes
      return this.heuristicExtraction(combinedText, cleanFilename);
    } catch (error) {
      console.warn('[DocumentInspector] Erro ao inspecionar páginas do documento:', error);
      return this.getFallbackMetadata(cleanFilename);
    }
  }

  /**
   * Faz o parse seguro do JSON retornado pela IA
   */
  private parseAiJsonResponse(rawText: string): z.infer<typeof extractedMetadataSchema> | null {
    if (!rawText.trim()) return null;

    try {
      // Remove possíveis blocos de markdown ```json ... ```
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = extractedMetadataSchema.safeParse(parsed);
      return validated.success ? validated.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Extração heurística simples por Expressões Regulares nas primeiras linhas
   */
  private heuristicExtraction(text: string, defaultTitle: string): ExtractedDocumentMetadata {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let extractedAuthor = '';
    let extractedTitle = defaultTitle;

    for (const line of lines.slice(0, 20)) {
      const authorMatch = line.match(/(?:autor|autores|por|by|escrito por)\s*[:|-]?\s*(.+)/i);
      if (authorMatch && authorMatch[1] && authorMatch[1].length > 3) {
        extractedAuthor = authorMatch[1].replace(/[^a-zA-Z\s,.-]/g, '').trim();
        break;
      }
    }

    if (lines.length > 0 && lines[0].length > 4 && lines[0].length < 100) {
      extractedTitle = lines[0].replace(/^#+\s*/, '');
    }

    return {
      title: extractedTitle,
      author: extractedAuthor || 'Autor a especificar',
      categories: ['Geral'],
      confidence: extractedAuthor ? 0.7 : 0.5,
      summary: `Documento de referência: ${defaultTitle}`,
    };
  }

  private getFallbackMetadata(cleanFilename: string): ExtractedDocumentMetadata {
    return {
      title: cleanFilename,
      author: '',
      categories: ['Geral'],
      confidence: 0.3,
      summary: `Documento didático: ${cleanFilename}`,
    };
  }
}

export const documentInspectorService = new DocumentInspectorService();
