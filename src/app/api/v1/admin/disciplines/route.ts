import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createDisciplineSchema, updateDisciplineSchema } from '@/lib/validators/admin.validator';
import { createDiscipline, listDisciplines, updateDiscipline } from '@/domains/academic/services/discipline-service';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const courseId = new URL(req.url).searchParams.get('courseId') || undefined;
    const disciplines = await listDisciplines({ courseId });
    return NextResponse.json({ success: true, disciplines });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = createDisciplineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const discipline = await createDiscipline(parsed.data);
    return NextResponse.json({ success: true, discipline });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = updateDisciplineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { id, ...input } = parsed.data;

    const discipline = await updateDiscipline(id, input);
    return NextResponse.json({ success: true, discipline });
  } catch (error) {
    return apiError(error);
  }
}
