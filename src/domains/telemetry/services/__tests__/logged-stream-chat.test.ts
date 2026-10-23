import { describe, it, expect, vi } from 'vitest';
import type { AIMessage, AICompletionOptions, InferenceTelemetry, StreamChunk } from '@/lib/ai-provider';
import { createLoggedStreamChat } from '../logged-stream-chat';

const telemetry: InferenceTelemetry = {
  ttftMs: 120.4,
  totalLatencyMs: 900.6,
  tokensPerSecond: 33.3,
  promptTokens: 40,
  completionTokens: 30,
  totalTokens: 70,
  provider: 'groq',
  model: 'qwen',
  externalTrafficBytes: 2048.2,
};

function fakeStream(fallback: boolean) {
  return vi.fn(async function* (_m: AIMessage[], options: AICompletionOptions = {}): AsyncGenerator<StreamChunk> {
    yield { token: 'olá ', isComplete: false, fallback };
    yield { token: 'mundo', isComplete: false, fallback };
    options.onTelemetry?.(telemetry);
    yield { token: '', isComplete: true, telemetry, fallback };
  });
}

describe('createLoggedStreamChat', () => {
  it('repassa os tokens e grava um InferenceLog com a telemetria da chamada', async () => {
    const createInferenceLog = vi.fn(async () => ({ id: 'log1' }));
    const streamChat = createLoggedStreamChat({ streamChat: fakeStream(false), createInferenceLog });
    let text = '';
    for await (const chunk of streamChat([{ role: 'user', content: 'oi' }], { temperature: 0.2 })) text += chunk.token;
    expect(text).toBe('olá mundo');
    expect(createInferenceLog).toHaveBeenCalledTimes(1);
    expect(createInferenceLog).toHaveBeenCalledWith({
      provider: 'groq',
      model: 'qwen',
      ttftMs: 120,
      totalLatencyMs: 901,
      tokensPerSecond: 33.3,
      promptTokens: 40,
      completionTokens: 30,
      externalTrafficBytes: 2048,
      fallback: false,
      agendaType: null,
    });
  });

  it('marca fallback e aceita um agendaType para atribuição', async () => {
    const createInferenceLog = vi.fn(async () => ({ id: 'log1' }));
    const streamChat = createLoggedStreamChat({ streamChat: fakeStream(true), createInferenceLog }, 'OFFICE_HOURS');
    for await (const _ of streamChat([{ role: 'user', content: 'oi' }])) { /* consome */ }
    expect(createInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ fallback: true, agendaType: 'OFFICE_HOURS' }));
  });

  it('falha ao gravar o log não interrompe o stream', async () => {
    const createInferenceLog = vi.fn(async () => { throw new Error('db down'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const streamChat = createLoggedStreamChat({ streamChat: fakeStream(false), createInferenceLog });
    let text = '';
    for await (const chunk of streamChat([{ role: 'user', content: 'oi' }])) text += chunk.token;
    expect(text).toBe('olá mundo');
    warn.mockRestore();
  });

  it('não repassa onTelemetry do chamador duas vezes: o chamador ainda recebe a telemetria', async () => {
    const createInferenceLog = vi.fn(async () => ({ id: 'log1' }));
    const onTelemetry = vi.fn();
    const streamChat = createLoggedStreamChat({ streamChat: fakeStream(false), createInferenceLog });
    for await (const _ of streamChat([{ role: 'user', content: 'oi' }], { onTelemetry })) { /* consome */ }
    expect(onTelemetry).toHaveBeenCalledWith(telemetry);
  });
});
