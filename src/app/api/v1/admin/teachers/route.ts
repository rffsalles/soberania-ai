import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createTeacherSchema } from '@/lib/validators/admin.validator';
import { createTeacher, listTeachers } from '@/domains/academic/services/subject-service';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const teachers = await listTeachers();
    return NextResponse.json({ success: true, teachers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = createTeacherSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const teacher = await createTeacher(parsed.data);
    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    return apiError(error);
  }
}
