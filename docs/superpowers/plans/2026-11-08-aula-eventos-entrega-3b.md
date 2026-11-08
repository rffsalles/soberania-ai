# Aula como eventos — Entrega 3b: tutora preparada, aula gravada e evals `proativo` — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O professor prepara a tutora no editor da aula antes de entrar na sala, o painel mostra o rascunho do próximo passo, a aula gravada avança pelo vídeo de cada aluno com a mesma tutora, e um conjunto de evals `proativo` mede o comportamento com o provedor real.

**Architecture:** Tudo sobre a Entrega 3a: a pré-geração reaproveita `produceStepContent` (mesma reserva e mesmo teto em `tutor_step_drafts`) numa rota por passo; a aula gravada grava `STEP_CHANGED` com `createdBy: SYSTEM` e audience = o aluno por uma rota `video-step` e dispara o mesmo worker; o seed ganha um roteiro com um passo de cada tipo, e o harness Python ganha login de professor e uma categoria opt-in.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Prisma 6, Zod, vitest + Testing Library (jsdom); Python 3.11 + httpx + pydantic + pytest no `evals/`.

**Spec:** docs/superpowers/specs/2026-11-08-aula-eventos-tutora-proativa-design.md (§3 "Pré-geração", "Aula gravada", "Evals"; §6 "Entrega 3"). Pré-requisito: docs/superpowers/plans/2026-11-08-aula-eventos-entrega-3a.md concluída (interfaces citadas abaixo vêm de lá).

**Decisões fixadas aqui:**
- A rota de pré-geração devolve um status por passo (`READY`, `MUTED`, `NO_MATERIAL`, `BUSY`, `FAILED`) e não grava `TUTOR_SKIPPED`: eventos só nascem ao vivo. A pergunta do professor (`socraticQuestion`) não vai para o rascunho; o worker a publica sem modelo.
- "Preparar tutora" exige aula publicada **e** formulário salvo: o `stepHash` vem do roteiro salvo, e preparar um roteiro não salvo geraria rascunhos que o worker descartaria.
- `GET /api/v1/teacher/lessons/[id]/tutor-drafts` serve ao editor e à prévia do próximo passo no painel; `current` diz se o rascunho bate com o roteiro e os capítulos atuais.
- Aula gravada: `appendEvents` ganha a opção `stepAudience` para ler o passo atual daquele aluno dentro da mesma trava; o servidor não repete o passo corrente dele. O tocador só reporta enquanto a fase é `NOT_STARTED`, a aula tem vídeo e roteiro, e para de reportar no primeiro 409.
- Roteiro de demonstração com 5 passos (os 3 atuais mantidos, para o Playwright da 3a continuar valendo) e duração da agenda ao vivo de 90 min: passo longo com material (cartão + pergunta gerada), passo com `socraticQuestion`, passo curto (sem pergunta gerada) e passo fora do material (`NO_MATERIAL`).
- Evals `proativo`: categoria opt-in (só roda com `--category proativo` ou `--id`), porque inicia a aula demo e consome a agenda até um novo seed. Os 10 casos são 10 asserções sobre os 5 passos (um passo pode ter mais de um caso); cada caso traz `step` e, em `question`, a `activity` esperada do passo, conferida contra o `STEP_CHANGED`.

## Global Constraints

- Trabalho direto em `main`, sem branch/PR; cada task termina em commit com o trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nenhuma task roda `npm run db:seed`, `prisma migrate reset` ou `prisma migrate dev` contra o banco de dev (porta 5432). Migration nova via `prisma migrate dev --create-only` com revisão manual do SQL (drift do pgvector gera DROPs espúrios; o índice parcial `class_events_tutor_step_uq` existe só na migration SQL e não pode ser dropado). Seed só no docker 5433 (`DATABASE_URL_TEST`), se algum teste precisar. Esta entrega não cria migration.
- Sem estado de aula em memória de processo; nenhum `setInterval` na sala/painel (o `setInterval` de 500 ms que já existe em `interactive-video-player.tsx` para ler o tempo do YouTube não muda).
- Teto de 2 chamadas ao modelo por passo por aula, reserva via `UPDATE ... WHERE` atômico, como na spec §3; pré-geração e geração ao vivo dividem o mesmo teto.
- Tipos da tutora não são aceitos no `POST /events` do professor (já é assim); audience aplicado no servidor.
- Copy em pt-BR exatamente como nas tasks. Sem stubs/placeholders.
- Testes: `npx vitest run <path>`, `npx tsc --noEmit`; componentes com `// @vitest-environment jsdom` e `import * as React`; sem `@testing-library/jest-dom`.
- Evals Python (`evals/`) não entram no vitest nem no CI; o caso `proativo` roda com o provedor real só manualmente.
- Serviços com `deps` injetáveis e `defaultDeps`; só repositórios importam `db`.

