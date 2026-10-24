import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createOfferingSchema, updateOfferingSchema } from '@/lib/validators/admin.validator';
import { createSubject, listSubjects, updateSubject } from '@/domains/academic/services/subject-service';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const subjects = await listSubjects(user);
    return NextResponse.json({ success: true, subjects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = createOfferingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const subject = await createSubject(parsed.data);
    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = updateOfferingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { id, teacherIds } = parsed.data;

    const subject = await updateSubject(id, { teacherIds });
    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiError(error);
  }
}
