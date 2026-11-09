# Aula como eventos — Entrega 4: grupo de estudos por eventos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O chat do grupo de estudos deixa de consultar o servidor a cada 5 s: cada mensagem gravada vira um evento `GROUP_MESSAGE` no canal da agenda, a tela recarrega a lista ao receber o evento, e a intervenção da tutora por silêncio roda em `after()` sem nenhum estado em memória de processo.

**Architecture:** O enum `ClassEventType` ganha `GROUP_MESSAGE` (migration à mão, porque é enum do Postgres). A gravação da mensagem e do evento acontece numa só transação, sob a mesma trava da agenda que o `appendEvents` já usa, por uma variante nova `appendEventsWith`. O `checkStalemate` troca o `Set`/`Map` em memória pela consulta ao último `TUTOR_SKIPPED { reason: 'STALEMATE_FAILED' }` e pela regravação condicional sob a trava; o cliente usa `useClassEvents` e um único `setTimeout` para o próximo prazo de silêncio.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Prisma 6 + Postgres 16 (pgvector), Zod, vitest + Testing Library (jsdom).

**Spec:** docs/superpowers/specs/2026-11-08-aula-eventos-tutora-proativa-design.md (§2 "Cliente: `useClassEvents`" — "O grupo de estudos migra na entrega 4"; §6 "Entrega 4 — grupo de estudos por eventos"). Pré-requisito: Entregas 1, 2, 3a e 3b concluídas (main em 083fd5d).

**Decisões fixadas aqui:**
- **Migration: sim.** `ClassEventType` é `enum` do Prisma, ou seja, tipo `"ClassEventType"` no Postgres (`prisma/migrations/20261108180110_class_events`). A migration `20261108200000_group_message_event` tem uma linha: `ALTER TYPE "ClassEventType" ADD VALUE IF NOT EXISTS 'GROUP_MESSAGE';`. No Postgres 16 isso roda dentro da transação do `migrate deploy` porque o valor novo não é usado na mesma migration. `STALEMATE_FAILED` não precisa de migration: `reason` vive no `payload` JSON e só o Zod o valida.
- **Payload e audience do `GROUP_MESSAGE`:** payload `{ messageId }` (estrito), `stepIndex` sempre `null`, audience `ALL` (o grupo inteiro e o professor leem a conversa; `audiencesFor` já dá `ALL` a todos). `createdBy` = `TUTOR` para mensagem da IA e `SYSTEM` para mensagem de aluno (o enum de ator não tem `STUDENT`, e o evento é gravado pelo servidor, não pelo aluno).
- **Quem escreve `GROUP_MESSAGE`:** só `study-group-repository.ts`, ao gravar uma `StudyGroupMessage`. Não entra em `TEACHER_WRITABLE_TYPES`; o `POST /events` responde 400 `EVENT_TYPE_NOT_ALLOWED`, como para os tipos da tutora. As três origens de mensagem (aluno, resposta à menção, intervenção por silêncio) gravam o evento.
- **`STALEMATE_FAILED` no schema:** `TUTOR_SKIPPED` passa a aceitar duas formas: a de passo (`{ reason: 'NO_MATERIAL' | 'RATE_LIMIT' | 'BUDGET' | 'PROVIDER_ERROR', kind }`, com `stepIndex` obrigatório, sem mudança) e a de grupo (`{ reason: 'STALEMATE_FAILED' }` estrito, com `stepIndex` obrigatoriamente `null`). O tipo `TutorSkippedPayload` continua sendo só a forma de passo, para que `tutor-policy.ts` e `class-state.ts` não mudem; a forma nova é `StalemateFailedPayload`. Audience `TEACHER`, `createdBy: 'TUTOR'`.
- **Janela de retentativa:** a mesma de hoje, `STUDY_GROUP_STALEMATE_RETRY_MS = 60_000`: com um `STALEMATE_FAILED` cujo `createdAt` está a menos de 60 s de `now`, `checkStalemate` sai sem chamar o modelo. Falha conta tanto em exceção quanto em `fallback: true` do provedor (hoje o fallback não conta; sem polling isso deixaria cada recarga chamar o modelo de novo).
- **Sem `Set` de "em andamento":** a garantia de uma intervenção por silêncio passa a ser a regravação condicional `createMessageIfLast` sob a trava da agenda (se chegou mensagem durante a geração, nada é gravado, nem evento). Para que normalmente só um cliente chame o modelo, o prazo tem prioridade do autor: quem escreveu a última mensagem humana pode disparar a intervenção a partir de `createdAt + 5 min`; os demais, só a partir de `createdAt + 5 min + STUDY_GROUP_STALEMATE_GRACE_MS` (60 s). Duas chamadas ao modelo só acontecem se dois clientes passarem do prazo durante a mesma geração; registrado como limitação.
- **Disparo do `checkStalemate`:** continua no `GET /api/v1/agendas/[id]/messages` (é o que dispara hoje), agora com `after()` no lugar do `void ... .catch`. Não roda após o `POST`: logo depois de um `POST` a última mensagem acabou de ser gravada e a checagem seria sempre nula. O `GET` acontece ao abrir a tela, a cada `GROUP_MESSAGE` recebido e no `setTimeout` do prazo de silêncio.
- **Como a tela obtém a mensagem:** ao mudar o maior `seq` de `GROUP_MESSAGE` visto pelo `useClassEvents`, o hook refaz `GET .../messages?since=<lastCreatedAt>` (o mesmo cursor de hoje). Recargas são coalescidas: uma em curso marca "pendente" e roda mais uma vez ao terminar, para não perder o evento que chegou no meio.
- **Polling de 5 s:** sai o `setInterval` de `use-study-group.ts` e a constante `STUDY_GROUP_POLL_MS`. O teste que avançava 5 s de relógio é reescrito para disparar recarga por evento. O único temporizador que fica é um `setTimeout` para o próximo prazo de silêncio, reagendado quando a última mensagem muda e, depois de disparar sem nova mensagem, a cada `STUDY_GROUP_STALEMATE_RETRY_MS`.

