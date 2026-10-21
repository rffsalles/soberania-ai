import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { INSTITUTION_TIMEZONE, LESSON_TEXT_MAX_LENGTH, LESSON_TITLE_MAX_LENGTH } from '@/lib/constants/teaching';
import { localDateTimeToUtc, toLocalDateTimeInput } from '@/lib/timezone';
import {
  openLessonMedia,
  syncAgendaForLesson,
  syncAgendasForSchedule,
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
  mediaType: null,
  mediaUrl: null,
  s3ObjectKey: null,
  courseSchedule: { teachingPlan: { teacherId, subject: { id: 'sub1', name: 'BD', classId } } },
});

function makeDeps(opts: { teacherId?: string; classId?: string | null; s3ObjectKey?: string | null; mediaType?: string | null; mediaUrl?: string | null; failDelete?: boolean } = {}) {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string, arg: unknown) => {
    (calls[name] ||= []).push(arg);
  };
  const agendas = new Map<string, Record<string, unknown>>();
  const lessonRow: LessonWithContext = {
    ...baseLesson(opts.teacherId ?? 't1', opts.classId === undefined ? 'c1' : opts.classId),
    s3ObjectKey: opts.s3ObjectKey ?? null,
    mediaType: opts.mediaType ?? null,
    mediaUrl: opts.mediaUrl ?? null,
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
      getFileSize: async () => 1000,
      createReadStream: async (p, range) => {
        rec('stream', { p, range });
        return { stream: new Response('x').body as ReadableStream<Uint8Array>, size: 1000, partial: Boolean(range) };
      },
      deleteFile: async (p) => {
        if (opts.failDelete) throw new Error('disk');
        rec('delete', p);
      },
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

  it('interpreta classDate de datetime-local no fuso da instituição e a agenda começa às 19:00 locais', async () => {
    const { deps, calls, agendas } = makeDeps();
    await updateLesson('own', teacher, { classDate: '2026-03-02T19:00' }, deps);
    const saved = (calls.updateLesson[0] as { data: { classDate: Date } }).data.classDate;
    expect(saved.toISOString()).toBe('2026-03-02T22:00:00.000Z');
    const start = agendas.get('own')!.startTime as Date;
    expect(start.toLocaleTimeString('pt-BR', { timeZone: INSTITUTION_TIMEZONE, hour: '2-digit', minute: '2-digit' })).toBe(
      '19:00'
    );
  });

  it('rejeita classDate inválida com 400 em vez de erro do banco', async () => {
    const { deps, calls } = makeDeps();
    for (const classDate of ['amanhã', '2026-02-30T19:00', '2026-03-02T25:00']) {
      await expect(updateLesson('own', teacher, { classDate }, deps)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls.updateLesson).toBeUndefined();
  });

  it('rejeita textos acima do limite com 400', async () => {
    const { deps } = makeDeps();
    await expect(
      updateLesson('own', teacher, { topicTitle: 'x'.repeat(LESSON_TITLE_MAX_LENGTH + 1) }, deps)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      updateLesson('own', teacher, { methodology: 'x'.repeat(LESSON_TEXT_MAX_LENGTH + 1) }, deps)
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('lesson-service syncAgendaForLesson', () => {
  it('aula gerada pelo cronograma às 19:00 locais gera agenda [19:00, 19:00 + duração] no fuso da instituição', async () => {
    const { deps, agendas } = makeDeps();
    const classDate = localDateTimeToUtc('2026-03-02', '19:00', INSTITUTION_TIMEZONE);
    await syncAgendaForLesson({ ...baseLesson('t1'), classDate }, deps);
    const agenda = agendas.get('own')!;
    expect((agenda.startTime as Date).getTime()).toBe(classDate.getTime());
    expect(toLocalDateTimeInput(agenda.startTime as Date, INSTITUTION_TIMEZONE)).toBe('2026-03-02T19:00');
    expect(toLocalDateTimeInput(agenda.endTime as Date, INSTITUTION_TIMEZONE)).toBe('2026-03-02T20:40');
  });

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

describe('lesson-service openLessonMedia', () => {
  it('404 when the lesson has no stored media', async () => {
    const { deps } = makeDeps();
    await expect(openLessonMedia('own', teacher, null, deps)).rejects.toMatchObject({ status: 404 });
  });

  it('serves students of the lesson class only', async () => {
    const { deps } = makeDeps({ s3ObjectKey: 'media/aula.mp4' });
    const ok = await openLessonMedia('own', student, null, deps);
    expect(ok).toMatchObject({ status: 200, contentType: 'video/mp4', start: 0, end: 999 });
    await expect(openLessonMedia('own', otherStudent, null, deps)).rejects.toMatchObject({ status: 403 });
  });

  it('answers a Range request with 206 and the requested window', async () => {
    const { deps, calls } = makeDeps({ s3ObjectKey: 'media/aula.mp4' });
    const res = await openLessonMedia('own', student, 'bytes=100-199', deps);
    expect(res).toMatchObject({ status: 206, start: 100, end: 199, size: 1000 });
    expect(calls.stream).toEqual([{ p: 'media/aula.mp4', range: { start: 100, end: 199 } }]);
  });

  it('answers 416 for an unsatisfiable range without opening the file', async () => {
    const { deps, calls } = makeDeps({ s3ObjectKey: 'media/aula.mp4' });
    expect(await openLessonMedia('own', student, 'bytes=5000-', deps)).toEqual({ status: 416, size: 1000 });
    expect(calls.stream).toBeUndefined();
  });
});

describe('lesson-service media validation', () => {
  it('rejects a bad URL in a mediaUrl-only update of a YOUTUBE lesson', async () => {
    const { deps } = makeDeps({ mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk' });
    await expect(updateLesson('own', teacher, { mediaUrl: 'https://evil.example/x' }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unknown mediaType, an unanchored URL and S3 fields set by hand', async () => {
    const { deps } = makeDeps();
    await expect(updateLesson('own', teacher, { mediaType: 'VIMEO' }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(
      updateLesson('own', teacher, { mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk.evil.com/x y' }, deps)
    ).rejects.toMatchObject({ status: 400 });
    await expect(updateLesson('own', teacher, { mediaType: 'S3_UPLOAD' }, deps)).rejects.toMatchObject({ status: 400 });
    await expect(updateLesson('own', teacher, { s3ObjectKey: 'x' }, deps)).rejects.toMatchObject({ status: 400 });
  });

  it('clears mediaUrl when the type becomes NONE', async () => {
    const { deps, calls } = makeDeps({ mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk' });
    await updateLesson('own', teacher, { mediaType: 'NONE', mediaUrl: 'https://youtu.be/abcdefghijk' }, deps);
    expect(calls.updateLesson).toEqual([{ id: 'own', data: { mediaType: 'NONE', mediaUrl: null } }]);
  });

  it('keeps the upload when an S3_UPLOAD lesson is saved without touching its URL', async () => {
    const { deps, calls } = makeDeps({ mediaType: 'S3_UPLOAD', s3ObjectKey: 'media/a.mp4' });
    await updateLesson('own', teacher, { mediaType: 'S3_UPLOAD', topicTitle: 'z' }, deps);
    expect(calls.updateLesson).toEqual([{ id: 'own', data: { mediaType: 'S3_UPLOAD', topicTitle: 'z' } }]);
    expect(calls.delete).toBeUndefined();
  });

  it('clears s3ObjectKey and deletes the stored file when switching to YouTube', async () => {
    const { deps, calls } = makeDeps({ mediaType: 'S3_UPLOAD', s3ObjectKey: 'media/a.mp4' });
    await updateLesson('own', teacher, { mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk' }, deps);
    expect(calls.updateLesson).toEqual([
      { id: 'own', data: { mediaType: 'YOUTUBE', mediaUrl: 'https://youtu.be/abcdefghijk', s3ObjectKey: null } },
    ]);
    expect(calls.delete).toEqual(['media/a.mp4']);
  });

  it('does not fail the update when deleting the old file fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = makeDeps({ mediaType: 'S3_UPLOAD', s3ObjectKey: 'media/a.mp4', failDelete: true });
    await expect(updateLesson('own', teacher, { mediaType: 'NONE' }, deps)).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('syncAgendasForSchedule', () => {
  it('keeps syncing the other lessons when one fails and reports the counts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lessons = ['a', 'b', 'c'].map((id) => ({ ...baseLesson('t1'), id }));
    const synced: string[] = [];
    const result = await syncAgendasForSchedule('s1', {
      listLessons: async () => lessons,
      syncLesson: async (l) => {
        if (l.id === 'b') throw new Error('boom');
        synced.push(l.id);
      },
    });
    expect(result).toEqual({ synced: 2, failed: 1 });
    expect(synced).toEqual(['a', 'c']);
    error.mockRestore();
  });
});
