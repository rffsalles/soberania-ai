import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { getLessonMedia, uploadLessonMedia } from '@/domains/teaching/services/lesson-service';

type Params = { params: Promise<{ id: string }> };

const DEFAULT_MIME = 'application/octet-stream';

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) throw new DomainError(400, 'Nenhum arquivo enviado.');

    const lesson = await uploadLessonMedia(id, user, {
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      mime: file.type || DEFAULT_MIME,
    });
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const { buffer, contentType } = await getLessonMedia(id, user);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