## Global Constraints

- Trabalho direto em `main`, sem branch/PR; cada task termina em commit com o trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nunca rodar `npm run db:seed`, `prisma migrate reset` nem `prisma migrate dev` contra o banco de dev (porta 5432). `prisma migrate dev --create-only` recusa por drift (pgvector), então a migration é escrita à mão e aplicada com `npx prisma migrate deploy` no 5432 e no docker 5433 (`DATABASE_URL=postgresql://postgres:local_password_123@localhost:5433/soberania_db?schema=public npx prisma migrate deploy`). O índice parcial `class_events_tutor_step_uq` e o trigger `pg_notify` existem só no SQL e não podem ser tocados.
- Depois de mudar `prisma/schema.prisma`: `npx prisma generate`, e avisar que o `next dev` precisa reiniciar.
- `npm run lint` e `npx tsc --noEmit` continuam limpos.
- Eventos da tutora e `GROUP_MESSAGE` nascem só no servidor; `appendEvents`/`appendEventsWith` gravam sempre sob o `SELECT ... FOR UPDATE` da agenda, com o retry único em P2002, como hoje.
- Nenhum estado em memória de processo em `study-group-service.ts`; nenhum `setInterval` em `use-study-group.ts` (o fallback de polling interno do `useClassEvents` não muda).
- Não quebrar o Playwright existente (`npm run test:e2e:ui` → 2 passed).
- Testes: `npx vitest run <path>`; componentes e hooks com `// @vitest-environment jsdom` e `import * as React`; sem `@testing-library/jest-dom`. Serviços com `deps` injetáveis e `defaultDeps`; só repositórios importam `db`.
- Copy em pt-BR; nenhum texto novo visível ao aluno nesta entrega.

## Review Focus

- Aluno manda mensagem enquanto a recarga disparada por outro `GROUP_MESSAGE` ainda está em curso: a mensagem do colega aparece mesmo assim (teste: Task 5 "evento durante uma carga em curso agenda nova carga").
- Silêncio de mais de 5 min com o autor da última mensagem e mais dois colegas na tela: só o pedido do autor chama o modelo no prazo; os colegas, no mesmo instante, não chamam (testes: Task 3 "não autor espera a carência", Task 3 "prazo com prioridade do autor").
- Provedor fora do ar durante o silêncio: uma falha grava `STALEMATE_FAILED`, as recargas dos 60 s seguintes não chamam o modelo, e a de depois chama (teste: Task 3 "após falha, aguarda a janela pelo evento"; Task 2 integração "consulta pelo reason no JSON").
- Mensagem chega enquanto a tutora gera a intervenção, inclusive vinda de outro processo: nenhuma mensagem da IA nem `GROUP_MESSAGE` é gravado (testes: Task 2 "createMessageIfLast não grava com outra última mensagem", Task 3 "aborta se chegou mensagem durante a geração").
- Professor tenta gravar `GROUP_MESSAGE` (ou um `TUTOR_SKIPPED STALEMATE_FAILED`) pelo `POST /events`: 400 `EVENT_TYPE_NOT_ALLOWED` (teste: Task 1).

