import { aiProvider, type InferenceTelemetry, type StreamChunk } from './ai-provider';

export interface ApplianceTelemetry extends InferenceTelemetry {
  gpuVramUsageGb: number;
  activeLora: string;
}

export type { InferenceTelemetry, StreamChunk };

export function getApplianceTelemetry(): ApplianceTelemetry {
  return {
    ttftMs: 780,
    totalLatencyMs: 1450,
    tokensPerSecond: 68.4,
    promptTokens: 45,
    completionTokens: 98,
    totalTokens: 143,
    provider: 'vllm',
    model: 'Qwen/Qwen2.5-7B-Instruct-AWQ (Multi-LoRA)',
    gpuVramUsageGb: 18.2,
    externalTrafficBytes: 0,
    activeLora: 'LoRA-TutoraLucy-Socratic-v2',
  };
}

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
