// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClassEvents } from '../use-class-events';
import type { ClassEventDTO } from '@/domains/classroom/class-event-schema';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 0;
  closed = false;
  listeners = new Map<string, Array<(e: Event) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  fire(type: string, event: Event = new Event(type)) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  open() {
    this.readyState = 1;
    this.fire('open');
  }
  error() {
    this.fire('error');
  }
  emit(type: string, dto: ClassEventDTO) {
    this.fire(type, new MessageEvent(type, { data: JSON.stringify(dto), lastEventId: String(dto.seq) }));
  }
}

const dto = (seq: number, type: ClassEventDTO['type'] = 'TEACHER_NOTE', stepIndex: number | null = null): ClassEventDTO => ({
  seq,
  type,
  stepIndex,
  payload: {},
  createdBy: 'TEACHER',
  createdAt: '2026-11-08T10:00:00.000Z',
});

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];

function mockFetch(events: ClassEventDTO[], lastSeq: number) {
  const fn = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, events, lastSeq }) }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('useClassEvents', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('abre o stream com after=0, vira live no open e mescla eventos ordenados sem duplicatas', () => {
    const { result } = renderHook(() => useClassEvents('ag1'));
    expect(latest().url).toBe('/api/v1/agendas/ag1/events/stream?after=0');
    expect(result.current.status).toBe('polling');
    act(() => latest().open());
    expect(result.current.status).toBe('live');
    act(() => {
      latest().emit('STEP_CHANGED', dto(3, 'STEP_CHANGED', 1));
      latest().emit('SESSION_STARTED', dto(1, 'SESSION_STARTED'));
      latest().emit('TEACHER_NOTE', dto(3, 'STEP_CHANGED', 1));
    });
    expect(result.current.events.map((e) => e.seq)).toEqual([1, 3]);
    expect(result.current.lastSeq).toBe(3);
    expect(result.current.state.currentStepIndex).toBe(1);
  });

  it('ignora frames malformados', () => {
    const { result } = renderHook(() => useClassEvents('ag1'));
    act(() => {
      latest().open();
      latest().fire('TEACHER_NOTE', new MessageEvent('TEACHER_NOTE', { data: '{oops' }));
    });
    expect(result.current.events).toEqual([]);
  });

  it('error seguido de open em 1 s mantém live e não chama fetch', () => {
    const fetchMock = mockFetch([], 0);
    const { result } = renderHook(() => useClassEvents('ag1'));
    act(() => latest().open());
    act(() => latest().error());
    act(() => vi.advanceTimersByTime(1000));
    act(() => latest().open());
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.status).toBe('live');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('error sem open por 10 s fecha o stream e faz polling a cada 5 s mesclando eventos', async () => {
    const fetchMock = mockFetch([dto(5)], 7);
    const { result } = renderHook(() => useClassEvents('ag1'));
    act(() => latest().open());
    act(() => latest().emit('TEACHER_NOTE', dto(2)));
    act(() => latest().error());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(result.current.status).toBe('polling');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/agendas/ag1/events?after=2');
    expect(result.current.events.map((e) => e.seq)).toEqual([2, 5]);
    expect(result.current.lastSeq).toBe(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/agendas/ag1/events?after=7');
  });

  it('fetch rejeitado no polling vira offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    const { result } = renderHook(() => useClassEvents('ag1'));
    act(() => latest().error());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000 + 5000);
    });
    expect(result.current.status).toBe('offline');
  });

  it('após 30 s em polling recria o stream com after=lastSeq e para o polling no open', async () => {
    const fetchMock = mockFetch([dto(4)], 4);
    const { result } = renderHook(() => useClassEvents('ag1'));
    act(() => latest().error());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000 + 30_000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latest().url).toBe('/api/v1/agendas/ag1/events/stream?after=4');
    act(() => latest().open());
    expect(result.current.status).toBe('live');
    fetchMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unmount fecha o EventSource e limpa os timers', () => {
    const { unmount } = renderHook(() => useClassEvents('ag1'));
    act(() => latest().error());
    unmount();
    expect(latest().closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