---

### Task 1: `GROUP_MESSAGE` e `STALEMATE_FAILED` no schema, no Prisma e na migration

**Files:**
- Modify: `prisma/schema.prisma` (`enum ClassEventType`, ~L16)
- Create: `prisma/migrations/20261108200000_group_message_event/migration.sql`
- Modify: `src/domains/classroom/class-event-schema.ts`
- Test: `src/domains/classroom/__tests__/class-event-schema.test.ts`, `src/domains/classroom/__tests__/class-event-service.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces:
```ts
// class-event-schema.ts
// CLASS_EVENT_TYPES ganha 'GROUP_MESSAGE' (último da lista); TEACHER_WRITABLE_TYPES não muda.
export type GroupMessagePayload = { messageId: string };      // z.object({ messageId: z.string().min(1).max(64) }).strict()
export type StalemateFailedPayload = { reason: 'STALEMATE_FAILED' }; // z.object({ reason: z.literal('STALEMATE_FAILED') }).strict()
export type TutorSkippedPayload = /* inalterado: forma de passo */;
// PAYLOAD_SCHEMAS.TUTOR_SKIPPED = z.union([tutorStepSkippedPayload, stalemateFailedPayload])
// stepIndexError: GROUP_MESSAGE e TUTOR_SKIPPED com reason STALEMATE_FAILED exigem stepIndex null
//                 ('stepIndex deve ser nulo neste tipo'); demais TUTOR_SKIPPED continuam exigindo stepIndex.
```
Prisma: `GROUP_MESSAGE` acrescentado depois de `TUTOR_SKIPPED`. SQL da migration (só isto, com um comentário de uma linha):
```sql
-- Mensagem do grupo de estudos no canal de eventos (a mensagem continua em study_group_messages)
ALTER TYPE "ClassEventType" ADD VALUE IF NOT EXISTS 'GROUP_MESSAGE';
```

- [ ] **Step 1: Testes falhando**
  - schema: `parseClassEvent('GROUP_MESSAGE', { messageId: 'm1' }, null)` → `ok: true`; com `stepIndex: 0` → `ok: false` com `'stepIndex deve ser nulo neste tipo'`; `{}` e `{ messageId: 'm1', extra: 1 }` → `ok: false`;
  - schema: `parseClassEvent('TUTOR_SKIPPED', { reason: 'STALEMATE_FAILED' }, null)` → `ok: true`; com `stepIndex: 2` → `ok: false`; `{ reason: 'STALEMATE_FAILED', kind: 'CARD' }` → `ok: false` (estrito); `{ reason: 'NO_MATERIAL', kind: 'CARD' }` com `stepIndex: null` → `ok: false` (forma de passo continua exigindo passo) e com `stepIndex: 1` → `ok: true`;
  - schema: `CLASS_EVENT_TYPES` contém `'GROUP_MESSAGE'` e `TEACHER_WRITABLE_TYPES` não;
  - serviço (**Review Focus**): `appendTeacherEvent(teacher, id, { type: 'GROUP_MESSAGE', payload: { messageId: 'm1' } }, deps)` rejeita com `DomainError` 400 e `details.code === 'EVENT_TYPE_NOT_ALLOWED'`, sem chamar `deps.repo.appendEvents`; idem para `{ type: 'TUTOR_SKIPPED', payload: { reason: 'STALEMATE_FAILED' } }`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-schema.test.ts src/domains/classroom/__tests__/class-event-service.test.ts` → FAIL (`GROUP_MESSAGE` desconhecido).
