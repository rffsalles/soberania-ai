import { z } from 'zod';
import { parseDocumentFile } from './file-parser';
import { aiProvider } from '@/lib/ai-provider';
import { loggedStreamChat } from '@/domains/telemetry/services/logged-stream-chat';
import type { RawDocumentPage } from './types';

/** De onde vieram título/autor: IA, ficha catalográfica, heurística de linhas ou só o nome do arquivo. */
export type MetadataSource = 'ai' | 'catalog-entry' | 'heuristic' | 'filename';

export interface ExtractedDocumentMetadata {
  title: string;
  author: string;
  /** Nomes de categorias; quando `availableCategories` é informado, só nomes cadastrados. */
  categories: string[];
  /** Categoria nova sugerida pela IA quando nenhuma cadastrada cobre a obra. */
  suggestedCategory?: string;
  source: MetadataSource;
  summary: string;
  /** true somente quando a resposta veio de um provedor de IA real (não mock/fallback). */
  aiApplied: boolean;
}

export interface InspectOptions {
  availableCategories?: string[];
}

/** Páginas sempre enviadas (capa, rosto, ficha, sumário). */
const BASE_PAGES = 4;
/** Até esta página procuramos a ficha catalográfica (ISBN/CDD), comum em livros com apresentação longa. */
const SCAN_UNTIL_PAGE = 8;
/** Orçamento de caracteres por página e total enviado à IA (~1.1k a 1.3k tokens). */
const PER_PAGE_CHARS = 900;
const TOTAL_CHARS = 4000;
const CATALOG_PATTERN = /\bISBN\b|\bCDD\b|\bCDU\b|cataloga[çc][ãa]o/i;

const authorField = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (Array.isArray(v) ? v.map((a) => a.trim()).filter(Boolean).join(', ') : (v ?? '')));

const extractedMetadataSchema = z
  .object({
    title: z.string().default(''),
    author: authorField,
    authors: authorField,
    categories: z.array(z.string()).default([]),
    suggestedCategory: z.string().optional(),
    summary: z.string().default(''),
  })
  .transform((d) => ({ ...d, author: d.author || d.authors }));

type AiMetadata = z.infer<typeof extractedMetadataSchema>;

/**
 * Monta o texto de cabeçalho enviado à IA: páginas 1..4 sempre, mais páginas até a 8 que
 * contenham ficha catalográfica. Cada página é cortada em PER_PAGE_CHARS e o total em TOTAL_CHARS.
 * O corpo do documento nunca é enviado.
 */
export function selectHeaderText(pages: RawDocumentPage[]): string {
  const selected = pages.filter(
    (p, idx) =>
      (p.pageNumber || idx + 1) <= BASE_PAGES ||
      ((p.pageNumber || idx + 1) <= SCAN_UNTIL_PAGE && CATALOG_PATTERN.test(p.text))
  );

  let out = '';
  for (const p of selected) {
    const slice = p.text.trim().slice(0, PER_PAGE_CHARS);
    if (!slice) continue;
    const block = `[Página ${p.pageNumber}]\n${slice}`;
    const remaining = TOTAL_CHARS - out.length;
    if (remaining <= 0) break;
    out += (out ? '\n\n' : '') + block.slice(0, remaining);
  }
  return out.trim();
}

function foldKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Casa categorias devolvidas pela IA com as cadastradas (sem caixa/acento) e separa as desconhecidas. */
export function normalizeCategories(
  candidates: string[],
  available: string[]
): { matched: string[]; unmatched: string[] } {
  const byKey = new Map(available.map((name) => [foldKey(name), name]));
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const raw of candidates) {
    const key = foldKey(raw);
    if (!key) continue;
    const hit = byKey.get(key);
    if (hit) {
      if (!matched.includes(hit)) matched.push(hit);
    } else if (!unmatched.includes(raw.trim())) {
      unmatched.push(raw.trim());
    }
  }
  return { matched, unmatched };
}

export class DocumentInspectorService {
  /**
   * Inspeciona o cabeçalho de um documento (capa, folha de rosto, ficha catalográfica e sumário)
   * para extração de Título, Autores, Categorias e Resumo via IA, sem enviar o corpo da obra.
   */
  public async inspectDocumentHeader(
    buffer: Buffer,
    filename: string,
    options: InspectOptions = {}
  ): Promise<ExtractedDocumentMetadata> {
    const cleanFilename = filename.replace(/\.[^/.]+$/, '').trim();

    try {
      const parseResult = await parseDocumentFile(buffer, filename, {
        maxPages: SCAN_UNTIL_PAGE,
        skipOcr: true,
      });
      const rawHeader = parseResult.pages
        .slice(0, BASE_PAGES)
        .map((p) => p.text.trim())
        .join('\n')
        .trim();
      if (!rawHeader || rawHeader.length < 15 || rawHeader === filename) {
        return this.getFallbackMetadata(cleanFilename);
      }

      const headerText = selectHeaderText(parseResult.pages);

      const aiData = await this.askAi(headerText, filename, parseResult.info, options.availableCategories);

      if (aiData && (aiData.title || aiData.author)) {
        return this.fromAi(aiData, cleanFilename, options.availableCategories);
      }

      return this.heuristicExtraction(headerText, cleanFilename);
    } catch (error) {
      console.warn('[DocumentInspector] Erro ao inspecionar páginas do documento:', error);
      return this.getFallbackMetadata(cleanFilename);
    }
  }

