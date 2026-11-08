import { expect, test, type Page } from '@playwright/test';
import { Prisma, PrismaClient, type AgendaStatus } from '@prisma/client';
import { DEMO_CREDENTIALS } from '../../src/lib/constants/demo-credentials';
import { DEMO_LIVE_TIME_SCRIPT } from '../../prisma/seed-data/academic';
import { stepHash } from '../../src/domains/classroom/tutor-step-hash';

const prisma = new PrismaClient();
let agendaId: string;
let steps: string[];
let lessonPlanId: string;
let original: { status: AgendaStatus; startTime: Date; endTime: Date };

const TUTOR_PURPOSES = ['TUTOR_CARD', 'TUTOR_QUESTION'] as const;
const tutorLogCount = () => prisma.inferenceLog.count({ where: { agendaId, purpose: { in: [...TUTOR_PURPOSES] } } });

async function clearClassData() {
  await prisma.classEvent.deleteMany({ where: { agendaId } });
  await prisma.tutorStepDraft.deleteMany({ where: { lessonPlanId } });
  await prisma.studentInteraction.deleteMany({ where: { agendaId, classEventSeq: { not: null } } });
}

/** Aula limpa, LIVE na janela atual e com a tutora em silêncio na aula toda: nenhum teste chega ao provedor real. */
async function resetClass() {
  await clearClassData();
  await prisma.classEvent.create({
    data: {
      agendaId,
      seq: 1,
      type: 'TEACHER_NOTE',
      stepIndex: null,
      payload: { tutor: 'MUTE', scope: 'LESSON' },
      audience: 'TEACHER',
      createdBy: 'SYSTEM',
    },
  });
  const now = Date.now();
  await prisma.agenda.update({
    where: { id: agendaId },
    data: { status: 'LIVE', startTime: new Date(now - 5 * 60_000), endTime: new Date(now + 60 * 60_000) },
  });
}

test.beforeAll(async () => {
  const agenda = await prisma.agenda.findFirstOrThrow({
    where: { title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)', type: 'CLASSROOM' },
  });
  agendaId = agenda.id;
  original = { status: agenda.status, startTime: agenda.startTime, endTime: agenda.endTime };
  if (!agenda.lessonPlanId) {
    throw new Error('A agenda de demonstração não tem plano de aula; rode o seed de demonstração.');
  }
  lessonPlanId = agenda.lessonPlanId;
  await prisma.lessonPlan.update({
    where: { id: agenda.lessonPlanId },
    data: { timeScript: DEMO_LIVE_TIME_SCRIPT as unknown as Prisma.InputJsonValue },
  });
  steps = DEMO_LIVE_TIME_SCRIPT.slice(0, 3).map((item) => item.activity);
});

test.beforeEach(async () => {
  await resetClass();
});

test.afterAll(async () => {
  // Devolve a agenda ao estado anterior (os eventos apagados e o roteiro continuam como o teste deixou).
  if (agendaId && lessonPlanId) await clearClassData();
  if (agendaId && original) {
    await prisma.agenda.update({ where: { id: agendaId }, data: original });
  }
  await prisma.$disconnect();
});

async function login(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.locator('#identifier').fill(identifier);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Acessar Ambiente' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test('professor inicia, avança, volta e encerra; aluno vê só o passo atual', async ({ browser }) => {
  const prof = DEMO_CREDENTIALS.find((c) => c.role === 'TEACHER')!;
  const aluno = DEMO_CREDENTIALS.find((c) => c.role === 'STUDENT')!;
  const teacherCtx = await browser.newContext();
  const studentCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  const student = await studentCtx.newPage();
  try {
    await login(teacher, prof.enrollment, prof.password);
    await login(student, aluno.enrollment, aluno.password);
    const strip = student.getByTestId('now-in-class-strip');
    await teacher.goto(`/teacher/live/${agendaId}`);
    await student.goto(`/classroom/${agendaId}`);
    await expect(strip).toHaveCount(0);
    await teacher.getByRole('button', { name: 'Iniciar aula' }).click();
    await expect(strip).toContainText(steps[0], { timeout: 5_000 });
    await expect(teacher.locator('[aria-current="step"]')).toContainText(steps[0], { timeout: 5_000 });
    await teacher.getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(strip).toContainText(steps[1], { timeout: 5_000 });
    await expect(student.getByText(steps[2])).toHaveCount(0);
    await teacher.getByRole('button', { name: 'Anterior', exact: true }).click();
    await expect(strip).toContainText(steps[0], { timeout: 5_000 });
    teacher.once('dialog', (d) => d.accept());
    await teacher.getByRole('button', { name: 'Encerrar aula' }).click();
    await expect(teacher.getByText('Aula encerrada.')).toBeVisible({ timeout: 5_000 });
    await expect(strip).toHaveCount(0, { timeout: 5_000 });
    expect((await prisma.agenda.findUniqueOrThrow({ where: { id: agendaId } })).status).toBe('COMPLETED');
  } finally {
    await teacherCtx.close();
    await studentCtx.close();
  }
});