## Review Focus

- Professor prepara a tutora e depois edita a `description` de um passo: o rascunho desse passo fica obsoleto (`current: false`), o worker regenera com `calls` zerado e os outros passos seguem promovidos sem chamada (testes: Task 1 "edição invalida só o passo editado").
- Professor clica "Preparar tutora" duas vezes, ou prepara enquanto a aula já está rodando: a reserva devolve `BUSY` e nenhuma chamada extra é feita; o editor mostra o aviso e segue para o próximo passo (testes: Task 1 "BUSY sem chamada", Task 2 "status por passo no resumo").
- Aluno arrasta o vídeo para frente por três passos ou volta: um `STEP_CHANGED` só para o passo final, e nenhum quando o passo não muda (testes: Task 4 "mesmo passo não repete", Task 5 "salto reporta só o passo final").
- Professor inicia a aula ao vivo enquanto um aluno assiste ao vídeo: a rota responde 409 `LIVE_CLASS_IN_PROGRESS` e o tocador para de reportar, sem laço de requisições (testes: Task 4, Task 5 "para no primeiro 409").
- Evals rodados contra uma aula demo já iniciada: o harness para com uma mensagem clara em vez de produzir dez falhas falsas (teste: Task 7 "aula já iniciada").

---

### Task 1: Serviço e rota de pré-geração por passo

**Files:**
- Create: `src/domains/classroom/tutor-draft-service.ts`
- Create: `src/app/api/v1/teacher/lessons/[id]/tutor-drafts/route.ts`
- Test: `src/domains/classroom/__tests__/tutor-draft-service.test.ts`, `src/app/api/v1/teacher/lessons/[id]/tutor-drafts/__tests__/route.test.ts`

**Interfaces:**
- Consumes (3a): `produceStepContent`, `StepContentInput`, `StepContent`, `MultipleChoicePayload` (`tutor-step-content.ts`); `stepHash`; `listDrafts`, `TutorDraftRow`; `decideTutorPlan`, `stepDurationSeconds`, `tutorSkipMessage` (`tutor-policy.ts`); `isTutorMuted`; `findEventsAfter` + `TUTOR_EVENTS_SCAN`; `toClassEventDTO`. Também `findLessonWithContext` + `assertOwner` (dono = `courseSchedule.teachingPlan.teacherId`), `LESSON_STATUS`.
- Produces:
```ts
export type PreparedStep = { stepIndex: number; status: 'READY' | 'MUTED' | 'NO_MATERIAL' | 'BUSY' | 'FAILED'; card: boolean; question: boolean; message: string | null };
export type TutorDraftView = { stepIndex: number; card: TutorCardPayload | null; question: MultipleChoicePayload | null; current: boolean };
export function prepareTutorDraft(user: LessonActor, lessonPlanId: string, stepIndex: number, deps?): Promise<PreparedStep>;
export function listTutorDrafts(user: LessonActor, lessonPlanId: string, deps?): Promise<TutorDraftView[]>;
```
Regras de `prepareTutorDraft`: aluno → 403 "Apenas o professor da aula prepara a tutora."; não dono → erro de `assertOwner`; aula não publicada → 409 "Publique a aula antes de preparar a tutora." (`LESSON_NOT_PUBLISHED`); sem agenda vinculada → 409 "A aula publicada não tem agenda." (`NO_AGENDA`); `stepIndex` fora do roteiro → 400 "O passo informado não existe no roteiro." (`STEP_OUT_OF_RANGE`). Depois: plano com `muted = isTutorMuted(eventos da agenda, i)`; `SILENT` → `MUTED` sem chamar `produce`; `produce({ agendaId, ..., wantQuestion: plan.question?.from === 'MODEL' })`; `BUSY` → `BUSY`; `noMaterial` → `NO_MATERIAL`; `failure` → `FAILED` com `message = tutorSkipMessage(failure)`; senão `READY`. `card`/`question` = peças presentes no resultado.
`listTutorDrafts`: mesmo dono; um item por linha de `listDrafts`, `current = row.stepHash === stepHash(roteiro[i], capítulos)` (passo inexistente → `false`), peças inválidas viram `null`.
Rota: `GET` → `{ success: true, drafts }`; `POST` com `z.object({ stepIndex: z.number().int().min(0) })` → `{ success: true, step }`; ambas com `requireUser(req, [Role.TEACHER, Role.ADMIN])` e `dynamic = 'force-dynamic'`.