- [ ] **Step 3: Implementar** o enum no Prisma, a migration e o schema Zod. Rodar `npx prisma generate`.
- [ ] **Step 4: Aplicar a migration** — `npx prisma migrate deploy` (5432) e o mesmo com `DATABASE_URL` do docker 5433 → "1 migration applied" nos dois; `npx prisma migrate status` → "Database schema is up to date!". Avisar que o `next dev` precisa reiniciar.
- [ ] **Step 5: Rodar e ver passar** — mesmo comando do Step 2 + `npx vitest run src/domains/classroom` + `npx tsc --noEmit` → PASS (o `Record<ClassEventTypeName, z.ZodType>` obriga a entrada `GROUP_MESSAGE`).
- [ ] **Step 6: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20261108200000_group_message_event src/domains/classroom/class-event-schema.ts src/domains/classroom/__tests__/class-event-schema.test.ts src/domains/classroom/__tests__/class-event-service.test.ts
git commit -m "feat(eventos): tipo GROUP_MESSAGE e motivo STALEMATE_FAILED no canal da aula

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Mensagem e evento na mesma transação; consulta da última falha de silêncio

**Files:**
- Modify: `src/domains/classroom/class-event-repository.ts`
- Modify: `src/domains/agendas/services/study-group-repository.ts`
- Create: `src/domains/agendas/services/__tests__/study-group-repository.test.ts`
- Test: `src/domains/classroom/__tests__/class-event-repository.test.ts`, `tests/e2e/class-events.test.ts`

**Interfaces:**
- Consumes (Task 1): `GROUP_MESSAGE`, `StalemateFailedPayload`.
- Produces:
```ts
// class-event-repository.ts
export function appendEventsWith<T>(
  agendaId: string,
  work: (tx: Prisma.TransactionClient, ctx: AppendContext) => Promise<{ value: T; events: NewClassEvent[] }>,
  options?: AppendOptions,
): Promise<{ value: T; rows: ClassEventRow[] }>;
// appendEvents passa a delegar: appendEventsWith(agendaId, async (_tx, ctx) => ({ value: null, events: build(ctx) }), options) → rows
export function findLastStalemateFailureAt(agendaId: string): Promise<Date | null>;
export function appendStalemateFailure(agendaId: string): Promise<void>;

// study-group-repository.ts
export function createMessage(data: NewStudyGroupMessage): Promise<StudyGroupMessageRecord>;
export function createMessageIfLast(data: NewStudyGroupMessage, expectedLastId: string): Promise<StudyGroupMessageRecord | null>;
```
`appendEventsWith`: dentro de `db.$transaction`, `lockAndReadState` → `work(tx, ctx)` → `insertEvents` só se `events.length > 0`; P2002 repete a transação inteira uma vez (o `work` roda de novo, e a mensagem da tentativa desfeita não existe mais). `findLastStalemateFailureAt`: `findFirst` com `{ agendaId, type: 'TUTOR_SKIPPED', stepIndex: null, payload: { path: ['reason'], equals: 'STALEMATE_FAILED' } }`, `orderBy: { seq: 'desc' }`, devolve `createdAt` ou `null`. `appendStalemateFailure`: `appendEvents` com um evento `{ type: 'TUTOR_SKIPPED', stepIndex: null, payload: { reason: 'STALEMATE_FAILED' }, audience: 'TEACHER', createdBy: 'TUTOR' }`.
`createMessage`: `appendEventsWith(data.agendaId, ...)` cria a `StudyGroupMessage` com `tx.studyGroupMessage.create({ data, include: messageInclude })` e devolve o evento `{ type: 'GROUP_MESSAGE', stepIndex: null, payload: { messageId: msg.id }, audience: 'ALL', createdBy: data.isAi ? 'TUTOR' : 'SYSTEM' }`. `createMessageIfLast`: igual, mas antes de criar lê no `tx` a última mensagem da agenda (`orderBy: { createdAt: 'desc' }`, `select: { id: true }`); se `id !== expectedLastId` (ou não há mensagem) → `{ value: null, events: [] }`.

