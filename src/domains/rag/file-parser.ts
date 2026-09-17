import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { RawDocumentPage, ParsedDocumentResult } from './types';
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

/**
 * Realiza a extração de conteúdo estruturado de documentos (PDF, DOCX, TXT, MD)
 * Executa fallback automático de OCR se o texto vetorial do PDF for escaneado/vazio
 */
export async function parseDocumentFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocumentResult> {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  const pages: RawDocumentPage[] = [];
  let isOcrApplied = false;

  if (ext === 'pdf') {
    const PDFParseConstructor = (typeof PDFParse === 'function' ? PDFParse : (PDFParse as { PDFParse?: new (opts: { data: Buffer }) => PDFParse })?.PDFParse) || PDFParse;
    const parser = new PDFParseConstructor({ data: buffer });
    try {
      const textResult = await parser.getText();
      const numPages = textResult.total || (textResult.pages ? textResult.pages.length : 1);

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

      // Detecção de PDF escaneado (baixa densidade de caracteres por página)
      const avgCharsPerPage = pages.length > 0 ? totalCharCount / pages.length : 0;
      if (avgCharsPerPage < 40 && ocrService.isOcrEnabled()) {
        try {
          const ocrText = await ocrService.recognizeText(buffer);
          if (ocrText && ocrText.length > totalCharCount) {
            isOcrApplied = true;
            pages.length = 0;
            const pageSize = 1200;
            let pNum = 1;
            for (let i = 0; i < ocrText.length; i += pageSize) {
              pages.push({
                pageNumber: pNum++,
                chapter: `Página OCR ${pNum - 1}`,
                section: 'Texto Reconhecido por OCR',
                text: ocrText.slice(i, i + pageSize).trim(),
              });
            }
          }
        } catch (ocrError) {
          console.warn('[parseDocumentFile] Advertência: OCR não pôde processar a imagem do PDF:', ocrError);
        }
      }

      await parser.destroy().catch(() => {});

      return {
        totalPages: pages.length || numPages || 1,
        pages: pages.length > 0 ? pages : [{
          pageNumber: 1,
          chapter: 'Documento Completo',
          section: 'Texto Principal',
          text: (textResult.text || '').trim() || `Documento PDF: ${filename}`,
        }],
        isOcrApplied,
        detectedMimeType: 'application/pdf',
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

      if (currentText.length + cleanPara.length > 1000 && currentText.length > 0) {
        pages.push({
          pageNumber: currentPage++,
          chapter: `Seção ${currentPage - 1}`,
          section: `Página ${currentPage - 1}`,
          text: currentText.trim(),
        });
        currentText = cleanPara;
      } else {
        currentText = currentText ? `${currentText}\n\n${cleanPara}` : cleanPara;
      }
    }

    if (currentText.trim()) {
      pages.push({
        pageNumber: currentPage,
        chapter: `Seção ${currentPage}`,
        section: `Página ${currentPage}`,
        text: currentText.trim(),
      });
    }

    return {
      totalPages: pages.length || 1,
      pages: pages.length > 0 ? pages : [{
        pageNumber: 1,
        chapter: 'Documento Word',
        section: 'Texto Principal',
        text: fullText || `Documento DOCX: ${filename}`,
      }],
      isOcrApplied: false,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // TXT ou Markdown
  const textContent = buffer.toString('utf-8').trim();
  const chunkSize = 1200;
  let pageNum = 1;

  for (let i = 0; i < textContent.length; i += chunkSize) {
    pages.push({
      pageNumber: pageNum++,
      chapter: ext === 'md' ? 'Notas / Documentação' : 'Texto',
      section: `Página ${pageNum - 1}`,
      text: textContent.slice(i, i + chunkSize).trim(),
    });
  }

  return {
    totalPages: pages.length || 1,
    pages: pages.length > 0 ? pages : [{
      pageNumber: 1,
      chapter: 'Texto',
      section: 'Documento',
      text: textContent || filename,
    }],
    isOcrApplied: false,
    detectedMimeType: ext === 'md' ? 'text/markdown' : 'text/plain',
  };
}
