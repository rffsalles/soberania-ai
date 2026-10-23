import { createWorker } from 'tesseract.js';

export interface OcrOptions {
  languages?: string;
  /** Tempo máximo por página. */
  timeoutMs?: number;
}

const DEFAULT_LANGUAGES = 'por+eng';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_PAGES = 30;

/**
 * Serviço de OCR para digitalização e reconhecimento de caracteres em imagens e scans
 * Suporta dicionários em Português e Inglês para preservação de acervos didáticos
 */
export class OcrService {
  /**
   * Reconhece texto de várias imagens de página (PNG/JPEG) com um único worker,
   * devolvendo o texto de cada imagem na mesma ordem. O worker é encerrado mesmo em falha.
   */
  public async recognizePages(images: Uint8Array[], options: OcrOptions = {}): Promise<string[]> {
    if (images.length === 0) return [];
    const languages = options.languages || DEFAULT_LANGUAGES;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    const worker = await createWorker(languages);
    try {
      const texts: string[] = [];
      for (const image of images) {
        const { data } = await withTimeout(worker.recognize(Buffer.from(image)), timeoutMs);
        texts.push((data.text || '').trim());
      }
      return texts;
    } catch (error) {
      console.error('[OcrService] Falha no reconhecimento OCR:', error);
      throw error;
    } finally {
      await worker.terminate().catch(() => {});
    }
  }

  /**
   * Reconhece texto a partir de um buffer de imagem
   */
  public async recognizeText(imageBuffer: Buffer, options: OcrOptions = {}): Promise<string> {
    const [text] = await this.recognizePages([new Uint8Array(imageBuffer)], options);
    return text ?? '';
  }

  /**
   * Verifica se o OCR está habilitado nas configurações do sistema
   */
  public isOcrEnabled(): boolean {
    return process.env.ENABLE_OCR === 'true';
  }

  /** Limite de páginas renderizadas e reconhecidas por documento (OCR_MAX_PAGES, padrão 30). */
  public maxPages(): number {
    const parsed = parseInt(process.env.OCR_MAX_PAGES || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[OcrService] Timeout de processamento excedido (${timeoutMs}ms)`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const ocrService = new OcrService();