- [ ] **Step 1: Testes falhando**
  - `class-event-repository.test.ts` (mesmo `tx` falso do arquivo): `appendEventsWith` chama `work` depois do `lock` e grava os eventos devolvidos com `seq` a partir do `MAX + 1`, devolvendo `{ value, rows }`; `events: []` não insere; P2002 na primeira tentativa chama `work` duas vezes; `findLastStalemateFailureAt` monta o `where` acima e devolve `createdAt`; `appendStalemateFailure` insere um `TUTOR_SKIPPED` com `stepIndex: null`, audience `'TEACHER'`, `createdBy: 'TUTOR'`; os testes atuais de `appendEvents` continuam verdes sem mudança;
  - `study-group-repository.test.ts` (novo; `vi.mock('@/domains/classroom/class-event-repository')` com um `appendEventsWith` que executa `work` com um `tx` falso): `createMessage` de aluno → evento `GROUP_MESSAGE` com `payload: { messageId: <id criado> }`, audience `'ALL'`, `createdBy: 'SYSTEM'`; de IA → `createdBy: 'TUTOR'`; **Review Focus:** `createMessageIfLast` não grava com outra última mensagem — última no `tx` é `m2` com `expectedLastId: 'm1'` → `null`, `tx.studyGroupMessage.create` não chamado e `events: []`; com `m1` → grava;
  - integração (`tests/e2e/class-events.test.ts`, numa agenda descartável `STUDY_GROUP` criada no `beforeAll` do mesmo jeito da agenda CLASSROOM): `createMessage` grava 1 linha em `study_group_messages` e 1 `GROUP_MESSAGE` com o `messageId` dela; `createMessageIfLast` com id velho não grava nenhuma das duas; **Review Focus:** consulta pelo reason no JSON — `findLastStalemateFailureAt` devolve `null` com só um `TUTOR_SKIPPED NO_MATERIAL` de passo gravado e devolve a data depois de `appendStalemateFailure`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-repository.test.ts src/domains/agendas/services/__tests__/study-group-repository.test.ts` → FAIL.
- [ ] **Step 3: Implementar** as funções; `appendEvents` delega para `appendEventsWith`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `DATABASE_URL_TEST=postgresql://postgres:local_password_123@localhost:5433/soberania_db?schema=public npx vitest run tests/e2e/class-events.test.ts` + `npx vitest run src/domains/agendas` + `npx tsc --noEmit` → PASS (a assinatura de `createMessage` não muda, então o serviço atual segue compilando).
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-repository.ts src/domains/classroom/__tests__/class-event-repository.test.ts src/domains/agendas/services/study-group-repository.ts src/domains/agendas/services/__tests__/study-group-repository.test.ts tests/e2e/class-events.test.ts
git commit -m "feat(grupo): mensagem do grupo e GROUP_MESSAGE gravados na mesma transação

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `checkStalemate` sem estado em memória

**Files:**
- Create: `src/domains/agendas/study-group-stalemate.ts` (puro; importável no cliente)
- Modify: `src/lib/constants/tutor.ts` (constantes novas; `STUDY_GROUP_POLL_MS` sai na Task 5)
- Modify: `src/domains/agendas/services/study-group-service.ts`
- Create: `src/domains/agendas/__tests__/study-group-stalemate.test.ts`
- Test: `src/domains/agendas/services/__tests__/study-group-service.test.ts`