- [ ] **Step 1: Testes falhando** (`makeDeps` com aula publicada de 3 passos, agenda de 90 min e `produce` falso)
  - `READY` com cartão e pergunta; `wantQuestion` `false` no passo com `socraticQuestion` e no passo curto;
  - **Review Focus:** BUSY sem chamada — `produce` devolvendo `BUSY` → `{ status: 'BUSY', card: false, question: false, message: null }`;
  - `MUTED` com `TEACHER_NOTE MUTE LESSON` na agenda, sem chamar `produce`;
  - `FAILED` com `message` "O provedor de IA recusou por limite de uso. Sem cartão neste passo."; `NO_MATERIAL`;
  - erros 403/409/409/400 com os `details.code` acima;
  - **Review Focus:** edição invalida só o passo editado — `listTutorDrafts` com hash salvo do roteiro antigo no passo 1 → `current` `[true, false, true]`;
  - rota: corpo inválido → 400; repassa `stepIndex`; `GET` devolve `drafts`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/tutor-draft-service.test.ts "src/app/api/v1/teacher/lessons/[id]/tutor-drafts"` → FAIL.
- [ ] **Step 3: Implementar** o serviço e a rota.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/tutor-draft-service.ts src/domains/classroom/__tests__/tutor-draft-service.test.ts "src/app/api/v1/teacher/lessons/[id]/tutor-drafts"
git commit -m "feat(tutora): pré-geração por passo com a mesma reserva e o mesmo teto do ao vivo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: "Preparar tutora" no editor da aula

**Files:**
- Create: `src/app/teacher/lessons/_components/use-prepare-tutor.ts`
- Modify: `src/app/teacher/lessons/_components/LessonEditor.tsx` (cabeçalho do card do roteiro, junto do botão de adicionar etapa ~L296)
- Test: `src/app/teacher/lessons/_components/__tests__/use-prepare-tutor.test.tsx`, `src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/teacher/lessons/:id/tutor-drafts` (Task 1), `PreparedStep`, `API_ROUTES.TEACHER_LESSONS`.
- Produces:
```ts
export function usePrepareTutor(lessonId: string): {
  run(stepCount: number): Promise<void>;
  running: boolean;
  progress: { done: number; total: number } | null;
  summary: string[] | null; // linhas exibidas ao fim
};
export function prepareSummary(results: (PreparedStep | { stepIndex: number; status: 'ERROR' })[]): string[];
```
`run`: um `POST` por passo, em sequência (nunca em paralelo), seguindo mesmo com erro num passo; segundo `run` durante um em curso é ignorado (ref). `prepareSummary`: primeira linha `"Tutora preparada: {ready} de {total} passos com conteúdo pronto."`; depois uma linha por passo não `READY`, `"Passo {i+1}: {texto}"`, com texto `MUTED` "tutora em silêncio.", `NO_MATERIAL` "sem trecho do material.", `BUSY` "em preparo por outra requisição; tente de novo em 1 minuto.", `FAILED` = `message`, `ERROR` "não foi possível preparar.".
Editor: botão "Preparar tutora" (ícone `Sparkles`, `variant="outline"`, `size="sm"`), habilitado só com `published && !isDirty() && steps.length > 0 && !busy && !running`; em curso, o rótulo vira "Preparando passo {done+1} de {total}…". Dicas abaixo, em `text-xs`: não publicada → "Publique a aula para preparar a tutora."; publicada e com alterações → "Salve as alterações antes de preparar a tutora."; ao fim, `summary` em `<ul role="status">`.

- [ ] **Step 1: Testes falhando**
  - hook: 3 passos → 3 `fetch` em sequência com corpos `{"stepIndex":0}`, `1`, `2` (o segundo só depois do primeiro resolver); HTTP 500 no passo 1 não interrompe; `summary` exato para `[READY, BUSY, ERROR]` → `['Tutora preparada: 1 de 3 passos com conteúdo pronto.', 'Passo 2: em preparo por outra requisição; tente de novo em 1 minuto.', 'Passo 3: não foi possível preparar.']`;
  - editor: aula em rascunho → botão `disabled` e a dica de publicar; publicada e sem alterações → habilitado; ao mudar uma `activity` → `disabled` e a dica de salvar.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/use-prepare-tutor.test.tsx src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/app/teacher/lessons` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/app/teacher/lessons/_components/use-prepare-tutor.ts src/app/teacher/lessons/_components/LessonEditor.tsx src/app/teacher/lessons/_components/__tests__/use-prepare-tutor.test.tsx src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx
