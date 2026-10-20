import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storageService } from '@/domains/storage';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function DELETE(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser(_req, [Role.TEACHER, Role.ADMIN]);
    const { id } = await props.params;

    const material = await db.didacticMaterial.findUnique({
      where: { id },
    });

    if (!material) {
      return NextResponse.json(
        { success: false, error: 'Material não encontrado.' },
        { status: 404 }
      );
    }

    // Remove arquivo do repositório de armazenamento (R2 ou Local)
    if (material.filePath) {
      await storageService.deleteFile(material.filePath).catch((deleteErr) => {
        console.warn('[DeleteRoute] Advertência ao remover arquivo do storage:', deleteErr);
      });
    }

    // Deleta o registro do banco de dados (chunks associados sofrem onDelete: Cascade)
    await db.didacticMaterial.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Material removido com sucesso.',
    });
  } catch (error) {
    return apiError(error);
  }
}
