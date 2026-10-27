import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { aiProvider, type InferenceTelemetry } from '../ai-provider';

describe('AI Provider Gateway', () => {
  it('deve retornar metadados do provedor configurado', () => {
    const info = aiProvider.getProviderInfo();
    expect(info.provider).toBeDefined();
    expect(info.baseUrl).toBeDefined();
    expect(info.model).toBeDefined();
  });

  it('deve realizar streaming de tokens com telemetria pedagógica', async () => {
    const stream = aiProvider.streamChat(
      [
        { role: 'system', content: 'Você é a Tutora Lucy em apoio ao Professor Responsável.' },
        { role: 'user', content: 'Como funciona o INNER JOIN na prática?' },
      ],
      { citation: '[Sistemas de Banco de Dados · Cap. 4, pág. 58]' }
    );

    let accumulated = '';
    let completedChunk: unknown = null;

    for await (const chunk of stream) {
      if (chunk.token) {
        accumulated += chunk.token;
      }
      if (chunk.isComplete) {
        completedChunk = chunk;
      }
    }

    expect(accumulated.length).toBeGreaterThan(20);
    expect(completedChunk).toBeDefined();
    
    // Telemetria
    const finalChunk = completedChunk as {
      citation?: string;
      telemetry?: {
        ttftMs: number;
        tokensPerSecond: number;
        externalTrafficBytes: number;
      };
    };
    expect(finalChunk.citation).toBe('[Sistemas de Banco de Dados · Cap. 4, pág. 58]');
    expect(finalChunk.telemetry?.ttftMs).toBeGreaterThan(0);
    expect(finalChunk.telemetry?.tokensPerSecond).toBeGreaterThan(0);
    expect(finalChunk.telemetry?.externalTrafficBytes).toBe(0);
  });

  describe('telemetria de provedor real', () => {
    const env = { ...process.env };
    afterEach(() => {
      vi.unstubAllGlobals();
      process.env = { ...env };
    });

    function sseResponse(lines: string[]) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(lines.map((l) => `data: ${l}\n\n`).join(''));
      return { bytes: payload.byteLength, response: new Response(payload, { status: 200 }) };
    }

    it('mede bytes externos reais (pedido + resposta) e usa o usage do provedor, sem preenchimentos fixos', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.AI_API_KEY = 'k';
      process.env.AI_BASE_URL = 'https://api.example.test/v1';
      const { bytes: responseBytes, response } = sseResponse([
        JSON.stringify({ choices: [{ delta: { content: 'Olá' } }] }),
        JSON.stringify({ choices: [{ delta: { content: ' mundo' } }] }),
        JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 } }),
        '[DONE]',
      ]);
      let requestBytes = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          requestBytes = new TextEncoder().encode(String(init.body)).byteLength;
          return response;
        })
      );
      let telemetry: InferenceTelemetry | undefined;
      for await (const chunk of aiProvider.streamChat([{ role: 'user', content: 'oi' }])) {
        if (chunk.telemetry) telemetry = chunk.telemetry;
      }
      expect(telemetry).toBeDefined();
      expect(telemetry!.promptTokens).toBe(12);
      expect(telemetry!.completionTokens).toBe(2);
      expect(telemetry!.totalTokens).toBe(14);
      expect(telemetry!.externalTrafficBytes).toBe(requestBytes + responseBytes);
      expect(requestBytes).toBeGreaterThan(0);
    });

    it('sem usage do provedor, conta os tokens recebidos e deixa prompt/total em zero em vez de inventar', async () => {
      process.env.AI_PROVIDER = 'groq';
      process.env.AI_API_KEY = 'k';
      process.env.AI_BASE_URL = 'https://api.example.test/v1';
      const { response } = sseResponse([JSON.stringify({ choices: [{ delta: { content: 'x' } }] }), '[DONE]']);
      vi.stubGlobal('fetch', vi.fn(async () => response));
      let telemetry: InferenceTelemetry | undefined;
      for await (const chunk of aiProvider.streamChat([{ role: 'user', content: 'oi' }])) {
        if (chunk.telemetry) telemetry = chunk.telemetry;
      }
      expect(telemetry!.completionTokens).toBe(1);
      expect(telemetry!.promptTokens).toBe(0);
      expect(telemetry!.totalTokens).toBe(0);
    });
  });

  describe('erros do provedor (429 e demais)', () => {
    const env = { ...process.env };
    beforeEach(() => {
      process.env.AI_PROVIDER = 'groq';
      process.env.AI_API_KEY = 'k';
      process.env.AI_BASE_URL = 'https://api.example.test/v1';
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      process.env = { ...env };
    });

    const rateLimitBody = (message: string) =>
      JSON.stringify({ error: { message, type: 'tokens', code: 'rate_limit_exceeded' } });
    const okResponse = () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Olá' } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200 },
      );

    async function collect() {
      const done = (async () => {
        const chunks = [];
        for await (const chunk of aiProvider.streamChat([{ role: 'user', content: 'oi' }])) chunks.push(chunk);
        return chunks;
      })();
      await vi.runAllTimersAsync();
      return done;
    }

    it('429 com retry-after dentro do teto: espera e refaz a chamada uma vez, sem fallback', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(rateLimitBody('Rate limit reached. Please try again in 1.5s.'), {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        )
        .mockResolvedValueOnce(okResponse());
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(chunks.some((c) => c.fallback)).toBe(false);
      expect(chunks.map((c) => c.token).join('')).toBe('Olá');
    });

    it('429 sem cabeçalho: lê o atraso do corpo ("try again in 10.32s")', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(rateLimitBody('Rate limit reached ... Please try again in 10.32s. Visit ...'), { status: 429 }),
        )
        .mockResolvedValueOnce(okResponse());
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(chunks.some((c) => c.fallback)).toBe(false);
    });

    it('429 que se repete na segunda tentativa cai no fallback com rate_limit', async () => {
      const fetchMock = vi.fn(
        async () => new Response(rateLimitBody('x'), { status: 429, headers: { 'retry-after': '1' } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(chunks.every((c) => c.fallback && c.fallbackReason === 'rate_limit')).toBe(true);
    });

    it('429 "Request too large": não repete e cai no fallback com rate_limit', async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(rateLimitBody('Request too large for model on output tokens per minute (OTPM): Limit 1000, Requested 1566.'), {
            status: 429,
            headers: { 'retry-after': '1' },
          }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every((c) => c.fallback === true && c.fallbackReason === 'rate_limit')).toBe(true);
    });

    it('429 com atraso acima do teto: não repete e cai no fallback com rate_limit', async () => {
      const fetchMock = vi.fn(
        async () => new Response(rateLimitBody('x'), { status: 429, headers: { 'retry-after': '60' } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chunks.every((c) => c.fallback && c.fallbackReason === 'rate_limit')).toBe(true);
    });

    it('429 sem atraso identificável: não repete', async () => {
      const fetchMock = vi.fn(async () => new Response('limite', { status: 429 }));
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chunks.every((c) => c.fallbackReason === 'rate_limit')).toBe(true);
    });

    it('500 cai no fallback com provider_error, sem repetir', async () => {
      const fetchMock = vi.fn(async () => new Response('erro', { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);
      const chunks = await collect();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(chunks.every((c) => c.fallback && c.fallbackReason === 'provider_error')).toBe(true);
    });

    it('erro de rede cai no fallback com provider_error', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
      const chunks = await collect();
      expect(chunks.every((c) => c.fallback && c.fallbackReason === 'provider_error')).toBe(true);
    });
  });
});
