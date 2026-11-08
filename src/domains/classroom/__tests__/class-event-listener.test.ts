import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { channelFor, createClassEventListener, type PgClientLike } from '../class-event-listener';

class FakeClient extends EventEmitter {
  queries: string[] = [];
  connect = vi.fn(async () => undefined);
  query = vi.fn(async (sql: string) => {
    this.queries.push(sql);
  });
  end = vi.fn(async () => undefined);
}

let clients: FakeClient[];
const make = () => {
  const c = new FakeClient();
  clients.push(c);
  return c as unknown as PgClientLike;
};
const flush = () => vi.advanceTimersByTimeAsync(0);
const notify = (c: FakeClient, channel: string) => c.emit('notification', { channel, payload: '1' });

beforeEach(() => {
  vi.useFakeTimers();
  clients = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('channelFor', () => {
  it('monta o canal e rejeita ids perigosos', () => {
    expect(channelFor('ag1')).toBe('class_events_ag1');
    expect(() => channelFor('ag1"; DROP')).toThrow();
  });
});

describe('createClassEventListener', () => {
  it('LISTEN só no primeiro subscribe; UNLISTEN ao fechar o último', async () => {
    const l = createClassEventListener(make);
    const a = l.subscribe('ag1');
    await flush();
    const b = l.subscribe('ag1');
    await flush();
    const c = clients[0];
    expect(c.queries.filter((q) => q.startsWith('LISTEN'))).toEqual(['LISTEN "class_events_ag1"']);
    a.close();
    expect(c.queries.some((q) => q.startsWith('UNLISTEN'))).toBe(false);
    b.close();
    expect(c.queries).toContain('UNLISTEN "class_events_ag1"');
  });

  it('notificação resolve o wait pendente', async () => {
    const l = createClassEventListener(make);
    const s = l.subscribe('ag1');
    await flush();
    const p = s.wait(new AbortController().signal, 25000);
    notify(clients[0], 'class_events_ag1');
    await expect(p).resolves.toBeUndefined();
  });

  it('notificação entre dois waits faz o próximo resolver na hora', async () => {
    const l = createClassEventListener(make);
    const s = l.subscribe('ag1');
    await flush();
    notify(clients[0], 'class_events_ag1');
    let resolved = false;
    void s.wait(new AbortController().signal, 25000).then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(true);
  });

  it('desconectado: wait degrada para pollMs', async () => {
    const l = createClassEventListener(() => {
      const c = new FakeClient();
      c.connect = vi.fn(() => new Promise<void>(() => undefined));
      return c as unknown as PgClientLike;
    });
    const s = l.subscribe('ag1');
    let resolved = false;
    void s.wait(new AbortController().signal, 25000).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(1999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('error reconecta após reconnectMs e refaz LISTEN', async () => {
    const l = createClassEventListener(make, { reconnectMs: 500 });
    l.subscribe('ag1');
    await flush();
    clients[0].emit('error', new Error('boom'));
    expect(l.isConnected()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(clients).toHaveLength(2);
    expect(clients[1].queries).toContain('LISTEN "class_events_ag1"');
    expect(l.isConnected()).toBe(true);
  });

  it('abort resolve o wait', async () => {
    const l = createClassEventListener(make);
    const s = l.subscribe('ag1');
    await flush();
    const ac = new AbortController();
    const p = s.wait(ac.signal, 25000);
    ac.abort();
    await expect(p).resolves.toBeUndefined();
  });
});
