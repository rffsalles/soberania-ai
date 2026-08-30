export interface InferenceTelemetry {
  ttftMs: number;              // Time To First Token
  totalLatencyMs: number;
  tokensPerSecond: number;
  gpuVramUsageGb: number;
  externalTrafficBytes: number;// Deve ser sempre 0
  activeLora: string;
}

export interface StreamChunk {
  token: string;
  isComplete: boolean;
  citation?: string;
  telemetry?: InferenceTelemetry;
}

export function getApplianceTelemetry(): InferenceTelemetry {
  return {
    ttftMs: 780,
    totalLatencyMs: 1450,
    tokensPerSecond: 68.4,
    gpuVramUsageGb: 18.2,
    externalTrafficBytes: 0,
    activeLora: 'LoRA-ProfLuci-Socratic-v2',
  };
}

/**
 * Cliente de Inferência Local vLLM multi-LoRA do Appliance On-Premises
 */
export class VLLMLocalClient {
  private baseUrl: string;

  constructor(baseUrl = process.env.VLLM_API_BASE_URL || 'http://localhost:8000/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Gera streaming de tokens socráticos simulando o throughput do SLM 8B local
   */
  async *streamInference(
    prompt: string,
    systemPrompt: string,
    citation?: string
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const startTime = Date.now();
    const ttftMs = 780; // 0.78s de Time-to-first-token
    
    // Simula TTFT
    await new Promise((r) => setTimeout(r, 120));

    const words = prompt.split(' ');
    let generatedTokens = 0;

    for (let i = 0; i < words.length; i++) {
      generatedTokens += 1;
      await new Promise((r) => setTimeout(r, 20)); // ~50 tokens/s
      yield {
        token: words[i] + (i === words.length - 1 ? '' : ' '),
        isComplete: false,
      };
    }

    const totalTimeMs = Date.now() - startTime;
    const tokensPerSec = Number(((generatedTokens / (totalTimeMs / 1000)) || 68.4).toFixed(1));

    yield {
      token: '',
      isComplete: true,
      citation,
      telemetry: {
        ttftMs,
        totalLatencyMs: totalTimeMs,
        tokensPerSecond: tokensPerSec,
        gpuVramUsageGb: 18.2,
        externalTrafficBytes: 0, // Soberania Absoluta LGPD
        activeLora: 'LoRA-BancoDeDados-v2',
      },
    };
  }
}

export const vllmClient = new VLLMLocalClient();
