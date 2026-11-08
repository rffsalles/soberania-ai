import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const STUDENT_ENROLLMENT = '202601001';
const MS_PER_HOUR = 3_600_000;

describe.skipIf(!TEST_DB_URL)('tutor_step_drafts (banco)', () => {
  let db: typeof import('@/lib/db').db;
  let repo: typeof import('@/domains/classroom/tutor-step-draft-repository');
  let planId: string;
  let agendaId: string;
  let studentId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    db = (await import('@/lib/db')).db;
    repo = await import('@/domains/classroom/tutor-step-draft-repository');
    const student = await db.user.findFirstOrThrow({ where: { enrollment: STUDENT_ENROLLMENT } });
    studentId = student.id;
    const schedule = await db.courseSchedule.findFirstOrThrow();
    const plan = await db.lessonPlan.create({
      data: {
        courseScheduleId: schedule.id,
        classDate: new Date(),
        classNumber: 999,
        topicTitle: 'Plano descartável tutor-drafts',
        dailyObjective: 'x',
        timeScript: [],
        methodology: 'x',
        resourcesNeeded: [],
        fixationExercise: 'x',
      },
    });
    planId = plan.id;
    const start = new Date();
    const agenda = await db.agenda.create({
      data: {
        title: 'Aula descartável tutor-drafts',
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
    if (planId) await db.lessonPlan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  });

  it('reserva: segunda tentativa falha; expira em 60 s; teto de 2 chamadas bloqueia', async () => {
    const { ensureDraft, claimDraft, spendCall, releaseDraft } = repo;
    const d = await ensureDraft(planId, 0, 'h1');
    expect(d.claimActive).toBe(false);
    const first = await claimDraft(d.id);
    expect(first).not.toBeNull();
    expect(await claimDraft(d.id)).toBeNull();
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(true);
    await db.$executeRaw`UPDATE tutor_step_drafts SET "claimedAt" = now() - interval '61 seconds' WHERE id = ${d.id}`;
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(false);
    const second = await claimDraft(d.id);
    expect(second).not.toBeNull();
    // Dono antigo (reserva vencida) não libera a reserva do novo dono.
    const staleClaim = await db.$queryRaw<{ t: string }[]>`SELECT (now() - interval '61 seconds')::timestamp(3)::text AS t`;
    await releaseDraft(d.id, staleClaim[0].t);
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(true);
    expect([await spendCall(d.id), await spendCall(d.id), await spendCall(d.id)]).toEqual([true, true, false]);
    await releaseDraft(d.id, second!);
    expect((await ensureDraft(planId, 0, 'h1')).claimActive).toBe(false);
    expect(await claimDraft(d.id)).toBeNull(); // calls = 2
  });

  it('hash novo zera calls e conteúdo; hash igual preserva', async () => {
    const { ensureDraft, spendCall, saveDraftContent } = repo;
    const d = await ensureDraft(planId, 1, 'a');
    await spendCall(d.id);
    await saveDraftContent(d.id, { card: { x: 1 } });
    expect(await ensureDraft(planId, 1, 'a')).toMatchObject({ calls: 1, card: { x: 1 } });
    expect(await ensureDraft(planId, 1, 'b')).toMatchObject({ calls: 0, card: null, stepHash: 'b' });
  });

  it('resposta única por aluno e evento; classEventSeq nulo repete livre', async () => {
    const base = {
      agendaId,
      studentId,
      type: 'SOCRATIC_CHALLENGE',
      questionText: 'q',
      responseText: 'r',
      isSocraticChallenge: true,
    } as const;
    await db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } });
    await expect(db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } })).rejects.toMatchObject({
      code: 'P2002',
    });
    await db.studentInteraction.create({ data: base });
    await db.studentInteraction.create({ data: base });
  });

  it('índice parcial class_events_tutor_step_uq continua existindo', async () => {
    const r = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'class_events_tutor_step_uq'`;
    expect(r[0].n).toBe(1);
  });
});