git commit -m "feat(aulas): botão Preparar tutora com progresso por passo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Prévia do rascunho do próximo passo no painel

**Files:**
- Create: `src/components/classroom/use-tutor-drafts.ts`
- Modify: `src/app/teacher/live/[agendaId]/_components/TutorPanel.tsx` (prop `nextDraft`), `.../LiveClassPage.tsx`
- Test: `src/components/classroom/__tests__/use-tutor-drafts.test.ts`, `src/app/teacher/live/[agendaId]/_components/__tests__/TutorPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/teacher/lessons/:id/tutor-drafts`, `TutorDraftView` (Task 1), `TeacherTutorView.nextStepIndex` (3a).
- Produces:
```ts
export function useTutorDrafts(lessonPlanId: string | null, reloadKey: number | null): { drafts: TutorDraftView[] };
// TutorPanel ganha: nextDraft: TutorDraftView | null
```
Hook: sem `lessonPlanId` não busca; busca na montagem e a cada `reloadKey` (o painel passa `state.currentStepIndex`); falha mantém a lista anterior. Painel: `nextDraft = drafts.find((d) => d.stepIndex === view.nextStepIndex && d.current && d.card) ?? null`. No bloco do próximo passo, com `nextDraft`: "Rascunho pronto para o próximo passo:" seguido dos `title` do cartão e, se houver pergunta, "com pergunta de múltipla escolha"; sem rascunho, nada além do que a 3a já mostra.

- [ ] **Step 1: Testes falhando** — hook: nenhuma requisição com `null`; `fetch` de novo quando `reloadKey` muda; painel: com `nextDraft` mostra o texto e os títulos; rascunho com `current: false` não é passado (teste na função de escolha, extraída como `pickNextDraft(drafts, nextStepIndex)` no próprio `TutorPanel.tsx`).
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom/__tests__/use-tutor-drafts.test.ts "src/app/teacher/live"` → FAIL.
- [ ] **Step 3: Implementar** (`LiveClassPage` passa `agenda.lessonPlanId ?? null`).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom/use-tutor-drafts.ts src/components/classroom/__tests__/use-tutor-drafts.test.ts "src/app/teacher/live"
git commit -m "feat(aula): prévia do rascunho da tutora para o próximo passo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rota `video-step` da aula gravada

**Files:**
- Modify: `src/domains/classroom/class-event-repository.ts` (`appendEvents` com opção `stepAudience`)
- Modify: `src/domains/classroom/class-event-service.ts` (`appendVideoStep`; `stepEvent` passa a receber `createdBy`, `audience` e `videoSeconds?`)
- Create: `src/app/api/v1/agendas/[id]/events/video-step/route.ts`
- Test: `src/domains/classroom/__tests__/class-event-repository.test.ts`, `src/domains/classroom/__tests__/class-event-service.test.ts`, `src/app/api/v1/agendas/[id]/events/video-step/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `runTutorForStepSafely` (3a), `after` de `next/server`.
- Produces:
```ts
export type AppendContext = { phase: SessionPhase; currentStepIndex: number | null; audienceStepIndex: number | null };
export function appendEvents(agendaId: string, build: (ctx: AppendContext) => NewClassEvent[], options?: { stepAudience?: string }): Promise<ClassEventRow[]>;
export function stepIndexAt(script: TimeScriptItem[], videoSeconds: number): number | null; // maior i com timeSeconds <= videoSeconds
export function appendVideoStep(user: AgendaActor, agendaId: string, videoSeconds: number, deps?: ClassEventDeps): Promise<ClassEventDTO[]>;
```
`audienceStepIndex` = `stepIndex` do último `STEP_CHANGED` com `audience = stepAudience` (sem opção, `null`). `appendVideoStep`: não aluno → 403 "Apenas alunos registram o avanço do vídeo."; escopo (404); agenda `CANCELLED` → 409 `CLASS_ENDED`; `stepIndexAt` nulo → `[]`; no `build`: fase `RUNNING` → 409 "A aula está acontecendo ao vivo; o roteiro segue o professor." (`LIVE_CLASS_IN_PROGRESS`); `ENDED` → 409 `CLASS_ENDED`; `audienceStepIndex === i` → `[]`; senão `STEP_CHANGED` com payload `{ activity, timeRange, fromStepIndex: audienceStepIndex, videoSeconds }`, `audience: user.id`, `createdBy: 'SYSTEM'`. Rota: `POST`, `requireUser(req)`, corpo `z.object({ videoSeconds: z.number().int().min(0) })`, 201 `{ success: true, events }`; com evento gravado, `after(() => runTutorForStepSafely(id, events[0].stepIndex!))`.

