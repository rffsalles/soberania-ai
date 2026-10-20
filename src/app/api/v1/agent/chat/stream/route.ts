import { NextRequest, NextResponse } from 'next/server';
import { startChat } from '@/domains/agents/services/chat-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { chatRequestSchema } from '@/lib/validators/chat.validator';

const SSE_EVENT = { TOKEN: 'token', DONE: 'done', ERROR: 'error' } as const;

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const parsed = chatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Payload inválido.' },
        { status: 400 }
      );
    }
    // Erros de agenda/escopo/janela são lançados aqui, antes do stream começar.
    const session = await startChat(user, parsed.data);
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const result = await session.run((token) =>
            controller.enqueue(encoder.encode(frame(SSE_EVENT.TOKEN, { token })))
          );
          controller.enqueue(encoder.encode(frame(SSE_EVENT.DONE, result)));
        } catch (err) {
          console.error('[chat/stream] erro durante o stream', err);
          try {
            controller.enqueue(
              encoder.encode(frame(SSE_EVENT.ERROR, { error: 'Falha ao gerar a resposta.' }))
            );
          } catch {
            // cliente desconectou: nada a enviar
          }
        } finally {
          try {
            controller.close();
          } catch {
            // stream já encerrado pelo cliente
          }
        }
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
