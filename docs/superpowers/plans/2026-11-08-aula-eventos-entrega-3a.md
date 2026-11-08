# Aula como eventos — Entrega 3a: tutora proativa ao vivo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cada passo da aula ao vivo, a tutora publica sozinha um cartão citado do material e, quando cabe, uma pergunta de verificação; o aluno responde na faixa "Agora na aula" e o professor vê, sem nomes, quantos responderam e a taxa de acerto, com controles para silenciar ou publicar.

**Architecture:** Worker sem estado (`runTutorForStep`) disparado por `after()` nas rotas de eventos e, sob demanda, quando um passo fica mais de 20 s sem conteúdo. A política de silêncio é pura (`tutor-policy.ts`); a reserva e o teto de 2 chamadas por passo moram em `tutor_step_drafts` com `UPDATE ... WHERE` atômico; a publicação passa por `appendTutorEvents`, idempotente sob a trava da agenda. Resposta e pulso usam `StudentInteraction` (com `classEventSeq`) e duas rotas novas; a faixa do aluno e a coluna da tutora no painel derivam tudo de `reduceStudentView`/`reduceTeacherView`.

**Tech Stack:** Next.js 15.5 App Router (`after` de `next/server`), React 19, TypeScript strict, Prisma 6 + Postgres/pgvector, Zod, vitest + Testing Library (jsdom), Tailwind/shadcn, `@playwright/test`.

**Spec:** docs/superpowers/specs/2026-11-08-aula-eventos-tutora-proativa-design.md (§1 `TutorStepDraft` e payloads, §3 Worker, §4 Interface, §5, §6 "Entrega 3"). Interfaces anteriores: docs/superpowers/plans/2026-11-08-aula-eventos-entrega-1.md e `...-entrega-2.md`. Continuação: docs/superpowers/plans/2026-11-08-aula-eventos-entrega-3b.md (pré-geração no editor, aula gravada, seed e evals).

**Decisões fixadas aqui:**
- `InferencePurpose`, `InferenceLog.agendaId/purpose` e o `purpose: 'CHAT'` do chat já existem (Entrega 1, Task 9; conferido em `prisma/schema.prisma` e `chat-service.ts:173`). Nenhuma task para isso; a migration nova só cria `tutor_step_drafts` e a coluna da resposta.
- **Publicação em dois lotes.** A pergunta do professor (`socraticQuestion`, regra 2) sai assim que o worker decide o plano, sem esperar o modelo; cartão, pergunta gerada e `TUTOR_SKIPPED` saem juntos num único `appendTutorEvents` no fim. Detecção de passo parado (disparo sob demanda) = passo atual sem `TUTOR_CARD` **e** sem `TUTOR_SKIPPED` há mais de 20 s (a pergunta do professor sozinha não conta como concluído).
- **Idempotência da tutora** (follow-up da Entrega 1): `appendTutorEvents` trava a agenda, ignora os tipos que o passo já tem e devolve as linhas existentes; P2002 do índice `class_events_tutor_step_uq` é sucesso (relê e devolve). Vale também para `TUTOR_SKIPPED`, que não está no índice parcial: a deduplicação por tipo sob a trava cobre. O índice parcial não é alterado.
- **Resposta do aluno com `StudentInteraction.classEventSeq Int?`** e índice único parcial `(agendaId, studentId, classEventSeq) WHERE classEventSeq IS NOT NULL`. Desvio consciente da spec (que pede a chave `questionText + createdAt` e "StudentInteraction não muda"): sem a coluna, a linha da resposta (tipo `SOCRATIC_CHALLENGE`, `isSocraticChallenge: true`) vira o "desafio anterior" que o chat julga na próxima mensagem e aparece no histórico do chat como pergunta/resposta; e duas abas gravariam duas respostas. `findLastInteraction` e `listRecentInteractions` passam a filtrar `classEventSeq: null`. Os demais campos da linha seguem a spec.
- **Escopo da busca do cartão = `loadTutorScope(lessonPlanId)`** (`chat-service.ts`): capítulos da aula expandidos por `expandChapterScope`; sem capítulos, materiais do plano; sem nada, acervo inteiro. É o mesmo escopo do chat, e o seed de demonstração não vincula capítulos às aulas.
- **Trecho "recuperado"** = trecho com casamento léxico (`bm25Score != null`) ou `similarityScore >= 0.55` (`TUTOR_MIN_SIMILARITY`). Sem esse corte a busca vetorial sempre devolve `topK` trechos e a regra 4 (`NO_MATERIAL`) nunca dispara.
- **Ordem do orçamento:** cartão primeiro (até 2 chamadas), pergunta gerada com o que sobrar. Rascunho com `stepHash` igual é promovido sem reserva e sem chamada.
- **Pulso:** recarrega a cada evento novo do hook e, só enquanto o passo atual tem pergunta publicada, por um único `setTimeout` de 10 s re-armado após cada leitura (spec §4). Nenhum `setInterval`.
- **Aviso de atas** (follow-up da Entrega 2): `POST /events` passa a devolver `warning` quando `SESSION_ENDED` grava o evento mas a agenda não conclui ou as atas falham; o painel mostra o aviso.
- `reduceTeacherView(events, pulse, stepCount)` recebe `stepCount` (necessário para `nextStepIndex`); desvio da assinatura da spec §4.
- A faixa do aluno aparece quando `phase !== 'ENDED'` e há passo visível (prepara a aula gravada da 3b sem mudar a faixa de novo).

## Global Constraints

- Trabalho direto em `main`, sem branch/PR; cada task termina em commit com o trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nenhuma task roda `npm run db:seed`, `prisma migrate reset` ou `prisma migrate dev` (sem `--create-only`) contra o banco de dev (porta 5432). Migration nova via `prisma migrate dev --create-only` é permitida porque só gera SQL; revisar o SQL à mão (o drift do pgvector gera DROPs espúrios; o índice parcial `class_events_tutor_step_uq` existe só na migration SQL e não pode ser dropado; o novo índice parcial `student_interactions_class_event_answer_uq` também existe só em SQL); aplicar com `npx prisma migrate deploy`. Seed só no docker 5433 (`DATABASE_URL_TEST`), se algum teste precisar.
- Sem estado de aula em memória de processo; nenhum `setInterval` na sala/painel nos arquivos criados ou alterados por esta entrega (o fallback em `use-class-events.ts` da Entrega 1 permanece).
- Teto de 2 chamadas ao modelo por passo por aula, reserva via `UPDATE ... WHERE` atômico, como na spec §3 (`calls < 2` e `claimedAt` nulo ou com mais de 60 s); cada chamada incrementa `calls` antes de ser feita.
- Tipos da tutora não são aceitos no `POST /events` do professor (já é assim); audience aplicado no servidor.
- Copy em pt-BR exatamente como nas tasks. Sem stubs/placeholders.
- Testes: `npx vitest run <path>`, `npx tsc --noEmit`; componentes com `// @vitest-environment jsdom` e `import * as React`; sem `@testing-library/jest-dom` (asserções com `textContent`, `getAttribute`, `.disabled`, `toBeNull()`).
- Evals Python (`evals/`) não entram no vitest nem no CI; o caso `proativo` roda com o provedor real só manualmente.
- Serviços com `deps` injetáveis e `defaultDeps`; só repositórios importam `db`. Erros de domínio via `DomainError(status, msg, { code })`.
- Depois de `npx prisma generate`, o `next dev` em execução precisa reiniciar.

## Review Focus

- Professor clica "Próximo" e volta ao mesmo passo, ou o disparo sob demanda coincide com o `after()`: dois workers no mesmo passo. Um só cartão e um só `TUTOR_SKIPPED` por passo (testes: Task 2 "appends concorrentes publicam um cartão", Task 7 "segunda execução não publica de novo").
- Modelo cita `chunkId` que não foi recuperado ou escreve "Cap. 9, p. 300" na explicação: o conceito some ou a referência vira "o material"; com menos de 2 conceitos válidos a chamada conta como falha (testes: Task 5).
- Worker cortado pela plataforma depois de gastar as 2 chamadas: a reserva expira em 60 s, e o próximo disparo grava `TUTOR_SKIPPED BUDGET` sem chamar o modelo, em vez de tentar para sempre (teste: Task 6 "calls esgotadas: BUDGET sem chamada").
- Aluno clica duas vezes em "Responder" ou responde em duas abas: uma `StudentInteraction`, a segunda requisição recebe 409 `ALREADY_ANSWERED` e a faixa mostra "Você já respondeu esta pergunta." (testes: Task 1 e2e índice parcial, Task 9, Task 10).
- Depois de responder a pergunta da tutora, o aluno escreve no chat: a resposta gravada não pode ser julgada como "desafio anterior" nem aparecer no histórico do chat (teste: Task 9 "consultas do chat ignoram respostas a eventos").

---

### Task 1: `TutorStepDraft`, coluna da resposta e repositório de rascunhos

**Files:**
- Modify: `prisma/schema.prisma` (`LessonPlan` ganha `tutorDrafts TutorStepDraft[]`; `StudentInteraction` ganha `classEventSeq Int?`; model `TutorStepDraft` exatamente como na spec §1)
- Create: `prisma/migrations/<timestamp>_tutor_step_drafts/migration.sql`
- Create: `src/domains/classroom/tutor-step-draft-repository.ts`
- Test: `src/domains/classroom/__tests__/tutor-step-draft-repository.test.ts` (mock de `db` como em `class-event-repository.test.ts`), `tests/e2e/tutor-step-drafts.test.ts`

