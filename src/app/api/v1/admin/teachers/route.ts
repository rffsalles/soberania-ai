import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
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
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.ADMIN]);
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
  } catch (error) {
    return apiError(error);
  }
}
