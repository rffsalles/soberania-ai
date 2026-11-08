import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { DEFAULT_PERIODS } from '../src/domains/academic/default-periods';
import { DEFAULT_CATEGORIES } from '../src/domains/rag/default-categories';
import { DEFAULT_CATEGORY_COLOR, MATERIAL_STATUS } from '../src/lib/constants/library';
import { embedTexts, EmbeddingUnavailableError, toVectorLiteral } from '../src/lib/embeddings';
import { LESSON_MEDIA_TYPE } from '../src/lib/constants/teaching';
import { DEMO_USERS } from './seed-data/users';
import {
  DEMO_ASSESSMENT,
  DEMO_CLASS,
  DEMO_COURSE,
  DEMO_DISCIPLINE,
  DEMO_LESSON_PLANS,
  DEMO_TOTAL_CLASSES,
  DEMO_PERIOD_CODE,
  DEMO_SCHEDULE,
  DEMO_TEACHING_PLAN,
} from './seed-data/academic';
import { DEMO_AGENDAS, offsetDate } from './seed-data/agendas';
import { SEED_CORPUS } from './seed-data/corpus';
import { assertSeedAllowed } from './seed-data/production-guard';

assertSeedAllowed();

const PASSWORD_SALT_ROUNDS = 10;
const SEED_FILE_SCHEME = 'seed://';

const prisma = new PrismaClient();

async function seedUsers(classId: string) {
  for (const demo of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });
    const data = {
      name: demo.name,
      enrollment: demo.enrollment,
      role: demo.role,
      classId: demo.role === Role.STUDENT ? classId : null,
    };
    if (existing) {
      const passwordHash = existing.passwordHash || (await bcrypt.hash(demo.passwordPlain, PASSWORD_SALT_ROUNDS));
      await prisma.user.update({ where: { id: existing.id }, data: { ...data, passwordHash } });
    } else {
      const passwordHash = await bcrypt.hash(demo.passwordPlain, PASSWORD_SALT_ROUNDS);
      await prisma.user.create({ data: { ...data, email: demo.email, passwordHash } });
    }
  }
  const teacherEmail = DEMO_USERS.find((u) => u.role === Role.TEACHER)!.email;
  return prisma.user.findUniqueOrThrow({ where: { email: teacherEmail } });
}

async function seedCategories() {
  const categories = [
    ...DEFAULT_CATEGORIES,
    ...[...new Set(SEED_CORPUS.map((c) => c.category).filter((c): c is string => Boolean(c)))]
      .filter((name) => !DEFAULT_CATEGORIES.some((d) => d.name === name))
      .map((name) => ({ name, description: null, color: DEFAULT_CATEGORY_COLOR })),
  ];
  for (const c of categories) {
    await prisma.documentCategory.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name, description: c.description, color: c.color },
    });
  }
}

async function seedCorpus() {
  const byMaterial = new Map<string, typeof SEED_CORPUS>();
  for (const chunk of SEED_CORPUS) {
    byMaterial.set(chunk.materialId, [...(byMaterial.get(chunk.materialId) ?? []), chunk]);
  }

  for (const [materialId, chunks] of byMaterial) {
    const first = chunks[0];
    const material = {
      title: first.bookTitle,
      author: first.author,
      subject: first.category ?? first.bookTitle,
      totalPages: Math.max(...chunks.map((c) => c.pageNumber)),
      filePath: `${SEED_FILE_SCHEME}${materialId}`,
    };
    const categoryNames = [...new Set(chunks.map((c) => c.category).filter((c): c is string => Boolean(c)))];
    const categories = { set: categoryNames.map((name) => ({ name })) };

    const existing = await prisma.didacticMaterial.findFirst({ where: { filePath: material.filePath } });
    const saved = existing
      ? await prisma.didacticMaterial.update({ where: { id: existing.id }, data: { ...material, categories } })
      : await prisma.didacticMaterial.create({
          data: { ...material, categories: { connect: categoryNames.map((name) => ({ name })) } },
        });

    await prisma.materialChunk.deleteMany({ where: { materialId: saved.id } });
    const created = await prisma.materialChunk.createManyAndReturn({
      data: chunks.map((c) => ({
        materialId: saved.id,
        chapter: c.chapter,
        section: c.section ?? null,
        pageNumber: c.pageNumber,
        content: c.content,
      })),
      select: { id: true, content: true },
    });

    const status = await seedEmbeddings(created);
    await prisma.didacticMaterial.update({ where: { id: saved.id }, data: { status } });
  }
}

