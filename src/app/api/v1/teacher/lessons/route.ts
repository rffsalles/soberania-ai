import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPresignedUploadUrl } from '@/lib/storage/s3-service';

export async function GET(req: Request) {
  try {
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
    return NextResponse.json(
      { success: false, error: 'Falha ao buscar planos de aula.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar plano de aula.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
