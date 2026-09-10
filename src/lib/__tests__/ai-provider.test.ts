import { describe, it, expect } from 'vitest';
import { aiProvider } from '../ai-provider';

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
});
