import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import {
  getLessonMedia,
  syncAgendaForLesson,
  updateLesson,
  uploadLessonMedia,
  type LessonDeps,
  type LessonWithContext,
} from '../lesson-service';

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const student = { id: 's1', role: Role.STUDENT, classId: 'c1' };
const otherStudent = { id: 's2', role: Role.STUDENT, classId: 'c9' };

const baseLesson = (teacherId: string, classId: string | null = 'c1'): LessonWithContext => ({
  id: 'own',
  topicTitle: 'Aula 1',
  classDate: new Date('2026-03-02T13:00:00Z'),
  mediaUrl: null,
  s3ObjectKey: null,
  courseSchedule: { teachingPlan: { teacherId, subject: { id: 'sub1', name: 'BD', classId } } },
});

function makeDeps(opts: { teacherId?: string; classId?: string | null; s3ObjectKey?: string | null } = {}) {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string, arg: unknown) => {
    (calls[name] ||= []).push(arg);
  };
  const agendas = new Map<string, Record<string, unknown>>();
  const lessonRow: LessonWithContext = {
    ...baseLesson(opts.teacherId ?? 't1', opts.classId === undefined ? 'c1' : opts.classId),
    s3ObjectKey: opts.s3ObjectKey ?? null,
  };
  const deps: LessonDeps = {
    repo: {
      findLessonWithContext: async (id) => (id === 'own' ? lessonRow : null),
      updateLesson: async (id, data) => {
        rec('updateLesson', { id, data });
        return { ...lessonRow, ...(data as object) } as LessonWithContext;
      },
      upsertAgendaByLessonPlanId: async (lessonPlanId, data) => {
        const existing = agendas.get(lessonPlanId);
        agendas.set(lessonPlanId, { ...(existing ?? { id: `ag-${agendas.size + 1}` }), ...data });
        rec('upsert', lessonPlanId);
        return agendas.get(lessonPlanId) as never;
      },
    },
    storage: {
      uploadFile: async (buffer, name, mime, prefix) => {
        rec('upload', { name, mime, prefix, size: buffer.length });
        return { key: 'k', filePath: `media/${name}`, provider: 'local' as const };
      },
      getFileBuffer: async () => ({ buffer: Buffer.from('x') }),
      deleteFile: async (p) => void rec('delete', p),
    },
  };
  return { deps, calls, agendas };
}

describe('lesson-service updateLesson', () => {
  it('rejects an invalid YouTube URL with 400', async () => {
    const { deps, calls } = makeDeps();
    await expect(
      updateLesson('own', teacher, { mediaType: 'YOUTUBE', mediaUrl: 'https://example.com/x' }, deps)
    ).rejects.toMatchObject({ status: 400 });
    expect(calls.updateLesson).toBeUndefined();
  });

  it('accepts a valid YouTube URL and syncs the agenda', async () => {
    const { deps, agendas } = makeDeps();
    await updateLesson('own', teacher, { mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk' }, deps);
    expect(agendas.get('own')).toMatchObject({ videoUrl: 'https://youtu.be/abcdefghijk' });
  });

  it('rejects a timeScript item without timeSeconds with 400', async () => {
    const { deps } = makeDeps();
    await expect(
      updateLesson('own', teacher, { timeScript: [{ timeRange: '0-1', activity: 'a', description: 'd' }] as never }, deps)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('enforces ownership and never forwards courseScheduleId', async () => {
    const foreign = makeDeps({ teacherId: 't2' });
    await expect(updateLesson('own', teacher, { topicTitle: 'y' }, foreign.deps)).rejects.toMatchObject({ status: 403 });
    const { deps, calls } = makeDeps();
    await expect(updateLesson('nope', teacher, { topicTitle: 'y' }, deps)).rejects.toMatchObject({ status: 404 });
    await updateLesson('own', teacher, { topicTitle: 'y', courseScheduleId: 'other', id: 'zzz' } as never, deps);
    expect(calls.updateLesson).toEqual([{ id: 'own', data: { topicTitle: 'y' } }]);
  });
});

describe('lesson-service syncAgendaForLesson', () => {
  it('creates one agenda, then the second call updates the same one', async () => {
    const { deps, agendas, calls } = makeDeps();
    const lesson = baseLesson('t1');
    await syncAgendaForLesson(lesson, deps);
    await syncAgendaForLesson({ ...lesson, mediaUrl: 'https://youtu.be/abcdefghijk' }, deps);
    expect(calls.upsert).toHaveLength(2);
    expect(agendas.size).toBe(1);
    const agenda = agendas.get('own');
    expect(agenda).toMatchObject({
      title: 'Aula 1',
      type: 'CLASSROOM',
      classId: 'c1',
      subjectId: 'sub1',
      teacherId: 't1',
      subject: 'BD',
      videoUrl: 'https://youtu.be/abcdefghijk',
    });
    expect((agenda!.endTime as Date).getTime() - (agenda!.startTime as Date).getTime()).toBe(100 * 60 * 1000);
  });

  it('skips the sync when the subject has no class', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps, calls } = makeDeps();
    await syncAgendaForLesson(baseLesson('t1', null), deps);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(calls.upsert).toBeUndefined();
  });
});

describe('lesson-service uploadLessonMedia', () => {
  const file = (name: string, size = 10) => ({ buffer: Buffer.alloc(size), name, mime: 'application/octet-stream' });

  it('rejects disallowed extensions with 400', async () => {
    const { deps, calls } = makeDeps();
    await expect(uploadLessonMedia('own', teacher, file('virus.exe'), deps)).rejects.toMatchObject({ status: 400 });
    expect(calls.upload).toBeUndefined();
  });

  it('rejects files over the size limit with 400', async () => {
    const { deps } = makeDeps();
    const tooBig = file('aula.mp4', 200 * 1024 * 1024 + 1);
    await expect(uploadLessonMedia('own', teacher, tooBig, deps)).rejects.toMatchObject({ status: 400 });
  });

  it('stores the file under the media prefix and records the lesson media', async () => {
    const { deps, calls } = makeDeps();
    await uploadLessonMedia('own', teacher, file('aula.mp4'), deps);
    expect(calls.upload).toEqual([{ name: 'aula.mp4', mime: 'application/octet-stream', prefix: 'media', size: 10 }]);
    expect(calls.updateLesson).toEqual([
      {
        id: 'own',
        data: { mediaType: 'S3_UPLOAD', mediaUrl: '/api/v1/teacher/lessons/own/media', s3ObjectKey: 'media/aula.mp4' },
      },
    ]);
  });

  it('forbids a teacher that does not own the lesson', async () => {
    const { deps } = makeDeps({ teacherId: 't2' });
    await expect(uploadLessonMedia('own', teacher, file('a.mp4'), deps)).rejects.toMatchObject({ status: 403 });
  });
});

describe('lesson-service getLessonMedia', () => {
  it('404 when the lesson has no stored media', async () => {
    const { deps } = makeDeps();
    await expect(getLessonMedia('own', teacher, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('serves students of the lesson class only', async () => {
    const { deps } = makeDeps({ s3ObjectKey: 'media/aula.mp4' });
    const ok = await getLessonMedia('own', student, deps);
    expect(ok.contentType).toBe('video/mp4');
    await expect(getLessonMedia('own', otherStudent, deps)).rejects.toMatchObject({ status: 403 });
  });
});
