import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { upsertSubjectSchema, updateSubjectSchema } from '@/lib/validators/admin.validator';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const subjects = await db.subject.findMany({
      include: {
        teacherAssignments: {
          include: {
            teacher: {
              select: { id: true, name: true, email: true, enrollment: true },
            },
          },
        },
        teachingPlans: {
          select: { id: true, status: true, updatedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, subjects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = upsertSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name, code, description, courseName, academicLevel, academicYear, teacherIds } = parsed.data;

    const subject = await db.subject.create({
      data: {
        name,
        code,
        description,
        courseName,
        academicLevel,
        academicYear,
        teacherAssignments: {
          create: teacherIds.map((teacherId) => ({ teacherId })),
        },
      },
      include: {
        teacherAssignments: {
          include: { teacher: { select: { id: true, name: true, email: true, enrollment: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
    const body = await req.json();
    const parsed = updateSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { id, name, code, description, courseName, academicLevel, academicYear, teacherIds } = parsed.data;

    // Re-sincronizar alocações N:N de professores de forma atômica
    const [, subject] = await db.$transaction([
      db.teacherSubject.deleteMany({ where: { subjectId: id } }),
      db.subject.update({
        where: { id },
        data: {
          name,
          code,
          description,
          courseName,
          academicLevel,
          academicYear,
          teacherAssignments: {
            create: teacherIds.map((teacherId) => ({ teacherId })),
          },
        },
        include: {
          teacherAssignments: {
            include: { teacher: { select: { id: true, name: true, email: true, enrollment: true } } },
          },
        },
      }),
    ]);

    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiError(error);
  }
}
