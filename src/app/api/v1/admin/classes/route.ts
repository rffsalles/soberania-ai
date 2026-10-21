import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { listClasses } from '@/domains/academic/services/class-service';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const classes = await listClasses();
    return NextResponse.json({ success: true, classes });
  } catch (error) {
    return apiError(error);
  }
}
