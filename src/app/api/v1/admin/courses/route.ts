import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/admin.validator';
import { createCourse, listCourses, updateCourse } from '@/domains/academic/services/course-service';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const courses = await listCourses();
    return NextResponse.json({ success: true, courses });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = createCourseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const course = await createCourse(parsed.data);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = updateCourseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { id, ...input } = parsed.data;

    const course = await updateCourse(id, input);
    return NextResponse.json({ success: true, course });
  } catch (error) {
    return apiError(error);
  }
}