**Interfaces:**
- Consumes (Task 2): `createMessage`, `createMessageIfLast`, `findLastStalemateFailureAt`, `appendStalemateFailure`.
- Produces:
```ts
// tutor.ts
export const STUDY_GROUP_STALEMATE_GRACE_MS = 60_000;      // carência dos não autores
export const STUDY_GROUP_STALEMATE_TIMER_SLACK_MS = 2_000;  // folga do setTimeout do cliente após o prazo

// study-group-stalemate.ts
export type StalemateMessage = { authorId: string | null; isAi: boolean; createdAt: Date | string };
export function stalemateDueAt(last: StalemateMessage, viewerId: string): number | null;
  // null se last.isAi; createdAt + STUDY_GROUP_STALEMATE_MINUTES * 60_000 + (viewerId === last.authorId ? 0 : STUDY_GROUP_STALEMATE_GRACE_MS)
export function isStalemateDue(last: StalemateMessage, viewerId: string, now: number): boolean; // due !== null && now > due
export function nextStalemateCheckAt(last: StalemateMessage, viewerId: string, now: number): number | null;
  // due null → null; now <= due → due + STUDY_GROUP_STALEMATE_TIMER_SLACK_MS; senão now + STUDY_GROUP_STALEMATE_RETRY_MS

// study-group-service.ts
export type StudyGroupDeps = {
  getAgenda; chatWithTutor; now;                       // inalterados
  repo: {
    listMessages; listRecentMessages; findLastMessage; // inalterados
    createMessage(data: NewStudyGroupMessage): Promise<StudyGroupMessageRecord>;
    createMessageIfLast(data: NewStudyGroupMessage, expectedLastId: string): Promise<StudyGroupMessageRecord | null>;
  };
  stalemate: {
    lastFailureAt(agendaId: string): Promise<Date | null>;
    recordFailure(agendaId: string): Promise<void>;
  };
};
export function checkStalemate(agendaId: string, user: AgendaActor, now: Date, deps?: StudyGroupDeps): Promise<MessageDTO | null>; // assinatura inalterada
```
`defaultDeps.stalemate = { lastFailureAt: findLastStalemateFailureAt, recordFailure: appendStalemateFailure }`. Saem `stalemateInFlight` e `stalemateFailedAt`; nenhum `new Map`/`new Set`/`let` em escopo de módulo. Ordem de `checkStalemate`: `loadStudyGroup` → não `LIVE` → `null`; `last = findLastMessage`; sem `last` ou `!isStalemateDue(last, user.id, now.getTime())` → `null`; `lastFailureAt` a menos de `STUDY_GROUP_STALEMATE_RETRY_MS` de `now` → `null`; `chatWithTutor` (mesmo prompt e `persistInteraction: false` de hoje); `fallback: true` → `recordFailure` e `null`; exceção → `recordFailure` e relança o erro original (falha do próprio `recordFailure` só vira `console.warn`); sucesso → `createMessageIfLast({ agendaId, authorId: null, content: reply, isAi: true }, last.id)` → `null` ou DTO. A releitura `findLastMessage` depois da geração sai (a checagem passou para dentro da trava). `postMessage` não muda além de o `createMessage` agora gravar o evento.

- [ ] **Step 1: Testes falhando**
  - `study-group-stalemate.test.ts` (última humana de `'u1'` em `T`): `stalemateDueAt(last, 'u1')` → `T + 300_000`; **Review Focus:** prazo com prioridade do autor — `stalemateDueAt(last, 'u2')` → `T + 360_000`; mensagem da IA → `null`; `isStalemateDue(last, 'u1', T + 300_000)` → `false` e `T + 300_001` → `true`; `nextStalemateCheckAt(last, 'u1', T)` → `T + 302_000`; `(last, 'u1', T + 400_000)` → `T + 460_000`; `createdAt` como string ISO dá o mesmo resultado;
  - serviço: `makeDeps` ganha `stalemate` falso (lista `failures: Date[]`; `recordFailure` empurra `deps.now()`; `lastFailureAt` devolve o último) e `createMessageIfLast` falso que compara com o último do `store`; fixtures de silêncio que hoje usam `STALEMATE_MINUTES + 1` minutos e autor `'stu-2'` passam a ter `authorId: user.id` (o leitor é o autor);
  - "checkStalemate cria uma intervenção e a segunda chamada não cria outra" segue verde;
  - **Review Focus:** não autor espera a carência — última de `'stu-2'` há 5 min 30 s, leitor `'stu-1'` → `null` sem chamar `chat`; há 6 min 1 s → intervém;
  - "intervenção por silêncio com o provedor em fallback" passa a esperar: nenhuma mensagem da IA, `failures` com 1 item;
  - **Review Focus:** após falha, aguarda a janela pelo evento — `chat` rejeita uma vez → `checkStalemate` rejeita com `'provider fora'` e `failures` tem 1 item; nova chamada com o mesmo `NOW` → `null` e `chat` chamado 1 vez; com `NOW + STUDY_GROUP_STALEMATE_RETRY_MS + 1000` → não nulo, `chat` 2 vezes, 1 mensagem da IA (substitui o teste do `Map`; o `agendaId` próprio do teste, que existia para isolar o `Map`, sai);
  - "duas chamadas concorrentes" reescrito: as duas promessas resolvem depois do `release()`, exatamente uma devolve não nulo e `store` tem 1 mensagem da IA (o `createMessageIfLast` falso faz a segunda ver a da IA como última);
  - "aborta se chegou mensagem durante a geração" segue verde (agora via `createMessageIfLast`);
  - `recordFailure` rejeitando dentro do `catch` não troca o erro relançado (`rejects.toThrow('provider fora')`);
  - verificação estática no próprio teste: o fonte de `study-group-service.ts` (lido com `fs.readFileSync`) não contém `new Map(` nem `new Set(`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/agendas` → FAIL.
- [ ] **Step 3: Implementar** o módulo puro, as constantes e o serviço.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/agendas/study-group-stalemate.ts src/domains/agendas/__tests__/study-group-stalemate.test.ts src/lib/constants/tutor.ts src/domains/agendas/services/study-group-service.ts src/domains/agendas/services/__tests__/study-group-service.test.ts
git commit -m "refactor(grupo): intervenção por silêncio sem estado em memória, com STALEMATE_FAILED no canal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `checkStalemate` em `after()` na rota de mensagens

**Files:**
- Modify: `src/app/api/v1/agendas/[id]/messages/route.ts`
- Create: `src/app/api/v1/agendas/[id]/messages/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `checkStalemate`, `listMessages`, `postMessage` (Task 3, assinaturas inalteradas), `after` de `next/server`.
- Produces: `GET` e `POST` com o mesmo contrato HTTP de hoje; `export const dynamic = 'force-dynamic'`. `GET`: depois de `listMessages`, `after(() => checkStalemate(id, user, new Date()).catch((err) => console.warn('[study-group] falha ao verificar silêncio do grupo', err)))`, no lugar do `void ... .catch` solto. `POST` não agenda nada.

