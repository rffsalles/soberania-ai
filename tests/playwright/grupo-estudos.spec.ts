import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEMO_CREDENTIALS } from '../../src/lib/constants/demo-credentials';

const prisma = new PrismaClient();
const MS_PER_MINUTE = 60_000;
const SECOND_STUDENT = { enrollment: 'PW-GRUPO-002', email: 'pw-grupo-002@teste.local', password: 'grupo-pw-123' };
const IDLE_WAIT_MS = 8_000;

let agendaId: string;
let secondStudentId: string | null = null;

test.beforeAll(async () => {
  const first = DEMO_CREDENTIALS.find((c) => c.role === 'STUDENT')!;
  const alunoA = await prisma.user.findFirstOrThrow({ where: { enrollment: first.enrollment } });
  // O grupo é visível por turma: o segundo aluno (descartável) entra na mesma turma do aluno de demonstração.
  const alunoB = await prisma.user.create({
    data: {
      name: 'Aluno Playwright Grupo',
      email: SECOND_STUDENT.email,
      enrollment: SECOND_STUDENT.enrollment,
      role: 'STUDENT',
      classId: alunoA.classId,
      passwordHash: await bcrypt.hash(SECOND_STUDENT.password, 10),
    },
  });
  secondStudentId = alunoB.id;
  const now = Date.now();
  const agenda = await prisma.agenda.create({
    data: {
      title: 'Grupo descartável Playwright',
      subject: 'Teste',
      type: 'STUDY_GROUP',
      status: 'LIVE',
      startTime: new Date(now - 5 * MS_PER_MINUTE),
      endTime: new Date(now + 60 * MS_PER_MINUTE),
      classId: alunoA.classId!,
    },
  });
  agendaId = agenda.id;
});

test.afterAll(async () => {
  if (agendaId) {
    await prisma.studyGroupMessage.deleteMany({ where: { agendaId } });
    await prisma.classEvent.deleteMany({ where: { agendaId } });
    await prisma.agenda.deleteMany({ where: { id: agendaId } });
  }
  if (secondStudentId) {
    await prisma.session.deleteMany({ where: { userId: secondStudentId } });
    await prisma.user.deleteMany({ where: { id: secondStudentId } });
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

test('mensagem do aluno A chega ao aluno B pelo canal de eventos, sem polling', async ({ browser }) => {
  const first = DEMO_CREDENTIALS.find((c) => c.role === 'STUDENT')!;
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const messagesPath = `/api/v1/agendas/${agendaId}/messages`;
  let getsB = 0;
  pageB.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === messagesPath) getsB++;
  });
  try {
    await login(pageA, first.enrollment, first.password);
    await login(pageB, SECOND_STUDENT.enrollment, SECOND_STUDENT.password);
    await pageA.goto(`/study-group/${agendaId}`);
    // Só mede depois que o canal de eventos de B está aberto (na primeira execução o dev server compila a rota).
    const streamOpen = pageB.waitForResponse((r) => r.url().includes(`/api/v1/agendas/${agendaId}/events/stream`), {
      timeout: 30_000,
    });
    await pageB.goto(`/study-group/${agendaId}`);
    await streamOpen;
    await expect(pageB.getByText('Nenhuma mensagem ainda.')).toBeVisible();
    await expect(pageA.getByText('Nenhuma mensagem ainda.')).toBeVisible();
    // Deixa a carga inicial (e o replay do canal) assentar antes de medir.
    await pageB.waitForTimeout(2_000);
    const baseline = getsB;
    expect(baseline).toBeGreaterThanOrEqual(1);
    expect(baseline).toBeLessThanOrEqual(2);

    const text = `Olá do aluno A ${Date.now()}`;
    await pageA.getByPlaceholder(/Escreva para a equipe/).fill(text);
    await pageA.getByRole('button').filter({ has: pageA.locator('svg.lucide-send') }).click();
    await expect(pageB.getByText(text)).toBeVisible({ timeout: 10_000 });

    await pageB.waitForTimeout(IDLE_WAIT_MS);
    expect(getsB - baseline).toBe(1);

    const messages = await prisma.studyGroupMessage.findMany({ where: { agendaId } });
    expect(messages).toHaveLength(1);
    const events = await prisma.classEvent.findMany({ where: { agendaId, type: 'GROUP_MESSAGE' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ messageId: messages[0].id });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