test('tutora publica o rascunho e a pergunta do professor; aluno responde; pulso atualiza', async ({ browser }) => {
  const prof = DEMO_CREDENTIALS.find((c) => c.role === 'TEACHER')!;
  const aluno = DEMO_CREDENTIALS.find((c) => c.role === 'STUDENT')!;
  const logsBefore = await tutorLogCount();

  // Rascunho preparado para o passo 1: a tutora o promove sem chamar o modelo.
  const plan = await prisma.lessonPlan.findUniqueOrThrow({
    where: { id: lessonPlanId },
    select: { chapters: { select: { chapter: { select: { id: true } } } } },
  });
  const chapterIds = plan.chapters.map((c) => c.chapter.id);
  const hash = stepHash(DEMO_LIVE_TIME_SCRIPT[1], chapterIds);
  const card = {
    concepts: [
      {
        title: 'INNER JOIN descarta quem não casa',
        explanation: 'Só as linhas com correspondência nas duas tabelas entram no resultado.',
        citation: {
          chunkId: 'demo-chunk-1',
          label: 'Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados',
          page: 58,
        },
      },
      {
        title: 'LEFT JOIN preserva a tabela da esquerda',
        explanation: 'Linhas sem correspondência aparecem com valores nulos nas colunas da direita.',
        citation: {
          chunkId: 'demo-chunk-1',
          label: 'Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados',
          page: 58,
        },
      },
    ],
    objectiveLink: 'Compara os resultados das junções sobre Estudantes e Matriculas.',
    source: 'GENERATED',
  };
  await prisma.tutorStepDraft.upsert({
    where: { lessonPlanId_stepIndex: { lessonPlanId, stepIndex: 1 } },
    create: { lessonPlanId, stepIndex: 1, stepHash: hash, card, calls: 0 },
    update: { stepHash: hash, card, question: Prisma.DbNull, calls: 0, claimedAt: null },
  });

  const teacherCtx = await browser.newContext();
  const studentCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  const student = await studentCtx.newPage();
  try {
    await login(teacher, prof.enrollment, prof.password);
    await login(student, aluno.enrollment, aluno.password);
    const strip = student.getByTestId('now-in-class-strip');
    await teacher.goto(`/teacher/live/${agendaId}`);
    await student.goto(`/classroom/${agendaId}`);
    await teacher.getByRole('button', { name: 'Iniciar aula' }).click();
    await teacher.getByRole('button', { name: 'Próximo', exact: true }).click();
    // A aula está em silêncio por padrão; só este passo é liberado, e o conteúdo vem do rascunho.
    await teacher.getByRole('button', { name: 'Publicar agora' }).click();
    await expect(strip).toContainText('INNER JOIN descarta quem não casa', { timeout: 10_000 });
    await expect(strip).toContainText(DEMO_LIVE_TIME_SCRIPT[1].socraticQuestion!, { timeout: 10_000 });
    await student.getByLabel('Sua resposta').fill('Ele não aparece no resultado.');
    await student.getByRole('button', { name: 'Responder' }).click();
    await expect(strip).toContainText('Resposta registrada.');
    const panel = teacher.getByRole('region', { name: 'Tutora' });
    await expect(panel).toContainText('Cartão publicado');
    await expect(panel).toContainText('1 resposta (pergunta aberta, sem correção automática)', { timeout: 15_000 });
    const sw = teacher.getByRole('switch', { name: 'Tutora em silêncio nesta aula' });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(sw).not.toBeChecked({ timeout: 5_000 });
    await sw.click();
    await expect(sw).toBeChecked({ timeout: 5_000 });
    expect(await tutorLogCount()).toBe(logsBefore); // aula preparada: nenhuma chamada ao modelo
  } finally {
    await teacherCtx.close();
    await studentCtx.close();
  }
});
