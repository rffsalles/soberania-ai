import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { getMaterialDownload } from '@/domains/rag/services/library-service';
import { Role } from '@prisma/client';

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(_req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;
    const { buffer, filename, contentType } = await getMaterialDownload(id);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
