import { describe, it, expect, vi, afterEach } from 'vitest';
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
});
