import type { StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import type { AIMessage } from '@/lib/ai-provider';

export type CollectStreamOptions = { temperature: number; maxTokens: number };

/** Consome o stream do LLM acumulando os tokens; `fallback` indica que algum chunk veio do provider de fallback. Não captura exceções. */
export async function collectStream(
  streamChat: StreamChatFn,
  messages: AIMessage[],
  options: CollectStreamOptions
): Promise<{ text: string; fallback: boolean }> {
  let text = '';
  let fallback = false;
  for await (const chunk of streamChat(messages, options)) {
    text += chunk.token;
    if (chunk.fallback) fallback = true;
  }
  return { text, fallback };
}