- [ ] **Step 1: Testes falhando**
  - repositório: com `stepAudience: 's1'`, a consulta do passo do aluno filtra `audience: 's1'` e o valor chega no `ctx`;
  - serviço (roteiro `[0, 600, 1800]`): `videoSeconds: 700` sem passo anterior → `stepIndex 1`, `fromStepIndex: null`, `videoSeconds: 700`, audience `'s1'`, `createdBy: 'SYSTEM'`; **Review Focus:** mesmo passo não repete — com `audienceStepIndex: 1`, `videoSeconds: 900` → `[]`; fase `RUNNING` → 409 `LIVE_CLASS_IN_PROGRESS`; professor → 403; `stepIndexAt([...], 10)` com primeiro passo em 30 → `null`;
  - rota: 201 com `after` chamado só quando há evento; corpo inválido → 400.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-event-repository.test.ts src/domains/classroom/__tests__/class-event-service.test.ts "src/app/api/v1/agendas/[id]/events/video-step"` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/domains/classroom "src/app/api/v1/agendas"` + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-event-repository.ts src/domains/classroom/class-event-service.ts src/domains/classroom/__tests__ "src/app/api/v1/agendas/[id]/events/video-step"
git commit -m "feat(aula): passo da aula gravada pelo tempo do vídeo de cada aluno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Tocador reporta o passo e a sala liga a aula gravada

**Files:**
- Modify: `src/components/classroom/interactive-video-player.tsx` (props novas; `checkAt` ~L83)
- Create: `src/components/classroom/use-video-step-reporter.ts`
- Modify: `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx`
- Test: `src/components/classroom/__tests__/interactive-video-player.test.tsx`, `src/components/classroom/__tests__/use-video-step-reporter.test.ts`, `src/app/(student)/classroom/[sessionId]/_components/__tests__/ClassroomPage.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/agendas/:id/events/video-step` (Task 4).
- Produces:
```ts
// interactive-video-player.tsx
export function stepTimeIndex(stepTimes: number[], seconds: number): number; // -1 antes do primeiro
// novas props: stepTimes?: number[]; onStepCross?: (videoSeconds: number) => void
export function useVideoStepReporter(agendaId: string, enabled: boolean): (videoSeconds: number) => void;
```
Tocador: guarda o último índice reportado num ref; a cada leitura de tempo (o `onTimeUpdate` do `<video>` e a leitura do YouTube que já existe), calcula `stepTimeIndex`; se `>= 0` e diferente do último, atualiza o ref e chama `onStepCross(Math.floor(seconds))`. Hook: `POST` sem esperar resposta para a UI; ignora chamadas com `enabled` falso; 409 (qualquer código) desliga o hook até a página recarregar (ref); erro de rede só loga. Página: `enabled = state.phase === 'NOT_STARTED' && Boolean(videoUrl) && mediaType !== NONE && (lesson?.timeScript.length ?? 0) > 0`; passa `stepTimes = lesson.timeScript.map((s) => s.timeSeconds)` e `onStepCross` = o reporter.

