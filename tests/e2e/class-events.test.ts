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