**Interfaces:**
- Produces:
```ts
export const TUTOR_STEP_MAX_CALLS = 2;
export const TUTOR_CLAIM_TTL_SECONDS = 60;
export type TutorDraftRow = { id: string; stepIndex: number; stepHash: string; card: Prisma.JsonValue | null; question: Prisma.JsonValue | null; calls: number };
export function ensureDraft(lessonPlanId: string, stepIndex: number, stepHash: string): Promise<TutorDraftRow>;
export function claimDraft(id: string): Promise<boolean>;
export function spendCall(id: string): Promise<boolean>;
export function saveDraftContent(id: string, data: { card?: Prisma.InputJsonValue; question?: Prisma.InputJsonValue }): Promise<void>;
export function releaseDraft(id: string): Promise<void>;
export function listDrafts(lessonPlanId: string): Promise<TutorDraftRow[]>;
```
`db.tutorStepDraft`; `StudentInteraction.classEventSeq`.

- [ ] **Step 1: Testes falhando**
  - Unit: `ensureDraft` é um único `INSERT ... ON CONFLICT ("lessonPlanId","stepIndex") DO UPDATE ... RETURNING` (via `$queryRaw`) que, com `stepHash` diferente, zera `card`, `question`, `calls` e `claimedAt` e grava o novo hash; com hash igual mantém tudo. O SQL fornece `id` (`randomUUID()`) e `"updatedAt" = now()` (os defaults do Prisma são do cliente). `claimDraft` devolve `true` só com 1 linha afetada; `spendCall` usa `SET calls = calls + 1 WHERE id = $1 AND calls < 2`.
  - e2e (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, `beforeAll` no padrão de `class-events.test.ts`, um plano de aula descartável):
```ts
it('reserva: segunda tentativa falha; expira em 60 s; teto de 2 chamadas bloqueia', async () => {
  const d = await ensureDraft(planId, 0, 'h1');
  expect(await claimDraft(d.id)).toBe(true);
  expect(await claimDraft(d.id)).toBe(false);
  await db.$executeRaw`UPDATE tutor_step_drafts SET "claimedAt" = now() - interval '61 seconds' WHERE id = ${d.id}`;
  expect(await claimDraft(d.id)).toBe(true);
  expect([await spendCall(d.id), await spendCall(d.id), await spendCall(d.id)]).toEqual([true, true, false]);
  await releaseDraft(d.id);
  expect(await claimDraft(d.id)).toBe(false); // calls = 2
});
it('hash novo zera calls e conteúdo; hash igual preserva', async () => {
  const d = await ensureDraft(planId, 1, 'a');
  await spendCall(d.id); await saveDraftContent(d.id, { card: { x: 1 } });
  expect(await ensureDraft(planId, 1, 'a')).toMatchObject({ calls: 1, card: { x: 1 } });
  expect(await ensureDraft(planId, 1, 'b')).toMatchObject({ calls: 0, card: null, stepHash: 'b' });
});
it('resposta única por aluno e evento; classEventSeq nulo repete livre', async () => {
  const base = { agendaId, studentId, type: 'SOCRATIC_CHALLENGE', questionText: 'q', responseText: 'r', isSocraticChallenge: true } as const;
  await db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } });
  await expect(db.studentInteraction.create({ data: { ...base, classEventSeq: 7 } })).rejects.toMatchObject({ code: 'P2002' });
  await db.studentInteraction.create({ data: base });
  await db.studentInteraction.create({ data: base });
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/tutor-step-draft-repository.test.ts` e `DATABASE_URL_TEST=<url> npx vitest run tests/e2e/tutor-step-drafts.test.ts` → FAIL (módulo e tabela não existem).
- [ ] **Step 3: Implementar** — schema; `npx prisma migrate dev --create-only --name tutor_step_drafts`; no SQL, apagar todo `DROP` (inclusive qualquer `DROP INDEX "class_events_tutor_step_uq"`) e acrescentar ao fim:
```sql
CREATE UNIQUE INDEX student_interactions_class_event_answer_uq
  ON student_interactions ("agendaId", "studentId", "classEventSeq") WHERE "classEventSeq" IS NOT NULL;
```
Aplicar com `npx prisma migrate deploy` (dev) e `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`; `npx prisma generate`. Conferir com `psql`/script que `class_events_tutor_step_uq` continua existindo nos dois bancos. Repositório com as funções acima (`claimDraft`/`spendCall` via `$executeRaw`, retorno = linhas afetadas).
- [ ] **Step 4: Rodar e ver passar** — os dois comandos + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations src/domains/classroom/tutor-step-draft-repository.ts src/domains/classroom/__tests__/tutor-step-draft-repository.test.ts tests/e2e/tutor-step-drafts.test.ts
git commit -m "feat(tutora): rascunhos por passo com reserva e teto de chamadas; resposta única por evento

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Publicação idempotente dos eventos da tutora