  /** Retorna null quando o provedor é mock, devolve stream de fallback, falha ou não produz JSON. */
  private async askAi(
    headerText: string,
    filename: string,
    info: { title?: string; author?: string } | undefined,
    availableCategories?: string[]
  ): Promise<AiMetadata | null> {
    if (aiProvider.getProviderInfo().provider === 'mock') return null;

    const hasCatalog = Boolean(availableCategories && availableCategories.length > 0);
    const categoriesInstruction = hasCatalog
      ? `3. "categories": Array com 1 a 3 nomes escolhidos EXATAMENTE desta lista de categorias cadastradas: ${JSON.stringify(availableCategories)}. Se nenhuma cobrir a obra, deixe o array vazio.
4. "suggestedCategory": Somente se nenhuma categoria da lista servir, o nome curto de uma nova área de conhecimento (ex: "Matemática"). Caso contrário, omita.`
      : `3. "categories": Array de 1 a 3 áreas temáticas / disciplinas pedagógicas relacionadas.`;

    const hints: string[] = [`Nome do arquivo original: ${filename}`];
    if (info?.title) hints.push(`Título nos metadados do PDF (pode estar errado): ${info.title}`);
    if (info?.author) hints.push(`Autor nos metadados do PDF (pode estar errado): ${info.author}`);

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Você é um bibliotecário especialista em catalogação pedagógica. Analise o texto fornecido (capa, folha de rosto, ficha catalográfica e sumário de um documento) e extraia:
1. "title": Título oficial limpo da obra/artigo (sem códigos de versão ou nomes de arquivo brutos).
2. "author": Nome completo do(s) autor(es) separados por vírgula (ex: "Marco Tulio Valente" ou "Ana Silva, Pedro Santos"). Em livros, o nome do autor costuma aparecer isolado na capa e na ficha catalográfica; não confunda com o título.
${categoriesInstruction}
${hasCatalog ? '5' : '4'}. "summary": Resumo conceitual curto de 1 frase.

Responda EXCLUSIVAMENTE em formato JSON estrito conforme a estrutura:
{"title": "...", "author": "...", "categories": ["..."], "summary": "..."}`,
      },
      {
        role: 'user' as const,
        content: `${hints.join('\n')}\n\nTexto do cabeçalho do documento:\n${headerText}`,
      },
    ];

    let fullResponse = '';
    try {
      const stream = loggedStreamChat(promptMessages, { temperature: 0.1, maxTokens: 400 });
      for await (const chunk of stream) {
        if (chunk.fallback) return null;
        if (chunk.token) fullResponse += chunk.token;
      }
    } catch (aiErr) {
      console.warn('[DocumentInspector] Falha na chamada de IA para extração de metadados:', aiErr);
      return null;
    }

    return this.parseAiJsonResponse(fullResponse);
  }

  private fromAi(
    data: AiMetadata,
    cleanFilename: string,
    availableCategories?: string[]
  ): ExtractedDocumentMetadata {
    let categories = data.categories.map((c) => c.trim()).filter(Boolean);
    let suggestedCategory = data.suggestedCategory?.trim() || undefined;

    if (availableCategories && availableCategories.length > 0) {
      const { matched, unmatched } = normalizeCategories(categories, availableCategories);
      categories = matched;
      suggestedCategory = suggestedCategory || unmatched[0];
    }

    return {
      title: data.title.trim() || cleanFilename,
      author: data.author.trim(),
      categories,
      suggestedCategory,
      source: 'ai',
      summary: data.summary.trim() || `Material didático: ${cleanFilename}`,
      aiApplied: true,
    };
  }

  /**
   * Faz o parse seguro do JSON retornado pela IA
   */
  private parseAiJsonResponse(rawText: string): AiMetadata | null {
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
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^\[Página \d+\]$/.test(l));
    let extractedAuthor = '';
    let extractedTitle = defaultTitle;

    // Ficha catalográfica (padrão ABNT/AACR2): "Título / Autor A e Autor B. – Cidade : Editora, ano."
    const catalogEntry = text.match(/^\s*(.{3,120}?)\s\/\s(.{3,200}?)\.\s+[–-]/m);
    if (catalogEntry) {
      return {
        title: catalogEntry[1].trim(),
        author: catalogEntry[2].trim(),
        categories: [],
        source: 'catalog-entry',
        summary: `Documento de referência: ${defaultTitle}`,
        aiApplied: false,
      };
    }

    for (const line of lines.slice(0, 20)) {
      const authorMatch = line.match(/(?:autor|autores|por|by|escrito por)\s*[:|-]?\s*(.+)/i);
      if (authorMatch && authorMatch[1] && authorMatch[1].length > 3) {
        extractedAuthor = authorMatch[1].replace(/[^\p{L}\s,.-]/gu, '').trim();
        break;
      }
    }

    if (lines.length > 0 && lines[0].length > 4 && lines[0].length < 100) {
      extractedTitle = lines[0].replace(/^#+\s*/, '');
    }

    return {
      title: extractedTitle,
      author: extractedAuthor,
      categories: [],
      source: 'heuristic',
      summary: `Documento de referência: ${defaultTitle}`,
      aiApplied: false,
    };
  }

  private getFallbackMetadata(cleanFilename: string): ExtractedDocumentMetadata {
    return {
      title: cleanFilename,
      author: '',
      categories: [],
      source: 'filename',
      summary: `Documento didático: ${cleanFilename}`,
      aiApplied: false,
    };
  }
}

export const documentInspectorService = new DocumentInspectorService();
