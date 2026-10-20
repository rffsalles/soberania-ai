import { NextResponse } from 'next/server';
import { uploadAndIngest } from '@/domains/rag/services/library-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

function parseCategories(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string') return [];
  const split = () => raw.split(',').map((c) => c.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((c) => String(c).trim()).filter(Boolean) : split();
  } catch {
    return split();
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Nenhum arquivo enviado.' },
        { status: 400 }
      );
    }

    const result = await uploadAndIngest(
      { buffer: Buffer.from(await file.arrayBuffer()), name: file.name },
      {
        title: (formData.get('title') as string | null) || '',
        author: (formData.get('author') as string | null) || '',
        edition: (formData.get('edition') as string | null) || '',
        categories: parseCategories(formData.get('categories')),
      }
    );

    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
