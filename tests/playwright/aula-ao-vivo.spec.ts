import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { DEMO_CREDENTIALS } from '../../src/lib/constants/demo-credentials';
import { DEMO_LIVE_TIME_SCRIPT } from '../../prisma/seed-data/academic';

const prisma = new PrismaClient();
let agendaId: string;
let steps: string[];

test.beforeAll(async () => {
  const agenda = await prisma.agenda.findFirstOrThrow({
    where: { title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)', type: 'CLASSROOM' },
  });
  agendaId = agenda.id;
  await prisma.lessonPlan.update({
    where: { id: agenda.lessonPlanId! },
    data: { timeScript: DEMO_LIVE_TIME_SCRIPT as unknown as object[] },
  });
  steps = DEMO_LIVE_TIME_SCRIPT.slice(0, 3).map((item) => item.activity);
  await prisma.classEvent.deleteMany({ where: { agendaId } });
  const now = Date.now();
  await prisma.agenda.update({
    where: { id: agendaId },
    data: { status: 'LIVE', startTime: new Date(now - 5 * 60_000), endTime: new Date(now + 60 * 60_000) },
  });
});

test.afterAll(async () => {
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
  const teacher = await (await browser.newContext()).newPage();
  const student = await (await browser.newContext()).newPage();
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
});
