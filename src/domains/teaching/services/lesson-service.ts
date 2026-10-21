import path from 'path';
import { AgendaType, Role, type Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { API_ROUTES } from '@/lib/constants/routes';
import {
  LESSON_DEFAULT_DURATION_MINUTES,
  LESSON_MEDIA_CONTENT_TYPES,
  LESSON_MEDIA_TYPE,
  MEDIA_MAX_UPLOAD_MB,
  YOUTUBE_URL_PATTERN,
} from '@/lib/constants/teaching';
import {
  storageService,
  type FileStreamResult,
  type StoragePrefix,
  type UploadResult,
} from '@/domains/storage/storage-service';
import * as agendaRepo from '@/domains/agendas/services/agenda-repository';
import * as lessonRepo from './lesson-plan-repository';
import { assertOwner } from '../ownership';
import { timeScriptSchema } from '../time-script';

const BYTES_PER_MB = 1024 * 1024;
const MS_PER_MINUTE = 60 * 1000;
const MEDIA_PREFIX: StoragePrefix = 'media';

export type LessonActor = { id: string; role: Role; classId: string | null };

export type LessonWithContext = {
  id: string;
  topicTitle: string;
  classDate: Date;
  mediaUrl: string | null;
  s3ObjectKey: string | null;
  courseSchedule: {
    teachingPlan: { teacherId: string; subject: { id: string; name: string; classId: string | null } };
  };
};

export type LessonDeps = {
  repo: {
    findLessonWithContext(id: string): Promise<LessonWithContext | null>;
    updateLesson(id: string, data: Prisma.LessonPlanUncheckedUpdateInput): Promise<LessonWithContext>;
    upsertAgendaByLessonPlanId(lessonPlanId: string, data: agendaRepo.LessonAgendaData): Promise<unknown>;
  };
  storage: {
    uploadFile(buffer: Buffer, name: string, mime: string, prefix?: StoragePrefix): Promise<UploadResult>;
    getFileBuffer(path: string): Promise<FileStreamResult>;
    deleteFile(path: string): Promise<void>;
  };
};

const defaultDeps: LessonDeps = {
  repo: {
    findLessonWithContext: lessonRepo.findLessonWithContext,
    updateLesson: lessonRepo.updateLessonWithContext,
    upsertAgendaByLessonPlanId: agendaRepo.upsertAgendaByLessonPlanId,
  },
  storage: storageService,
};

export type LessonUpdateInput = {
  classDate?: string;
  classNumber?: number | string;
  topicTitle?: string;
  dailyObjective?: string;
  timeScript?: unknown;
  methodology?: string;
  resourcesNeeded?: string[];
  fixationExercise?: string;
  mediaType?: string;
  mediaUrl?: string | null;
};

export type LessonMediaFile = { buffer: Buffer; name: string; mime: string };

async function loadOwned(id: string, user: LessonActor, deps: LessonDeps) {
  const lesson = await deps.repo.findLessonWithContext(id);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  assertOwner(user, lesson.courseSchedule.teachingPlan.teacherId);
  return lesson;
}

/** Creates or updates the CLASSROOM agenda of a dated lesson (one agenda per lesson plan). */
export async function syncAgendaForLesson(lesson: LessonWithContext, deps: LessonDeps = defaultDeps) {
  const { teacherId, subject } = lesson.courseSchedule.teachingPlan;
  if (!subject.classId) {
    console.warn(`[lesson-service] Disciplina ${subject.id} sem turma: agenda da aula ${lesson.id} não sincronizada.`);
    return;
  }
  await deps.repo.upsertAgendaByLessonPlanId(lesson.id, {
    title: lesson.topicTitle,
    subject: subject.name,
    type: AgendaType.CLASSROOM,
    startTime: lesson.classDate,
    endTime: new Date(lesson.classDate.getTime() + LESSON_DEFAULT_DURATION_MINUTES * MS_PER_MINUTE),
    videoUrl: lesson.mediaUrl ?? null,
    classId: subject.classId,
    subjectId: subject.id,
    teacherId,
  });
}

export async function syncAgendaForLessonId(id: string, deps: LessonDeps = defaultDeps) {
  const lesson = await deps.repo.findLessonWithContext(id);
  if (lesson) await syncAgendaForLesson(lesson, deps);
}

/** Ensures every lesson of a schedule has its agenda; the caller must already own the schedule. */
export async function syncAgendasForSchedule(scheduleId: string) {
  const lessons = await lessonRepo.listLessonsBySchedule({ scheduleId });
  for (const lesson of lessons) await syncAgendaForLesson(lesson);
}

export async function updateLesson(
  id: string,
  user: LessonActor,
  input: LessonUpdateInput,
  deps: LessonDeps = defaultDeps
) {
  await loadOwned(id, user, deps);

  const data: Prisma.LessonPlanUncheckedUpdateInput = {};
  if (input.timeScript !== undefined) {
    const parsed = timeScriptSchema.safeParse(input.timeScript);
    if (!parsed.success) {
      throw new DomainError(400, 'Roteiro inválido: cada etapa precisa de tempo (segundos), faixa, atividade e descrição.');
    }
    data.timeScript = parsed.data;
  }
  if (input.mediaType === LESSON_MEDIA_TYPE.YOUTUBE && !YOUTUBE_URL_PATTERN.test(input.mediaUrl ?? '')) {
    throw new DomainError(400, 'Informe uma URL válida de vídeo do YouTube.');
  }
  // Explicit whitelist: the parent schedule can never be changed through an update.
  if (input.classDate) data.classDate = new Date(input.classDate);
  if (input.classNumber !== undefined) data.classNumber = Number(input.classNumber);
  if (input.topicTitle !== undefined) data.topicTitle = input.topicTitle;
  if (input.dailyObjective !== undefined) data.dailyObjective = input.dailyObjective;
  if (input.methodology !== undefined) data.methodology = input.methodology;
  if (input.resourcesNeeded !== undefined) data.resourcesNeeded = input.resourcesNeeded;
  if (input.fixationExercise !== undefined) data.fixationExercise = input.fixationExercise;
  if (input.mediaType !== undefined) data.mediaType = input.mediaType;
  if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;

  const updated = await deps.repo.updateLesson(id, data);
  await syncAgendaForLesson(updated, deps);
  return updated;
}

function mediaExtension(name: string): keyof typeof LESSON_MEDIA_CONTENT_TYPES | null {
  const ext = path.extname(name).slice(1).toLowerCase();
  return ext in LESSON_MEDIA_CONTENT_TYPES ? (ext as keyof typeof LESSON_MEDIA_CONTENT_TYPES) : null;
}

export async function uploadLessonMedia(
  id: string,
  user: LessonActor,
  file: LessonMediaFile,
  deps: LessonDeps = defaultDeps
) {
  const lesson = await loadOwned(id, user, deps);
  if (!mediaExtension(file.name)) {
    throw new DomainError(400, 'Formato não suportado. Envie mp4, webm, mp3, m4a ou pdf.');
  }
  if (file.buffer.length === 0 || file.buffer.length > MEDIA_MAX_UPLOAD_MB * BYTES_PER_MB) {
    throw new DomainError(400, `O arquivo deve ter entre 1 byte e ${MEDIA_MAX_UPLOAD_MB} MB.`);
  }

  const safeName = path.basename(file.name).replace(/[^\w.-]/g, '_');
  const stored = await deps.storage.uploadFile(file.buffer, safeName, file.mime, MEDIA_PREFIX);
  const updated = await deps.repo.updateLesson(id, {
    mediaType: LESSON_MEDIA_TYPE.S3_UPLOAD,
    mediaUrl: `${API_ROUTES.TEACHER_LESSONS}/${id}/media`,
    s3ObjectKey: stored.filePath,
  });
  if (lesson.s3ObjectKey) await deps.storage.deleteFile(lesson.s3ObjectKey).catch(() => undefined);
  await syncAgendaForLesson(updated, deps);
  return updated;
}

export async function getLessonMedia(id: string, user: LessonActor, deps: LessonDeps = defaultDeps) {
  const lesson = await deps.repo.findLessonWithContext(id);
  if (!lesson) throw new DomainError(404, 'Plano de aula não encontrado.');
  const { teacherId, subject } = lesson.courseSchedule.teachingPlan;
  if (user.role === Role.STUDENT) {
    if (!user.classId || user.classId !== subject.classId) {
      throw new DomainError(403, 'Você não tem acesso a este recurso.');
    }
  } else {
    assertOwner(user, teacherId);
  }
  if (!lesson.s3ObjectKey) throw new DomainError(404, 'Esta aula não possui mídia enviada.');

  const { buffer } = await deps.storage.getFileBuffer(lesson.s3ObjectKey);
  const ext = mediaExtension(lesson.s3ObjectKey);
  return { buffer, contentType: ext ? LESSON_MEDIA_CONTENT_TYPES[ext] : 'application/octet-stream' };
}
