import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
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
    return NextResponse.json(
      { success: false, error: 'Falha ao buscar disciplinas.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao criar disciplina.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
