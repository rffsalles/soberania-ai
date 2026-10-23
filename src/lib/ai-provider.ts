/**
 * AI Provider Gateway - Soberania AI
 * 
 * Suporte unificado para inferência de SLMs (Small Language Models 3B a 8B)
 * compatível com a API padrão da OpenAI (/v1/chat/completions).
 * 
 * Provedores suportados:
 * - "groq": Inferência em Nuvem ultra-rápida (LPUs, 300-700 tokens/s)
 * - "together": Nuvem Serverless para modelos Open Source (Llama, Qwen)
 * - "ollama": Execução Local na máquina do desenvolvedor (offline, R$ 0)
 * - "vllm": Motor nativo do Appliance Físico On-Premises (Produção / Homologação)
 */

export type AIProviderType = 'groq' | 'together' | 'ollama' | 'vllm' | 'mock';

/** Provedores que rodam dentro do appliance: nenhum dado sai da rede da instituição. */
export const LOCAL_PROVIDERS: readonly AIProviderType[] = ['vllm', 'ollama'];
export function isLocalProvider(provider: string): boolean {
  return (LOCAL_PROVIDERS as readonly string[]).includes(provider);
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceTelemetry {
  ttftMs: number;               // Time to First Token
  totalLatencyMs: number;
  tokensPerSecond: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  provider: AIProviderType;
  model: string;
  externalTrafficBytes: number; // 0 quando on-premises/local
  gpuVramUsageGb?: number;
  activeLora?: string;
}

export interface StreamChunk {
  token: string;
  isComplete: boolean;
  citation?: string;
  telemetry?: InferenceTelemetry;
  /** true quando o stream veio do modo determinístico (provider mock/indisponível) */
  fallback?: boolean;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  citation?: string;
  loraAdapter?: string;
  /** Chamado uma vez com a telemetria final (caminho real e fallback) */
  onTelemetry?: (telemetry: InferenceTelemetry) => void;
}

export class AIProviderGateway {
  private get provider(): AIProviderType {
    return (process.env.AI_PROVIDER as AIProviderType) || 'mock';
  }

  private get baseUrl(): string {
    return process.env.AI_BASE_URL || this.getDefaultBaseUrl(this.provider);
  }

  private get apiKey(): string {
    return process.env.AI_API_KEY || '';
  }

  private get model(): string {
    return process.env.AI_MODEL || this.getDefaultModel(this.provider);
  }

  private getDefaultBaseUrl(provider: AIProviderType): string {
    switch (provider) {
      case 'groq':
        return 'https://api.groq.com/openai/v1';
      case 'together':
        return 'https://api.together.xyz/v1';
      case 'ollama':
        return 'http://localhost:11434/v1';
      case 'vllm':
        return 'http://localhost:8000/v1';
      default:
        return 'http://localhost:8000/v1';
    }
  }

  private getDefaultModel(provider: AIProviderType): string {
    switch (provider) {
      case 'groq':
        return 'qwen/qwen3.8-27b';
      case 'together':
        return 'meta-llama/Llama-3.2-3B-Instruct-Turbo';
      case 'ollama':
        return 'llama3.2:3b';
      case 'vllm':
        return 'Qwen/Qwen2.5-7B-Instruct-AWQ';
      default:
        return 'Soberania-SLM-8B-Socratic';
    }
  }

  /** Configuração efetiva do provedor (inclui a chave: não serializar para o cliente). */
  public getProviderConfig() {
    return {
      provider: this.provider,
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
    };
  }

  public getProviderInfo() {
    return {
      provider: this.provider,
      baseUrl: this.baseUrl,
      model: this.model,
      isConfigured: Boolean(this.apiKey || this.provider === 'ollama' || this.provider === 'vllm'),
    };
  }

  /**
   * Gera streaming de tokens em tempo real.
   * Se a API externa/local estiver disponível, consome SSE real.
   * Se estiver em modo mock ou offline, simula o streaming pedagógico determinístico.
   */
  async *streamChat(
    messages: AIMessage[],
    options: AICompletionOptions = {}
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const startTime = Date.now();
    let ttftRecorded = false;
    let ttftMs = 0;
    let generatedText = '';
    let tokenCount = 0;
    // Medido, não estimado: bytes do corpo enviado + bytes recebidos do provedor.
    let requestBytes = 0;
    let responseBytes = 0;
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;

    const currentProvider = this.provider;
    const currentApiKey = this.apiKey;
    const currentBaseUrl = this.baseUrl;
    const currentModel = this.model;

    const isLiveProvider =
      currentProvider !== 'mock' &&
      (Boolean(currentApiKey) || currentProvider === 'ollama' || currentProvider === 'vllm');

    if (isLiveProvider) {
      try {
        console.log(`[AIProvider] Chamando ${currentProvider.toUpperCase()} (${currentModel}) em ${currentBaseUrl}...`);
        const requestInit: RequestInit & { dispatcher?: unknown } = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentApiKey ? { Authorization: `Bearer ${currentApiKey}` } : {}),
          },
          body: JSON.stringify({
            model: currentModel,
            messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 512,
            stream: true,
            // Provedores compatíveis com OpenAI devolvem `usage` no último chunk quando solicitado.
            stream_options: { include_usage: true },
          }),
        };
        requestBytes = new TextEncoder().encode(String(requestInit.body)).byteLength;
        let doFetch: typeof fetch = fetch;
        // Só aceita certificado autoassinado quando explicitamente habilitado (afeta apenas esta chamada).
        if (process.env.AI_ALLOW_INSECURE_TLS === 'true') {
          // import dinâmico fora do bundle: undici é exclusivo do servidor (este módulo também é alcançado pelo cliente).
          // O fetch vem do mesmo pacote do Agent, pois o fetch global do Node embute outra versão do undici.
          const { Agent, fetch: undiciFetch } = await import(/* webpackIgnore: true */ 'undici');
          requestInit.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
          doFetch = undiciFetch as unknown as typeof fetch;
        }
        const response = await doFetch(`${currentBaseUrl}/chat/completions`, requestInit);

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[AIProvider Error ${response.status}] ${currentProvider}: ${errText}`);
        }

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!ttftRecorded) {
              ttftMs = Date.now() - startTime;
              ttftRecorded = true;
            }

            responseBytes += value.byteLength;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                const u = parsed.usage ?? parsed.x_groq?.usage;
                if (u && typeof u.completion_tokens === 'number') {
                  usage = {
                    promptTokens: Number(u.prompt_tokens ?? 0),
                    completionTokens: Number(u.completion_tokens),
                    totalTokens: Number(u.total_tokens ?? 0),
                  };
                }
                const deltaToken = parsed.choices?.[0]?.delta?.content || '';
                if (deltaToken) {
                  tokenCount++;
                  generatedText += deltaToken;
                  yield {
                    token: deltaToken,
                    isComplete: false,
                  };
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }

          const totalLatencyMs = Date.now() - startTime;
          const tokensPerSec = totalLatencyMs > 0 ? Number((tokenCount / (totalLatencyMs / 1000)).toFixed(1)) : 0;

          console.log(`[AIProvider Success] Sucesso Groq/Provider (${tokenCount} tokens gerados em ${totalLatencyMs}ms)`);

          // Sem `usage` do provedor: só o que foi contado de fato (prompt/total ficam 0, nunca estimados).
          const realTelemetry: InferenceTelemetry = {
            ttftMs,
            totalLatencyMs,
            tokensPerSecond: tokensPerSec,
            promptTokens: usage?.promptTokens ?? 0,
            completionTokens: usage?.completionTokens ?? tokenCount,
            totalTokens: usage?.totalTokens ?? 0,
            provider: currentProvider,
            model: currentModel,
            externalTrafficBytes: isLocalProvider(currentProvider) ? 0 : requestBytes + responseBytes,
          };
          options.onTelemetry?.(realTelemetry);
          yield {
            token: '',
            isComplete: true,
            citation: options.citation,
            telemetry: realTelemetry,
          };
          return;
        }
      } catch (err) {
        console.error(`[AIProvider Exception] Falha ao conectar ao provedor ${currentProvider}:`, err);
      }
    }

    // Fallback: Streaming Socrático Determinado para testes e ambiente offline
    const promptMessage = messages.find((m) => m.role === 'user')?.content || '';
    const fallbackWords = this.getDeterministicSocraticTokens(promptMessage, options.citation);
    
    await new Promise((resolve) => setTimeout(resolve, 80));
    ttftMs = Date.now() - startTime;

    for (let i = 0; i < fallbackWords.length; i++) {
      tokenCount++;
      const word = fallbackWords[i];
      await new Promise((resolve) => setTimeout(resolve, 20)); // ~50 tokens/s
      yield {
        token: word + (i === fallbackWords.length - 1 ? '' : ' '),
        isComplete: false,
        fallback: true,
      };
    }

    const totalLatencyMs = Date.now() - startTime;
    const tokensPerSec = totalLatencyMs > 0 ? Number((tokenCount / (totalLatencyMs / 1000)).toFixed(1)) : 0;

    const fallbackTelemetry: InferenceTelemetry = {
      ttftMs,
      totalLatencyMs,
      tokensPerSecond: tokensPerSec,
      promptTokens: promptMessage.split(' ').length,
      completionTokens: tokenCount,
      totalTokens: promptMessage.split(' ').length + tokenCount,
      provider: this.provider,
      model: this.model,
      externalTrafficBytes: 0, // 100% On-Premises
    };
    options.onTelemetry?.(fallbackTelemetry);
    yield {
      token: '',
      isComplete: true,
      citation: options.citation,
      telemetry: fallbackTelemetry,
      fallback: true,
    };
  }

  /**
   * Resposta socrática determinística para testes pedagógicos sem dependência de API
   */
  private getDeterministicSocraticTokens(userPrompt: string, citation?: string): string[] {
    const p = userPrompt.toLowerCase();
    let text = '';

    if (p.includes('join') || p.includes('tabela')) {
      text = `Excelente reflexão! Vamos examinar a diferença essencial: o INNER JOIN descarta qualquer registro que não tenha par correspondente em ambas as tabelas. Já o LEFT JOIN preserva integralmente as tuplas da tabela primária, completando com NULL onde não houver correspondência. Se estivermos gerando a lista oficial de chamada de alunos, você usaria INNER JOIN ou LEFT JOIN com a tabela de presenças?`;
    } else if (p.includes('3fn') || p.includes('normalizacao') || p.includes('normalização')) {
      text = `Ótima colocação! Na Terceira Forma Normal (3FN), nenhum atributo não-chave pode depender de outro atributo não-chave. Pense em um cadastro com Código do Aluno, CEP e Nome da Cidade. O Nome da Cidade depende do Aluno ou do CEP? Como você separaria essas tabelas para evitar redundância?`;
    } else if (p.includes('acid') || p.includes('transacao') || p.includes('transação')) {
      text = `Perfeito! As propriedades ACID são o pilar dos bancos relacionais: Atomicidade (tudo ou nada), Consistência (regras de integridade respeitadas), Isolamento (transações concorrentes não interferem entre si) e Durabilidade (dados gravados persistem mesmo após falha). O que aconteceria em uma transferência bancária se o sistema falhasse logo após o débito sem o crédito?`;
    } else {
      text = `Muito bem colocado! Analisando a nossa bibliografia institucional ${citation ? `em ${citation}` : 'oficial'}: o conceito estrutural é a chave para construir sistemas escaláveis e seguros. Como você aplicaria essa definição no cenário da nossa aula de hoje?`;
    }

    return text.split(' ');
  }
}

export const aiProvider = new AIProviderGateway();
