import { describe, it, expect, vi } from 'vitest';
import {
  createClassEventStream,
  formatEventFrame,
  readStreamConfig,
  resolveCursor,
  type StreamConfig,
} from '../class-event-stream';
import type { ClassEventDTO } from '../class-event-schema';

function ev(seq: number): ClassEventDTO {
  return {
    seq,
    type: 'STEP_CHANGED',
    stepIndex: seq,
    payload: {},
    createdBy: 'TEACHER',
    createdAt: '2026-11-08T10:00:00.000Z',
  };
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out += dec.decode(value);
  }
}

function clock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const base: StreamConfig = { maxMs: 8000, mode: 'poll', pollMs: 2000, pingMs: 25000 };

describe('readStreamConfig', () => {
  it('Vercel limita a 8s; padrão sem limite', () => {
    expect(readStreamConfig({ VERCEL: '1' })).toMatchObject({ maxMs: 8000, mode: 'poll' });
    expect(readStreamConfig({}).maxMs).toBe(0);
    expect(readStreamConfig({ CLASS_EVENTS_STREAM_MAX_MS: '5000' }).maxMs).toBe(5000);
    expect(readStreamConfig({}).pollMs).toBe(2000);
    expect(readStreamConfig({}).pingMs).toBe(25000);
  });
  it('modo listen ou poll; inválido cai em poll', () => {
    expect(readStreamConfig({ CLASS_EVENTS_NOTIFY_MODE: 'listen' }).mode).toBe('listen');
    expect(readStreamConfig({ CLASS_EVENTS_NOTIFY_MODE: 'xyz' }).mode).toBe('poll');
  });
});

describe('resolveCursor', () => {
  it('usa o maior entre Last-Event-ID e after numéricos', () => {
    expect(resolveCursor('3', '7')).toBe(7);
    expect(resolveCursor(null, '7')).toBe(7);
    expect(resolveCursor('x', null)).toBe(0);
    expect(resolveCursor('5', '2')).toBe(5);
  });
});

describe('formatEventFrame', () => {
  it('formata id, event e data', () => {
    expect(formatEventFrame(ev(4))).toMatch(/^id: 4\nevent: STEP_CHANGED\ndata: \{"seq":4.*\}\n\n$/);
  });
});

describe('createClassEventStream', () => {
  it('abre com retry, emite eventos e avança o cursor por lastSeq', async () => {
    const c = clock();
    const results = [
      { events: [ev(4)], lastSeq: 4 },
      { events: [], lastSeq: 5 },
    ];
    const read = vi.fn(async (_after: number) => results.shift() ?? { events: [], lastSeq: 5 });
    const onClose = vi.fn();
    const waitForChange = vi.fn(async (_s: AbortSignal, ms: number) => {
      c.advance(ms);
    });
    const text = await drain(
      createClassEventStream(3, { ...base, maxMs: 4000 }, { read, waitForChange, now: c.now, onClose }, new AbortController().signal)
    );
    expect(text.startsWith('retry: 1000\n\n')).toBe(true);
    expect(text).toContain('id: 4\nevent: STEP_CHANGED\ndata: {"seq":4');
    expect(read.mock.calls[0][0]).toBe(3);
    expect(read.mock.calls[1][0]).toBe(4);
    expect(read.mock.calls[2][0]).toBe(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('com maxMs 8000 fecha sozinho: waitForChange sempre 2000, 5 leituras', async () => {
    const c = clock();
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after }));
    const waitForChange = vi.fn(async (_s: AbortSignal, ms: number) => {
      c.advance(ms);
    });
    const onClose = vi.fn();
    await drain(createClassEventStream(0, base, { read, waitForChange, now: c.now, onClose }, new AbortController().signal));
    expect(waitForChange.mock.calls.every((call) => call[1] === 2000)).toBe(true);
    expect(read).toHaveBeenCalledTimes(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('página cheia lê de novo antes de esperar', async () => {
    const c = clock();
    const full = Array.from({ length: 200 }, (_, i) => ev(i + 1));
    const results = [
      { events: full, lastSeq: 200 },
      { events: [ev(201), ev(202), ev(203)], lastSeq: 203 },
    ];
    const order: string[] = [];
    const read = vi.fn(async (after: number) => {
      order.push('read');
      return results.shift() ?? { events: [], lastSeq: after };
    });
    const waitForChange = vi.fn(async (_s: AbortSignal, ms: number) => {
      order.push('wait');
      c.advance(ms);
    });
    await drain(createClassEventStream(0, { ...base, maxMs: 1 }, { read, waitForChange, now: c.now }, new AbortController().signal));
    expect(order.slice(0, 3)).toEqual(['read', 'read', 'wait']);
    expect(read.mock.calls[1][0]).toBe(200);
  });

  it('cursor avança por lastSeq mesmo sem eventos válidos', async () => {
    const c = clock();
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after + 10 }));
    const waitForChange = vi.fn(async (_s: AbortSignal, ms: number) => {
      c.advance(ms);
    });
    await drain(createClassEventStream(0, { ...base, maxMs: 4000 }, { read, waitForChange, now: c.now }, new AbortController().signal));
    expect(read.mock.calls.map((x) => x[0])).toEqual([0, 10, 20]);
  });

  it('maxMs 0: emite ping após pingMs ocioso', async () => {
    const c = clock();
    const ac = new AbortController();
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after }));
    const waitForChange = vi.fn(async (_s: AbortSignal, ms: number) => {
      c.advance(ms);
      if (c.now() >= 28000) ac.abort();
    });
    const text = await drain(
      createClassEventStream(0, { ...base, maxMs: 0 }, { read, waitForChange, now: c.now }, ac.signal)
    );
    expect(text).toContain(': ping\n\n');
  });

  it('abort para o laço, fecha o stream e chama onClose', async () => {
    const ac = new AbortController();
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after }));
    const waitForChange = vi.fn(async () => {
      ac.abort();
    });
    const onClose = vi.fn();
    const text = await drain(
      createClassEventStream(0, { ...base, maxMs: 0 }, { read, waitForChange, now: () => 0, onClose }, ac.signal)
    );
    expect(text.startsWith('retry: 1000')).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('read que lança fecha o stream e chama onClose uma vez', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    const text = await drain(
      createClassEventStream(
        0,
        base,
        { read: async () => { throw new Error('boom'); }, waitForChange: async () => {}, now: () => 0, onClose },
        new AbortController().signal
      )
    );
    expect(text).toBe('retry: 1000\n\n');
    expect(onClose).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('cancelar o leitor no meio encerra o laço e chama onClose uma vez', async () => {
    const onClose = vi.fn();
    const read = vi.fn(async (after: number) => ({ events: [], lastSeq: after }));
    let release!: () => void;
    const waitForChange = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const stream = createClassEventStream(0, { ...base, maxMs: 0 }, { read, waitForChange, now: () => 0, onClose }, new AbortController().signal);
    const reader = stream.getReader();
    await reader.read();
    await vi.waitFor(() => expect(waitForChange).toHaveBeenCalled());
    await reader.cancel();
    release();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledTimes(1);
  });
});