- [ ] **Step 1: Testes falhando** (padrão de `src/app/api/v1/agendas/[id]/events/__tests__/route.test.ts`, com `next/server.after`, `requireUser` e o serviço mockados)
  - `GET` → 200 `{ success: true, messages }` e `after` chamado uma vez; `checkStalemate` não é chamado antes de o callback rodar; executar o callback chama `checkStalemate('ag1', user, expect.any(Date))`;
  - `checkStalemate` rejeitando dentro do callback só gera `console.warn` (o callback resolve);
  - `?since=xyz` → 400 `'Parâmetro since inválido.'` e `after` não chamado;
  - `POST` válido → 200 com o retorno de `postMessage` e `after` não chamado; corpo vazio → 400.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/api/v1/agendas/[id]/messages"` → FAIL (`after` nunca chamado).
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add "src/app/api/v1/agendas/[id]/messages"
git commit -m "feat(grupo): verificação de silêncio do grupo em after() após a leitura

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Tela do grupo pelo canal, sem polling de 5 s

**Files:**
- Modify: `src/components/study-group/use-study-group.ts`
- Modify: `src/app/(student)/study-group/[groupId]/_components/StudyGroupPage.tsx` (chamada do hook, ~L42)
- Modify: `src/lib/constants/tutor.ts` (remove `STUDY_GROUP_POLL_MS`)
- Test: `src/components/study-group/__tests__/use-study-group.test.ts`

**Interfaces:**
- Consumes: `nextStalemateCheckAt` (Task 3), `useClassEvents(agendaId)` → `{ events, status, lastSeq, state }` (Entrega 1; já assina todos os `CLASS_EVENT_TYPES`, inclusive `GROUP_MESSAGE` da Task 1), `GET .../messages` que dispara a checagem (Task 4).
- Produces:
```ts
export function useStudyGroupMessages(
  agendaId: string,
  author: { id: string; name: string } | null,
  options?: { stalemateEnabled?: boolean },   // a página passa { stalemateEnabled: isOpen }
): { messages: MessageDTO[]; isLoading: boolean; isSending: boolean; error: string | null; send: (content: string) => Promise<boolean> }; // retorno inalterado
```
Sai o `setInterval` e o `import` de `STUDY_GROUP_POLL_MS`. `load()` continua igual (cursor `since`), com `pendingReload` (ref): chamada durante uma carga em curso marca pendente e a carga roda mais uma vez ao terminar. Um efeito observa `groupSeq` = maior `seq` de `events` com `type === 'GROUP_MESSAGE'` e chama `load()` quando ele muda; a carga inicial na montagem continua. Temporizador de silêncio: com `stalemateEnabled` e `author`, sobre a última mensagem real (ignorando ids `pending-`), `at = nextStalemateCheckAt(last, author.id, Date.now())`; `at` não nulo → um `setTimeout(at - Date.now())` que chama `load()` e reagenda com o mesmo cálculo; limpo na troca da última mensagem, de `agendaId` e na desmontagem.

