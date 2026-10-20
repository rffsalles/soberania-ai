import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPresignedUploadUrl } from '@/lib/storage/s3-service';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { Role } from '@prisma/client';

export async function GET(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get('scheduleId');

    const lessons = await db.lessonPlan.findMany({
      where: scheduleId ? { courseScheduleId: scheduleId } : undefined,
      include: {
        courseSchedule: {
          include: {
            teachingPlan: { include: { subject: true } },
          },
        },
      },
      orderBy: { classNumber: 'asc' },
    });

    return NextResponse.json({ success: true, lessons });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const {
      courseScheduleId,
      classDate,
      classNumber,
      topicTitle,
      dailyObjective,
      timeScript,
      methodology,
      resourcesNeeded,
      fixationExercise,
      mediaType,
      mediaUrl,
      requestS3Upload,
      fileName,
      fileType,
      subjectCode,
    } = body;

    // Se solicitou URL de upload S3
    if (requestS3Upload && fileName && subjectCode) {
      const uploadData = await createPresignedUploadUrl(
        subjectCode,
        classNumber || 1,
        fileName,
        fileType || 'application/octet-stream'
      );
      return NextResponse.json({ success: true, uploadData });
    }

    if (!courseScheduleId || !topicTitle) {
      return NextResponse.json(
        { success: false, error: 'Cronograma e título do tópico são obrigatórios.' },
        { status: 400 }
      );
    }

    const lesson = await db.lessonPlan.create({
      data: {
        courseScheduleId,
        classDate: classDate ? new Date(classDate) : new Date(),
        classNumber: Number(classNumber) || 1,
        topicTitle,
        dailyObjective: dailyObjective || '',
        timeScript: timeScript || [],
        methodology: methodology || '',
        resourcesNeeded: resourcesNeeded || [],
        fixationExercise: fixationExercise || '',
        mediaType: mediaType || 'NONE',
        mediaUrl: mediaUrl || null,
      },
    });

    return NextResponse.json({ success: true, lesson });
  } catch (error) {
    return apiError(error);
  }
}
