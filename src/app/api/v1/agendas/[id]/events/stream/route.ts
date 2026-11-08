import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { isClassClosed, openEventReader } from '@/domains/classroom/class-event-service';
import { createClassEventStream, readStreamConfig, resolveCursor } from '@/domains/classroom/class-event-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function abortableWait(signal: AbortSignal, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const cursor = resolveCursor(new URL(req.url).searchParams.get('after'), req.headers.get('last-event-id'));
    // 204 faz o EventSource parar de reconectar depois do fim da aula.
    if (await isClassClosed(user, id, cursor)) return new Response(null, { status: 204 });
    const reader = await openEventReader(user, id);
    const config = readStreamConfig();
    let waitForChange = abortableWait;
    let onClose: (() => void) | undefined;
    if (config.mode === 'listen') {
      const { getClassEventListener } = await import('@/domains/classroom/class-event-listener');
      const sub = getClassEventListener().subscribe(id);
      waitForChange = sub.wait;
      onClose = () => sub.close();
    }
    const stream = createClassEventStream(
      cursor,
      config,
      { read: (after) => reader.read(after), waitForChange, now: () => Date.now(), onClose },
      req.signal,
    );
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
