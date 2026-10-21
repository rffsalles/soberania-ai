import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DB_URL = process.env.DATABASE_URL_TEST;
const SUFFIX = `${Date.now()}`;
const MS_PER_MINUTE = 60_000;
const STUDENT_ENROLLMENT = '202601001';

const TEXT_CONTENT = [
  'A terceira forma normal (3FN) exige que nenhum atributo não chave dependa transitivamente da chave primária.',
  'A normalização reduz redundância e anomalias de atualização em bancos de dados relacionais.',
].join(' ');

const QUESTIONS = [
  {
    id: 'q1',
    enunciation: 'Qual forma normal elimina dependências transitivas?',
    options: [
      { key: 'A', text: 'Primeira forma normal' },
      { key: 'B', text: 'Segunda forma normal' },
      { key: 'C', text: 'Terceira forma normal' },
      { key: 'D', text: 'Nenhuma das anteriores' },
    ],
    correctKey: 'C',
    rationale: 'A 3FN remove dependências transitivas.',
    topic: 'Normalização',
  },
  {
    id: 'q2',
    enunciation: 'A normalização busca principalmente reduzir o quê?',
    options: [
      { key: 'A', text: 'Redundância de dados' },
      { key: 'B', text: 'Número de tabelas' },
      { key: 'C', text: 'Segurança' },
      { key: 'D', text: 'Desempenho de rede' },
    ],
    correctKey: 'A',
    rationale: 'Menos redundância, menos anomalias.',
    topic: 'Normalização',
  },
];

