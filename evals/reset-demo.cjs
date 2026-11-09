// Prepara a aula demo para uma nova rodada de `python -m evals run --category proativo`.
// Apaga os eventos (ClassEvent) e os rascunhos da tutora (TutorStepDraft) SÓ da agenda demo e a põe em LIVE.
// Não apaga mais nada; não precisa de banco limpo nem de seed novo. Uso (na raiz do repositório):
//   node evals/reset-demo.cjs [agendaId]
// Sem argumento, usa a única agenda CLASSROOM do seed da demo ("Modelagem Conceitual e Álgebra Relacional (JOINs)").
// Só roda contra banco local (localhost/127.0.0.1).
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // Sem .env: usa o DATABASE_URL do ambiente.
}
const { PrismaClient } = require(path.join(root, 'node_modules/@prisma/client'));

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`Recusado: DATABASE_URL não aponta para banco local (host "${host}").`);
  process.exit(1);
}

const p = new PrismaClient();
(async () => {
  const given = process.argv[2];
  const agenda = given
    ? await p.agenda.findUnique({ where: { id: given }, select: { id: true, title: true, lessonPlanId: true } })
    : await p.agenda.findFirst({
        where: { type: 'CLASSROOM', title: { startsWith: 'Modelagem Conceitual' } },
        select: { id: true, title: true, lessonPlanId: true },
      });
  if (!agenda) throw new Error('agenda demo não encontrada; passe o id como argumento');
  const events = await p.classEvent.deleteMany({ where: { agendaId: agenda.id } });
  const drafts = agenda.lessonPlanId
    ? await p.tutorStepDraft.deleteMany({ where: { lessonPlanId: agenda.lessonPlanId } })
    : { count: 0 };
  await p.agenda.update({ where: { id: agenda.id }, data: { status: 'LIVE' } });
  console.log(JSON.stringify({ agenda: agenda.id, eventosApagados: events.count, draftsApagados: drafts.count, status: 'LIVE' }));
})()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
