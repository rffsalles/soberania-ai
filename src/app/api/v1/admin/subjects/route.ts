import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

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
    const { name, code, description, courseName, academicLevel, academicYear, teacherIds } = body;

    if (!name || !code || !courseName) {
      return NextResponse.json(
        { success: false, error: 'Nome, código e curso são obrigatórios.' },
        { status: 400 }
      );
    }

    const subject = await db.subject.create({
      data: {
        name,
        code,
        description,
        courseName,
        academicLevel: academicLevel || 'HIGHER_EDUCATION',
        academicYear: Number(academicYear) || 2026,
        teacherAssignments: {
          create: Array.isArray(teacherIds)
            ? teacherIds.map((tId: string) => ({ teacherId: tId }))
            : [],
        },
      },
      include: {
        teacherAssignments: {
          include: { teacher: true },
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
    const { id, name, code, description, courseName, academicLevel, academicYear, teacherIds } = body;

    if (!id || !name || !code || !courseName) {
      return NextResponse.json(
        { success: false, error: 'ID, nome, código e curso são obrigatórios.' },
        { status: 400 }
      );
    }

    // Re-sincronizar alocações N:N de professores
    await db.teacherSubject.deleteMany({
      where: { subjectId: id },
    });

    const subject = await db.subject.update({
      where: { id },
      data: {
        name,
        code,
        description,
        courseName,
        academicLevel: academicLevel || 'HIGHER_EDUCATION',
        academicYear: Number(academicYear) || 2026,
        teacherAssignments: {
          create: Array.isArray(teacherIds)
            ? teacherIds.map((tId: string) => ({ teacherId: tId }))
            : [],
        },
      },
      include: {
        teacherAssignments: {
          include: { teacher: true },
        },
      },
    });

    return NextResponse.json({ success: true, subject });
  } catch (error) {
    return apiError(error);
  }
}
