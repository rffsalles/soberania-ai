import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { Role } from '@prisma/client';

export async function GET() {
  try {
    const teachers = await db.user.findMany({
      where: { role: Role.TEACHER },
      include: {
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
    return NextResponse.json(
      { success: false, error: 'Falha ao listar docentes.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, enrollment, passwordPlain } = body;

    if (!name || !email || !enrollment) {
      return NextResponse.json(
        { success: false, error: 'Nome, e-mail e matrícula são obrigatórios.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(passwordPlain || 'prof123');

    const teacher = await db.user.create({
      data: {
        name,
        email,
        enrollment,
        passwordHash,
        role: Role.TEACHER,
      },
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao cadastrar professor.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
