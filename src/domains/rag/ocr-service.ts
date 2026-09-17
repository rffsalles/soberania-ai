import { createWorker } from 'tesseract.js';

export interface OcrOptions {
  languages?: string;
  timeoutMs?: number;
}

const DEFAULT_LANGUAGES = 'por+eng';
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Serviço de OCR para digitalização e reconhecimento de caracteres em imagens e scans
 * Suporta dicionários em Português e Inglês para preservação de acervos didáticos
 */
export class OcrService {
  /**
   * Reconhece texto a partir de um buffer de imagem
   */
  public async recognizeText(
    imageBuffer: Buffer,
    options: OcrOptions = {}
  ): Promise<string> {
    const languages = options.languages || DEFAULT_LANGUAGES;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    const ocrPromise = (async () => {
      let worker;
      try {
        worker = await createWorker(languages);
        const { data } = await worker.recognize(imageBuffer);
        await worker.terminate();
        return (data.text || '').trim();
      } catch (error) {
        if (worker) {
          await worker.terminate().catch(() => {});
        }
        console.error('[OcrService] Falha no reconhecimento OCR:', error);
        throw error;
      }
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[OcrService] Timeout de processamento excedido (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    return Promise.race([ocrPromise, timeoutPromise]);
  }

  /**
   * Verifica se o OCR está habilitado nas configurações do sistema
   */
  public isOcrEnabled(): boolean {
    return process.env.ENABLE_OCR === 'true';
  }
}

export const ocrService = new OcrService();