- [ ] **Step 1: Testes falhando**
  - `stepTimeIndex([0, 600, 1800], 599)` → 0; `(…, 1800)` → 2; `([30], 10)` → −1;
  - tocador (`<video>` de upload, `fireEvent.timeUpdate` após definir `currentTime` com `Object.defineProperty`): tempos 5, 10, 700 → `onStepCross` com 5 e 700; **Review Focus:** salto reporta só o passo final — de 5 direto para 2000 → uma chamada com 2000; voltar para 100 → chamada com 100;
  - hook: **Review Focus:** para no primeiro 409 — depois de uma resposta 409, novas chamadas não fazem `fetch`; `enabled: false` não faz `fetch`;
  - página: fase `RUNNING` → `InteractiveVideoPlayer` mockado recebe `onStepCross` indefinido; `NOT_STARTED` com vídeo e roteiro → definido.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom "src/app/(student)/classroom"` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom/interactive-video-player.tsx src/components/classroom/use-video-step-reporter.ts src/components/classroom/__tests__ "src/app/(student)/classroom/[sessionId]/_components"
git commit -m "feat(sala): vídeo da aula gravada avança o passo e aciona a tutora

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Roteiro de demonstração com um passo de cada tipo

**Files:**
- Modify: `prisma/seed-data/academic.ts` (`DEMO_LIVE_TIME_SCRIPT`)
- Test: `prisma/seed-data/__tests__/academic.test.ts`

**Interfaces:**
- Consumes: `decideTutorPlan`, `stepDurationSeconds` (3a), `DEMO_AGENDAS` (a agenda CLASSROOM ao vivo já vai de −25 a +65 min = 90 min; não muda).
- Produces: `DEMO_LIVE_TIME_SCRIPT` com 5 itens; os 3 primeiros iguais aos de hoje, exceto `timeRange` do terceiro, e mais:
```ts
{ timeSeconds: 3000, timeRange: '50-53 min', activity: 'Exercício relâmpago: propriedades ACID',
  description: 'Em dupla, apontar qual propriedade ACID impede que uma transação deixe alterações parciais.' },
{ timeSeconds: 3180, timeRange: '53-90 min', activity: 'Intervalo',
  description: 'Pausa para café e alongamento.' },
