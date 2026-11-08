# Aula como eventos — Entrega 1: eventos + canal SSE + hook — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aula passa a ser uma sequência imutável de eventos por agenda, gravada pelo professor e entregue à turma por SSE com retomada por cursor, e a sala do aluno deixa de depender de relógios periódicos.

**Architecture:** Tabela `class_events` com `seq` por agenda gerado sob `SELECT ... FOR UPDATE` na agenda; domínio novo `src/domains/classroom/` (schema Zod, repositório, serviço, estado derivado puro, núcleo do stream e ouvinte LISTEN/NOTIFY). Rotas `POST/GET /api/v1/agendas/[id]/events` e `GET .../events/stream` reutilizam `getAgendaForUser` (escopo) e filtram `audience` no `WHERE`; o cliente usa `useClassEvents` (EventSource → polling de 5 s → volta ao SSE).

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma 6 + Postgres, Zod, vitest (+ Testing Library/jsdom nos hooks), SSE com `eventsource-parser` já usado no chat, `pg` só para o modo `listen`.

**Spec:** docs/superpowers/specs/2026-11-08-aula-eventos-tutora-proativa-design.md

## Global Constraints

- Trabalhar direto em `main`, sem branches nem PR.
- Mensagens de domínio em pt-BR via `DomainError(status, msg, { code })`; códigos da spec em `details.code` (`apiError` já repassa `details`).
- Serviços com `deps` injetáveis e `defaultDeps`; só o repositório importa `db` (Prisma).
- Migration via `npx prisma migrate dev --create-only`; índice parcial e trigger escritos à mão; remover todo `DROP` espúrio gerado pelo drift do pgvector antes de aplicar.
- Nenhum estado de aula em memória de processo; o ouvinte do modo `listen` só acorda conexões, que sempre releem do banco pelo cursor.
- Primeiro frame do stream: `retry: 1000`.
- `CLASS_EVENTS_STREAM_MAX_MS`: padrão 8000 com `VERCEL` definido, 0 (sem limite, `: ping` a cada 25 s) fora dela.
- Modo `poll`: cada conexão consulta `seq > cursor` a cada 2 s.
- Cliente: sem conexão aberta por 10 s seguidos → polling de 5 s em `GET /events?after=`; a cada 30 s em polling tenta o SSE de novo.
- `CLASS_EVENTS_NOTIFY_MODE=poll|listen` (padrão `poll`).
- `audience` filtrado na consulta: aluno lê `ALL` + o próprio id; professor/admin leem `ALL` + `TEACHER`.
- Escrita só pelo professor dono (ou admin) e só `STEP_CHANGED`, `TEACHER_NOTE`, `SESSION_STARTED`, `SESSION_ENDED`.
- `TUTOR_*` nunca entram pela rota de escrita (400 `EVENT_TYPE_NOT_ALLOWED`).
- Comandos: `npx vitest run <path>`; `npx tsc --noEmit`; integração com `DATABASE_URL_TEST` (padrão `tests/e2e/full-flow.test.ts`).

## Review Focus

- Duas abas do professor clicam "Iniciar aula" juntas: um segundo `SESSION_STARTED` gravaria outro `STEP_CHANGED` 0 e devolveria a turma ao início. As regras de fase rodam dentro da trava, e o segundo leva 409 `CLASS_ALREADY_STARTED` (testes: Task 4 integração, Task 5).
- Aba do aluno fechada: o laço do stream precisa parar no `abort` da requisição e soltar a assinatura do ouvinte; senão cada aba fechada deixa uma consulta a cada 2 s para sempre (teste: Task 7).
- Buffer/cache no caminho: sem `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`, o Next ou o nginx do Docker seguram os frames e o aluno só vê o evento quando a conexão fecha (teste: Task 7).
- O fechamento planejado a cada 8 s dispara `onerror` no EventSource; o hook não pode contar isso para o fallback de 10 s, piscar `offline` nem duplicar eventos na reconexão (teste: Task 10).
- Agenda marcada para daqui a 30 dias: `setTimeout` com atraso > 2^31−1 ms dispara na hora e entra em laço de re-render; o atraso é limitado (teste: Task 11).

---

### Task 1: Schema, migration, índice parcial e trigger

**Files:**
- Modify: `prisma/schema.prisma` (enums novos após `AgendaType` ~L16; `Agenda` L144-177 ganha `events ClassEvent[]`; `InferenceLog` L577-593)
- Create: `prisma/migrations/<timestamp>_class_events/migration.sql` (gerada e editada à mão)
- Create: `tests/e2e/class-events.test.ts`

**Interfaces:**
- Produces: `db.classEvent`; enums `ClassEventType { STEP_CHANGED TUTOR_CARD TUTOR_QUESTION TEACHER_NOTE SESSION_STARTED SESSION_ENDED TUTOR_SKIPPED }`, `ClassEventActor { TEACHER TUTOR SYSTEM }`, `InferencePurpose { CHAT TUTOR_CARD TUTOR_QUESTION }`; `InferenceLog.agendaId String?`, `InferenceLog.purpose InferencePurpose?`, `@@index([agendaId])`.

