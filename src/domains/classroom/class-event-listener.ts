export type PgClientLike = {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  on(ev: string, cb: (arg?: any) => void): void;
  end(): Promise<void>;
};
export type Subscription = { wait(signal: AbortSignal, timeoutMs: number): Promise<void>; close(): void };
export type ClassEventListener = { subscribe(agendaId: string): Subscription; isConnected(): boolean };

const DEFAULT_RECONNECT_MS = 2000;
const DEFAULT_POLL_MS = 2000;

export function channelFor(agendaId: string): string {
  if (!/^[a-z0-9]+$/i.test(agendaId)) throw new Error('agendaId inválido para canal');
  return `class_events_${agendaId}`;
}

type SubState = { dirty: boolean; wake: (() => void) | null };

export function createClassEventListener(
  makeClient: () => PgClientLike,
  opts: { reconnectMs?: number; pollMs?: number } = {},
): ClassEventListener {
  const reconnectMs = opts.reconnectMs ?? DEFAULT_RECONNECT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const channels = new Map<string, Set<SubState>>();
  let client: PgClientLike | null = null;
  let connected = false;
  let connecting = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const run = (sql: string) => {
    if (connected && client) client.query(sql).catch(() => undefined);
  };

  function wakeAll(markDirty: boolean) {
    for (const subs of channels.values()) {
      for (const sub of subs) {
        if (markDirty) sub.dirty = true;
        sub.wake?.();
      }
    }
  }

  function scheduleReconnect() {
    connected = false;
    wakeAll(false);
    const old = client;
    client = null;
    old?.end().catch(() => undefined);
    if (retryTimer || channels.size === 0) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, reconnectMs);
  }

  async function connect() {
    if (connecting || connected || channels.size === 0) return;
    connecting = true;
    const c = makeClient();
    client = c;
    c.on('error', () => {
      if (client === c) scheduleReconnect();
    });
    c.on('end', () => {
      if (client === c) scheduleReconnect();
    });
    c.on('notification', (msg?: { channel?: string }) => {
      for (const sub of channels.get(msg?.channel ?? '') ?? []) {
        sub.dirty = true;
        sub.wake?.();
      }
    });
    const abandon = () => {
      connecting = false;
      c.end().catch(() => undefined);
      void connect();
    };
    try {
      await c.connect();
      if (client !== c) return abandon();
      for (const name of channels.keys()) {
        await c.query(`LISTEN "${name}"`);
        if (client !== c) return abandon();
      }
    } catch {
      connecting = false;
      if (client === c) scheduleReconnect();
      return;
    }
    connecting = false;
    connected = true;
    // notificações perdidas durante a queda: acorda todos para reler
    wakeAll(true);
  }

  return {
    isConnected: () => connected,
    subscribe(agendaId) {
      const name = channelFor(agendaId);
      const state: SubState = { dirty: false, wake: null };
      let subs = channels.get(name);
      if (!subs) {
        subs = new Set();
        channels.set(name, subs);
        run(`LISTEN "${name}"`);
      }
      subs.add(state);
      void connect();

      return {
        wait(signal, timeoutMs) {
          return new Promise<void>((resolve) => {
            if (signal.aborted || state.dirty) {
              state.dirty = false;
              return resolve();
            }
            const limit = connected ? timeoutMs : Math.min(timeoutMs, pollMs);
            const done = () => {
              clearTimeout(timer);
              signal.removeEventListener('abort', done);
              state.wake = null;
              state.dirty = false;
              resolve();
            };
            const timer = setTimeout(done, limit);
            signal.addEventListener('abort', done, { once: true });
            state.wake = done;
          });
        },
        close() {
          const set = channels.get(name);
          if (!set?.delete(state)) return;
          state.wake?.();
          if (set.size > 0) return;
          channels.delete(name);
          run(`UNLISTEN "${name}"`);
          if (channels.size === 0) {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = null;
            const c = client;
            client = null;
            connected = false;
            c?.end().catch(() => undefined);
          }
        },
      };
    },
  };
}

const globalForListener = globalThis as unknown as { classEventListener?: ClassEventListener };

export function getClassEventListener(): ClassEventListener {
  if (!globalForListener.classEventListener) {
    globalForListener.classEventListener = createClassEventListener(() => {
      const { Client } = require('pg') as typeof import('pg');
      return new Client({ connectionString: process.env.DATABASE_URL }) as unknown as PgClientLike;
    });
  }
  return globalForListener.classEventListener;
}
