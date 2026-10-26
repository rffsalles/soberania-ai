import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { RawDocumentPage, ParsedDocumentResult, ParseDocumentOptions, OutlineEntry, PdfNavigation } from './types';
import { ocrService } from './ocr-service';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedFilename: string;
  extension: string;
  mimeType: string;
}

/**
 * Validação de integridade e segurança de arquivos
 * Verifica extensões permitidas, limite de tamanho e assinaturas de Magic Bytes
 */
export function validateFileSafety(
  buffer: Buffer,
  originalFilename: string
): FileValidationResult {
  const maxMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '25', 10);
  const maxBytes = maxMb * 1024 * 1024;

  if (buffer.length > maxBytes) {
    return {
      isValid: false,
      error: `Arquivo excede o limite máximo permitido de ${maxMb}MB.`,
      sanitizedFilename: '',
      extension: '',
      mimeType: '',
    };
  }

  const allowedExts = (process.env.ALLOWED_DOCUMENT_EXTENSIONS || 'pdf,docx,txt,md')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim().replace(/^\./, ''));

  const parsedPath = path.parse(originalFilename);
  const ext = parsedPath.ext.toLowerCase().replace(/^\./, '');

  if (!allowedExts.includes(ext)) {
    return {
      isValid: false,
      error: `Extensão .${ext} não permitida. Extensões aceitas: ${allowedExts.join(', ')}.`,
      sanitizedFilename: '',
      extension: ext,
      mimeType: '',
    };
  }

  // Sanitização de nome de arquivo contra path traversal
  const safeBaseName = parsedPath.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);

  const sanitizedFilename = `${safeBaseName || 'documento'}.${ext}`;

  // Validação de Magic Bytes para prevenir uploads maliciosos disfarçados
  let detectedMime = 'text/plain';

  if (ext === 'pdf') {
    // Magic bytes: %PDF (0x25 0x50 0x44 0x46)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x25 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x44 ||
      buffer[3] !== 0x46
    ) {
      return {
        isValid: false,
        error: 'Arquivo PDF corrompido ou assinatura de cabeçalho inválida.',
        sanitizedFilename,
        extension: ext,
        mimeType: '',
      };
    }
    detectedMime = 'application/pdf';
  } else if (ext === 'docx') {
    // Magic bytes: PK.. (0x50 0x4B 0x03 0x04)
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4B ||
      buffer[2] !== 0x03 ||
      buffer[3] !== 0x04
    ) {
      return {
        isValid: false,
        error: 'Arquivo DOCX corrompido ou assinatura de pacote inválida.',
        sanitizedFilename,
        extension: ext,
        mimeType: '',
      };
    }
    detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (ext === 'md' || ext === 'txt') {
    // Checagem de ausência de byte nulo no cabeçalho para evitar binários mascarados
    const headerSlice = buffer.slice(0, Math.min(buffer.length, 1024));
    if (headerSlice.includes(0x00)) {
      return {
        isValid: false,
        error: 'O arquivo contém caracteres binários incompatíveis com texto/markdown.',
        sanitizedFilename,
        extension: ext,
        mimeType: '',
      };
    }
    detectedMime = ext === 'md' ? 'text/markdown' : 'text/plain';
  }

  return {
    isValid: true,
    sanitizedFilename,
    extension: ext,
    mimeType: detectedMime,
  };
}

/** Lê Title/Author do dicionário Info do PDF (custo baixo: só metadados, sem páginas). */
async function readPdfInfo(parser: PDFParse): Promise<ParsedDocumentResult['info']> {
  try {
    const infoResult = await parser.getInfo();
    const raw = (infoResult?.info ?? {}) as Record<string, unknown>;
    const title = typeof raw.Title === 'string' ? raw.Title.trim() : '';
    const author = typeof raw.Author === 'string' ? raw.Author.trim() : '';
    if (!title && !author) return undefined;
    return { title: title || undefined, author: author || undefined };
  } catch {
    return undefined;
  }
}

