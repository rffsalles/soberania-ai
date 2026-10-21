import { aiProvider, type InferenceTelemetry, type StreamChunk } from './ai-provider';

export type { InferenceTelemetry, StreamChunk };

/**
 * Cliente de Inferência Local vLLM do Appliance On-Premises
 * integrado ao AI Provider Gateway Multi-Provedor.
 */
export class VLLMLocalClient {
  /**
   * Gera streaming de tokens socráticos com telemetria
   */
  async *streamInference(
    prompt: string,
    systemPrompt: string,
    citation?: string
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const stream = aiProvider.streamChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      { citation }
    );

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}

export const vllmClient = new VLLMLocalClient();