**Files:**
- Modify: `src/domains/classroom/class-event-repository.ts`
- Test: `src/domains/classroom/__tests__/class-event-repository.test.ts`, `tests/e2e/class-events.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: `ClassEventRow`, trava de `appendOnce` (Entrega 1).
- Produces:
```ts
export type TutorEventType = 'TUTOR_CARD' | 'TUTOR_QUESTION' | 'TUTOR_SKIPPED';
export type NewTutorEvent = { type: TutorEventType; payload: Prisma.InputJsonValue; audience: 'ALL' | 'TEACHER' };
export function appendTutorEvents(agendaId: string, stepIndex: number, events: NewTutorEvent[]): Promise<ClassEventRow[]>;
export function findTutorEventsForStep(agendaId: string, stepIndex: number): Promise<ClassEventRow[]>;
export function findEventBySeq(agendaId: string, seq: number, audiences: string[]): Promise<ClassEventRow | null>;
export const TUTOR_EVENTS_SCAN = 1000; // limite de leitura do worker em findEventsAfter
```
Semântica de `appendTutorEvents`: transação com `SELECT ... FOR UPDATE` na agenda; fase `ENDED` → `[]` sem inserir; lê as linhas da tutora do passo; insere (com `createdBy: 'TUTOR'`, `stepIndex`, `seq` contíguos) só os tipos ainda ausentes; devolve, para cada tipo pedido, a linha existente ou a nova. P2002 → devolve `findTutorEventsForStep` filtrado pelos tipos pedidos, sem lançar.

- [ ] **Step 1: Testes falhando**
  - Unit: tipo já existente não é reinserido e volta a linha antiga; fase `ENDED` não insere; P2002 no `create` → resolve com as linhas relidas (sem rejeitar); `findEventBySeq` filtra `audience: { in }`.
  - e2e:
```ts
it('appends concorrentes publicam um cartão e um skip por passo', async () => {
  const card = { type: 'TUTOR_CARD', payload: cardPayload, audience: 'ALL' } as const;
  const skip = { type: 'TUTOR_SKIPPED', payload: { reason: 'NO_MATERIAL', kind: 'CARD' }, audience: 'TEACHER' } as const;
  await Promise.all([appendTutorEvents(id, 0, [card]), appendTutorEvents(id, 0, [card]), appendTutorEvents(id, 0, [skip]), appendTutorEvents(id, 0, [skip])]);
  const rows = await db.classEvent.findMany({ where: { agendaId: id, stepIndex: 0 } });
  expect(rows.map((r) => r.type).sort()).toEqual(['TUTOR_CARD', 'TUTOR_SKIPPED']);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-repository.test.ts` + e2e → FAIL.
- [ ] **Step 3: Implementar** — reaproveitar a leitura de fase de `appendOnce` (extrair helper interno; `appendEvents` não muda de comportamento).
- [ ] **Step 4: Rodar e ver passar** — mesmos comandos → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-repository.ts src/domains/classroom/__tests__/class-event-repository.test.ts tests/e2e/class-events.test.ts
git commit -m "feat(tutora): publicação idempotente por passo; P2002 do índice parcial vira sucesso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Política de silêncio e tipos dos payloads

**Files:**
- Modify: `src/domains/classroom/class-event-schema.ts` (só exports de tipo)
- Create: `src/domains/classroom/tutor-policy.ts`
- Test: `src/domains/classroom/__tests__/tutor-policy.test.ts`

**Interfaces:**
- Consumes: `ClassEventDTO`, `currentStep`, `sessionPhase`, `isTutorMuted`, `tutorContentForStep` (`class-state.ts`), `TimeScriptItem`.
- Produces:
```ts
// class-event-schema.ts
export type TutorCardPayload = z.infer<typeof tutorCardPayload>;
export type TutorQuestionPayload = z.infer<typeof tutorQuestionPayload>;
export type TutorSkippedPayload = z.infer<typeof tutorSkippedPayload>;
export type TeacherNotePayload = z.infer<typeof teacherNotePayload>;
// tutor-policy.ts (puro, sem imports de runtime fora de class-state)
export const SHORT_STEP_SECONDS = 240;
export const TUTOR_STALL_MS = 20_000;
export type TutorPlan =
  | { kind: 'SILENT' }
  | { kind: 'RUN'; question: { from: 'TEACHER'; text: string } | { from: 'MODEL' } | null };
export type CallResult = 'ok' | 'rate_limit' | 'provider_error' | 'invalid';
export type SkipReason = TutorSkippedPayload['reason'];
export function stepDurationSeconds(script: TimeScriptItem[], stepIndex: number, agendaSeconds: number): number;
export function decideTutorPlan(step: { item: TimeScriptItem; durationSeconds: number }, context: { muted: boolean }): TutorPlan;
export function noMaterialSkip(plan: Extract<TutorPlan, { kind: 'RUN' }>): TutorSkippedPayload;
export function failureReason(results: CallResult[]): Exclude<SkipReason, 'NO_MATERIAL'>;
export function tutorRunTarget(written: ClassEventDTO[]): number | null;
export function stalledTutorStep(events: ClassEventDTO[], now: number): number | null;
export function tutorSkipMessage(p: TutorSkippedPayload): string;
```
Regras: 1 `muted` → `SILENT`; 2 `socraticQuestion` não vazia (trim) → `{ from: 'TEACHER', text: trim().slice(0, 500) }`; 3 duração `< 240` → `question: null`; senão `{ from: 'MODEL' }`. Duração: próximo `timeSeconds` − atual; no último, `agendaSeconds − timeSeconds` (mínimo 0). `noMaterialSkip` → `{ reason: 'NO_MATERIAL', kind: plan.question?.from === 'MODEL' ? 'BOTH' : 'CARD' }` (regra 4). `failureReason([])` → `'BUDGET'`; dois últimos `'rate_limit'` → `'RATE_LIMIT'`; senão `'PROVIDER_ERROR'` (regra 5). `tutorRunTarget`: `stepIndex` do último `STEP_CHANGED` escrito, ou do `TEACHER_NOTE` com `tutor: 'PUBLISH_NOW'`; senão `null`. `stalledTutorStep`: passo atual (`currentStep`) com fase ≠ `ENDED`, `now − createdAt > 20 000`, não mudo e sem `card` nem `skipped`; senão `null`.
Copy de `tutorSkipMessage` = motivo + espaço + tipo:
- motivo: `NO_MATERIAL` "Nenhum trecho do material foi encontrado para este passo."; `RATE_LIMIT` "O provedor de IA recusou por limite de uso."; `BUDGET` "O limite de 2 chamadas à IA neste passo já foi usado."; `PROVIDER_ERROR` "A IA não devolveu um conteúdo válido."
- tipo: `CARD` "Sem cartão neste passo."; `QUESTION` "Sem pergunta gerada neste passo."; `BOTH` "Sem cartão nem pergunta neste passo."

- [ ] **Step 1: Teste falhando** (helper `item(timeSeconds, extra?)`, `ev` como em `class-state.test.ts`)
```ts
it('regra 1 vence a 2: mudo não publica nem a pergunta do professor', () => {
  expect(decideTutorPlan({ item: item(0, { socraticQuestion: 'Por quê?' }), durationSeconds: 900 }, { muted: true })).toEqual({ kind: 'SILENT' });
});
it('regra 2 vence a 3: pergunta do professor mesmo em passo curto', () => {
  expect(decideTutorPlan({ item: item(0, { socraticQuestion: ' Por quê? ' }), durationSeconds: 60 }, { muted: false }))
    .toEqual({ kind: 'RUN', question: { from: 'TEACHER', text: 'Por quê?' } });
});
it('regra 3: menos de 4 min sem pergunta gerada; 4 min com', () => {
  expect(decideTutorPlan({ item: item(0), durationSeconds: 239 }, { muted: false })).toEqual({ kind: 'RUN', question: null });
  expect(decideTutorPlan({ item: item(0), durationSeconds: 240 }, { muted: false })).toEqual({ kind: 'RUN', question: { from: 'MODEL' } });
});
it('duração do último passo vem da agenda', () => {
  const s = [item(0), item(600), item(1800)];
  expect([0, 1, 2].map((i) => stepDurationSeconds(s, i, 3000))).toEqual([600, 1200, 1200]);
  expect(stepDurationSeconds(s, 2, 1000)).toBe(0);
});
it('regra 4: NO_MATERIAL com BOTH só quando a pergunta seria gerada', () => {
  expect(noMaterialSkip({ kind: 'RUN', question: { from: 'MODEL' } })).toEqual({ reason: 'NO_MATERIAL', kind: 'BOTH' });
  expect(noMaterialSkip({ kind: 'RUN', question: { from: 'TEACHER', text: 'x' } })).toEqual({ reason: 'NO_MATERIAL', kind: 'CARD' });
});
it('regra 5', () => {
  expect(failureReason(['rate_limit', 'rate_limit'])).toBe('RATE_LIMIT');
  expect(failureReason(['invalid', 'rate_limit'])).toBe('PROVIDER_ERROR');
  expect(failureReason([])).toBe('BUDGET');
});
it('passo parado: >20 s sem cartão nem skip; pergunta do professor sozinha não conclui', () => {
  const t0 = Date.parse('2026-11-08T12:00:00Z');
  const step = { ...ev(2, 'STEP_CHANGED', 1), createdAt: new Date(t0).toISOString() };
  const es = [ev(1, 'SESSION_STARTED'), step, ev(3, 'TUTOR_QUESTION', 1)];
  expect(stalledTutorStep(es, t0 + 20_000)).toBeNull();
  expect(stalledTutorStep(es, t0 + 20_001)).toBe(1);
  expect(stalledTutorStep([...es, ev(4, 'TUTOR_SKIPPED', 1)], t0 + 60_000)).toBeNull();
  expect(stalledTutorStep([...es, ev(4, 'TEACHER_NOTE', 1, { tutor: 'MUTE', scope: 'STEP' })], t0 + 60_000)).toBeNull();
  expect(stalledTutorStep([...es, ev(4, 'SESSION_ENDED')], t0 + 60_000)).toBeNull();
});
it('alvo do worker após o POST', () => {
  expect(tutorRunTarget([ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0)])).toBe(0);
  expect(tutorRunTarget([ev(5, 'TEACHER_NOTE', 3, { tutor: 'PUBLISH_NOW', scope: 'STEP' })])).toBe(3);
  expect(tutorRunTarget([ev(5, 'TEACHER_NOTE', 3, { tutor: 'MUTE', scope: 'STEP' })])).toBeNull();
});
it('mensagem do skip', () => {
  expect(tutorSkipMessage({ reason: 'RATE_LIMIT', kind: 'QUESTION' }))
    .toBe('O provedor de IA recusou por limite de uso. Sem pergunta gerada neste passo.');
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/tutor-policy.test.ts` → FAIL.
- [ ] **Step 3: Implementar** os exports acima.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-schema.ts src/domains/classroom/tutor-policy.ts src/domains/classroom/__tests__/tutor-policy.test.ts
git commit -m "feat(tutora): política de silêncio pura com as 5 regras e detecção de passo parado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `generateQuestionsFromChunks` e prompt da pergunta de aula

**Files:**
- Modify: `src/domains/assessments/services/assessment-service.ts` (`askModel` L132-145 e `generateQuestions` L147-200)
- Create: `src/domains/agents/prompts/lesson-question-prompt.ts`
- Test: `src/domains/assessments/services/__tests__/assessment-service.test.ts` (casos novos; os existentes não mudam), `src/domains/agents/prompts/__tests__/lesson-question-prompt.test.ts`

**Interfaces:**
- Consumes: `collectStream`, `parseAssessmentText`, `questionSchema`, `formatCitation`, `StreamChatFn`.
- Produces:
```ts
export type QuestionGenerationResult =
  | { ok: true; questions: Question[]; rubrics: Rubric[] }
  | { ok: false; reason: 'rate_limit' | 'provider_error' | 'invalid' };
export function generateQuestionsFromChunks(
  chunks: DidacticChunk[], count: number,
  buildMessages: (chunks: DidacticChunk[], count: number) => AIMessage[],
  deps: { streamChat: StreamChatFn },
): Promise<QuestionGenerationResult>;
// lesson-question-prompt.ts
export type LessonQuestionPromptInput = { activity: string; description: string; dailyObjective: string; chunks: DidacticChunk[] };
export function buildLessonQuestionMessages(input: LessonQuestionPromptInput): AIMessage[];
```
`generateQuestionsFromChunks`: temperatura 0.4 e `assessmentMaxTokens(count)`; `fallbackReason === 'rate_limit'` → `rate_limit`; outro fallback ou exceção → `provider_error`; parse nulo ou `z.array(questionSchema).length(count)` falho → `invalid`; ids renumerados `q1..qN`. `generateQuestions` passa a chamá-lo: `rate_limit` → `DomainError(429, LESSON_AI_RATE_LIMITED_MESSAGE)` como hoje; demais falhas → `buildFallbackQuestions` como hoje.
Prompt: sistema pede exatamente 1 questão de múltipla escolha no mesmo JSON de `ASSESSMENT_SYSTEM_PROMPT` (`{"questions":[...]}` com 4 alternativas A-D, uma correta, `rationale` curta citando o trecho, `topic`), só com os trechos dados, sem markdown; usuário traz "Passo da aula: {activity}", "Descrição: {description}", "Objetivo do dia: {dailyObjective}" e os trechos com `formatCitation`.

- [ ] **Step 1: Testes falhando**
  - `generateQuestionsFromChunks` com `streamChat` falso: JSON válido com 1 questão → `{ ok: true, questions: [{ id: 'q1', ... }] }`; chunk com `fallback: true, fallbackReason: 'rate_limit'` → `{ ok: false, reason: 'rate_limit' }`; fallback sem motivo → `provider_error`; `streamChat` que lança → `provider_error`; 2 questões quando `count = 1` → `invalid`.
  - `generateQuestions`: suíte existente verde sem alterações.
  - Prompt: as mensagens contêm a `activity`, o `dailyObjective` e `formatCitation(chunk)` de cada trecho; o sistema contém `"questions"` e "exatamente 1".
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/assessments/services/__tests__/assessment-service.test.ts src/domains/agents/prompts/__tests__/lesson-question-prompt.test.ts` → FAIL.
- [ ] **Step 3: Implementar** a extração e o prompt.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/assessments/services/assessment-service.ts src/domains/assessments/services/__tests__/assessment-service.test.ts src/domains/agents/prompts/lesson-question-prompt.ts src/domains/agents/prompts/__tests__/lesson-question-prompt.test.ts
git commit -m "refactor(avaliacoes): núcleo generateQuestionsFromChunks; prompt da pergunta de aula

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Prompt e parser do cartão

**Files:**
- Create: `src/domains/agents/prompts/tutor-card-prompt.ts`
- Test: `src/domains/agents/prompts/__tests__/tutor-card-prompt.test.ts`

**Interfaces:**
- Consumes: `stripUnsupportedReferences` (`citation-guard.ts`), `toPlainText` (`plain-text.ts`), `isSyntheticChapter`, `TutorCardPayload` (Task 3), `parseClassEvent`.
- Produces:
```ts
export type CardSource = DidacticChunk & { label: string };
export function chunkLabel(chunk: DidacticChunk, chapterLabels: Map<string, string>): string;
export function buildTutorCardMessages(input: { activity: string; description: string; dailyObjective: string; sources: CardSource[] }): AIMessage[];
export function parseTutorCard(raw: string, sources: CardSource[]): Omit<TutorCardPayload, 'source'> | null;
```
`chunkLabel`: `chapterLabels.get(chunk.chapterId)` (rótulo de `formatChapterLabel`) ou `` `${chunk.chapter} — ${chunk.bookTitle}` ``, cortado em 200. Prompt: sistema pede só JSON `{"concepts":[{"title":"...","explanation":"...","chunkId":"..."}],"objectiveLink":"..."}`, 2 ou 3 conceitos, cada um explicado só com o trecho cujo `id` informa, `explanation` até 400 caracteres em texto corrido, `objectiveLink` = uma frase ligando o passo ao objetivo do dia, sem markdown e sem citar páginas; o usuário lista cada trecho como `id: <chunk.id>\n<label>\n<content>`.
`parseTutorCard`: primeiro objeto JSON do texto; por conceito, `chunkId` fora de `sources` → descartado; `explanation` = `toPlainText(stripUnsupportedReferences(e, sources).text).trim().slice(0, 400)`, `title` = `toPlainText(t).trim().slice(0, 80)`; vazio → descartado; `citation = { chunkId, label: source.label, page: isSyntheticChapter(source.chapter) || source.pageNumber < 1 ? null : source.pageNumber }`; no máximo 3; menos de 2 ou `objectiveLink` vazio (após `toPlainText`, cortado em 300) → `null`.

- [ ] **Step 1: Teste falhando**
```ts
const src = (id: string, extra = {}): CardSource => ({ id, materialId: 'm', bookTitle: 'Sistemas de Banco de Dados', author: 'N', chapter: 'Capítulo 4: Álgebra Relacional e SQL', pageNumber: 58, content: 'x', label: 'Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados', ...extra });
const json = (concepts: object[], objectiveLink = 'Liga o passo ao objetivo.') => JSON.stringify({ concepts, objectiveLink });
it('cartão válido passa no schema do evento com citação vinda do trecho', () => {
  const card = parseTutorCard(json([{ title: 'INNER JOIN', explanation: 'Descarta tuplas sem par.', chunkId: 'c1' }, { title: 'LEFT JOIN', explanation: 'Preserva a esquerda.', chunkId: 'c2' }]), [src('c1'), src('c2', { pageNumber: 59 })]);
  expect(card?.concepts.map((c) => c.citation)).toEqual([{ chunkId: 'c1', label: src('c1').label, page: 58 }, { chunkId: 'c2', label: src('c2').label, page: 59 }]);
  expect(parseClassEvent('TUTOR_CARD', { ...card, source: 'GENERATED' }, 0).ok).toBe(true);
});
it('chunkId inventado é descartado; sobrando 1 conceito, null', () => {
  expect(parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'zzz' }]), [src('c1')])).toBeNull();
});
it('markdown e referência inventada saem da explicação', () => {
  const card = parseTutorCard(json([{ title: '**JOIN**', explanation: 'Veja o **Cap. 9, p. 300**: junção.', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'c1' }]), [src('c1')]);
  expect(card!.concepts[0].title).toBe('JOIN');
  expect(card!.concepts[0].explanation).not.toMatch(/\*\*|Cap\. 9|p\. 300/);
});
it('quatro conceitos viram três; texto sem JSON dá null; trecho sintético sem página', () => {
  const four = [1, 2, 3, 4].map((n) => ({ title: `T${n}`, explanation: 'e', chunkId: 'c1' }));
  expect(parseTutorCard(json(four), [src('c1')])!.concepts).toHaveLength(3);
  expect(parseTutorCard('não sei', [src('c1')])).toBeNull();
  const syn = src('s1', { chapter: 'Trecho 3' });
  expect(parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 's1' }, { title: 'B', explanation: 'b', chunkId: 's1' }]), [syn])!.concepts[0].citation.page).toBeNull();
});
it('chunkLabel usa o rótulo do capítulo quando houver', () => {
  expect(chunkLabel({ ...src('c1'), chapterId: 'ch1' }, new Map([['ch1', 'Cap. 4: Álgebra — SBD (N), p. 50 a 70']]))).toBe('Cap. 4: Álgebra — SBD (N), p. 50 a 70');
  expect(chunkLabel(src('c1'), new Map())).toBe('Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados');
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/agents/prompts/__tests__/tutor-card-prompt.test.ts` → FAIL.
- [ ] **Step 3: Implementar** o módulo.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/agents/prompts/tutor-card-prompt.ts src/domains/agents/prompts/__tests__/tutor-card-prompt.test.ts
git commit -m "feat(tutora): prompt e parser do cartão com citação vinda do trecho recuperado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Geração do conteúdo do passo com reserva e teto

**Files:**
- Create: `src/domains/classroom/tutor-step-hash.ts` (só `node:crypto`; importado também pelo Playwright)
- Create: `src/domains/classroom/tutor-step-content.ts`
- Modify: `src/domains/rag/services/chapter-repository.ts` (nova `findChapterLabels`)
- Test: `src/domains/classroom/__tests__/tutor-step-content.test.ts`, `src/domains/classroom/__tests__/tutor-step-hash.test.ts`

**Interfaces:**
- Consumes: Task 1 (repositório de rascunhos), Task 3 (`failureReason`, tipos), Task 4 (`generateQuestionsFromChunks`, `buildLessonQuestionMessages`), Task 5, `loadTutorScope` (`chat-service.ts`), `executeHybridSearch`, `createLoggedStreamChat(deps?, 'CLASSROOM', { agendaId, purpose })`, `collectStream`.
- Produces:
```ts
// tutor-step-hash.ts
export function stepHash(item: TimeScriptItem, chapterIds: string[]): string;
// sha256 hex de JSON.stringify([item.activity, item.description, item.socraticQuestion ?? '', [...chapterIds].sort()])
// chapter-repository.ts
export function findChapterLabels(chapterIds: string[]): Promise<Map<string, string>>; // formatChapterLabel com chapterNumbersFor
// tutor-step-content.ts
export const TUTOR_TOP_K = 3;
export const TUTOR_MIN_SIMILARITY = 0.55;
export const TUTOR_CARD_TEMPERATURE = 0.3;
export const TUTOR_CARD_MAX_TOKENS = 900;
export type MultipleChoicePayload = Extract<TutorQuestionPayload, { kind: 'MULTIPLE_CHOICE' }>;
export type StepContentInput = { agendaId: string; lessonPlanId: string; stepIndex: number; item: TimeScriptItem; dailyObjective: string; chapterIds: string[]; wantQuestion: boolean };
export type StepContent =
  | { status: 'BUSY' }
  | { status: 'DONE'; noMaterial: boolean;
      card: { payload: TutorCardPayload; fromDraft: boolean } | null;
      question: { payload: MultipleChoicePayload; fromDraft: boolean } | null;
      failure: { reason: 'RATE_LIMIT' | 'BUDGET' | 'PROVIDER_ERROR'; kind: 'CARD' | 'QUESTION' | 'BOTH' } | null };
export type StepContentDeps = {
  drafts: { ensureDraft: typeof ensureDraft; claimDraft: typeof claimDraft; spendCall: typeof spendCall; saveDraftContent: typeof saveDraftContent; releaseDraft: typeof releaseDraft };
  loadScope(lessonPlanId: string): Promise<TutorScope | undefined>;
  search(q: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>;
  chapterLabels(chapterIds: string[]): Promise<Map<string, string>>;
  streamChat(meta: InferenceMeta): StreamChatFn;
};
export function produceStepContent(input: StepContentInput, deps?: StepContentDeps): Promise<StepContent>;
```
Algoritmo (fixo):
1. `draft = ensureDraft(lessonPlanId, stepIndex, stepHash(item, chapterIds))`; peças do rascunho só contam se `parseClassEvent` as aceitar.
2. Falta nada (cartão presente e, se `wantQuestion`, pergunta presente) → `DONE` com `fromDraft: true`, sem busca nem reserva.
3. Busca: `query = item.description.trim() || item.activity`; escopo de `loadScope` (`allowedChapterIds`/`allowedMaterialIds`); `topK: 3`; ficam os trechos com `bm25Score != null` ou `similarityScore >= 0.55`. Nenhum → `DONE { noMaterial: true, card: null, question: null, failure: null }`.
4. `draft.calls >= 2` → `DONE` com as peças do rascunho e `failure: { reason: 'BUDGET', kind }` sem chamar o modelo. `claimDraft` falso → `BUSY`.
5. Cartão: enquanto faltar e `spendCall` der `true`: `collectStream(streamChat({ agendaId, purpose: 'TUTOR_CARD' }), buildTutorCardMessages(...), { temperature: 0.3, maxTokens: 900 })` → `fallbackReason 'rate_limit'` = `rate_limit`; outro fallback ou exceção = `provider_error`; `parseTutorCard` nulo = `invalid`; ok → `saveDraftContent({ card: { ...card, source: 'GENERATED' } })`.
6. Pergunta (se `wantQuestion` e faltar): um `spendCall`; `generateQuestionsFromChunks(trechos, 1, (c) => buildLessonQuestionMessages(...), { streamChat: streamChat({ agendaId, purpose: 'TUTOR_QUESTION' }) })`; ok → payload `{ kind: 'MULTIPLE_CHOICE', question: { ...q, id: \`step-${stepIndex}\` }, origin: 'TUTOR', source: 'GENERATED' }` salvo no rascunho.
7. `releaseDraft` no `finally`. `failure`: cartão faltando → `failureReason(resultados do cartão)` com `kind` `BOTH` se a pergunta também faltar (e era querida), senão `CARD`; só a pergunta faltando → `failureReason(resultados da pergunta)` com `QUESTION`.
`defaultDeps`: repositório da Task 1, `loadTutorScope`, `executeHybridSearch`, `findChapterLabels`, `(meta) => createLoggedStreamChat(undefined, 'CLASSROOM', meta)`.

- [ ] **Step 1: Testes falhando** (`makeDeps()` com rascunho em memória que conta `spendCall`; `streamChat` roteirizado por chamada)
  - hash: muda com `activity`, `description`, `socraticQuestion` e capítulos; não muda com a ordem dos capítulos nem com `timeSeconds`.
  - rascunho completo com o mesmo hash → `DONE`, `fromDraft: true`, `search` e `streamChat` não chamados.
  - trecho só vetorial com `similarityScore: 0.3` → `noMaterial: true`, zero chamadas.
  - cartão ok na 1ª e pergunta ok → 2 `spendCall`, `InferenceMeta` `{ agendaId, purpose: 'TUTOR_CARD' }` e depois `'TUTOR_QUESTION'`, `failure: null`.
  - cartão inválido na 1ª e ok na 2ª, `wantQuestion` → pergunta não tentada, `failure: { reason: 'BUDGET', kind: 'QUESTION' }`.
  - dois `rate_limit` no cartão, `wantQuestion` → `failure: { reason: 'RATE_LIMIT', kind: 'BOTH' }`.
  - **Review Focus:** calls esgotadas: BUDGET sem chamada — rascunho com `calls: 2` e sem cartão → `failure.reason === 'BUDGET'`, `streamChat` nunca chamado, `claimDraft` não chamado.
  - `claimDraft` falso com `calls: 0` → `BUSY`; `releaseDraft` sempre chamado quando a reserva vingou, inclusive se `streamChat` lança.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/tutor-step-content.test.ts src/domains/classroom/__tests__/tutor-step-hash.test.ts` → FAIL.
- [ ] **Step 3: Implementar** os três arquivos.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/tutor-step-hash.ts src/domains/classroom/tutor-step-content.ts src/domains/rag/services/chapter-repository.ts src/domains/classroom/__tests__/tutor-step-content.test.ts src/domains/classroom/__tests__/tutor-step-hash.test.ts
git commit -m "feat(tutora): geração do passo com reserva, teto de 2 chamadas e rascunho reaproveitado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Worker da tutora

**Files:**
- Create: `src/domains/classroom/tutor-step-worker.ts`
- Modify: `src/domains/classroom/class-event-service.ts` (exportar `toClassEventDTO`, hoje `toDTO` privado)
- Test: `src/domains/classroom/__tests__/tutor-step-worker.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 6; `findAgendaById`, `findLessonPlayerData`, `findLessonTutorScope` (ids dos capítulos), `timeScriptSchema`, `findEventsAfter` + `TUTOR_EVENTS_SCAN`.
- Produces:
```ts
export type TutorStepContext = { agendaId: string; lessonPlanId: string; agendaSeconds: number; script: TimeScriptItem[]; dailyObjective: string; chapterIds: string[] };
export type TutorWorkerDeps = {
  loadContext(agendaId: string): Promise<TutorStepContext | null>;
  readEvents(agendaId: string): Promise<ClassEventDTO[]>; // audiences ['ALL','TEACHER'], payload validado
  produce(input: StepContentInput): Promise<StepContent>;
  appendTutorEvents: typeof appendTutorEvents;
};
export type TutorRunResult = 'NO_STEP' | 'ENDED' | 'SILENT' | 'ALREADY_DONE' | 'BUSY' | 'PUBLISHED';
export function runTutorForStep(agendaId: string, stepIndex: number, deps?: TutorWorkerDeps): Promise<TutorRunResult>;
export function runTutorForStepSafely(agendaId: string, stepIndex: number): Promise<void>; // captura e loga '[tutora] falha no worker'
export function toClassEventDTO(row: ClassEventRow): ClassEventDTO; // class-event-service.ts
```
Fluxo: contexto nulo ou passo fora do roteiro → `NO_STEP`; fase `ENDED` → `ENDED`; `plan = decideTutorPlan({ item, durationSeconds: stepDurationSeconds(...) }, { muted: isTutorMuted(events, i) })`; `SILENT` → `SILENT`; passo com `card` ou `skipped` → `ALREADY_DONE`; plano com pergunta do professor e sem `TUTOR_QUESTION` → `appendTutorEvents(i, [{ TUTOR_QUESTION, { kind: 'OPEN', text, origin: 'TEACHER' }, 'ALL' }])` antes de `produce`; `produce({ ..., wantQuestion: plan.question?.from === 'MODEL' })`; `BUSY` → `BUSY`; senão um único `appendTutorEvents` com, nesta ordem: cartão (`source: fromDraft ? 'DRAFT' : 'GENERATED'`, `ALL`), pergunta gerada (idem, `ALL`), `TUTOR_SKIPPED` (`TEACHER`) = `noMaterialSkip(plan)` se `noMaterial`, senão `failure` se houver → `PUBLISHED`.

- [ ] **Step 1: Teste falhando** (`makeDeps({ events, content })`, `appendTutorEvents` falso com deduplicação por tipo e passo)
  - mudo para a aula → `SILENT`, `produce` e `appendTutorEvents` não chamados;
  - passo com `socraticQuestion` → primeiro append só com o `OPEN` do professor, `produce` com `wantQuestion: false`;
  - `noMaterial` com plano `MODEL` → skip `{ reason: 'NO_MATERIAL', kind: 'BOTH' }` com audience `TEACHER` e nenhum cartão;
  - rascunho → cartão com `source: 'DRAFT'`;
  - cartão + `failure { PROVIDER_ERROR, QUESTION }` → um append com `[TUTOR_CARD, TUTOR_SKIPPED]`;
  - **Review Focus:** segunda execução não publica de novo — rodar duas vezes o mesmo passo: a segunda devolve `ALREADY_DONE` e o total de cartões é 1;
  - `SESSION_ENDED` nos eventos → `ENDED`; passo 7 num roteiro de 3 → `NO_STEP`; `BUSY` repassado;
  - `runTutorForStepSafely` com `loadContext` que lança → resolve e chama `console.error`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/tutor-step-worker.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — `defaultDeps.loadContext`: agenda (`agendaSeconds = (endTime − startTime) / 1000`), plano (roteiro via `timeScriptSchema.safeParse`, vazio se inválido), ids de `findLessonTutorScope(...).chapters`; agenda sem plano → `null`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/domains/classroom` + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/tutor-step-worker.ts src/domains/classroom/class-event-service.ts src/domains/classroom/__tests__/tutor-step-worker.test.ts
git commit -m "feat(tutora): worker por passo sem estado, com política e publicação idempotente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Disparo nas rotas de eventos e aviso de atas

**Files:**
- Modify: `src/domains/classroom/class-event-service.ts` (`appendTeacherEvent`, `ClassEventDeps.completeAgenda`, nova `stalledTutorStepFor`)
- Modify: `src/app/api/v1/agendas/[id]/events/route.ts`, `src/app/api/v1/agendas/[id]/events/stream/route.ts`
- Test: `src/domains/classroom/__tests__/class-event-service.test.ts`, `src/app/api/v1/agendas/[id]/events/__tests__/route.test.ts`, `src/app/api/v1/agendas/[id]/events/stream/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `tutorRunTarget`, `stalledTutorStep` (Task 3), `runTutorForStepSafely` (Task 7), `after` de `next/server`.
- Produces:
```ts
export const CLASS_END_MINUTES_WARNING = 'Aula encerrada, mas não foi possível gerar as atas dos alunos. O erro foi registrado no servidor.';
export const CLASS_END_AGENDA_WARNING = 'Aula encerrada, mas a agenda não foi marcada como concluída. Conclua pelo relatório da turma.';
// ClassEventDeps.completeAgenda(agendaId, user): Promise<{ minutesGenerated: boolean }>
export function appendTeacherEvent(user, agendaId, input, deps?): Promise<{ events: ClassEventDTO[]; warning: string | null }>;
export function stalledTutorStepFor(user: AgendaActor, agendaId: string, now: number, deps?: ClassEventDeps): Promise<number | null>;
```
`POST /events` → 201 `{ success: true, events, warning }` e, se `tutorRunTarget(events) !== null`, `after(() => runTutorForStepSafely(id, alvo))`. `GET /events` e a abertura do stream: depois da checagem de escopo, `stalledTutorStepFor(user, id, Date.now())` (lê `['ALL','TEACHER']` mais o id do aluno, com `TUTOR_EVENTS_SCAN`) e, se não nulo, o mesmo `after`; qualquer falha nessa checagem só loga e a resposta segue.

- [ ] **Step 1: Testes falhando**
  - serviço: `completeAgenda` lançando → `warning === CLASS_END_AGENDA_WARNING` e evento gravado; devolvendo `{ minutesGenerated: false }` → `CLASS_END_MINUTES_WARNING`; demais tipos → `warning: null`; testes existentes adaptados a `{ events }`.
  - `stalledTutorStepFor`: chama `findEventsAfter(id, 0, ['ALL','TEACHER','s1'], 1000)` para aluno e `['ALL','TEACHER']` para professor; devolve o passo parado.
  - rota POST (`vi.mock('next/server', async (o) => ({ ...(await o()), after: vi.fn() }))`): `SESSION_STARTED` que grava `STEP_CHANGED 0` → `after` chamado uma vez e, ao executar o callback, `runTutorForStepSafely('a1', 0)`; `TEACHER_NOTE MUTE` → `after` não chamado; corpo traz `warning`.
  - rota GET e stream: com `stalledTutorStepFor` → 2, `after` chamado; com ele lançando, GET responde 200 e o stream abre normalmente.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-service.test.ts "src/app/api/v1/agendas/[id]/events"` → FAIL.
- [ ] **Step 3: Implementar** — `defaultDeps.completeAgenda`: `setAgendaStatus` (pode lançar) e `generateMinutesForAgenda` em `try/catch` → `{ minutesGenerated: false }` com log.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-service.ts src/domains/classroom/__tests__/class-event-service.test.ts "src/app/api/v1/agendas/[id]/events"
git commit -m "feat(tutora): worker disparado por after() e sob demanda; aviso quando as atas falham

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Resposta do aluno e pulso da turma

**Files:**
- Modify: `src/domains/pedagogy/services/interaction-repository.ts` (novas funções; `findLastInteraction` e `listRecentInteractions` com `classEventSeq: null`)
- Modify: `src/domains/classroom/class-event-schema.ts` (tipos `AnswerResult` e `PulseEntry`, importáveis no cliente)
- Create: `src/domains/classroom/class-answer-service.ts`
- Create: `src/app/api/v1/agendas/[id]/events/[seq]/answer/route.ts`, `src/app/api/v1/agendas/[id]/pulse/route.ts`
- Test: `src/domains/classroom/__tests__/class-answer-service.test.ts`, `src/domains/pedagogy/services/__tests__/interaction-repository.test.ts` (novo, mock de `db`), `src/app/api/v1/agendas/[id]/events/[seq]/answer/__tests__/route.test.ts`, `src/app/api/v1/agendas/[id]/pulse/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getAgendaForUser`, `audiencesFor`, `findEventBySeq`, `findEventsAfter` (Task 2), `parseClassEvent`, `OPTION_KEYS`.
- Produces:
```ts
// interaction-repository.ts
export function insertClassAnswer(data: InteractionInput & { classEventSeq: number }): Promise<'CREATED' | 'DUPLICATE'>; // P2002 → 'DUPLICATE'
export function countClassAnswers(agendaId: string, seqs: number[]): Promise<{ seq: number; answered: number; correct: number }[]>;
// SELECT "classEventSeq" AS seq, COUNT(*)::int AS answered, COUNT(*) FILTER (WHERE "wasCorrect")::int AS correct
//   FROM student_interactions WHERE "agendaId" = $1 AND "classEventSeq" = ANY($2) GROUP BY 1
// class-event-schema.ts (só tipos)
export type AnswerResult = { wasCorrect: boolean | null; correctKey: string | null; rationale: string | null };
export type PulseEntry = { seq: number; stepIndex: number; kind: 'MULTIPLE_CHOICE' | 'OPEN'; answered: number; correct: number | null };
// class-answer-service.ts
export type AnswerInput = { optionKey?: string; text?: string; videoSeconds?: number };
export function answerTutorQuestion(user: AgendaActor, agendaId: string, seq: number, input: AnswerInput, deps?): Promise<AnswerResult>;
export function getClassPulse(user: AgendaActor, agendaId: string, deps?): Promise<PulseEntry[]>;
```
Regras de `answerTutorQuestion`: não aluno → 403 "Apenas alunos respondem às perguntas da tutora."; escopo pela agenda (404); evento `seq` visível ao aluno e do tipo `TUTOR_QUESTION` com payload válido, senão 404 "Pergunta não encontrada."; múltipla escolha sem `optionKey` em `OPTION_KEYS` → 400 "Escolha uma das alternativas." (`INVALID_ANSWER`); aberta sem `text` com 1..1000 após trim → 400 "Escreva uma resposta de até 1000 caracteres." (`INVALID_ANSWER`); grava `type: SOCRATIC_CHALLENGE`, `isSocraticChallenge: true`, `questionText` = `enunciation` ou `text` do evento, `responseText` = `` `${key}) ${option.text}` `` ou o texto, `wasCorrect` = `optionKey === correctKey` ou `null`, `timestampInVideo` = `videoSeconds ?? null`, `agendaType` da agenda, `classEventSeq: seq`; `DUPLICATE` → 409 "Você já respondeu esta pergunta." (`ALREADY_ANSWERED`). Devolve `{ wasCorrect, correctKey, rationale }` (nulos na aberta).
`getClassPulse`: só TEACHER/ADMIN (403 "Apenas o professor vê o pulso da turma."), escopo; um item por `TUTOR_QUESTION` com audience `ALL`, em ordem de `seq`; `correct: null` na aberta; sem respostas → `answered: 0`.
Rotas: `POST .../events/[seq]/answer` com `requireUser(req)`, `seq` não inteiro positivo → 404 "Pergunta não encontrada.", corpo `z.object({ optionKey: z.string().optional(), text: z.string().optional(), videoSeconds: z.number().int().min(0).optional() })` → `{ success: true, result }`; `GET .../pulse` com `requireUser(req, [Role.TEACHER, Role.ADMIN])` → `{ success: true, pulse }`; ambas `dynamic = 'force-dynamic'`.

- [ ] **Step 1: Testes falhando**
  - serviço: acerto e erro em múltipla escolha (valores gravados exatamente como acima); aberta grava `wasCorrect: null` e devolve nulos; professor → 403; evento `TUTOR_CARD` ou de outro aluno → 404; `optionKey: 'E'` → 400; texto de 1001 → 400; `DUPLICATE` → 409 com `details.code === 'ALREADY_ANSWERED'`;
  - pulso: duas perguntas, contagens `[{ seq: 4, answered: 3, correct: 2 }]` → `[{ seq: 4, kind: 'MULTIPLE_CHOICE', answered: 3, correct: 2 }, { seq: 9, kind: 'OPEN', answered: 0, correct: null }]`; aluno → 403;
  - **Review Focus:** consultas do chat ignoram respostas a eventos — `findLastInteraction` e `listRecentInteractions` chamam o Prisma com `where` contendo `classEventSeq: null`; `insertClassAnswer` com P2002 → `'DUPLICATE'`;
  - rotas: `seq=abc` → 404; corpo repassado; 409 com `details.code`; pulso exige papel de professor.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-answer-service.test.ts src/domains/pedagogy/services/__tests__/interaction-repository.test.ts "src/app/api/v1/agendas/[id]/events/[seq]" "src/app/api/v1/agendas/[id]/pulse"` → FAIL.
- [ ] **Step 3: Implementar** os módulos e rotas.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/domains/agents src/domains/pedagogy` + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/pedagogy/services/interaction-repository.ts src/domains/pedagogy/services/__tests__/interaction-repository.test.ts src/domains/classroom/class-event-schema.ts src/domains/classroom/class-answer-service.ts src/domains/classroom/__tests__/class-answer-service.test.ts "src/app/api/v1/agendas/[id]/events/[seq]" "src/app/api/v1/agendas/[id]/pulse"
git commit -m "feat(tutora): resposta única do aluno às perguntas e pulso sem nomes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Faixa do aluno com cartão, pergunta e "Continuar no chat"

**Files:**
- Modify: `src/domains/classroom/class-state.ts` (`reduceStudentView`)
- Create: `src/components/classroom/use-tutor-answers.ts`
- Modify: `src/components/classroom/now-in-class-strip.tsx`
- Modify: `src/components/ai/chat-composer.tsx`, `src/components/ai/universal-socratic-chat.tsx`, `src/components/classroom/socratic-chat-panel.tsx` (prop `draft`)
- Modify: `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx`
- Test: `src/domains/classroom/__tests__/class-state.test.ts`, `src/components/classroom/__tests__/use-tutor-answers.test.ts`, `src/components/classroom/__tests__/now-in-class-strip.test.tsx`, `src/components/ai/__tests__/chat-composer.test.tsx`, `src/app/(student)/classroom/[sessionId]/_components/__tests__/ClassroomPage.test.tsx`

**Interfaces:**
- Consumes: `TutorCardPayload` (Task 3), `AnswerResult` (Task 9, de `class-event-schema.ts`), `useClassEvents → { events, state, status }`.
- Produces:
```ts
// class-state.ts
export type AnswerOutcome = AnswerResult | { alreadyAnswered: true };
export type StudentQuestion =
  | { seq: number; kind: 'MULTIPLE_CHOICE'; enunciation: string; options: { key: string; text: string }[] }
  | { seq: number; kind: 'OPEN'; text: string };
export type StudentView = { stepIndex: number | null; activity: string | null; card: TutorCardPayload | null; question: StudentQuestion | null; answer: AnswerOutcome | null };
export function reduceStudentView(events: ClassEventDTO[], answers: Record<number, AnswerOutcome>): StudentView;
// use-tutor-answers.ts
export const ANSWER_ERROR = 'Não foi possível enviar sua resposta. Tente novamente.';
export function useTutorAnswers(agendaId: string): { answers: Record<number, AnswerOutcome>; submit(seq: number, input: { optionKey?: string; text?: string }): Promise<void>; pendingSeq: number | null; error: string | null };
// now-in-class-strip.tsx
export function continueInChatText(q: StudentQuestion, a: AnswerOutcome): string;
export function NowInClassStrip(props: { view: StudentView; status: ClassEventsStatus; onAnswer(seq: number, input: { optionKey?: string; text?: string }): void; answerPending: boolean; answerError: string | null; onContinueInChat(text: string): void }): JSX.Element | null;
// chat: draft?: { text: string; nonce: number } em ChatComposer, UniversalSocraticChat e SocraticChatPanel
```
`reduceStudentView`: `stepIndex` = passo atual se `phase !== 'ENDED'`, senão `null`; `card`/`question` do passo atual (`tutorContentForStep`); `answer = answers[question.seq] ?? null`. `useTutorAnswers`: `POST /api/v1/agendas/:id/events/:seq/answer`; 2xx → `answers[seq] = body.result`; 409 com `details.code === 'ALREADY_ANSWERED'` → `{ alreadyAnswered: true }`; outro erro → `body.error` string ou `ANSWER_ERROR`; ref impede envio duplo.
Copy da faixa (exata): título "Agora na aula"; cartão com cabeçalho "Da tutora", cada conceito com `title`, `explanation` e "Fonte: {label}" mais " · pág. {page}" quando `page` não é nulo; `objectiveLink` em parágrafo. Pergunta: cabeçalho "Pergunta rápida (opcional)"; múltipla escolha como `radiogroup` com rótulos `"{key}) {text}"`; aberta com `<textarea aria-label="Sua resposta">`; botão "Responder" (em voo "Enviando...", desabilitado sem escolha/texto). Feedback: acerto "Você acertou."; erro "Resposta certa: {correctKey}."; `rationale` em seguida; aberta "Resposta registrada."; `alreadyAnswered` "Você já respondeu esta pergunta."; erro em `role="alert"`. Depois de qualquer feedback, botão "Continuar no chat". `continueInChatText`: múltipla escolha com `rationale` → `Sobre a pergunta "{enunciation}": a justificativa foi "{rationale}". Pode me explicar melhor?`; múltipla escolha sem `rationale` → `Sobre a pergunta "{enunciation}": pode me ajudar a revisar?`; aberta → `Sobre a pergunta "{text}": pode me ajudar a pensar na resposta?`.
`ChatComposer`: a cada `draft.nonce` novo, `setInput(draft.text)` e foco no campo; não envia sozinho.
Página: `const { events, state, lastSeq, status: eventsStatus } = useClassEvents(sessionId)`; `view = useMemo(() => reduceStudentView(events, answers))`; `onContinueInChat` grava `{ text, nonce: Date.now() }` no estado repassado ao `SocraticChatPanel`.

- [ ] **Step 1: Testes falhando**
  - `reduceStudentView`: passo 1 com cartão e pergunta → `question.kind`, `answer` do mapa; `ENDED` → `stepIndex: null`; pergunta de múltipla escolha projetada (sem `correctKey`) vira `options`.
  - hook: corpo e URL `/api/v1/agendas/a1/events/4/answer`; 409 `ALREADY_ANSWERED` → `{ alreadyAnswered: true }`; dois `submit` no mesmo `act` → `fetch` 1x.
  - faixa: cartão com "Fonte: ..." e " · pág. 58"; escolher "B) ..." e "Responder" chama `onAnswer(4, { optionKey: 'B' })`; feedback de erro com "Resposta certa: C." e a justificativa; "Continuar no chat" chama `onContinueInChat` com o texto exato; aberta envia `{ text }`; `alreadyAnswered` mostra a frase.
  - `ChatComposer`: `draft` novo preenche o campo (`(textbox as HTMLTextAreaElement).value`) e não chama `onSend`.
  - página: `useClassEvents` mockado com cartão no passo atual → faixa mostra o título do conceito; o teste existente "fase ENDED esconde a faixa" continua verde.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-state.test.ts src/components/classroom src/components/ai/__tests__/chat-composer.test.tsx "src/app/(student)/classroom"` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` + `grep -n "setInterval" "src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx" src/components/classroom/now-in-class-strip.tsx src/components/classroom/use-tutor-answers.ts` (sem saída) → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-state.ts src/domains/classroom/__tests__/class-state.test.ts src/components/classroom src/components/ai/chat-composer.tsx src/components/ai/universal-socratic-chat.tsx src/components/ai/__tests__/chat-composer.test.tsx "src/app/(student)/classroom/[sessionId]/_components"
git commit -m "feat(sala): cartão e pergunta da tutora na faixa, resposta e Continuar no chat

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Coluna da tutora e pulso no painel do professor

**Files:**
- Modify: `src/domains/classroom/class-state.ts` (`reduceTeacherView`)
- Create: `src/components/classroom/use-class-pulse.ts`
- Modify: `src/components/classroom/use-live-class-actions.ts` (comando `TEACHER_NOTE`, `warning`)
- Create: `src/app/teacher/live/[agendaId]/_components/TutorPanel.tsx`
- Modify: `src/app/teacher/live/[agendaId]/_components/LiveClassPage.tsx` (coluna `lg:col-span-5`, aviso)
- Test: `src/domains/classroom/__tests__/class-state.test.ts`, `src/components/classroom/__tests__/use-class-pulse.test.ts`, `src/components/classroom/__tests__/use-live-class-actions.test.ts`, `src/app/teacher/live/[agendaId]/_components/__tests__/TutorPanel.test.tsx`, `.../__tests__/LiveClassPage.test.tsx`

**Interfaces:**
- Consumes: `PulseEntry` (Task 9, de `class-event-schema.ts`), `tutorSkipMessage` (Task 3), `TutorQuestionPayload`.
- Produces:
```ts
export type TeacherTutorView = {
  stepIndex: number | null; status: 'IDLE' | 'MUTED' | 'GENERATING' | 'READY';
  card: TutorCardPayload | null; question: TutorQuestionPayload | null; questionSeq: number | null; skipped: TutorSkippedPayload | null;
  canPublishNow: boolean; nextStepIndex: number | null; nextStepMuted: boolean; lessonMuted: boolean; pulse: PulseEntry | null;
};
export function reduceTeacherView(events: ClassEventDTO[], pulse: PulseEntry[], stepCount: number): TeacherTutorView;
export const PULSE_REFRESH_MS = 10_000;
export function useClassPulse(agendaId: string, reloadKey: number, openQuestion: boolean): { pulse: PulseEntry[] };
export type TutorNoteCommand = { type: 'TEACHER_NOTE'; stepIndex?: number; payload: { tutor: 'MUTE' | 'UNMUTE' | 'PUBLISH_NOW'; scope: 'STEP' | 'LESSON' } };
// TeacherClassCommand passa a incluir TutorNoteCommand; useLiveClassActions devolve também warning: string | null (body.warning)
export function pulseText(p: PulseEntry): string;
export function TutorPanel(props: { view: TeacherTutorView; nextActivity: string | null; disabled: boolean; onNote(cmd: TutorNoteCommand): void }): JSX.Element;
```
`reduceTeacherView`: `status` = `IDLE` se fase ≠ `RUNNING` ou sem passo; `MUTED` se `isTutorMuted`; `READY` com cartão ou skip; senão `GENERATING`. `canPublishNow` = `RUNNING`, passo atual e nenhum `card`/`question`/`skipped`. `nextStepIndex` = atual + 1 se `< stepCount`. `pulse` = item com `seq === questionSeq`.
`useClassPulse`: `GET /api/v1/agendas/:id/pulse` na montagem e a cada `reloadKey`; com `openQuestion`, um `setTimeout(PULSE_REFRESH_MS)` re-armado depois de cada leitura; limpo ao desmontar ou quando `openQuestion` vira `false`; erro de rede mantém o último pulso. No painel: `reloadKey = lastSeq`, `openQuestion = view.questionSeq !== null`.
`pulseText`: `answered === 0` → "Ninguém respondeu ainda."; múltipla escolha → `"{n} resposta(s) · {round(correct/n*100)}% de acerto"` com "1 resposta" / "{n} respostas"; aberta → `"{n} resposta(s) (pergunta aberta, sem correção automática)"`.
`TutorPanel` (copy exata): `<section aria-label="Tutora">` com título "Tutora"; `IDLE` "A tutora começa quando a aula for iniciada."; `MUTED` "Tutora em silêncio neste passo."; `GENERATING` "Gerando o conteúdo da tutora…"; cartão: "Cartão publicado" e os `title` em lista; pergunta de múltipla escolha: "Pergunta publicada", o enunciado e "Resposta certa: {correctKey}"; aberta: "Pergunta do professor publicada" e o texto; skip: `tutorSkipMessage`; pulso: subtítulo "Pulso da turma" e `pulseText`. Botão "Publicar agora" só com `canPublishNow` → `{ type: 'TEACHER_NOTE', stepIndex, payload: { tutor: 'PUBLISH_NOW', scope: 'STEP' } }`. Próximo passo (quando `nextStepIndex !== null` e não `lessonMuted`): "Próximo passo: {nextActivity}" e botão "Pular" → `MUTE`/`STEP` com `stepIndex: nextStepIndex`; com `nextStepMuted`, no lugar do botão: "A tutora ficará em silêncio no próximo passo." Interruptor `<input type="checkbox" role="switch">` com rótulo "Tutora em silêncio nesta aula", `checked = lessonMuted`, alterna `MUTE`/`UNMUTE` com `scope: 'LESSON'` e sem `stepIndex`. Tudo `disabled` com `disabled`.
`LiveClassPage`: coluna `<aside className="lg:col-span-5">` com `TutorPanel` (`disabled = busy || state.phase !== 'RUNNING'`); `warning` do hook num `<p role="status">` (amber) abaixo de "Aula encerrada.".

- [ ] **Step 1: Testes falhando**
  - `reduceTeacherView`: `GENERATING` com só a pergunta do professor; `READY` com skip; `MUTED` com nota de passo; `canPublishNow` falso com pergunta publicada; `nextStepMuted` com `MUTE`/`STEP` no próximo; `pulse` casado por `questionSeq`.
  - `useClassPulse` (`vi.useFakeTimers()`, `vi.spyOn(globalThis, 'setInterval')`): `fetch` na montagem e ao trocar `reloadKey`; com `openQuestion` mais um `fetch` após 10 s e outro após mais 10 s; sem `openQuestion`, nenhum depois de 30 s; `setInterval` nunca chamado; desmontar limpa o timer pendente.
  - ações: `TEACHER_NOTE` enviado com o corpo exato; `warning` lido do 201.
  - `TutorPanel`: cada estado com a copy acima; "Publicar agora", "Pular" e o interruptor chamam `onNote` com os comandos exatos; `pulseText` para `{answered:3, correct:2}` → "3 respostas · 67% de acerto" e para aberta com 1 → "1 resposta (pergunta aberta, sem correção automática)".
  - `LiveClassPage`: coluna "Tutora" presente com a aula em andamento; com `warning` do hook mockado, o texto aparece em `role="status"` na fase `ENDED`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-state.test.ts src/components/classroom "src/app/teacher/live"` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` + `grep -rn "setInterval" "src/app/teacher/live" src/components/classroom/use-class-pulse.ts` (sem saída) → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-state.ts src/domains/classroom/__tests__/class-state.test.ts src/components/classroom "src/app/teacher/live"
git commit -m "feat(aula): coluna da tutora com pular, publicar agora, silêncio e pulso da turma

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Playwright sem provedor real e verificação final

**Files:**
- Modify: `tests/playwright/aula-ao-vivo.spec.ts`
- Modify: `README.md` e `README.pt-BR.md` (seção de eventos de aula: uma frase sobre a tutora proativa, o teto de 2 chamadas por passo e o que o Playwright cobre sem provedor)

**Interfaces:**
- Consumes: `stepHash` (`src/domains/classroom/tutor-step-hash.ts`, import relativo), `DEMO_LIVE_TIME_SCRIPT`, painel (Task 11), faixa (Task 10), pulso (Task 9).

- [ ] **Step 1: Escrever o teste**
  - O preparo do `beforeAll` vira `resetClass()` chamado em `test.beforeEach`: apaga `classEvent`, `tutorStepDraft` do plano e `studentInteraction` com `classEventSeq` não nulo da agenda; põe a agenda `LIVE` na janela atual. `afterAll` também apaga rascunhos e respostas antes de restaurar a agenda.
  - Teste novo `'tutora publica o rascunho e a pergunta do professor; aluno responde; pulso atualiza'`:
    - Prisma: `TEACHER_NOTE { tutor: 'MUTE', scope: 'STEP' }` (audience `TEACHER`, `createdBy: 'TEACHER'`, seq 1..) para todo passo ≠ 1, para o worker não chamar o provedor; `tutorStepDraft.upsert` do passo 1 com `stepHash(DEMO_LIVE_TIME_SCRIPT[1], <ids dos capítulos do plano>)`, `calls: 0` e o cartão fixo (2 conceitos; o primeiro com `title: 'INNER JOIN descarta quem não casa'`; `citation.label` 'Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados', `page: 58`; `source: 'GENERATED'`).
```ts
await teacher.getByRole('button', { name: 'Iniciar aula' }).click();
await teacher.getByRole('button', { name: 'Próximo' }).click();
await expect(strip).toContainText('INNER JOIN descarta quem não casa', { timeout: 10_000 });
await expect(strip).toContainText(DEMO_LIVE_TIME_SCRIPT[1].socraticQuestion!, { timeout: 10_000 });
await student.getByLabel('Sua resposta').fill('Ele não aparece no resultado.');
await student.getByRole('button', { name: 'Responder' }).click();
await expect(strip).toContainText('Resposta registrada.');
const panel = teacher.getByRole('region', { name: 'Tutora' });
await expect(panel).toContainText('Cartão publicado');
await expect(panel).toContainText('1 resposta (pergunta aberta, sem correção automática)', { timeout: 15_000 });
await teacher.getByRole('switch', { name: 'Tutora em silêncio nesta aula' }).click();
await expect(teacher.getByRole('switch', { name: 'Tutora em silêncio nesta aula' })).toBeChecked({ timeout: 5_000 });
expect(await tutorLogCount()).toBe(logsBefore); // aula preparada: nenhuma chamada ao modelo
```
    - `tutorLogCount = () => prisma.inferenceLog.count({ where: { agendaId, purpose: { in: ['TUTOR_CARD', 'TUTOR_QUESTION'] } } })`; `logsBefore` é lido no início do teste.
- [ ] **Step 2: Rodar** — `npm run test:e2e:ui` → 2 passed (o servidor de dev reiniciado depois do `prisma generate` da Task 1).
- [ ] **Step 3: Verificação final** — `npx vitest run` (suíte inteira), `npx tsc --noEmit`, `npm run lint`, `DATABASE_URL_TEST=<url> npx vitest run tests/e2e/class-events.test.ts tests/e2e/tutor-step-drafts.test.ts` → verdes; `grep -rn "setInterval" "src/app/(student)/classroom" "src/app/teacher/live" src/components/classroom --include=*.ts --include=*.tsx | grep -v interactive-video-player` → sem saída.
- [ ] **Step 4: Teste manual (aceite, com provedor real)** — aula demo: iniciar e avançar pelos 3 passos; em cada um sai cartão citado ou `TUTOR_SKIPPED` visível só no painel; `SELECT purpose, count(*) FROM inference_logs WHERE "agendaId" = '<id>' AND purpose IN ('TUTOR_CARD','TUTOR_QUESTION') GROUP BY 1` soma no máximo 2 × passos visitados; responder a pergunta de múltipla escolha como aluno e ver o pulso mudar; encerrar.
- [ ] **Step 5: Commit**
```bash
git add tests/playwright/aula-ao-vivo.spec.ts README.md README.pt-BR.md
git commit -m "test(tutora): Playwright com rascunho preparado, pergunta do professor e pulso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Critérios de aceite (spec §6, Entrega 3, parte ao vivo)

| Critério | Cumprido em |
|---|---|
| A cada passo sai cartão citado ou `TUTOR_SKIPPED` visível só ao professor | Tasks 3, 6, 7, 8, 11; Task 12 Step 4 |
| Nunca mais de 2 linhas de `InferenceLog` de tutora por passo | Task 1 (e2e do teto), Task 6; Task 12 Step 4 |
| Resposta do aluno vira `StudentInteraction` e aparece no pulso | Tasks 9, 10, 11, 12 |
| Aula preparada publica sem chamar o modelo | Task 6 (rascunho), Task 7 (`DRAFT`), Task 12 (contagem zero) |
| P2002 do índice parcial é sucesso (follow-up da Entrega 1) | Task 2 |
| Aviso quando as atas falham no `SESSION_ENDED` (follow-up da Entrega 2) | Tasks 8, 11 |
| Pré-geração no editor, aula gravada, seed com um passo de cada tipo, evals `proativo` ≥ 0,8 | Entrega 3b |
