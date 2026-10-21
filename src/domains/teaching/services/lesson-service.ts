import path from 'path';
import { AgendaType, Role, type Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { API_ROUTES } from '@/lib/constants/routes';
import {
  LESSON_DEFAULT_DURATION_MINUTES,
  LESSON_MEDIA_CONTENT_TYPES,
  LESSON_MEDIA_TYPE,
  MEDIA_MAX_UPLOAD_MB,
} from '@/lib/constants/teaching';
import { parseRangeHeader } from '@/lib/http-range';
import { parseLessonInput } from '@/lib/validators/lesson.validator';
import {
  storageService,
  type FileReadResult,
  type StoragePrefix,
  type UploadResult,
} from '@/domains/storage/storage-service';
import * as agendaRepo from '@/domains/agendas/services/agenda-repository';
import * as lessonRepo from './lesson-plan-repository';
import { assertOwner } from '../ownership';

const BYTES_PER_MB = 1024 * 1024;
const MS_PER_MINUTE = 60 * 1000;
const MEDIA_PREFIX: StoragePrefix = 'media';

export type LessonActor = { id: string; role: Role; classId: string | null };

export type LessonWithContext = {
  id: string;
  topicTitle: string;
  classDate: Date;
  mediaType: string | null;
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
    getFileSize(path: string): Promise<number>;
    createReadStream(path: string, range?: { start: number; end: number }): Promise<FileReadResult>;
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

export type ScheduleAgendaDeps = {
  listLessons(scheduleId: string): Promise<LessonWithContext[]>;
  syncLesson(lesson: LessonWithContext): Promise<void>;
};

const defaultScheduleAgendaDeps: ScheduleAgendaDeps = {
  listLessons: (scheduleId) => lessonRepo.listLessonsBySchedule({ scheduleId }),
  syncLesson: (lesson) => syncAgendaForLesson(lesson),
};

/**
 * Ensures every lesson of a schedule has its agenda; the caller must already own the schedule.
 * A failing lesson never blocks the others.
 */
export async function syncAgendasForSchedule(scheduleId: string, deps: ScheduleAgendaDeps = defaultScheduleAgendaDeps) {
  const lessons = await deps.listLessons(scheduleId);
  let synced = 0;
  let failed = 0;
  for (const lesson of lessons) {
    try {
      await deps.syncLesson(lesson);
      synced += 1;
    } catch (err) {
      failed += 1;
      console.error(`[lesson-service] Falha ao sincronizar a agenda da aula ${lesson.id}:`, err);
    }
  }
  return { synced, failed };
}

export async function updateLesson(id: string, user: LessonActor, raw: unknown, deps: LessonDeps = defaultDeps) {
  const existing = await loadOwned(id, user, deps);
  const input = parseLessonInput(raw, existing);

  // Explicit whitelist: the parent schedule can never be changed through an update.
  const data: Prisma.LessonPlanUncheckedUpdateInput = {};
  if (input.classDate) data.classDate = new Date(input.classDate);
  if (input.classNumber !== undefined) data.classNumber = Number(input.classNumber);
  if (input.topicTitle !== undefined) data.topicTitle = input.topicTitle;
  if (input.dailyObjective !== undefined) data.dailyObjective = input.dailyObjective;
  if (input.timeScript !== undefined) data.timeScript = input.timeScript;
  if (input.methodology !== undefined) data.methodology = input.methodology;
  if (input.resourcesNeeded !== undefined) data.resourcesNeeded = input.resourcesNeeded;
  if (input.fixationExercise !== undefined) data.fixationExercise = input.fixationExercise;
  if (input.mediaType !== undefined) data.mediaType = input.mediaType;
  if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;

  const leavingUpload =
    existing.s3ObjectKey !== null &&
    input.mediaType !== undefined &&
    input.mediaType !== LESSON_MEDIA_TYPE.S3_UPLOAD;
  if (leavingUpload) data.s3ObjectKey = null;

  const updated = await deps.repo.updateLesson(id, data);
  if (leavingUpload && existing.s3ObjectKey) await discardStoredMedia(existing.s3ObjectKey, deps);
  await syncAgendaForLesson(updated, deps);
  return updated;
}

/** Best-effort removal of a replaced/unlinked media file; the DB no longer references it. */
async function discardStoredMedia(key: string, deps: LessonDeps) {
  try {
    await deps.storage.deleteFile(key);
  } catch (err) {
    console.warn(`[lesson-service] Não foi possível remover a mídia antiga ${key}:`, err);
  }
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
  if (lesson.s3ObjectKey) await discardStoredMedia(lesson.s3ObjectKey, deps);
  await syncAgendaForLesson(updated, deps);
  return updated;
}

export type LessonMediaStream =
  | { status: 200 | 206; stream: ReadableStream<Uint8Array>; size: number; start: number; end: number; contentType: string }
  | { status: 416; size: number };

/** Authorizes and opens the lesson media, honouring a single `Range` request. */
export async function openLessonMedia(
  id: string,
  user: LessonActor,
  rangeHeader: string | null,
  deps: LessonDeps = defaultDeps
): Promise<LessonMediaStream> {
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

  const size = await deps.storage.getFileSize(lesson.s3ObjectKey);
  const range = parseRangeHeader(rangeHeader, size);
  if (range === 'unsatisfiable') return { status: 416, size };

  const opened = await deps.storage.createReadStream(lesson.s3ObjectKey, range ?? undefined);
  const ext = mediaExtension(lesson.s3ObjectKey);
  const partial = range !== null && opened.partial;
  return {
    status: partial ? 206 : 200,
    stream: opened.stream,
    size,
    start: partial ? range.start : 0,
    end: partial ? range.end : size - 1,
    contentType: ext ? LESSON_MEDIA_CONTENT_TYPES[ext] : 'application/octet-stream',
  };
}