describe.skipIf(!TEST_DB_URL)('full pedagogical flow over Postgres (service level)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soberania-e2e-'));
  const startedAt = new Date();

  type Db = typeof import('@/lib/db').db;
  let db: Db;
  let teacherId = '';
  let subjectId = '';
  let planId = '';
  let materialId = '';
  let assessmentId = '';
  const agendaIds: string[] = [];
  let lessonAgendaId = '';
  let examAgendaId = '';
  let heatmapTopic = '';
  let expectedAnsweredChallenges = 0;

  let teacher: { id: string; role: 'TEACHER'; classId: string | null };
  let student: { id: string; role: 'STUDENT'; classId: string | null };
  let classId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.AI_PROVIDER = 'mock';
    process.env.STORAGE_PROVIDER = 'local';
    process.env.MATERIALS_STORAGE_DIR = path.join(tmpDir, 'materials');
    process.env.MEDIA_STORAGE_DIR = path.join(tmpDir, 'media');
    db = (await import('@/lib/db')).db;

    const seededStudent = await db.user.findFirstOrThrow({ where: { enrollment: STUDENT_ENROLLMENT } });
    classId = seededStudent.classId!;
    student = { id: seededStudent.id, role: 'STUDENT', classId };
  });

  afterAll(async () => {
    if (agendaIds.length) await db.agenda.deleteMany({ where: { id: { in: agendaIds } } });
    if (planId) await db.teachingPlan.deleteMany({ where: { id: planId } });
    if (subjectId) await db.subject.deleteMany({ where: { id: subjectId } });
    if (teacherId) await db.user.deleteMany({ where: { id: teacherId } });
    if (materialId) {
      const { removeMaterial } = await import('@/domains/rag/services/library-service');
      await removeMaterial(materialId).catch(() => undefined);
    }
    await db.inferenceLog.deleteMany({ where: { createdAt: { gte: startedAt } } });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await db.$disconnect();
  });

  it('admin creates a teacher and a subject for the seeded class', async () => {
    const { createTeacher, createSubject } = await import('@/domains/academic/services/subject-service');
    const created = await createTeacher({
      name: `Prof E2E ${SUFFIX}`,
      email: `prof-e2e-${SUFFIX}@soberania.test`,
      enrollment: `E2E${SUFFIX}`,
      password: 'senha-e2e-123',
    });
    teacherId = created.id;
    teacher = { id: teacherId, role: 'TEACHER', classId: null };

    // Mesmo shape que POST /admin/subjects aceita: o schema da rota valida o corpo.
    const { upsertSubjectSchema } = await import('@/lib/validators/admin.validator');
    const subject = await createSubject(
      upsertSubjectSchema.parse({
        name: `Banco de Dados E2E ${SUFFIX}`,
        code: `E2E${SUFFIX}`,
        courseName: 'ADS',
        classId,
        teacherIds: [teacherId],
      })
    );
    subjectId = subject.id;
    expect(subject.teacherAssignments.map((a) => a.teacherId)).toEqual([teacherId]);
    expect(subject.classId).toBe(classId);
  });

  it('teacher uploads a .txt that is chunked and embedded', async () => {
    const { ingestTextDocument } = await import('@/domains/rag/services/library-service');
    const { material } = await ingestTextDocument({
      title: `Livro E2E ${SUFFIX}`,
      author: 'Autor E2E',
      categories: ['E2E'],
      text: TEXT_CONTENT,
    });
    materialId = material.id;
    expect(material.totalChunks).toBeGreaterThan(0);
    expect(material.status).toBe('INDEXED');
    expect(await db.materialChunk.count({ where: { materialId } })).toBe(material.totalChunks);
    const [{ embedded }] = await db.$queryRaw<{ embedded: bigint }[]>`
      SELECT count(*) AS embedded FROM material_chunks WHERE "materialId" = ${materialId} AND embedding IS NOT NULL`;
    expect(Number(embedded)).toBe(material.totalChunks);
  });

  it('teacher creates plan, schedule, lessons and the lesson agenda', async () => {
    const { createPlan } = await import('@/domains/teaching/services/teaching-plan-service');
    const { createSchedule, syncLessons } = await import('@/domains/teaching/services/schedule-service');
    const { syncAgendasForSchedule, updateLesson } = await import('@/domains/teaching/services/lesson-service');

    const plan = await createPlan(teacher, {
      subjectId,
      syllabus: 'Modelagem e normalização de bancos de dados relacionais.',
      unitsContent: [{ unitNumber: 1, title: 'Normalização', topics: ['3FN'] }],
    });
    planId = plan.id;

    // A aula começa no minuto local de 5 minutos atrás: a agenda gerada pelo fluxo normal fica LIVE agora.
    const { INSTITUTION_TIMEZONE } = await import('@/lib/constants/teaching');
    const { toLocalDateTimeInput } = await import('@/lib/timezone');
    const [classDay, startTime] = toLocalDateTimeInput(
      new Date(Date.now() - 5 * MS_PER_MINUTE),
      INSTITUTION_TIMEZONE
    ).split('T');
    // Mesmo shape que POST /teacher/schedules aceita.
    const { createScheduleSchema } = await import('@/lib/validators/schedule.validator');
    const schedule = await createSchedule(
      teacher,
      createScheduleSchema.parse({
        teachingPlanId: planId,
        startDate: classDay,
        endDate: classDay,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        holidays: [],
        startTime,
      })
    );
    expect(schedule.meetings.length).toBe(1);
    const scheduleId = (schedule as unknown as { id: string }).id;

    const synced = await syncLessons(scheduleId, teacher);
    expect(synced.created).toBe(1);

    const lesson = await db.lessonPlan.findFirstOrThrow({ where: { courseScheduleId: scheduleId } });
    expect(toLocalDateTimeInput(lesson.classDate, INSTITUTION_TIMEZONE)).toBe(`${classDay}T${startTime}`);
    // Edição como o LessonEditor envia: classDate em datetime-local no fuso da instituição.
    await updateLesson(lesson.id, { ...teacher }, {
      classDate: `${classDay}T${startTime}`,
      topicTitle: `Normalização E2E ${SUFFIX}`,
    });
    await syncAgendasForSchedule(scheduleId);

    const agenda = await db.agenda.findFirstOrThrow({ where: { lessonPlanId: lesson.id } });
    lessonAgendaId = agenda.id;
    agendaIds.push(agenda.id);
    expect(agenda).toMatchObject({ type: 'CLASSROOM', classId, subjectId, teacherId });
    expect(agenda.startTime.getTime()).toBe(lesson.classDate.getTime());
  });

  it('teacher creates and publishes an exam', async () => {
    const { createAssessment } = await import('@/domains/teaching/services/teaching-content-service');
    const { publishAssessment } = await import('@/domains/assessments/services/assessment-service');

    const assessment = (await createAssessment(teacher, {
      teachingPlanId: planId,
      title: `Prova E2E ${SUFFIX}`,
      questions: QUESTIONS,
      rubrics: [],
      maxScore: 10,
      durationMinutes: 60,
    })) as { id: string };
    assessmentId = assessment.id;

    const agenda = await publishAssessment(
      assessmentId,
      teacher,
      { classId, startTime: new Date(Date.now() - MS_PER_MINUTE).toISOString() }
    );
    examAgendaId = agenda.id;
    agendaIds.push(agenda.id);
    expect(agenda).toMatchObject({ type: 'EXAM', assessmentId });
  });

  it('student chats on the lesson agenda: 1 interaction and an inference log are persisted', async () => {
    const { chatWithTutor } = await import('@/domains/agents/services/chat-service');
    const logsBefore = await db.inferenceLog.count();

    const result = await chatWithTutor(student, {
      agendaId: lessonAgendaId,
      message: 'O que é a terceira forma normal?',
    });

    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.blockedByExamGuardrail).toBe(false);
    expect(result.interactionId).toBeTruthy();
    expect(await db.studentInteraction.count({ where: { agendaId: lessonAgendaId, studentId: student.id } })).toBe(1);
    expect(await db.inferenceLog.count()).toBe(logsBefore + 1);
  });

  it('student answers a persisted Socratic challenge and the judge marks it wrong', async () => {
    const { chatWithTutor } = await import('@/domains/agents/services/chat-service');
    const { getAgendaForUser } = await import('@/domains/agendas/services/agenda-service');
    const { createInteraction, findLastInteraction } = await import(
      '@/domains/pedagogy/services/interaction-repository'
    );
    const { createInferenceLog } = await import('@/domains/telemetry/services/inference-log-repository');
    const { JUDGE_SYSTEM_PROMPT } = await import('@/lib/constants/tutor');
    type StreamChunk = import('@/lib/ai-provider').StreamChunk;

    // Provedor "real" falso: a tutora responde com um desafio; o juiz reprova só a resposta a esse desafio.
    const CHALLENGE = 'Antes de seguir: qual a diferença entre 2FN e 3FN?';
    const judgeCalls: string[] = [];
    const tutorReplies = [CHALLENGE, 'Vamos revisar a dependência transitiva.'];
    const deps = {
      getAgenda: getAgendaForUser,
      createInteraction,
      createInferenceLog,
      findLastInteraction,
      provider: 'ollama' as const,
      async *streamChat(messages: { role: string; content: string }[]): AsyncGenerator<StreamChunk> {
        if (messages[0]?.content === JUDGE_SYSTEM_PROMPT) {
          judgeCalls.push(messages[1].content);
          yield { token: messages[1].content.includes(CHALLENGE) ? 'INCORRETO' : 'CORRETO', isComplete: false };
        } else {
          yield { token: tutorReplies.shift() ?? 'Ok.', isComplete: false };
        }
        yield { token: '', isComplete: true };
      },
    };

    // O turno anterior (provedor mock) também pode ter terminado em desafio; aí este turno é julgado CORRETO.
    const previous = await db.studentInteraction.findFirstOrThrow({
      where: { agendaId: lessonAgendaId, studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });
    const challenge = await chatWithTutor(student, { agendaId: lessonAgendaId, message: 'Explique a 3FN.' }, deps);
    expect(challenge.isSocraticChallenge).toBe(true);
    expect(challenge.wasCorrect).toBe(previous.isSocraticChallenge ? true : null);
    expectedAnsweredChallenges = previous.isSocraticChallenge ? 2 : 1;

    const answer = await chatWithTutor(
      student,
      { agendaId: lessonAgendaId, message: 'A 2FN e a 3FN são a mesma coisa.' },
      deps
    );
    expect(answer.wasCorrect).toBe(false);
    expect(judgeCalls.filter((c) => c.includes(CHALLENGE))).toHaveLength(1);

    const stored = await db.studentInteraction.findUniqueOrThrow({ where: { id: answer.interactionId! } });
    expect(stored).toMatchObject({ wasCorrect: false, studentId: student.id, agendaId: lessonAgendaId });
    expect(stored.ragSourceBook).toBeTruthy();
    heatmapTopic =
      stored.ragSourcePage == null ? stored.ragSourceBook! : `${stored.ragSourceBook}, pág. ${stored.ragSourcePage}`;
  });

  it('student submits the exam and the score is computed server-side', async () => {
    const { getExamForStudent, submitExam } = await import('@/domains/assessments/services/exam-service');

    const exam = await getExamForStudent(student, examAgendaId);
    expect(exam.questions).toHaveLength(2);
    expect(JSON.stringify(exam.questions)).not.toContain('correctKey');

    const result = await submitExam(student, examAgendaId, {
      answers: [
        { questionId: 'q1', chosenKey: 'C', timeSpentSeconds: 20 },
        { questionId: 'q2', chosenKey: 'B', timeSpentSeconds: 15 },
      ],
      integrityLog: { blurEvents: 0, guardrailBlocks: 0 },
    });
    expect(result).toMatchObject({ score: 5, maxScore: 10, correct: 1, total: 2 });
    await expect(
      submitExam(student, examAgendaId, { answers: [], integrityLog: { blurEvents: 0, guardrailBlocks: 0 } })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('completing the agenda generates the minute; listMinutes and buildHeatmap read it back', async () => {
    const { setAgendaStatus } = await import('@/domains/agendas/services/agenda-service');
    const { generateMinutesForAgenda, listMinutes } = await import('@/domains/pedagogy/services/minutes-service');
    const { buildHeatmap } = await import('@/domains/pedagogy/services/reports-service');

    const completed = await setAgendaStatus(lessonAgendaId, teacher, 'COMPLETED');
    expect(completed.status).toBe('COMPLETED');
    const generation = await generateMinutesForAgenda(lessonAgendaId, teacher);
    expect(generation).toEqual({ generated: 1, failed: [] });

    const minutes = await listMinutes(teacher, { agendaId: lessonAgendaId });
    expect(minutes).toHaveLength(1);
    expect(minutes[0]).toMatchObject({ studentId: student.id, totalQuestionsAsked: expect.any(Number) });
    // Conta as interações que seguem um desafio persistido.
    expect(minutes[0].socraticChallengesAnswered).toBe(expectedAnsweredChallenges);
    expect(minutes[0].topicsStruggled).toContain(heatmapTopic);

    const heatmap = buildHeatmap(minutes);
    expect(heatmap).toEqual([
      expect.objectContaining({ topic: heatmapTopic, strugglePercentage: 100, affectedStudentsCount: 1 }),
    ]);
  });
});
