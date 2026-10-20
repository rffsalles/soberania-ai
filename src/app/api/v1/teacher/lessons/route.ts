import { NextResponse } from 'next/server';
import { createPresignedUploadUrl } from '@/lib/storage/s3-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';
import { createLesson, listLessons } from '@/domains/teaching/services/teaching-content-service';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);

    const lessons = await listLessons(user, searchParams.get('scheduleId') || undefined);
    return NextResponse.json({ success: true, lessons });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const { requestS3Upload, fileName, fileType, subjectCode, ...lessonInput } = body;

    // Se solicitou URL de upload S3
    if (requestS3Upload && fileName && subjectCode) {
      const uploadData = await createPresignedUploadUrl(
        subjectCode,
        lessonInput.classNumber || 1,
        fileName,
        fileType || 'application/octet-stream'
      );
      return NextResponse.json({ success: true, uploadData });
    }

    const lesson = await createLesson(user, lessonInput);
    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
