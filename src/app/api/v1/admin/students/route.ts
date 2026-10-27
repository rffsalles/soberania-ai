import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createStudentSchema, enrollStudentSchema } from '@/lib/validators/admin.validator';
import {
  createStudent,
  listStudents,
  listStudentsByClass,
  setStudentClass,
} from '@/domains/academic/services/student-service';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const classId = new URL(req.url).searchParams.get('classId');
    const students = classId ? await listStudentsByClass(classId) : await listStudents();
    return NextResponse.json({ success: true, students });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = createStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const student = await createStudent(parsed.data);
    return NextResponse.json({ success: true, student });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = enrollStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const student = await setStudentClass(parsed.data.id, parsed.data.classId);
    return NextResponse.json({ success: true, student });
  } catch (error) {
    return apiError(error);
  }
}
