import type { AgendaType } from '@prisma/client';
import { aiProvider, type AICompletionOptions, type AIMessage, type StreamChunk } from '@/lib/ai-provider';
import { createInferenceLog, type InferenceLogInput } from './inference-log-repository';

export type StreamChatFn = (messages: AIMessage[], options?: AICompletionOptions) => AsyncGenerator<StreamChunk>;

export type LoggedStreamChatDeps = {
  streamChat: StreamChatFn;
  createInferenceLog(data: InferenceLogInput): Promise<unknown>;
};

const defaultDeps: LoggedStreamChatDeps = {
  streamChat: (messages, options) => aiProvider.streamChat(messages, options),
  createInferenceLog,
};

/**
 * Envolve `streamChat` gravando um InferenceLog por chamada: a telemetria do appliance
 * ("tráfego externo", chamadas, TTFT) só é verdadeira se toda chamada ao provedor for registrada,
 * não apenas as do chat. A gravação nunca derruba o stream.
 */
export function createLoggedStreamChat(deps: LoggedStreamChatDeps = defaultDeps, agendaType: AgendaType | null = null): StreamChatFn {
  return async function* loggedStreamChat(messages, options = {}) {
    let fallback = false;
    const stream = deps.streamChat(messages, {
      ...options,
      onTelemetry: (telemetry) => {
        options.onTelemetry?.(telemetry);
        void deps
          .createInferenceLog({
            provider: telemetry.provider,
            model: telemetry.model,
            ttftMs: Math.round(telemetry.ttftMs),
            totalLatencyMs: Math.round(telemetry.totalLatencyMs),
            tokensPerSecond: telemetry.tokensPerSecond,
            promptTokens: telemetry.promptTokens,
            completionTokens: telemetry.completionTokens,
            externalTrafficBytes: Math.round(telemetry.externalTrafficBytes),
            fallback,
            agendaType,
          })
          .catch((err) => console.warn('[telemetry] falha ao gravar InferenceLog', err));
      },
    });
    for await (const chunk of stream) {
      if (chunk.fallback) fallback = true;
      yield chunk;
    }
  };
}

/** Instância padrão (provedor configurado + Prisma) para os serviços de domínio. */
export const loggedStreamChat: StreamChatFn = (messages, options) => createLoggedStreamChat()(messages, options);
