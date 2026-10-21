import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { MEDIA_MAX_UPLOAD_MB } from '@/lib/constants/teaching';
import { openLessonMedia, uploadLessonMedia } from '@/domains/teaching/services/lesson-service';

type Params = { params: Promise<{ id: string }> };

const DEFAULT_MIME = 'application/octet-stream';
const BYTES_PER_MB = 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const STATUS_RANGE_NOT_SATISFIABLE = 416;

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await params;
    const declared = Number(req.headers.get('content-length'));
    if (declared > MEDIA_MAX_UPLOAD_MB * BYTES_PER_MB + MULTIPART_OVERHEAD_BYTES) {
      throw new DomainError(400, `O arquivo deve ter no máximo ${MEDIA_MAX_UPLOAD_MB} MB.`);
    }
    const file = (await req.formData()).get('file');
    if (!(file instanceof File)) throw new DomainError(400, 'Nenhum arquivo enviado.');
    // Reject before reading the body into memory.
    if (file.size > MEDIA_MAX_UPLOAD_MB * BYTES_PER_MB) {
      throw new DomainError(400, `O arquivo deve ter no máximo ${MEDIA_MAX_UPLOAD_MB} MB.`);
    }

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
    const media = await openLessonMedia(id, user, req.headers.get('range'));

    if (media.status === STATUS_RANGE_NOT_SATISFIABLE) {
      return new Response(null, { status: media.status, headers: { 'Content-Range': `bytes */${media.size}` } });
    }
    const length = media.end - media.start + 1;
    const headers: Record<string, string> = {
      'Content-Type': media.contentType,
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    };
    if (media.status === 206) headers['Content-Range'] = `bytes ${media.start}-${media.end}/${media.size}`;
    return new Response(media.stream, { status: media.status, headers });
  } catch (error) {
    return apiError(error);
  }
}
