import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { createTeacherSchema } from '@/lib/validators/admin.validator';

const teacherSelect = {
  id: true,
  name: true,
  email: true,
  enrollment: true,
  role: true,
  createdAt: true,
} as const;

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const teachers = await db.user.findMany({
      where: { role: Role.TEACHER },
      select: {
        ...teacherSelect,
        teacherSubjects: {
          include: {
            subject: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

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
    const { name, email, enrollment, password } = parsed.data;

    const passwordHash = await hashPassword(password);

    const teacher = await db.user.create({
      data: { name, email, enrollment, passwordHash, role: Role.TEACHER },
      select: teacherSelect,
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    return apiError(error);
  }
}