```
(terceiro item: `timeRange: '30-50 min'`, sem mudança.)

- [ ] **Step 1: Teste falhando** (substitui as asserções de 3 passos da Entrega 2)
```ts
it('aula 3 tem um passo de cada tipo para a tutora', () => {
  const live = DEMO_AGENDAS.find((a) => a.type === 'CLASSROOM' && a.status === 'LIVE')!;
  const seconds = (live.endOffsetMinutes - live.startOffsetMinutes) * 60;
  const plans = DEMO_LIVE_TIME_SCRIPT.map((item, i) =>
    decideTutorPlan({ item, durationSeconds: stepDurationSeconds(DEMO_LIVE_TIME_SCRIPT, i, seconds) }, { muted: false }));
  expect(plans.map((p) => (p.kind === 'RUN' ? p.question?.from ?? 'NONE' : 'SILENT'))).toEqual(['MODEL', 'TEACHER', 'MODEL', 'NONE', 'MODEL']);
  expect(DEMO_LIVE_TIME_SCRIPT.slice(0, 3).map((s) => s.activity)).toEqual(['Revisão: chaves e relacionamentos', 'INNER JOIN e LEFT JOIN na prática', 'Subqueries e operações de conjunto']);
  expect(timeScriptSchema.parse(DEMO_LIVE_TIME_SCRIPT)).toHaveLength(5);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run prisma/seed-data/__tests__/academic.test.ts` → FAIL.
- [ ] **Step 3: Implementar** os dois itens.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit`; seed só no docker 5433 (`DATABASE_URL=<DATABASE_URL do .env com a porta 5433> npm run db:seed`, sem imprimir a URL) e um script Prisma que confirma 5 itens no plano da `classNumber 3`; `npm run test:e2e:ui` (o Playwright da 3a silencia todo passo ≠ 1 percorrendo o roteiro inteiro) → PASS.
- [ ] **Step 5: Commit**
```bash
git add prisma/seed-data/academic.ts prisma/seed-data/__tests__/academic.test.ts
git commit -m "feat(seed): roteiro demo com passo de material, do professor, curto e fora do material

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Evals `proativo` com login de professor

**Files:**
- Modify: `evals/evals/cases.py` (`Category.PROATIVO = "proativo"`; `Case.step: int | None = Field(default=None, ge=0, le=59)`; `Expectation.teacher_question: str | None`; graders novos em `GRADER_NAMES`; `DEFAULT_GRADERS[PROATIVO] = ()` e validação: `proativo` exige `step` e `graders` não vazios; outras categorias proíbem `step`)
- Modify: `evals/evals/client.py` (`post_event`, `list_events`)
- Create: `evals/evals/proactive.py`, `evals/evals/graders/proactive.py`
- Modify: `evals/evals/graders/__init__.py`, `evals/evals/cli.py`, `evals/evals/runner.py` (despacha `proativo` para `run_proactive_cases`)
- Create: `evals/cases/proativo.jsonl`
- Test: `evals/tests/test_proactive.py`, `evals/tests/test_cases.py`
- Modify: `evals/README.md`

**Interfaces:**
- Consumes (HTTP): `POST /api/v1/auth/login`, `POST /api/v1/agendas/:id/events`, `GET /api/v1/agendas/:id/events?after=0`.
- Produces:
```python
# client.py (TutorClient)
def post_event(self, agenda_id: str, type: str, step_index: int | None = None) -> list[dict[str, Any]]: ...
def list_events(self, agenda_id: str, after: int = 0) -> list[dict[str, Any]]: ...  # pagina até lastSeq parar
# proactive.py
@dataclass
class ProactiveObservation:
    step: int
    activity: str | None
    teacher_events: list[dict[str, Any]]  # eventos da tutora do passo, visão do professor
    student_events: list[dict[str, Any]]  # idem, visão do aluno
    timed_out: bool
def run_proactive_cases(cases: list[Case], teacher: TutorClient, student: TutorClient, agenda_id: str,
                        timeout_s: float = 60.0, poll_s: float = 2.0, sleep=time.sleep, clock=time.monotonic) -> list[CaseResult]: ...
# graders/proactive.py — assinatura (obs: ProactiveObservation, expect: Expectation) -> GradeResult
card_cites, card_shape, question_generated, teacher_question, no_question, skipped_no_material
PROACTIVE_GRADERS: dict[str, Callable[[ProactiveObservation, Expectation], GradeResult]]
```
Fluxo de `run_proactive_cases`: se `teacher.list_events` já tem `SESSION_STARTED` → `ClientError("A aula de demonstração já foi iniciada; semeie de novo (docker compose restart app) antes de rodar o proativo.")`; passos = `sorted({c.step})`; o primeiro passo dispara `SESSION_STARTED` (que grava o passo 0) e, se ele não for 0, um `STEP_CHANGED`; os demais, `STEP_CHANGED`; para cada passo, consulta como professor a cada `poll_s` até haver `TUTOR_CARD` ou `TUTOR_SKIPPED` do passo ou `timeout_s`; depois lê uma vez como aluno; `activity` vem do `STEP_CHANGED`; caso cuja `question` difere da `activity` → `CaseResult` com `error = "roteiro do seed diverge: esperado '{question}', encontrado '{activity}'"`; timeout → `error = "sem evento da tutora em 60 s"`. `reply` = JSON compacto dos `teacher_events`; `citations` = `label` das citações do cartão. Não encerra a aula.
Graders: `card_cites` — cartão existe e alguma `citation.label` contém `expect.citation.material` e `expect.citation.chapter` (comparação sem acentos); `card_shape` — 2 ou 3 conceitos, nenhum `title`/`explanation` com `**`, `` ` ``, `#` no início ou marcador de lista; `question_generated` — `TUTOR_QUESTION` `MULTIPLE_CHOICE` com `origin: 'TUTOR'` e 4 alternativas na visão do professor, e o mesmo `seq` na visão do aluno sem `correctKey` nem `rationale`; `teacher_question` — `OPEN` com `origin: 'TEACHER'` e `text` igual (trim) a `expect.teacher_question`; `no_question` — nenhum `TUTOR_QUESTION`; `skipped_no_material` — professor vê `TUTOR_SKIPPED` com `reason: 'NO_MATERIAL'`, não há `TUTOR_CARD`, e o aluno não vê `TUTOR_SKIPPED`.
CLI: `proativo` só entra quando pedido por `--category proativo` ou `--id`; opções `--teacher-identifier` (padrão `PROF001`) e `--teacher-password` (padrão `prof123`, ou `EVALS_TEACHER_PASSWORD`); o limiar padrão 0,8 vale.
Casos (`evals/cases/proativo.jsonl`, `mode: "classroom"`, `question` = `activity` do passo):

| id | step | graders | expect |
|---|---|---|---|
| `proativo-revisao-cartao-cita` | 0 | `card_cites` | citation `Sistemas de Banco de Dados` / `Capítulo 6` |
| `proativo-revisao-pergunta-gerada` | 0 | `question_generated` | — |
| `proativo-join-cartao-cita` | 1 | `card_cites` | `Sistemas de Banco de Dados` / `Capítulo 4` |
| `proativo-join-pergunta-do-professor` | 1 | `teacher_question` | `teacher_question`: "O que acontece com um estudante sem matrícula num INNER JOIN?" |
| `proativo-subquery-cartao-sem-markdown` | 2 | `card_shape` | — |
| `proativo-subquery-pergunta-gerada` | 2 | `question_generated` | — |
| `proativo-acid-cartao-cita` | 3 | `card_cites` | `Sistemas de Banco de Dados` / `Capítulo 8` |
| `proativo-acid-passo-curto-sem-pergunta` | 3 | `no_question` | — |
| `proativo-intervalo-sem-material` | 4 | `skipped_no_material` | — |
| `proativo-intervalo-sem-pergunta` | 4 | `no_question` | — |

- [ ] **Step 1: Testes falhando** (pytest, sem rede)
  - `test_cases.py`: caso `proativo` sem `step` é inválido; `fato_no_material` com `step` é inválido; `python -m evals cases` lista os 10 novos;
  - graders: um par passa/falha para cada um dos 6, com observações montadas à mão (inclusive aluno vendo `correctKey` → `question_generated` falha);
  - runner com `httpx.MockTransport`: sequência `SESSION_STARTED` → eventos do passo 0 aparecem na 2ª consulta → casos avaliados; **Review Focus:** aula já iniciada — `list_events` com `SESSION_STARTED` levanta `ClientError` com a mensagem acima e nenhum `POST` é feito; timeout com `clock` falso → `error` "sem evento da tutora em 60 s"; `activity` divergente → `error` de roteiro;
  - CLI: `run` sem `--category` não carrega casos `proativo`.
- [ ] **Step 2: Rodar e ver falhar** — `cd evals && . .venv/bin/activate && python -m pytest -q` → FAIL.
- [ ] **Step 3: Implementar** os módulos, os casos e a seção do README: linha `proativo` na tabela de categorias (pergunta típica: "o professor avança o passo"; passa quando: cartão citado, pergunta com 4 alternativas sem gabarito para o aluno, pergunta do professor publicada, passo curto sem pergunta, passo fora do material com `TUTOR_SKIPPED NO_MATERIAL` só para o professor), contagem "50 casos em 6 categorias", e o roteiro: seed novo, app com o provedor real, `python -m evals run --category proativo --base-url http://localhost:3000`; a categoria consome a aula demo até um novo seed e não roda no CI.
- [ ] **Step 4: Rodar e ver passar** — `python -m pytest -q && ruff check . && python -m evals cases` → PASS. Manual (fora do CI, com o provedor real e seed novo no Docker): `python -m evals run --category proativo` → taxa da categoria ≥ 0,8; anotar o relatório gerado em `evals/reports/`.
- [ ] **Step 5: Commit**
```bash
git add evals/evals evals/cases/proativo.jsonl evals/tests evals/README.md
git commit -m "feat(evals): categoria proativo com login de professor e graders da tutora proativa

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final

- `npx vitest run` (suíte inteira), `npx tsc --noEmit`, `npm run lint` → verdes.
- `npm run test:e2e:ui` → 2 passed.
- `cd evals && python -m pytest -q && ruff check .` → verdes.
- Manual: no editor, "Preparar tutora" numa aula publicada; no painel, a prévia do próximo passo; ao vivo, o passo preparado publica com `source: 'DRAFT'` e nenhuma linha nova em `inference_logs`; como aluno numa agenda sem `SESSION_STARTED` e com vídeo de upload, avançar o vídeo e ver a faixa mudar de passo e receber o cartão.

## Critérios de aceite (spec §6, Entrega 3, parte preparada e gravada)

| Critério | Cumprido em |
|---|---|
| "Preparar tutora" no `LessonEditor.tsx`, um passo por requisição, com progresso | Tasks 1, 2 |
| Aula preparada publica sem chamar o modelo | 3a Tasks 6-7 + Task 1 aqui; verificação manual |
| Prévia do próximo passo (rascunho) no painel | Task 3 |
| Aula gravada avança pelo vídeo (`video-step`, `SYSTEM`, audience do aluno, 409 com aula ao vivo) | Tasks 4, 5 |
| Seed com um passo de cada tipo na aula ao vivo | Task 6 |
| `evals/cases/proativo.jsonl` (10 casos), professor no `client.py`, `proativo` ≥ 0,8 com o provedor real | Task 7 |