- [ ] **Step 1: Testes falhando** (`vi.mock('@/components/classroom/use-class-events')` devolvendo `events` controláveis por `rerender`)
  - montagem faz 1 `GET` sem `since`; novo `GROUP_MESSAGE` (`seq` 5) → 1 `GET` com `since` = `createdAt` da última recebida; evento `STEP_CHANGED` não faz `GET`; avançar 60 s de relógio falso sem eventos e sem `stalemateEnabled` não faz `GET` (sem polling);
  - **Review Focus:** evento durante uma carga em curso agenda nova carga — com o primeiro `GET` pendurado numa promessa, chegam `seq` 5 e 6; ao resolver, acontece exatamente mais 1 `GET`;
  - temporizador: última mensagem humana do próprio autor em `T`, relógio falso em `T + 1000`, `stalemateEnabled: true` → nenhum `GET` até `T + 301_999`, 1 `GET` em `T + 302_000`, outro em `T + 362_000`; mensagem da IA como última → nenhum temporizador; `stalemateEnabled: false` → nenhum;
  - o teste atual "o POST não avança o cursor" troca o `advanceTimersByTimeAsync(5_000)` por um `GROUP_MESSAGE` no `rerender` e mantém as asserções de `since` e de ordem.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/study-group` → FAIL.
- [ ] **Step 3: Implementar** o hook, a chamada na página e a remoção de `STUDY_GROUP_POLL_MS` (`grep -rn STUDY_GROUP_POLL_MS src` → vazio).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run "src/app/(student)/study-group"` + `npx tsc --noEmit` + `npm run lint` → PASS; `grep -n "setInterval" src/components/study-group/use-study-group.ts` → vazio.
- [ ] **Step 5: Commit**
```bash
git add src/components/study-group "src/app/(student)/study-group/[groupId]/_components/StudyGroupPage.tsx" src/lib/constants/tutor.ts
git commit -m "feat(grupo): chat do grupo pelo canal de eventos, sem polling de 5 s

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final

- `npx vitest run` (suíte inteira; os flaky conhecidos da sala e do `MaterialChaptersPanel` rodam de novo antes de investigar), `npx tsc --noEmit`, `npm run lint` → verdes.
- `DATABASE_URL_TEST=<5433> npx vitest run tests/e2e/class-events.test.ts` → verde.
- `npm run test:e2e:ui` → 2 passed.
- `grep -nE "new (Map|Set)\(" src/domains/agendas/services/study-group-service.ts` → vazio.
- Manual (com `next dev` reiniciado após o `prisma generate`, `NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=true`): dois navegadores de aluno no mesmo grupo; mensagem de um aparece no outro em até ~3 s sem requisição periódica a `/messages` na aba Network (só o `EventSource` de `/events/stream`); `@lucy` publica a resposta nos dois; com a agenda `LIVE` e 5 min de silêncio, a intervenção aparece uma vez; uma linha `GROUP_MESSAGE` por mensagem em `class_events`.

## Critérios de aceite (spec §6, Entrega 4)

| Critério | Cumprido em |
|---|---|
| Enum ganha `GROUP_MESSAGE`, payload `{ messageId }`, mensagem continua em `StudyGroupMessage` | Task 1 |
| Postar mensagem grava o evento na mesma transação | Task 2 (e Task 3 para resposta da tutora e intervenção) |
| Tela do grupo troca o polling de 5 s por `useClassEvents` | Task 5 |
| `checkStalemate` em `after()` e sem `Map` `stalemateFailedAt`; consulta ao último `TUTOR_SKIPPED { reason: 'STALEMATE_FAILED' }` | Tasks 3, 4 |
| `STALEMATE_FAILED` acrescentado ao schema | Task 1 |
| Nenhum estado em memória em `study-group-service.ts`; testes do serviço adaptados e verdes | Task 3 |
