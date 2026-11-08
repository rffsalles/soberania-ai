import { CLASS_EVENTS_PAGE } from './class-event-repository';
import type { ClassEventDTO } from './class-event-schema';

export type StreamConfig = { maxMs: number; mode: 'poll' | 'listen'; pollMs: number; pingMs: number };

const VERCEL_MAX_MS = 8000;

export function readStreamConfig(env: Record<string, string | undefined> = process.env): StreamConfig {
  const explicit = Number.parseInt(env.CLASS_EVENTS_STREAM_MAX_MS ?? '', 10);
  const maxMs = Number.isFinite(explicit) && explicit >= 0 ? explicit : env.VERCEL ? VERCEL_MAX_MS : 0;
  const mode = env.CLASS_EVENTS_NOTIFY_MODE === 'listen' ? 'listen' : 'poll';
  return { maxMs, mode, pollMs: 2000, pingMs: 25000 };
}

function parseSeq(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number.parseInt(value, 10);
}

/** Cursor de retomada: o maior entre Last-Event-ID e ?after (ambos numéricos), senão 0. */
export function resolveCursor(after: string | null, lastEventId: string | null): number {
  return Math.max(parseSeq(after) ?? 0, parseSeq(lastEventId) ?? 0);
}

export function formatEventFrame(e: ClassEventDTO): string {
  return `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

export type StreamDeps = {
  read(after: number): Promise<{ events: ClassEventDTO[]; lastSeq: number }>;
  waitForChange(signal: AbortSignal, timeoutMs: number): Promise<void>;
  now(): number;
  onClose?(): void;
};

export function createClassEventStream(
  cursor: number,
  config: StreamConfig,
  deps: StreamDeps,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  const finish = (controller?: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    try {
      controller?.close();
    } catch {
      // já fechado pelo consumidor
    }
    deps.onClose?.();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          finish(controller);
        }
      };
      const onAbort = () => finish(controller);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        send('retry: 1000\n\n');
        const startedAt = deps.now();
        let lastSentAt = startedAt;
        let after = cursor;
        while (!closed && !signal.aborted) {
          let page = await deps.read(after);
          for (;;) {
            if (closed || signal.aborted) break;
            for (const e of page.events) send(formatEventFrame(e));
            if (page.events.length > 0) lastSentAt = deps.now();
            after = page.lastSeq;
            if (page.events.length < CLASS_EVENTS_PAGE) break;
            if (config.maxMs > 0 && deps.now() - startedAt >= config.maxMs) break;
            page = await deps.read(after);
          }
          if (closed || signal.aborted) break;
          const elapsed = deps.now() - startedAt;
          if (config.maxMs > 0 && elapsed >= config.maxMs) break;
          if (config.maxMs === 0 && deps.now() - lastSentAt >= config.pingMs) {
            send(': ping\n\n');
            lastSentAt = deps.now();
          }
          const remaining = config.maxMs > 0 ? config.maxMs - elapsed : Infinity;
          const wait = config.mode === 'poll' ? config.pollMs : Math.min(config.pingMs, remaining);
          await deps.waitForChange(signal, wait);
        }
      } catch (err) {
        if (!signal.aborted) console.error('[aula] erro no stream de eventos', err);
      } finally {
        signal.removeEventListener('abort', onAbort);
        finish(controller);
      }
    },
    cancel() {
      finish();
    },
  });
}
