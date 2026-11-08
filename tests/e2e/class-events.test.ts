import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const STUDENT_ENROLLMENT = '202601001';
const MS_PER_HOUR = 3_600_000;

describe.skipIf(!TEST_DB_URL)('class_events (banco)', () => {
  let db: typeof import('@/lib/db').db;
  let agendaId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import('@/lib/db')).db;
    const student = await db.user.findFirstOrThrow({ where: { enrollment: STUDENT_ENROLLMENT } });
    const start = new Date();
    const agenda = await db.agenda.create({
      data: {
        title: 'Aula descartável class-events',
        subject: 'Teste',
        type: 'CLASSROOM',
        startTime: start,
        endTime: new Date(start.getTime() + MS_PER_HOUR),
        classId: student.classId!,
      },
    });
    agendaId = agenda.id;
  });

  afterAll(async () => {
    if (agendaId) await db.agenda.deleteMany({ where: { id: agendaId } });
    await db.$disconnect();
  });

  it('índice parcial: segundo TUTOR_CARD do mesmo passo dá P2002; STEP_CHANGED repetido não', async () => {
    const base = { agendaId, payload: {}, audience: 'ALL' };
    await db.classEvent.create({ data: { ...base, seq: 1, type: 'TUTOR_CARD', stepIndex: 0, createdBy: 'TUTOR' } });
    await expect(
      db.classEvent.create({ data: { ...base, seq: 2, type: 'TUTOR_CARD', stepIndex: 0, createdBy: 'TUTOR' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await db.classEvent.create({ data: { ...base, seq: 3, type: 'STEP_CHANGED', stepIndex: 0, createdBy: 'TEACHER' } });
    await db.classEvent.create({ data: { ...base, seq: 4, type: 'STEP_CHANGED', stepIndex: 0, createdBy: 'TEACHER' } });
  });

  it('(agendaId, seq) é único', async () => {
    await expect(
      db.classEvent.create({
        data: { agendaId, seq: 1, type: 'SESSION_STARTED', payload: {}, audience: 'ALL', createdBy: 'TEACHER' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe.skipIf(!TEST_DB_URL)('class-event-repository (banco)', () => {
  let db: typeof import('@/lib/db').db;
  const agendaIds: string[] = [];

  const freshAgenda = async (): Promise<string> => {
    const student = await db.user.findFirstOrThrow({ where: { enrollment: STUDENT_ENROLLMENT } });
    const start = new Date();
    const agenda = await db.agenda.create({
      data: {
        title: 'Aula descartável repositório',
        subject: 'Teste',
        type: 'CLASSROOM',
        startTime: start,
        endTime: new Date(start.getTime() + MS_PER_HOUR),
        classId: student.classId!,
      },
    });
    agendaIds.push(agenda.id);
    return agenda.id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import('@/lib/db')).db;
  });

  afterAll(async () => {
    await db.agenda.deleteMany({ where: { id: { in: agendaIds } } });
    await db.$disconnect();
  });

  it('10 appends concorrentes geram seq 1..10 sem buraco', async () => {
    const { appendEvents } = await import('@/domains/classroom/class-event-repository');
    const freshAgendaId = await freshAgenda();
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        appendEvents(freshAgendaId, () => [
          { type: 'TEACHER_NOTE', stepIndex: null, payload: { tutor: null, scope: 'LESSON' }, audience: 'TEACHER', createdBy: 'TEACHER' },
        ]),
      ),
    );
    expect(rows.flat().map((r) => r.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('dois SESSION_STARTED simultâneos: um grava, o outro 409', async () => {
    const { appendEvents } = await import('@/domains/classroom/class-event-repository');
    const { DomainError } = await import('@/lib/api/domain-error');
    const otherAgendaId = await freshAgenda();
    const start = () =>
      appendEvents(otherAgendaId, (ctx) => {
        if (ctx.phase !== 'NOT_STARTED') throw new DomainError(409, 'A aula já foi iniciada.', { code: 'CLASS_ALREADY_STARTED' });
        return [{ type: 'SESSION_STARTED', stepIndex: null, payload: {}, audience: 'ALL', createdBy: 'TEACHER' }];
      });
    const r = await Promise.allSettled([start(), start()]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('audience filtrado no WHERE', async () => {
    const { appendEvents, findEventsAfter } = await import('@/domains/classroom/class-event-repository');
    const id = await freshAgenda();
    const note = (audience: string) => ({
      type: 'TEACHER_NOTE' as const,
      stepIndex: null,
      payload: { tutor: null, scope: 'LESSON' },
      audience,
      createdBy: 'TEACHER' as const,
    });
    await appendEvents(id, () => [note('ALL'), note('TEACHER'), note('s1'), note('s2')]);
    const rows = await findEventsAfter(id, 0, ['ALL', 's1'], 200);
    expect(rows.map((r) => r.audience)).toEqual(['ALL', 's1']);
  });
});