/** Stores chunk embeddings (vector column managed via raw SQL); lexical-only when the provider is unavailable. */
async function seedEmbeddings(chunks: { id: string; content: string }[]) {
  let vectors: number[][];
  try {
    vectors = await embedTexts(chunks.map((c) => c.content));
  } catch (err) {
    if (!(err instanceof EmbeddingUnavailableError)) throw err;
    console.warn('[seed] Embeddings indisponíveis; materiais indexados apenas para busca léxica:', err.message);
    return MATERIAL_STATUS.INDEXED_LEXICAL_ONLY;
  }
  for (const [i, chunk] of chunks.entries()) {
    await prisma.$executeRaw`UPDATE material_chunks SET embedding = ${toVectorLiteral(vectors[i])}::vector WHERE id = ${chunk.id}`;
  }
  return MATERIAL_STATUS.INDEXED;
}

async function main() {
  // Períodos padrão
  for (const p of DEFAULT_PERIODS) {
    await prisma.academicPeriod.upsert({ where: { code: p.code }, update: { name: p.name }, create: { ...p } });
  }
  const period = await prisma.academicPeriod.findUniqueOrThrow({ where: { code: DEMO_PERIOD_CODE } });

  // Curso, disciplina da matriz, turma, usuários e oferta
  const course = await prisma.course.upsert({
    where: { code: DEMO_COURSE.code },
    update: { name: DEMO_COURSE.name, academicLevel: DEMO_COURSE.academicLevel },
    create: { ...DEMO_COURSE },
  });
  const discipline = await prisma.discipline.upsert({
    where: { courseId_code: { courseId: course.id, code: DEMO_DISCIPLINE.code } },
    update: { name: DEMO_DISCIPLINE.name, workloadHours: DEMO_DISCIPLINE.workloadHours },
    create: { ...DEMO_DISCIPLINE, courseId: course.id },
  });
  const klass = await prisma.class.upsert({
    where: { code: DEMO_CLASS.code },
    update: { name: DEMO_CLASS.name, semester: DEMO_CLASS.semester, courseId: course.id, academicPeriodId: period.id },
    create: { ...DEMO_CLASS, courseId: course.id, academicPeriodId: period.id },
  });
  const teacher = await seedUsers(klass.id);

  const subject = await prisma.subject.upsert({
    where: { disciplineId_classId: { disciplineId: discipline.id, classId: klass.id } },
    update: {},
    create: { disciplineId: discipline.id, classId: klass.id },
  });
  await prisma.teacherSubject.upsert({
    where: { teacherId_subjectId: { teacherId: teacher.id, subjectId: subject.id } },
    update: {},
    create: { teacherId: teacher.id, subjectId: subject.id },
  });

  // Categorias padrão
  await seedCategories();

  // Plano de ensino, cronograma e planos de aula
  const planWhere = { subjectId: subject.id, teacherId: teacher.id };
  const planData = { ...DEMO_TEACHING_PLAN, basicBibliography: [...DEMO_TEACHING_PLAN.basicBibliography], complementaryBiblio: [...DEMO_TEACHING_PLAN.complementaryBiblio] };
  const existingPlan = await prisma.teachingPlan.findFirst({ where: planWhere });
  const plan = existingPlan
    ? await prisma.teachingPlan.update({ where: { id: existingPlan.id }, data: planData })
    : await prisma.teachingPlan.create({ data: { ...planWhere, ...planData } });

  const scheduleData = { ...DEMO_SCHEDULE, totalClasses: DEMO_TOTAL_CLASSES };
  const existingSchedule = await prisma.courseSchedule.findFirst({ where: { teachingPlanId: plan.id } });
  const schedule = existingSchedule
    ? await prisma.courseSchedule.update({ where: { id: existingSchedule.id }, data: scheduleData })
    : await prisma.courseSchedule.create({ data: { teachingPlanId: plan.id, ...scheduleData } });

  const lessonPlans: Record<number, string> = {};
  for (const lesson of DEMO_LESSON_PLANS) {
    const data = {
      classDate: lesson.classDate,
      topicTitle: lesson.topicTitle,
      dailyObjective: `Compreender e praticar: ${lesson.topicTitle}.`,
      timeScript: lesson.timeScript,
      methodology: DEMO_TEACHING_PLAN.methodology,
      resourcesNeeded: [],
      fixationExercise: 'Resolver a lista de exercícios de fixação do capítulo correspondente.',
      mediaType: LESSON_MEDIA_TYPE.NONE,
    };
    const existing = await prisma.lessonPlan.findFirst({
      where: { courseScheduleId: schedule.id, classNumber: lesson.classNumber },
    });
    const saved = existing
      ? await prisma.lessonPlan.update({ where: { id: existing.id }, data })
      : await prisma.lessonPlan.create({
          data: { courseScheduleId: schedule.id, classNumber: lesson.classNumber, ...data },
        });
    lessonPlans[lesson.classNumber] = saved.id;
  }

  // Avaliação
  const assessmentData = {
    type: DEMO_ASSESSMENT.type,
    status: DEMO_ASSESSMENT.status,
    durationMinutes: DEMO_ASSESSMENT.durationMinutes,
    questions: DEMO_ASSESSMENT.questions,
    rubrics: DEMO_ASSESSMENT.rubrics,
  };
  const existingAssessment = await prisma.assessment.findFirst({
    where: { teachingPlanId: plan.id, title: DEMO_ASSESSMENT.title },
  });
  const assessment = existingAssessment
    ? await prisma.assessment.update({ where: { id: existingAssessment.id }, data: assessmentData })
    : await prisma.assessment.create({
        data: { teachingPlanId: plan.id, title: DEMO_ASSESSMENT.title, ...assessmentData },
      });

  // Agendas
  const now = Date.now();
  for (const a of DEMO_AGENDAS) {
    const data = {
      subject: DEMO_DISCIPLINE.name,
      type: a.type,
      status: a.status,
      startTime: offsetDate(now, a.startOffsetMinutes),
      endTime: offsetDate(now, a.endOffsetMinutes),
      videoUrl: a.videoUrl ?? null,
      teacherId: teacher.id,
      subjectId: subject.id,
      lessonPlanId: a.linkLessonPlan ? lessonPlans[3] : null,
      assessmentId: a.linkAssessment ? assessment.id : null,
    };
    const existing = await prisma.agenda.findFirst({ where: { classId: klass.id, title: a.title } });
    if (existing) {
      await prisma.agenda.update({ where: { id: existing.id }, data });
    } else {
      await prisma.agenda.create({ data: { classId: klass.id, title: a.title, ...data } });
    }
  }

  await seedCorpus();

  // Aula vinculada a uma agenda fica publicada
  await prisma.lessonPlan.update({ where: { id: lessonPlans[3] }, data: { status: 'PUBLISHED' } });

  // Referências estruturadas: materiais do acervo cujo título aparece na bibliografia básica
  const seededMaterials = await prisma.didacticMaterial.findMany({ select: { id: true, title: true } });
  for (const material of seededMaterials) {
    const title = material.title.trim().toLowerCase();
    if (!DEMO_TEACHING_PLAN.basicBibliography.some((entry) => entry.toLowerCase().includes(title))) continue;
    await prisma.teachingPlanReference.upsert({
      where: { teachingPlanId_materialId: { teachingPlanId: plan.id, materialId: material.id } },
      update: { kind: 'BASIC' },
      create: { teachingPlanId: plan.id, materialId: material.id, kind: 'BASIC' },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    courses: await prisma.course.count(),
    disciplines: await prisma.discipline.count(),
    classes: await prisma.class.count(),
    subjects: await prisma.subject.count(),
    teacherSubjects: await prisma.teacherSubject.count(),
    academicPeriods: await prisma.academicPeriod.count(),
    documentCategories: await prisma.documentCategory.count(),
    teachingPlans: await prisma.teachingPlan.count(),
    courseSchedules: await prisma.courseSchedule.count(),
    lessonPlans: await prisma.lessonPlan.count(),
    assessments: await prisma.assessment.count(),
    agendas: await prisma.agenda.count(),
    didacticMaterials: await prisma.didacticMaterial.count(),
    materialChunks: await prisma.materialChunk.count(),
    teachingPlanReferences: await prisma.teachingPlanReference.count(),
  };
  console.table(counts);
  console.log('Seed concluído');
}

main()
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
