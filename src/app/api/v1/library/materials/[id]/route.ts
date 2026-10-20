import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { removeMaterial } from '@/domains/rag/services/library-service';
import { Role } from '@prisma/client';

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(_req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;
    await removeMaterial(id);

    return NextResponse.json({
      success: true,
      message: 'Material removido com sucesso.',
    });
  } catch (error) {
    return apiError(error);
  }
}