- [ ] **Step 1: Teste de integração falhando** — `tests/e2e/class-events.test.ts`, `describe.skipIf(!process.env.DATABASE_URL_TEST)`, `beforeAll` igual ao de `full-flow.test.ts` (`process.env.DATABASE_URL = TEST_DB_URL`, import dinâmico de `db`, turma do aluno `202601001`), cria uma agenda CLASSROOM descartável; `afterAll` apaga a agenda (cascade).
```ts
it('índice parcial: segundo TUTOR_CARD do mesmo passo dá P2002; STEP_CHANGED repetido não', async () => {
  const base = { agendaId, payload: {}, audience: 'ALL' };
  await db.classEvent.create({ data: { ...base, seq: 1, type: 'TUTOR_CARD', stepIndex: 0, createdBy: 'TUTOR' } });
  await expect(db.classEvent.create({ data: { ...base, seq: 2, type: 'TUTOR_CARD', stepIndex: 0, createdBy: 'TUTOR' } }))
    .rejects.toMatchObject({ code: 'P2002' });
  await db.classEvent.create({ data: { ...base, seq: 3, type: 'STEP_CHANGED', stepIndex: 0, createdBy: 'TEACHER' } });
  await db.classEvent.create({ data: { ...base, seq: 4, type: 'STEP_CHANGED', stepIndex: 0, createdBy: 'TEACHER' } });
});
it('(agendaId, seq) é único', async () => {
  await expect(db.classEvent.create({ data: { agendaId, seq: 1, type: 'SESSION_STARTED', payload: {}, audience: 'ALL', createdBy: 'TEACHER' } }))
    .rejects.toMatchObject({ code: 'P2002' });
});
```
- [ ] **Step 2: Rodar e ver falhar** — `DATABASE_URL_TEST=<url> npx vitest run tests/e2e/class-events.test.ts` → FAIL: `db.classEvent` não existe (TypeError/erro de tipo).
- [ ] **Step 3: Implementar** — models e enums exatamente como na seção 1 da spec (sem `TutorStepDraft`, sem `GROUP_MESSAGE`). `npx prisma migrate dev --create-only --name class_events`; no SQL, apagar `DROP`s espúrios e acrescentar ao fim:
```sql
CREATE UNIQUE INDEX class_events_tutor_step_uq ON class_events ("agendaId", "stepIndex", type) WHERE type IN ('TUTOR_CARD','TUTOR_QUESTION');
CREATE OR REPLACE FUNCTION class_events_notify() RETURNS trigger AS $$
BEGIN PERFORM pg_notify('class_events_' || NEW."agendaId", NEW.seq::text); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER class_events_notify_trg AFTER INSERT ON class_events FOR EACH ROW EXECUTE FUNCTION class_events_notify();
```
Aplicar com `npx prisma migrate dev` e `npx prisma generate`; aplicar também no banco de teste (`DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations tests/e2e/class-events.test.ts
git commit -m "feat(aula): tabela class_events com índice parcial da tutora e trigger de NOTIFY

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Payloads, projeção do aluno e política de audience

Fica em `src/domains/classroom/` (caminho fixado pela spec; eventos de aula ao vivo são um contexto próprio, consumido por agendas, e `agendas/services` já cuida do CRUD de agendas). O arquivo não importa `@prisma/client` em runtime, para poder ir ao bundle do cliente.

**Files:**
- Create: `src/domains/classroom/class-event-schema.ts`
- Create: `src/domains/classroom/__tests__/class-event-schema.test.ts`

**Interfaces:**
- Consumes: `questionSchema` (`@/domains/assessments/question-schema`), `TIME_SCRIPT_MAX_ITEMS`.
- Produces:
```ts
export const CLASS_EVENT_TYPES: readonly ['STEP_CHANGED','TUTOR_CARD','TUTOR_QUESTION','TEACHER_NOTE','SESSION_STARTED','SESSION_ENDED','TUTOR_SKIPPED'];
export type ClassEventTypeName = (typeof CLASS_EVENT_TYPES)[number];
export const TEACHER_WRITABLE_TYPES: readonly ClassEventTypeName[]; // os 4
export type ClassEventDTO = { seq: number; type: ClassEventTypeName; stepIndex: number | null; payload: unknown; createdBy: 'TEACHER' | 'TUTOR' | 'SYSTEM'; createdAt: string };
export function parseClassEvent(type: string, payload: unknown, stepIndex: number | null): { ok: true; payload: unknown } | { ok: false; error: string };
export function projectForStudent(e: ClassEventDTO): ClassEventDTO;
export function audiencesFor(actor: { id: string; role: string }): string[];
```

- [ ] **Step 1: Teste falhando** (valores da tabela da spec)
```ts
const card = (n: number) => ({ concepts: Array.from({ length: n }, (_, i) => ({ title: `C${i}`, explanation: 'x', citation: { chunkId: 'k', label: 'Cap. 1', page: null } })), objectiveLink: 'liga', source: 'GENERATED' });
it('STEP_CHANGED: limites de activity/timeRange e stepIndex 0..59', () => {
  const p = { activity: 'a', timeRange: '0-5', fromStepIndex: null };
  expect(parseClassEvent('STEP_CHANGED', p, 0).ok).toBe(true);
  expect(parseClassEvent('STEP_CHANGED', { ...p, activity: 'x'.repeat(201) }, 0).ok).toBe(false);
  expect(parseClassEvent('STEP_CHANGED', { ...p, timeRange: 'x'.repeat(41) }, 0).ok).toBe(false);
  expect(parseClassEvent('STEP_CHANGED', p, 60).ok).toBe(false);
  expect(parseClassEvent('STEP_CHANGED', p, null).ok).toBe(false);
});
it('TUTOR_CARD aceita 2..3 conceitos', () => {
  expect([1, 2, 3, 4].map((n) => parseClassEvent('TUTOR_CARD', card(n), 0).ok)).toEqual([false, true, true, false]);
});
it('TEACHER_NOTE scope STEP exige stepIndex; text até 500', () => {
  expect(parseClassEvent('TEACHER_NOTE', { tutor: 'MUTE', scope: 'STEP' }, null).ok).toBe(false);
  expect(parseClassEvent('TEACHER_NOTE', { tutor: 'MUTE', scope: 'LESSON' }, null).ok).toBe(true);
  expect(parseClassEvent('TEACHER_NOTE', { tutor: null, scope: 'LESSON', text: 'x'.repeat(501) }, null).ok).toBe(false);
});
it('SESSION_* só aceita {}', () => {
  expect(parseClassEvent('SESSION_STARTED', {}, null).ok).toBe(true);
  expect(parseClassEvent('SESSION_ENDED', { a: 1 }, null).ok).toBe(false);
});
it('TUTOR_QUESTION OPEN: text 1..500; tipo desconhecido falha', () => {
  expect(parseClassEvent('TUTOR_QUESTION', { kind: 'OPEN', text: 'Por quê?', origin: 'TEACHER' }, 2).ok).toBe(true);
  expect(parseClassEvent('NOPE', {}, null).ok).toBe(false);
});
it('projeção do aluno remove correctKey e rationale', () => {
  const q = { id: 'q', enunciation: 'Qual a forma normal?', options: [...'ABCD'].map((key) => ({ key, text: key })), correctKey: 'C', rationale: 'r', topic: 't' };
  const e = projectForStudent({ seq: 1, type: 'TUTOR_QUESTION', stepIndex: 0, createdBy: 'TUTOR', createdAt: '', payload: { kind: 'MULTIPLE_CHOICE', question: q, origin: 'TUTOR', source: 'GENERATED' } });
  expect((e.payload as any).question).not.toHaveProperty('correctKey');
  expect((e.payload as any).question).not.toHaveProperty('rationale');
});
it('audiencesFor', () => {
  expect(audiencesFor({ id: 's1', role: 'STUDENT' })).toEqual(['ALL', 's1']);
  expect(audiencesFor({ id: 't1', role: 'TEACHER' })).toEqual(['ALL', 'TEACHER']);
  expect(audiencesFor({ id: 'a1', role: 'ADMIN' })).toEqual(['ALL', 'TEACHER']);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-schema.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** — um schema Zod por tipo com os limites da tabela da spec (`TUTOR_QUESTION` como `z.discriminatedUnion('kind', ...)`; `SESSION_*` como `z.object({}).strict()`); `parseClassEvent` também valida a coluna `stepIndex`: obrigatória 0..59 para `STEP_CHANGED`, `TUTOR_*` e `TEACHER_NOTE` com `scope: 'STEP'`, e `null` para `SESSION_*`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-schema.ts src/domains/classroom/__tests__/class-event-schema.test.ts
git commit -m "feat(aula): schemas dos eventos de aula, projeção do aluno e audience

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Estado derivado puro

**Files:**
- Create: `src/domains/classroom/class-state.ts`
- Create: `src/domains/classroom/__tests__/class-state.test.ts`

**Interfaces:**
- Consumes: `ClassEventDTO`.
- Produces:
```ts
export type SessionPhase = 'NOT_STARTED' | 'RUNNING' | 'ENDED';
export type TutorContent = { card: ClassEventDTO | null; question: ClassEventDTO | null; skipped: ClassEventDTO | null };
export type ClassState = { phase: SessionPhase; currentStepIndex: number | null; lessonMuted: boolean; tutorByStep: Record<number, TutorContent> };
export function sessionPhase(events: ClassEventDTO[]): SessionPhase;
export function currentStep(events: ClassEventDTO[]): ClassEventDTO | null;
export function isTutorMuted(events: ClassEventDTO[], stepIndex: number): boolean;
export function tutorContentForStep(events: ClassEventDTO[], stepIndex: number): TutorContent;
export function reduceClassState(events: ClassEventDTO[]): ClassState;
```

- [ ] **Step 1: Teste falhando** — helper `ev(seq, type, stepIndex = null, payload = {})`; a entrada vem fora de ordem para provar que manda o maior `seq`.
```ts
it('passo atual é o STEP_CHANGED de maior seq, inclusive ao voltar', () => {
  const es = [ev(3, 'STEP_CHANGED', 0), ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0), ev(4, 'STEP_CHANGED', 2), ev(5, 'STEP_CHANGED', 1)];
  expect(reduceClassState(es).currentStepIndex).toBe(1);
});
it('fases', () => {
  expect(sessionPhase([])).toBe('NOT_STARTED');
  expect(sessionPhase([ev(1, 'SESSION_STARTED')])).toBe('RUNNING');
  expect(sessionPhase([ev(1, 'SESSION_STARTED'), ev(9, 'SESSION_ENDED')])).toBe('ENDED');
});
it('mute: vale a última nota relevante; PUBLISH_NOW anula só o próprio passo', () => {
  const es = [ev(1, 'TEACHER_NOTE', null, { tutor: 'MUTE', scope: 'LESSON' }), ev(2, 'TEACHER_NOTE', 3, { tutor: 'PUBLISH_NOW', scope: 'STEP' })];
  expect(isTutorMuted(es, 3)).toBe(false);
  expect(isTutorMuted(es, 4)).toBe(true);
  expect(isTutorMuted([...es, ev(3, 'TEACHER_NOTE', null, { tutor: 'UNMUTE', scope: 'LESSON' })], 4)).toBe(false);
  expect(isTutorMuted([ev(1, 'TEACHER_NOTE', 2, { tutor: 'MUTE', scope: 'STEP' })], 2)).toBe(true);
});
it('conteúdo da tutora por passo', () => {
  const es = [ev(1, 'TUTOR_CARD', 0), ev(2, 'TUTOR_SKIPPED', 1), ev(3, 'TUTOR_QUESTION', 0)];
  expect(tutorContentForStep(es, 0)).toMatchObject({ card: { seq: 1 }, question: { seq: 3 }, skipped: null });
  expect(tutorContentForStep(es, 1).skipped?.seq).toBe(2);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-state.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** — ordenar por `seq` antes de qualquer cálculo. Regra do mute (decisão deste plano): para o passo `s`, a última entre `LESSON MUTE/UNMUTE` e `STEP(s) MUTE/UNMUTE/PUBLISH_NOW` decide; está mudo se ela for `MUTE`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-state.ts src/domains/classroom/__tests__/class-state.test.ts
git commit -m "feat(aula): estado da aula derivado dos eventos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Repositório com `seq` sob trava

**Files:**
- Create: `src/domains/classroom/class-event-repository.ts`
- Create: `src/domains/classroom/__tests__/class-event-repository.test.ts` (mock de `db` como em `src/domains/rag/services/__tests__/chapter-repository.test.ts`)
- Modify: `tests/e2e/class-events.test.ts` (novo `describe` ao final)

**Interfaces:**
- Produces:
```ts
export type NewClassEvent = { type: ClassEventType; stepIndex: number | null; payload: Prisma.InputJsonValue; audience: string; createdBy: ClassEventActor };
export type ClassEventRow = { seq: number; type: ClassEventType; stepIndex: number | null; payload: Prisma.JsonValue; audience: string; createdBy: ClassEventActor; createdAt: Date };
export type AppendContext = { phase: SessionPhase; currentStepIndex: number | null };
export function appendEvents(agendaId: string, build: (ctx: AppendContext) => NewClassEvent[]): Promise<ClassEventRow[]>;
export function findEventsAfter(agendaId: string, after: number, audiences: string[], limit: number): Promise<ClassEventRow[]>;
export const CLASS_EVENTS_PAGE = 200;
```

- [ ] **Step 1: Testes falhando**
  - Unit: `appendEvents` executa, nesta ordem, `SELECT id FROM agendas WHERE id = ... FOR UPDATE`, a leitura de fase e passo, `COALESCE(MAX(seq), 0) + 1` e inserts com seq consecutivos. Se `build` lança `DomainError(409)`, nada é inserido e o erro propaga. Com P2002 no insert, repete a transação inteira uma vez; com P2002 de novo, propaga. Agenda inexistente (trava retorna 0 linhas) → `DomainError(404, 'Agenda não encontrada.')`. `findEventsAfter` monta `where: { agendaId, seq: { gt: after }, audience: { in: audiences } }`, `orderBy: { seq: 'asc' }`, `take: limit`.
  - Integração (Postgres):
```ts
it('10 appends concorrentes geram seq 1..10 sem buraco', async () => {
  const { appendEvents } = await import('@/domains/classroom/class-event-repository');
  const rows = await Promise.all(Array.from({ length: 10 }, () =>
    appendEvents(freshAgendaId, () => [{ type: 'TEACHER_NOTE', stepIndex: null, payload: { tutor: null, scope: 'LESSON' }, audience: 'TEACHER', createdBy: 'TEACHER' }])));
  expect(rows.flat().map((r) => r.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
it('dois SESSION_STARTED simultâneos: um grava, o outro 409', async () => {
  const start = () => appendEvents(otherAgendaId, (ctx) => {
    if (ctx.phase !== 'NOT_STARTED') throw new DomainError(409, 'A aula já foi iniciada.', { code: 'CLASS_ALREADY_STARTED' });
    return [{ type: 'SESSION_STARTED', stepIndex: null, payload: {}, audience: 'ALL', createdBy: 'TEACHER' }];
  });
  const r = await Promise.allSettled([start(), start()]);
  expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
});
it('audience filtrado no WHERE', async () => { /* eventos ALL, TEACHER, s1, s2 → findEventsAfter(id, 0, ['ALL','s1'], 200) devolve só ALL e s1 */ });
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-repository.test.ts` e o e2e → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** — `db.$transaction(async (tx) => ...)` com `tx.$queryRaw` para a trava e o `MAX`; `phase` e `currentStepIndex` lidos dentro da transação (último `SESSION_*` e último `STEP_CHANGED` com `audience = 'ALL'`); `tx.classEvent.create` por evento com `seq = next + i`. Só `insert` e consultas são exportados (imutável).
- [ ] **Step 4: Rodar e ver passar** — os dois comandos → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-repository.ts src/domains/classroom/__tests__/class-event-repository.test.ts tests/e2e/class-events.test.ts
git commit -m "feat(aula): repositório de eventos com seq por agenda sob trava

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Serviço de eventos

**Files:**
- Create: `src/domains/classroom/class-event-service.ts`
- Create: `src/domains/classroom/__tests__/class-event-service.test.ts` (padrão `makeDeps()` com repositório em memória, como `study-group-service.test.ts`)

**Interfaces:**
- Consumes: `getAgendaForUser` + `AgendaActor` + `setAgendaStatus` (`agenda-service.ts`), `findLessonPlayerData` (`lesson-plan-repository.ts`), `timeScriptSchema`, `generateMinutesForAgenda`, Tasks 2-4.
- Produces:
```ts
export type TeacherEventInput = { type: string; stepIndex?: number; payload?: unknown };
export type ClassEventDeps = {
  getAgenda(id: string, user: AgendaActor): Promise<AgendaDTO>;
  findTimeScript(lessonPlanId: string): Promise<TimeScriptItem[]>;
  repo: { appendEvents: typeof appendEvents; findEventsAfter: typeof findEventsAfter };
  completeAgenda(agendaId: string, user: AgendaActor): Promise<void>;
};
export type EventReader = { read(after: number): Promise<ClassEventDTO[]> };
export function appendTeacherEvent(user: AgendaActor, agendaId: string, input: TeacherEventInput, deps?: ClassEventDeps): Promise<ClassEventDTO[]>;
export function openEventReader(user: AgendaActor, agendaId: string, deps?: ClassEventDeps): Promise<EventReader>;
export function listEventsAfter(user: AgendaActor, agendaId: string, after: number, deps?: ClassEventDeps): Promise<{ events: ClassEventDTO[]; lastSeq: number }>;
```

- [ ] **Step 1: Teste falhando** (roteiro fake com 3 passos)
  - aluno → 403; `getAgenda` rejeita 404 (outro professor) → 404 propagado;
  - `TUTOR_CARD` → 400 com `details.code === 'EVENT_TYPE_NOT_ALLOWED'`;
  - `STEP_CHANGED` antes de iniciar → 409 `CLASS_NOT_STARTED`; qualquer escrita após `SESSION_ENDED` → 409 `CLASS_ENDED`; segundo `SESSION_STARTED` → 409 `CLASS_ALREADY_STARTED`;
  - `stepIndex: 3` → 400 `STEP_OUT_OF_RANGE`;
  - `SESSION_STARTED` devolve 2 eventos, `[SESSION_STARTED, STEP_CHANGED]`, com seq consecutivos, `stepIndex` 0 e payload `{ activity, timeRange }` vindos do roteiro, `fromStepIndex: null`; com roteiro vazio, só 1 evento;
  - `STEP_CHANGED` para 2 após o passo 0 → payload `{ activity: roteiro[2].activity, timeRange: roteiro[2].timeRange, fromStepIndex: 0 }`; o `payload` do cliente é ignorado;
  - `TEACHER_NOTE` grava `audience: 'TEACHER'`; os demais, `'ALL'`;
  - `SESSION_ENDED` chama `completeAgenda` uma vez; se ele lança, o evento continua gravado e o erro não propaga;
  - `Promise.all` de 5 `STEP_CHANGED` → seq únicos e crescentes;
  - leitura: aluno chama `findEventsAfter` com `['ALL', id]`; `TUTOR_QUESTION` sai sem `correctKey`; payload inválido no banco é descartado com `console.warn`, sem lançar; `lastSeq` = último seq devolvido ou `after`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-service.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — escrita: papel (`TEACHER`/`ADMIN`, senão 403 `'Apenas o professor da aula pode registrar eventos.'`), depois `getAgenda` (escopo → 404), depois tipo permitido, e as regras de fase dentro do `build` de `appendEvents`. `defaultDeps.completeAgenda` reproduz o `PATCH .../status`: `setAgendaStatus(id, user, COMPLETED)` e `generateMinutesForAgenda` em `try/catch` com log. `openEventReader` checa escopo uma vez e devolve um `read(after)` com o mesmo filtro de audience.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-service.ts src/domains/classroom/__tests__/class-event-service.test.ts
git commit -m "feat(aula): serviço de eventos com autorização, fases e leitura por cursor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Rotas POST e GET `/events`

**Files:**
- Create: `src/app/api/v1/agendas/[id]/events/route.ts`
- Create: `src/app/api/v1/agendas/[id]/events/__tests__/route.test.ts` (padrão `vi.hoisted` de `status/__tests__/route.test.ts`)

**Interfaces:**
- Consumes: `appendTeacherEvent`, `listEventsAfter`, `requireUser`, `apiError`.
- Produces: `POST` → 201 `{ success: true, events }`; `GET ?after=` → `{ success: true, events, lastSeq }`.

- [ ] **Step 1: Teste falhando** — POST chama `requireUser(req, [Role.TEACHER, Role.ADMIN])` e repassa `{ type, stepIndex, payload }`; `DomainError(409, ..., { code: 'CLASS_ENDED' })` vira 409 com `details.code`; body sem `type` → 400; GET usa `requireUser(req)` e `after=abc` → `listEventsAfter(..., 0)`; `after=12` → 12.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/api/v1/agendas/[id]/events/__tests__/route.test.ts"` → FAIL.
- [ ] **Step 3: Implementar** — body validado por `z.object({ type: z.string().min(1), stepIndex: z.number().int().optional(), payload: z.unknown().optional() })`; `export const dynamic = 'force-dynamic'`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add "src/app/api/v1/agendas/[id]/events/route.ts" "src/app/api/v1/agendas/[id]/events/__tests__/route.test.ts"
git commit -m "feat(aula): rotas de escrita e leitura de eventos da aula

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Núcleo do SSE e rota `/events/stream` (modo poll)

**Files:**
- Create: `src/domains/classroom/class-event-stream.ts`
- Create: `src/domains/classroom/__tests__/class-event-stream.test.ts`
- Create: `src/app/api/v1/agendas/[id]/events/stream/route.ts`
- Create: `src/app/api/v1/agendas/[id]/events/stream/__tests__/route.test.ts`

**Interfaces:**
```ts
export type StreamConfig = { maxMs: number; mode: 'poll' | 'listen'; pollMs: number; pingMs: number };
export function readStreamConfig(env?: Record<string, string | undefined>): StreamConfig; // pollMs 2000, pingMs 25000
export function resolveCursor(after: string | null, lastEventId: string | null): number;
export function formatEventFrame(e: ClassEventDTO): string; // `id: ${seq}\nevent: ${type}\ndata: ${json}\n\n`
export type StreamDeps = { read(after: number): Promise<ClassEventDTO[]>; waitForChange(signal: AbortSignal, timeoutMs: number): Promise<void>; now(): number; onClose?(): void };
export function createClassEventStream(cursor: number, config: StreamConfig, deps: StreamDeps, signal: AbortSignal): ReadableStream<Uint8Array>;
```

- [ ] **Step 1: Teste falhando** (relógio falso: `waitForChange` soma `ms` em `t`; `now: () => t`)
  - `readStreamConfig({ VERCEL: '1' })` → `{ maxMs: 8000, mode: 'poll' }`; `({})` → `maxMs: 0`; `({ CLASS_EVENTS_STREAM_MAX_MS: '5000' })` → 5000; `({ CLASS_EVENTS_NOTIFY_MODE: 'listen' })` → `'listen'`; modo inválido → `'poll'`;
  - `resolveCursor('3', '7')` → 7, `(null, '7')` → 7, `('x', null)` → 0, `('5', '2')` → 5;
  - o texto começa com `retry: 1000\n\n`; contém `id: 4\nevent: STEP_CHANGED\ndata: {"seq":4`; `read` chamado com 3 e depois com 5;
  - `maxMs: 8000`: o stream fecha sozinho; `waitForChange` sempre com 2000; `read` 5 vezes; `onClose` chamado;
  - página cheia: `read` devolve 200 e depois 3 → as duas leituras acontecem antes do primeiro `waitForChange`;
  - `maxMs: 0`: após 25 s sem frame sai `: ping\n\n`;
  - **Review Focus:** `abort()` do sinal → o laço para (nenhum `read` depois), o stream fecha e `onClose` é chamado;
  - Rota: `Last-Event-ID: 9` com `?after=2` → `read` começa em 9; fora de escopo → 404 JSON antes de abrir o stream; **Review Focus:** headers `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, e o módulo exporta `dynamic === 'force-dynamic'` e `runtime === 'nodejs'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-stream.test.ts "src/app/api/v1/agendas/[id]/events/stream/__tests__/route.test.ts"` → FAIL.
- [ ] **Step 3: Implementar** — laço: ler até página incompleta → enfileirar → fechar se `maxMs > 0` e `now - início >= maxMs` ou se `signal.aborted` → esperar `mode === 'poll' ? pollMs : min(pingMs, prazo restante)`. A rota usa `req.signal`, `openEventReader` e, em `poll`, `waitForChange` = espera abortável.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-stream.ts src/domains/classroom/__tests__/class-event-stream.test.ts "src/app/api/v1/agendas/[id]/events/stream"
git commit -m "feat(aula): stream SSE de eventos com cursor, Last-Event-ID e fechamento limpo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Ouvinte LISTEN/NOTIFY (modo `listen`)

**Files:**
- Modify: `package.json` (`npm i pg` e `npm i -D @types/pg`)
- Create: `src/domains/classroom/class-event-listener.ts`
- Create: `src/domains/classroom/__tests__/class-event-listener.test.ts`
- Modify: `src/app/api/v1/agendas/[id]/events/stream/route.ts` e o teste da rota
- Modify: `tests/e2e/class-events.test.ts`

**Interfaces:**
```ts
export type PgClientLike = { connect(): Promise<void>; query(sql: string): Promise<unknown>; on(ev: string, cb: (arg?: any) => void): void; end(): Promise<void> };
export function channelFor(agendaId: string): string; // 'class_events_<id>'; lança se !/^[a-z0-9]+$/i
export type Subscription = { wait(signal: AbortSignal, timeoutMs: number): Promise<void>; close(): void };
export type ClassEventListener = { subscribe(agendaId: string): Subscription; isConnected(): boolean };
export function createClassEventListener(makeClient: () => PgClientLike, opts?: { reconnectMs?: number; pollMs?: number }): ClassEventListener;
export function getClassEventListener(): ClassEventListener; // singleton preguiçoso em globalThis, pg.Client com DATABASE_URL
```

- [ ] **Step 1: Teste falhando** (cliente falso com `EventEmitter`)
  - o primeiro `subscribe('ag1')` emite `LISTEN "class_events_ag1"`; o segundo não repete; `close()` do último emite `UNLISTEN`;
  - notificação no canal resolve o `wait` pendente; notificação chegada entre dois `wait` faz o próximo resolver na hora;
  - desconectado: `wait(signal, 25000)` resolve em 2000 ms (fake timers);
  - `'error'` no cliente → reconecta após `reconnectMs` e refaz o `LISTEN` dos canais ativos;
  - `channelFor('ag1"; DROP')` lança;
  - rota em `listen`: usa `subscribe`, chama `close()` quando o stream fecha;
  - e2e: `pg.Client` em `DATABASE_URL_TEST` faz `LISTEN`; `appendEvents` → notificação recebida com payload = seq.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-listener.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — contagem de referências por canal; a flag `dirty` por assinatura evita perder NOTIFY durante a leitura. Na rota, só `mode === 'listen'` chama `getClassEventListener()`; em `poll`, `pg` nunca é carregado.
- [ ] **Step 4: Rodar e ver passar** — unitários + e2e + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json src/domains/classroom/class-event-listener.ts src/domains/classroom/__tests__/class-event-listener.test.ts "src/app/api/v1/agendas/[id]/events/stream" tests/e2e/class-events.test.ts
git commit -m "feat(aula): modo listen com LISTEN/NOTIFY e um ouvinte por processo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Telemetria com `agendaId` e `purpose`

**Files:**
- Modify: `src/domains/telemetry/services/logged-stream-chat.ts` (L22 assinatura; L29-40 gravação)
- Modify: `src/domains/agents/services/chat-service.ts` (`logInference` L151-175; chamadas L266, L315)
- Modify: `src/domains/telemetry/services/__tests__/logged-stream-chat.test.ts`, `src/domains/agents/services/__tests__/chat-service.test.ts` (~L159)

**Interfaces:**
- Produces: `export type InferenceMeta = { agendaId?: string | null; purpose?: InferencePurpose | null }`; `createLoggedStreamChat(deps?, agendaType?: AgendaType | null, meta?: InferenceMeta): StreamChatFn`.

- [ ] **Step 1: Teste falhando** — `createLoggedStreamChat(deps, 'CLASSROOM', { agendaId: 'ag1', purpose: 'TUTOR_CARD' })` grava `objectContaining({ agendaId: 'ag1', purpose: 'TUTOR_CARD' })`; sem `meta`, grava `agendaId: null, purpose: null`; no chat, a expectativa de `createInferenceLog` passa a incluir `agendaId: <id da agenda>, purpose: 'CHAT'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/telemetry/services/__tests__/logged-stream-chat.test.ts src/domains/agents/services/__tests__/chat-service.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — `logInference` recebe `agenda.id` e grava `purpose: 'CHAT'`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/telemetry/services/logged-stream-chat.ts src/domains/agents/services/chat-service.ts src/domains/telemetry/services/__tests__/logged-stream-chat.test.ts src/domains/agents/services/__tests__/chat-service.test.ts
git commit -m "feat(telemetria): InferenceLog com agendaId e purpose; chat grava CHAT

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Hook `useClassEvents`

**Files:**
- Create: `src/components/classroom/use-class-events.ts`
- Create: `src/components/classroom/__tests__/use-class-events.test.ts` (`// @vitest-environment jsdom`; `FakeEventSource` via `vi.stubGlobal`; `vi.useFakeTimers()`)

**Interfaces:**
```ts
export type ClassEventsStatus = 'live' | 'polling' | 'offline';
export function useClassEvents(agendaId: string, options?: { after?: number }): { events: ClassEventDTO[]; status: ClassEventsStatus; lastSeq: number; state: ClassState };
```

- [ ] **Step 1: Teste falhando** — `FakeEventSource` guarda `url`, `readyState`, ouvintes por nome e `close()`; helper `emit(type, dto)` dispara `MessageEvent` **nomeado** (o servidor manda `event: <type>`, então `onmessage` não serve).
  - URL `/api/v1/agendas/ag1/events/stream?after=0`; após `open` → `'live'`; eventos fora de ordem e repetidos → `events` ordenado e sem duplicatas; `state.currentStepIndex` atualizado;
  - **Review Focus:** `error` seguido de `open` em 1 s → status nunca sai de `'live'`, `fetch` não é chamado;
  - `error` sem `open` por 10 s → `close()` no EventSource, status `'polling'`, `fetch('/api/v1/agendas/ag1/events?after=<lastSeq>')` a cada 5 s, e os eventos do JSON são mesclados;
  - `fetch` rejeitado no polling → `'offline'`;
  - 30 s em polling → novo EventSource com `?after=<lastSeq>`; no `open`, o polling para (nenhum `fetch` nos 10 s seguintes) e status `'live'`;
  - unmount fecha o EventSource e limpa os timers.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom/__tests__/use-class-events.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — status inicial `'polling'` (mostrado como "atualizando") até o primeiro `open`; um `addEventListener` por item de `CLASS_EVENT_TYPES`; `state = useMemo(() => reduceClassState(events))`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom/use-class-events.ts src/components/classroom/__tests__/use-class-events.test.ts
git commit -m "feat(aula): hook useClassEvents com SSE, fallback para polling e retorno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: ClassroomPage sem tique periódico

**Files:**
- Create: `src/components/classroom/use-session-clock.ts`, `src/components/classroom/__tests__/use-session-clock.test.ts`
- Modify: `src/components/classroom/use-agenda-lesson.ts` (`useAgendaFaqs` L43-66; remove `FAQ_REFETCH_MS` L8)
- Create: `src/components/classroom/__tests__/use-agenda-faqs.test.ts`
- Modify: `src/components/ai/use-tutor-chat.ts` (opção `onReplyDone`, chamada no `SSE_EVENT.DONE` ~L117) e `src/components/ai/__tests__/use-tutor-chat.test.ts`
- Modify: `src/components/ai/universal-socratic-chat.tsx` e `src/components/classroom/socratic-chat-panel.tsx` (repassar `onReplyDone`)
- Modify: `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx` (L36-40 relógio; L47 FAQ; L79-80 status; L114-119 "restantes")

**Interfaces:**
```ts
export const MAX_TIMEOUT_MS = 2_147_483_647;
export function nextBoundaryDelay(startTime: string, endTime: string, now: number): number | null;
export function useSessionClock(startTime: string, endTime: string, resetKey: unknown): Date;
export function useAgendaFaqs(agendaId: string, reloadKey: string | number): { faqs: FAQItem[]; isLoading: boolean };
// useTutorChat({ ..., onReplyDone?: () => void })
```

- [ ] **Step 1: Teste falhando**
  - `nextBoundaryDelay`: antes do início → até `startTime`; durante → até `endTime`; depois → `null`; **Review Focus:** início em 30 dias → `MAX_TIMEOUT_MS`;
  - `useSessionClock`: com `vi.spyOn(globalThis, 'setInterval')`, zero chamadas; um único `setTimeout` pendente; avançar até o limite atualiza o `Date` devolvido; mudar `resetKey` recalcula;
  - `useAgendaFaqs`: `fetch` uma vez na montagem e mais uma a cada mudança de `reloadKey`; nenhum `setInterval`;
  - `useTutorChat`: `onReplyDone` chamado uma vez após `done`, e não em `error`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom/__tests__/use-session-clock.test.ts src/components/classroom/__tests__/use-agenda-faqs.test.ts src/components/ai/__tests__/use-tutor-chat.test.ts` → FAIL.
- [ ] **Step 3: Implementar**
  - Na página: `const { state, lastSeq } = useClassEvents(sessionId)`; `now = useSessionClock(session.startTime, session.endTime, state.phase)`.
  - Status: `state.phase === 'ENDED' ? 'COMPLETED' : deriveAgendaStatus(session, now)`.
  - FAQ: contador `repliesDone` incrementado por `onReplyDone`; `useAgendaFaqs(sessionId, \`${lastSeq}:${repliesDone}\`)`.
  - O selo "X restantes" vira "até HH:MM" no `INSTITUTION_TIMEZONE`: sem tique, o contador ficaria parado.
  - A faixa "Agora na aula" não entra nesta entrega.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/components` + `grep -n "setInterval" "src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx" src/components/classroom/use-agenda-lesson.ts` (sem saída) → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom src/components/ai/use-tutor-chat.ts src/components/ai/__tests__/use-tutor-chat.test.ts src/components/ai/universal-socratic-chat.tsx "src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx"
git commit -m "feat(sala): status e FAQ dirigidos por eventos, sem relógio periódico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Documentação e verificação final

**Files:**
- Modify: `README.md` (nova seção "Class events (Eventos de aula)" antes de `## Evals` ~L107, no idioma do README; duas linhas na tabela de Environment ~L156)
- Modify: `.env.example` (bloco novo após Database)
- Modify: `docs/DEPLOY.md` (§2.4 "Recomendadas", ~L55)

- [ ] **Step 1: Escrever**
  - README: os modos `poll` (padrão; consulta de 2 s por conexão) e `listen` (trigger + `pg_notify`, um ouvinte por processo, conexão sem pooler); na Vercel, conexão de até 8 s com retomada por `Last-Event-ID` e latência de ~2 s.
  - `.env.example`: `CLASS_EVENTS_NOTIFY_MODE="poll"` e `# CLASS_EVENTS_STREAM_MAX_MS=""` com comentário (padrão 8000 com `VERCEL`, 0 fora).
  - DEPLOY: uma frase dizendo que `listen` só vale fora da Vercel (Docker/VPS com conexão direta) e que na Vercel fica `poll`.
- [ ] **Step 2: Verificação** — `npx vitest run` (suíte inteira), `npx tsc --noEmit`, `DATABASE_URL_TEST=<url> npx vitest run tests/e2e` → tudo verde.
- [ ] **Step 3: Teste manual (aceite)** — `npm run dev` com `CLASS_EVENTS_NOTIFY_MODE=poll`; dois navegadores como alunos na mesma sala; como professor, `curl -X POST .../events` com `SESSION_STARTED` e depois `STEP_CHANGED` → os dois recebem em até 3 s (aba Network: frames com `id`). Com `CLASS_EVENTS_STREAM_MAX_MS=3000`, conferir que a reconexão manda `Last-Event-ID` e que nenhum evento se repete nem falta.
- [ ] **Step 4: Commit**
```bash
git add README.md .env.example docs/DEPLOY.md
git commit -m "docs(aula): eventos de aula, modos poll/listen e limites na Vercel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Critérios de aceite (Entrega 1, spec §6)

| Critério | Cumprido em |
|---|---|
| `ClassEvent` e migration com trigger e índice parcial | Task 1 (integração), Task 8 (NOTIFY e2e) |
| Dois navegadores de aluno recebem um evento gravado por `POST` em até 3 s no modo `poll` | Task 6 (POST), Task 7 (poll de 2 s), Task 12 Step 3 |
| Reconexão retoma pelo `Last-Event-ID` sem perder nem repetir | Task 7 (cursor = max(after, Last-Event-ID)), Task 10 (dedupe por `seq`), Task 12 Step 3 |
| Nenhum `setInterval` periódico na sala | Task 11 (spies + grep) |
| Testes e typecheck verdes | Task 12 Step 2 |
| (pedido) `SESSION_ENDED` conclui a agenda e gera atas sem desfazer o evento | Task 5 |
| (pedido) InferenceLog com `agendaId`/`purpose`; chat grava `CHAT` | Task 1, Task 9 |
