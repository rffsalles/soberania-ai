import { describe, it, expect, vi } from 'vitest';
import { collectStream } from '../collect-stream';
import type { StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import type { AIMessage } from '@/lib/ai-provider';

const messages: AIMessage[] = [{ role: 'user', content: 'oi' }];

function streamOf(chunks: Array<{ token: string; fallback?: boolean }>): StreamChatFn {
  return vi.fn(async function* () {
    for (const c of chunks) yield c;
  }) as unknown as StreamChatFn;
}

describe('collectStream', () => {
  it('concatena os tokens e repassa temperature e maxTokens', async () => {
    const streamChat = streamOf([{ token: 'a' }, { token: 'b' }]);
    const result = await collectStream(streamChat, messages, { temperature: 0.2, maxTokens: 100 });
    expect(result).toEqual({ text: 'ab', fallback: false });
    expect(streamChat).toHaveBeenCalledWith(messages, { temperature: 0.2, maxTokens: 100 });
  });

  it('qualquer chunk com fallback marca fallback', async () => {
    const streamChat = streamOf([
      { token: 'x', fallback: false },
      { token: 'y', fallback: true },
    ]);
    const result = await collectStream(streamChat, messages, { temperature: 0.2, maxTokens: 100 });
    expect(result).toEqual({ text: 'xy', fallback: true });
  });

  it('exceção do stream propaga', async () => {
    const streamChat = vi.fn(async function* () {
      yield { token: 'a' };
      throw new Error('boom');
    }) as unknown as StreamChatFn;
    await expect(collectStream(streamChat, messages, { temperature: 0.2, maxTokens: 100 })).rejects.toThrow('boom');
  });
});
