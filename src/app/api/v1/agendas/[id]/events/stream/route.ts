import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { openEventReader } from '@/domains/classroom/class-event-service';
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
    const reader = await openEventReader(user, id);
    const cursor = resolveCursor(new URL(req.url).searchParams.get('after'), req.headers.get('last-event-id'));
    const stream = createClassEventStream(
      cursor,
      readStreamConfig(),
      { read: (after) => reader.read(after), waitForChange: abortableWait, now: () => Date.now() },
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