interface PdfDocLike {
  getOutline(): Promise<Array<{ title?: string; dest?: unknown }> | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: { num: number; gen: number }): Promise<number>;
  getPageLabels(): Promise<string[] | null>;
}

async function resolveOutlineDest(doc: PdfDocLike, rawDest: unknown): Promise<number | null> {
  try {
    const dest = typeof rawDest === 'string' ? await doc.getDestination(rawDest) : rawDest;
    if (!Array.isArray(dest) || dest.length === 0) return null;
    const target = dest[0];
    if (typeof target === 'number') return target + 1;
    if (target && typeof target === 'object' && typeof (target as { num?: unknown }).num === 'number') {
      return (await doc.getPageIndex(target as { num: number; gen: number })) + 1;
    }
    return null;
  } catch {
    return null;
  }
}

/** Lê o outline (1º nível) e os rótulos de página do PDF, resolvendo cada bookmark para a página física. */
export async function readPdfNavigation(buffer: Buffer): Promise<PdfNavigation> {
  const PDFParseConstructor = (typeof PDFParse === 'function' ? PDFParse : (PDFParse as { PDFParse?: new (opts: { data: Buffer }) => PDFParse })?.PDFParse) || PDFParse;
  const parser = new PDFParseConstructor({ data: buffer });
  try {
    // `load` é privado em tempo de compilação, mas devolve o documento pdf.js em runtime.
    const doc = await (parser as unknown as { load(): Promise<PdfDocLike> }).load();
    const rawOutline = await doc.getOutline();
    const outline: OutlineEntry[] = [];
    for (const item of Array.isArray(rawOutline) ? rawOutline : []) {
      outline.push({
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        pageNumber: await resolveOutlineDest(doc, item?.dest),
      });
    }
    let pageLabels: string[] | null = null;
    try {
      const labels = await doc.getPageLabels();
      pageLabels = Array.isArray(labels) ? labels : null;
    } catch {
      pageLabels = null;
    }
    return { outline, pageLabels };
  } catch {
    return { outline: [], pageLabels: null };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * Realiza a extração de conteúdo estruturado de documentos (PDF, DOCX, TXT, MD)
 * Executa fallback automático de OCR se o texto vetorial do PDF for escaneado/vazio
 */
/** Formatos sem paginação própria (DOCX, TXT, MD) são fatiados em trechos de tamanho fixo. */
export const SYNTHETIC_PAGE_CHARS_DOCX = 1000;
export const SYNTHETIC_PAGE_CHARS_TEXT = 1200;
function syntheticPage(pageNumber: number, text: string): RawDocumentPage {
  return { pageNumber, chapter: `Trecho ${pageNumber}`, section: `Trecho ${pageNumber}`, text: text.trim() };
}

export async function parseDocumentFile(
  buffer: Buffer,
  filename: string,
  options: ParseDocumentOptions = {}
): Promise<ParsedDocumentResult> {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  const pages: RawDocumentPage[] = [];
  let isOcrApplied = false;
  let ocrPartial = false;

  if (ext === 'pdf') {
    const PDFParseConstructor = (typeof PDFParse === 'function' ? PDFParse : (PDFParse as { PDFParse?: new (opts: { data: Buffer }) => PDFParse })?.PDFParse) || PDFParse;
    const parser = new PDFParseConstructor({ data: buffer });
    try {
      const textResult = await parser.getText(options.maxPages ? { first: options.maxPages } : {});
      const numPages = textResult.total || (textResult.pages ? textResult.pages.length : 1);
      const info = await readPdfInfo(parser);

      let totalCharCount = 0;

      if (Array.isArray(textResult.pages) && textResult.pages.length > 0) {
        textResult.pages.forEach((p: { num?: number; text?: string }, idx: number) => {
          const pageText = (p.text || '').trim();
          totalCharCount += pageText.length;
          pages.push({
            pageNumber: p.num || idx + 1,
            chapter: `Página ${p.num || idx + 1}`,
            section: `Seção ${idx + 1}`,
            text: pageText,
          });
        });
      } else if (typeof textResult.text === 'string') {
        const fullText = textResult.text.trim();
        totalCharCount = fullText.length;
        const splitPages: string[] = fullText.split(/\f/);
        splitPages.forEach((pt: string, idx: number) => {
          if (pt.trim()) {
            pages.push({
              pageNumber: idx + 1,
              chapter: `Página ${idx + 1}`,
              section: `Seção ${idx + 1}`,
              text: pt.trim(),
            });
          }
        });
      }

      // Detecção de PDF escaneado (baixa densidade de caracteres por página):
      const avgCharsPerPage = pages.length > 0 ? totalCharCount / pages.length : 0;
      // renderiza as primeiras OCR_MAX_PAGES páginas em PNG e reconhece cada uma, preservando a numeração.
      if (!options.skipOcr && avgCharsPerPage < 40 && ocrService.isOcrEnabled()) {
        try {
          const limit = ocrService.maxPages();
          const shots = await parser.getScreenshot({ first: limit, scale: 2, imageBuffer: true });
          const texts = await ocrService.recognizePages(shots.pages.map((p) => p.data));
          const ocrPages: RawDocumentPage[] = shots.pages
            .map((p, idx) => ({
              pageNumber: p.pageNumber,
              chapter: `Página ${p.pageNumber}`,
              section: 'Texto Reconhecido por OCR',
              text: (texts[idx] || '').trim(),
            }))
            .filter((p) => p.text);
          const ocrCharCount = ocrPages.reduce((acc, p) => acc + p.text.length, 0);
          if (ocrCharCount > totalCharCount) {
            isOcrApplied = true;
            ocrPartial = (shots.total || numPages) > limit;
            pages.length = 0;
            pages.push(...ocrPages);
            if (ocrPartial) {
              console.warn(`[parseDocumentFile] OCR parcial: ${limit} de ${shots.total || numPages} páginas reconhecidas (OCR_MAX_PAGES).`);
            }
          }
        } catch (ocrError) {
          console.warn('[parseDocumentFile] Advertência: OCR não pôde processar a imagem do PDF:', ocrError);
        }
      }

      await parser.destroy().catch(() => {});

      // Sem texto extraível devolve zero páginas: nada de indexar o nome do arquivo como conteúdo.
      return {
        totalPages: numPages || pages.length,
        pages,
        isOcrApplied,
        ocrPartial,
        detectedMimeType: 'application/pdf',
        info,
      };
    } catch (err) {
      await parser.destroy().catch(() => {});
      console.error('[parseDocumentFile] Erro ao extrair texto do PDF:', err);
      throw err;
    }
  }

  if (ext === 'docx') {
    const rawResult = await mammoth.extractRawText({ buffer });
    const fullText = (rawResult.value || '').trim();

    // Divide em páginas lógicas de ~1000 caracteres respeitando parágrafos
    const paragraphs = fullText.split(/\n\s*\n/);
    let currentPage = 1;
    let currentText = '';

    for (const para of paragraphs) {
      const cleanPara = para.trim();
      if (!cleanPara) continue;

      if (currentText.length + cleanPara.length > SYNTHETIC_PAGE_CHARS_DOCX && currentText.length > 0) {
        pages.push(syntheticPage(currentPage++, currentText));
        currentText = cleanPara;
      } else {
        currentText = currentText ? `${currentText}\n\n${cleanPara}` : cleanPara;
      }
    }

    if (currentText.trim()) pages.push(syntheticPage(currentPage, currentText));

    return {
      totalPages: pages.length,
      pages,
      isOcrApplied: false,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // TXT ou Markdown
  const textContent = buffer.toString('utf-8').trim();
  let pageNum = 1;

  for (let i = 0; i < textContent.length; i += SYNTHETIC_PAGE_CHARS_TEXT) {
    pages.push(syntheticPage(pageNum++, textContent.slice(i, i + SYNTHETIC_PAGE_CHARS_TEXT)));
  }

  return {
    totalPages: pages.length,
    pages,
    isOcrApplied: false,
    detectedMimeType: ext === 'md' ? 'text/markdown' : 'text/plain',
  };
}
