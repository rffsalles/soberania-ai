# Aula como eventos — Entrega 2: painel ao vivo do professor (sem tutora) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O professor conduz a aula por uma tela própria (iniciar, avançar, voltar, ir a um passo, encerrar) e o aluno vê, sem recarregar, só o passo atual numa faixa "Agora na aula".

**Architecture:** Tudo em cima da Entrega 1: o painel lê o estado de `useClassEvents(agendaId)` (via `reduceClassState`), o roteiro de `GET /api/v1/agendas/:id/lesson` (`useAgendaLesson`) e grava por `POST /api/v1/agendas/:id/events`; sem UI otimista, o evento volta pelo stream em ~2 s. Regras de botão (próximo/anterior/habilitado por fase) ficam num módulo puro; a faixa do aluno deriva a `activity` do último `STEP_CHANGED` pelo reducer. Playwright entra como dev dependency com um fluxo professor + aluno contra a app com seed.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma 6 + Postgres, vitest + Testing Library (jsdom), shadcn/Tailwind, `@playwright/test` (novo, só dev).

**Spec:** docs/superpowers/specs/2026-11-08-aula-eventos-tutora-proativa-design.md (§4 Interface, §6 "Entrega 2" e "Playwright"). Interfaces da Entrega 1: docs/superpowers/plans/2026-11-08-aula-eventos-entrega-1.md.

**Decisões fixadas aqui:**
- Página em `src/app/teacher/live/[agendaId]/`, como diz a spec: as páginas `/teacher/*` já vivem em `src/app/teacher/` (layout com `AppHeader`; o grupo `(teacher)` só tem `/reports`). O RBAC já cobre `/teacher/*` com `STAFF_ROLES` (prefixo `ROUTES.TEACHER`), nada a mudar em `rbac.ts`.
- `SESSION_ENDED` → `setAgendaStatus(COMPLETED)` + `generateMinutesForAgenda` já existe (Entrega 1, `completeAgenda` em `class-event-service.ts`); aqui só a confirmação na UI.
- `ClassState` ganha `currentStepActivity: string | null` (do payload do último `STEP_CHANGED`); a faixa não lê payload cru.
- A faixa fica entre a barra do topo e a grade da sala (largura total, acima do chat), não dentro da coluna do chat: a coluna usa `useFillViewportHeight` e uma faixa ali dentro roubaria altura do chat.
- Com `phase === 'ENDED'` a faixa some (o selo "Encerrada" do topo já informa).
- O seed dá roteiro de 3 passos ao plano da aula 3 (o vinculado à agenda CLASSROOM de demonstração); o Playwright usa essa agenda e zera os eventos dela no `beforeAll` via Prisma.
- Truncar `activity` (200) e `timeRange` (40) ao montar o `STEP_CHANGED` no servidor: hoje um roteiro com `activity` longa ou vazia gera payload que o leitor descarta em silêncio, e o aluno nunca vê o passo.

## Global Constraints

- Trabalhar direto em `main`, sem branches nem PR; cada task termina num commit com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nenhum `setInterval` na sala do aluno nem no painel do professor; o estado da aula vem só de `useClassEvents` (`reduceClassState`). Componentes não guardam estado de aula fora disso (spec §4, "Estado derivado").
- Escrita só por TEACHER/ADMIN (já aplicado em `POST /events` e no RBAC de `/teacher`); a UI não reimplementa autorização.
- Vercel Hobby: função de até 10 s; o stream fecha a cada 8 s e reconecta; latência de até ~2 s no modo `poll`. A UI não assume resposta otimista: depois do `201`, o destaque muda quando o evento chega pelo hook.
- Botões de ação desabilitados enquanto uma requisição está em voo; erro 400/409 mostra `body.error` da API num `role="alert"`.
- O aluno vê só a `activity` do passo atual; nunca o roteiro inteiro.
- Copy em pt-BR, exatamente como nas tasks.
- Fora desta entrega: "Pular", "Publicar agora", "Tutora em silêncio nesta aula", pulso da turma, cartão/pergunta da tutora na faixa. O layout do painel é uma grade `lg:grid-cols-12` com o roteiro em `lg:col-span-7`; a Entrega 3 acrescenta a coluna de 5 com tutora e pulso. Sem stubs nem placeholders.
- Testes de componente: `// @vitest-environment jsdom`, `@testing-library/react`, hooks de dados mockados com `vi.mock`. Comandos: `npx vitest run <path>`, `npx tsc --noEmit`.
- Nenhuma task roda `npm run db:seed` nem `prisma migrate reset` no banco de dev (porta 5432).
- Playwright não roda no vitest (exclude) nem no CI (`.github/workflows` não muda).

## Review Focus

- Clique duplo em "Próximo" (ou "Próximo" seguido de clique num passo) antes da primeira resposta: dois `STEP_CHANGED` pulam um passo. O hook de ações recusa um segundo envio enquanto há um em voo, guardado por ref e não só pelo `disabled` (teste: Task 3 "segundo send durante o pendente não chama fetch").
- Roteiro editado e encurtado depois do início: `currentStepIndex` aponta além do fim. Nada pode quebrar: "Próximo" desabilitado, "Anterior" leva ao último passo existente, nenhum item destacado (teste: Task 2 "passo atual além do roteiro").
- `activity` vazia ou com mais de 200 caracteres no roteiro: o `STEP_CHANGED` passa a ser descartado na leitura e o aluno fica sem passo. O servidor trunca e usa "Passo N" para vazio (teste: Task 1 "activity longa é truncada; vazia vira Passo N").
- Agenda sem plano de aula (o endpoint de lição dá 404): o painel não pode ficar em carregamento eterno nem esconder "Iniciar"/"Encerrar" (teste: Task 5 "sem plano de aula mostra o aviso e ainda permite iniciar").
- Aula encerrada por outra aba ou pelo `PATCH` de status: a faixa do aluno precisa sumir e o painel precisa travar os controles a partir do estado do hook, não de estado local (testes: Task 4 "fase ENDED esconde a faixa", Task 5 "fase ENDED mostra Aula encerrada e nenhum botão de ação").

---

### Task 1: Passo atual no estado derivado e payload de passo sempre válido

**Files:**
- Modify: `src/domains/classroom/class-state.ts` (`ClassState`, `reduceClassState`)
- Modify: `src/domains/classroom/class-event-service.ts` (`stepEvent`, ~L78-91)
- Test: `src/domains/classroom/__tests__/class-state.test.ts`, `src/domains/classroom/__tests__/class-event-service.test.ts`

**Interfaces:**
- Consumes: `ClassEventDTO`, `currentStep(events)` (Entrega 1).
- Produces: `ClassState = { phase; currentStepIndex: number | null; currentStepActivity: string | null; lessonMuted; tutorByStep }`. `currentStepActivity` é `payload.activity` do `STEP_CHANGED` de maior `seq` quando for string, senão `null`.

- [ ] **Step 1: Testes falhando**
```ts
// class-state.test.ts (helper ev já existente)
it('currentStepActivity vem do STEP_CHANGED de maior seq', () => {
  const es = [ev(1, 'SESSION_STARTED'), ev(2, 'STEP_CHANGED', 0, { activity: 'Revisão', timeRange: '0-10 min', fromStepIndex: null }),
    ev(3, 'STEP_CHANGED', 1, { activity: 'JOINs', timeRange: '10-30 min', fromStepIndex: 0 })];
  expect(reduceClassState(es).currentStepActivity).toBe('JOINs');
  expect(reduceClassState([ev(1, 'SESSION_STARTED')]).currentStepActivity).toBeNull();
  expect(reduceClassState([ev(1, 'STEP_CHANGED', 0, {})]).currentStepActivity).toBeNull();
});
// class-event-service.test.ts (makeDeps já existente)
it('activity longa é truncada; vazia vira Passo N', async () => {
  const script = [{ timeSeconds: 0, timeRange: 'x'.repeat(50), activity: 'a'.repeat(250), description: '' },
                  { timeSeconds: 60, timeRange: '1-2', activity: '   ', description: '' }];
  // SESSION_STARTED já gravado (fase RUNNING) via makeDeps, como nos testes de STEP_CHANGED existentes
  const [e0] = await appendTeacherEvent(teacher, 'a1', { type: 'STEP_CHANGED', stepIndex: 0 }, runningDeps(script));
  expect((e0.payload as any).activity).toHaveLength(200);
  expect((e0.payload as any).timeRange).toHaveLength(40);
  const [e1] = await appendTeacherEvent(teacher, 'a1', { type: 'STEP_CHANGED', stepIndex: 1 }, runningDeps(script));
  expect((e1.payload as any).activity).toBe('Passo 2');
  expect(parseClassEvent('STEP_CHANGED', e0.payload, 0).ok).toBe(true);
});
```
(`runningDeps(script)` = `makeDeps({ script })` com a fase `RUNNING`, no mesmo formato dos testes "STEP_CHANGED monta o payload no servidor".)
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/class-state.test.ts src/domains/classroom/__tests__/class-event-service.test.ts` → FAIL (`currentStepActivity` undefined; activity com 250).
- [ ] **Step 3: Implementar** — `reduceClassState` lê `currentStep(events)?.payload` e devolve `activity` só se `typeof === 'string'`. Em `stepEvent`: `activity: item.activity.trim().slice(0, 200) || \`Passo ${stepIndex + 1}\``, `timeRange: item.timeRange.slice(0, 40)`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/class-state.ts src/domains/classroom/class-event-service.ts src/domains/classroom/__tests__/class-state.test.ts src/domains/classroom/__tests__/class-event-service.test.ts
git commit -m "feat(aula): activity do passo atual no estado e payload de passo sempre válido

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras dos controles do painel

**Files:**
- Create: `src/domains/classroom/live-controls.ts`
- Test: `src/domains/classroom/__tests__/live-controls.test.ts`

**Interfaces:**
- Consumes: `ClassState` (Task 1).
- Produces:
```ts
export type LiveControls = {
  canStart: boolean; canEnd: boolean; canSelectStep: boolean;
  prevIndex: number | null; nextIndex: number | null; // null = botão desabilitado
  highlightedIndex: number | null;                     // passo destacado no roteiro (null se fora do roteiro)
};
export function liveControls(state: Pick<ClassState, 'phase' | 'currentStepIndex'>, stepCount: number, pending: boolean): LiveControls;
export function stepTarget(controls: LiveControls, stepIndex: number): number | null; // null = clique não grava nada
```
Regras: `NOT_STARTED` → só `canStart = !pending`. `RUNNING` → `canEnd = !pending`; `canSelectStep = !pending && stepCount > 0`; com `pending` todos os índices `null`. `currentStepIndex === null` (aula iniciada sem roteiro) → `nextIndex = stepCount > 0 ? 0 : null`, `prevIndex = null`. `currentStepIndex >= stepCount` → `nextIndex = null`, `prevIndex = stepCount - 1` (ou `null` se 0), `highlightedIndex = null`. `ENDED` → tudo falso/`null`. `stepTarget` devolve `null` quando `!canSelectStep`, quando `stepIndex === highlightedIndex` ou fora de `0..stepCount-1`.

- [ ] **Step 1: Teste falhando**
```ts
const run = (i: number | null) => ({ phase: 'RUNNING' as const, currentStepIndex: i });
it('antes de iniciar só Iniciar', () => {
  expect(liveControls({ phase: 'NOT_STARTED', currentStepIndex: null }, 3, false))
    .toEqual({ canStart: true, canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null, highlightedIndex: null });
});
it('meio do roteiro', () => {
  expect(liveControls(run(1), 3, false)).toMatchObject({ prevIndex: 0, nextIndex: 2, highlightedIndex: 1, canEnd: true, canStart: false });
});
it('primeiro e último passo', () => {
  expect(liveControls(run(0), 3, false).prevIndex).toBeNull();
  expect(liveControls(run(2), 3, false).nextIndex).toBeNull();
});
it('passo atual além do roteiro', () => {
  expect(liveControls(run(5), 3, false)).toMatchObject({ nextIndex: null, prevIndex: 2, highlightedIndex: null });
});
it('pendente desabilita tudo', () => {
  expect(liveControls(run(1), 3, true)).toMatchObject({ canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null });
  expect(liveControls({ phase: 'NOT_STARTED', currentStepIndex: null }, 3, true).canStart).toBe(false);
});
it('encerrada trava tudo', () => {
  expect(liveControls({ phase: 'ENDED', currentStepIndex: 2 }, 3, false))
    .toMatchObject({ canStart: false, canEnd: false, canSelectStep: false, prevIndex: null, nextIndex: null });
});
it('stepTarget ignora o passo atual e índices fora do roteiro', () => {
  const c = liveControls(run(1), 3, false);
  expect([0, 1, 2, 3].map((i) => stepTarget(c, i))).toEqual([0, null, 2, null]);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/classroom/__tests__/live-controls.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `liveControls` e `stepTarget` em `src/domains/classroom/live-controls.ts` (sem imports de runtime além de tipos).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/classroom/live-controls.ts src/domains/classroom/__tests__/live-controls.test.ts
git commit -m "feat(aula): regras puras dos controles do painel ao vivo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Hook de ações do professor

**Files:**
- Create: `src/components/classroom/use-live-class-actions.ts`
- Test: `src/components/classroom/__tests__/use-live-class-actions.test.ts`

**Interfaces:**
- Produces:
```ts
export type TeacherClassCommand =
  | { type: 'SESSION_STARTED' } | { type: 'STEP_CHANGED'; stepIndex: number } | { type: 'SESSION_ENDED' };
export const LIVE_ACTION_ERROR = 'Não foi possível registrar a ação. Tente novamente.';
export function useLiveClassActions(agendaId: string): {
  send(cmd: TeacherClassCommand): Promise<boolean>; // true em 2xx com success
  pending: TeacherClassCommand['type'] | null;
  error: string | null;
};
```
Chamada: `fetch(\`${API_ROUTES.AGENDAS}/${encodeURIComponent(agendaId)}/events\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) })`. Erro: `body.error` se string, senão `LIVE_ACTION_ERROR` (inclui falha de rede). Um `useRef<boolean>` impede um segundo envio enquanto há um em voo.

- [ ] **Step 1: Teste falhando** (`renderHook`, `vi.stubGlobal('fetch', ...)`)
```ts
it('envia POST com o corpo do comando e devolve true em 201', async () => {
  // fetch → new Response(JSON.stringify({ success: true, events: [] }), { status: 201 })
  const ok = await act(() => result.current.send({ type: 'STEP_CHANGED', stepIndex: 2 }));
  expect(ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/agendas/a1/events', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ type: 'STEP_CHANGED', stepIndex: 2 }) }));
});
it('pending fica com o tipo do comando enquanto a requisição está aberta', ...); // fetch com promessa controlada: pending === 'SESSION_STARTED', depois null
it('segundo send durante o pendente não chama fetch e devolve false', ...);      // dois send no mesmo act: fetch 1x, segundo → false
it('em 409 expõe a mensagem da API', ...);  // { success:false, error:'A aula já foi iniciada.' } status 409 → error === 'A aula já foi iniciada.', send → false
it('falha de rede usa a mensagem padrão', ...); // fetch rejeita → error === LIVE_ACTION_ERROR
it('error é limpo no próximo send bem-sucedido', ...);
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom/__tests__/use-live-class-actions.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `useLiveClassActions` (`'use client'`), no estilo de `send` em `src/components/agendas/agenda-actions.ts`, mas sem lançar: o erro vira estado.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom/use-live-class-actions.ts src/components/classroom/__tests__/use-live-class-actions.test.ts
git commit -m "feat(aula): hook de ações do professor com trava de envio único

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Faixa "Agora na aula" e indicador ao vivo na sala do aluno

**Files:**
- Create: `src/components/classroom/live-status-indicator.tsx`, `src/components/classroom/now-in-class-strip.tsx`
- Modify: `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx` (L49 hook; inserir a faixa entre a barra do topo, ~L91-127, e a grade, ~L130)
- Test: `src/components/classroom/__tests__/now-in-class-strip.test.tsx`, `src/app/(student)/classroom/[sessionId]/_components/__tests__/ClassroomPage.test.tsx`

**Interfaces:**
- Consumes: `ClassEventsStatus`, `useClassEvents` (Entrega 1); `ClassState.currentStepActivity` (Task 1).
- Produces:
```ts
export const LIVE_STATUS_LABEL: Record<ClassEventsStatus, string> = { live: 'Ao vivo', polling: 'Atualizando', offline: 'Reconectando' };
export function LiveStatusIndicator(props: { status: ClassEventsStatus }): JSX.Element; // <span role="status">, ponto verde pulsante só em 'live'
export function NowInClassStrip(props: { stepIndex: number | null; activity: string | null; status: ClassEventsStatus }): JSX.Element | null;
```
A faixa: `null` quando `stepIndex === null`; senão `<section data-testid="now-in-class-strip" aria-label="Agora na aula">` com o título "Agora na aula", o texto `activity ?? \`Passo ${stepIndex + 1}\`` e `<LiveStatusIndicator status={status} />`. Na página: `const { state, lastSeq, status: eventsStatus } = useClassEvents(sessionId)` e `<NowInClassStrip stepIndex={state.phase === 'RUNNING' ? state.currentStepIndex : null} activity={state.currentStepActivity} status={eventsStatus} />`.

- [ ] **Step 1: Testes falhando**
```tsx
// now-in-class-strip.test.tsx
it('sem passo não renderiza nada', () => {
  const { container } = render(<NowInClassStrip stepIndex={null} activity={null} status="live" />);
  expect(container.innerHTML).toBe('');
});
it('mostra a activity e o indicador', () => {
  render(<NowInClassStrip stepIndex={1} activity="INNER JOIN e LEFT JOIN na prática" status="live" />);
  expect(screen.getByTestId('now-in-class-strip').textContent).toContain('Agora na aula');
  expect(screen.getByText('INNER JOIN e LEFT JOIN na prática')).not.toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Ao vivo');
});
it('sem activity usa Passo N; polling mostra Atualizando', () => {
  render(<NowInClassStrip stepIndex={2} activity={null} status="polling" />);
  expect(screen.getByText('Passo 3')).not.toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Atualizando');
});
// ClassroomPage.test.tsx — vi.mock de use-agenda, use-agenda-lesson (useAgendaLesson + useAgendaFaqs), use-class-events,
// use-session-clock, use-fill-viewport-height e dos filhos pesados (interactive-video-player, socratic-chat-panel,
// dynamic-faq-accordion, pedagogical-minutes-modal → () => null). O lesson mockado tem timeScript de 3 passos.
it('fase RUNNING mostra a faixa com a activity do passo atual e não o roteiro', () => {
  // state = { phase:'RUNNING', currentStepIndex:1, currentStepActivity:'INNER JOIN e LEFT JOIN na prática', ... }
  expect(screen.getByTestId('now-in-class-strip').textContent).toContain('INNER JOIN e LEFT JOIN na prática');
  expect(screen.queryByText('Subqueries e operações de conjunto')).toBeNull();
});
it('fase NOT_STARTED não mostra a faixa', ...);
it('fase ENDED esconde a faixa', ...); // currentStepIndex 2 mas phase ENDED → queryByTestId null
```
(O projeto não usa `@testing-library/jest-dom`: asserções com `textContent`, `getAttribute`, `.disabled` e `toBeNull()`, como nos testes existentes.)
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/components/classroom/__tests__/now-in-class-strip.test.tsx "src/app/(student)/classroom/[sessionId]/_components/__tests__/ClassroomPage.test.tsx"` → FAIL.
- [ ] **Step 3: Implementar** os dois componentes (`'use client'`, Tailwind no estilo da barra do topo da sala: `rounded-2xl`, borda `brand-teal`) e a ligação na `ClassroomPage` (renomear a variável local para `eventsStatus`, já existe `status` da agenda).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/components/classroom` + `grep -n "setInterval" "src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx" src/components/classroom/now-in-class-strip.tsx` (sem saída) → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/components/classroom/live-status-indicator.tsx src/components/classroom/now-in-class-strip.tsx src/components/classroom/__tests__/now-in-class-strip.test.tsx "src/app/(student)/classroom/[sessionId]/_components"
git commit -m "feat(sala): faixa Agora na aula com o passo atual e indicador ao vivo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Painel do professor `/teacher/live/[agendaId]`

**Files:**
- Modify: `src/lib/constants/routes.ts` (`ROUTES.TEACHER_LIVE: '/teacher/live'` e `teacherLivePath(agendaId)`)
- Create: `src/app/teacher/live/[agendaId]/page.tsx`
- Create: `src/app/teacher/live/[agendaId]/_components/LiveClassPage.tsx`, `.../_components/LessonScriptPanel.tsx`
- Test: `src/app/teacher/live/[agendaId]/_components/__tests__/LiveClassPage.test.tsx`, `src/lib/auth/__tests__/rbac.test.ts` (1 caso)

**Interfaces:**
- Consumes: `useAgenda(id) → { agenda, isLoading, error, notFound }` (`@/components/agendas/use-agenda`), `useAgendaLesson(id) → { lesson: AgendaLessonDTO | null, isLoading }`, `useClassEvents(id) → { state, status }`, `liveControls`/`stepTarget` (Task 2), `useLiveClassActions` (Task 3), `LiveStatusIndicator` (Task 4), `AgendaNotFound`.
- Produces:
```ts
export function teacherLivePath(agendaId: string): string; // `/teacher/live/${agendaId}`
// page.tsx
export default async function TeacherLivePage({ params }: { params: Promise<{ agendaId: string }> }): Promise<JSX.Element>;
// LiveClassPage.tsx ('use client')
export default function LiveClassPage({ agendaId }: { agendaId: string }): JSX.Element;
// LessonScriptPanel.tsx
export function LessonScriptPanel(props: { script: TimeScriptItem[]; controls: LiveControls; onGoTo(stepIndex: number): void }): JSX.Element;
```
Tela (copy exata):
- Topo: título da agenda, `className · subject`, `<LiveStatusIndicator status={status} />`.
- Barra de ações: "Iniciar aula" (em voo: "Iniciando...") só em `NOT_STARTED`, grava `{ type: 'SESSION_STARTED' }`; "Anterior" / "Próximo" gravam `{ type: 'STEP_CHANGED', stepIndex: controls.prevIndex | nextIndex }`; "Encerrar aula" (em voo: "Encerrando...") pede `window.confirm('Encerrar a aula? A turma verá a aula como encerrada e as atas dos alunos serão geradas.')` e grava `{ type: 'SESSION_ENDED' }`.
- Dica em `NOT_STARTED`: "A turma verá o primeiro passo assim que você iniciar a aula."
- `ENDED`: "Aula encerrada." e link "Ver relatórios" para `ROUTES.REPORTS`; nenhum botão de ação.
- Roteiro (`LessonScriptPanel`): `<ol aria-label="Roteiro da aula">`; cada item é um `<button>` com `timeRange`, `activity` e `description`; `aria-current="step"` no `controls.highlightedIndex`; clique chama `onGoTo(i)` só se `stepTarget(controls, i) !== null` (senão `disabled`).
- Sem plano (`!lessonLoading && lesson === null`): "Esta agenda não tem plano de aula vinculado." Roteiro vazio: "Este plano de aula não tem roteiro. Você pode iniciar e encerrar a aula, mas não há passos para conduzir." Nos dois casos "Iniciar aula"/"Encerrar aula" seguem disponíveis.
- `agenda.type !== 'CLASSROOM'`: "Só aulas podem ser conduzidas por esta tela." e nenhum controle.
- `error` do hook de ações em `<p role="alert">`.
- Layout: `grid grid-cols-1 lg:grid-cols-12 gap-6`, roteiro em `lg:col-span-7` (a coluna de 5 é da Entrega 3).

- [ ] **Step 1: Testes falhando** — `vi.mock` de `use-agenda`, `use-agenda-lesson`, `use-class-events` (estado configurável por teste), `vi.stubGlobal('fetch', ...)` devolvendo 201; `script` de 3 passos (`'Revisão: chaves e relacionamentos'`, `'INNER JOIN e LEFT JOIN na prática'`, `'Subqueries e operações de conjunto'`).
```tsx
it('NOT_STARTED: Iniciar aula grava SESSION_STARTED', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar aula' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/agendas/a1/events', expect.objectContaining({ method: 'POST', body: '{"type":"SESSION_STARTED"}' }));
  expect((screen.getByRole('button', { name: 'Iniciando...' }) as HTMLButtonElement).disabled).toBe(true); // enquanto o fetch não resolve
});
it('RUNNING no passo 2: destaque, Próximo, Anterior e clique no passo', async () => {
  // state { phase:'RUNNING', currentStepIndex:1 }
  expect(screen.getByRole('button', { name: /INNER JOIN/ }).getAttribute('aria-current')).toBe('step');
  // Próximo → {"type":"STEP_CHANGED","stepIndex":2}; Anterior → stepIndex 0; clique em /Subqueries/ → stepIndex 2
});
it('clicar no passo atual não grava nada', ...);            // fetch não chamado; botão do passo atual disabled
it('último passo desabilita Próximo; primeiro desabilita Anterior', ...);
it('409 mostra a mensagem da API', ...);                    // { success:false, error:'A aula já foi iniciada.' } → getByRole('alert')
it('Encerrar aula cancelado na confirmação não grava', ...); // vi.spyOn(window,'confirm').mockReturnValue(false) → fetch 0x; true → body '{"type":"SESSION_ENDED"}'
it('fase ENDED mostra Aula encerrada e nenhum botão de ação', ...); // queryByRole('button', { name: /Iniciar aula|Anterior|Próximo|Encerrar aula/ }) null
it('sem plano de aula mostra o aviso e ainda permite iniciar', ...); // useAgendaLesson → { lesson:null, isLoading:false }
it('agenda que não é CLASSROOM não mostra controles', ...);
it('indicador mostra Atualizando quando status é polling', ...);
// rbac.test.ts
it('painel ao vivo é só de staff', () => {
  expect(canAccessRoute('/teacher/live/abc', TEACHER)).toBe(true);
  expect(canAccessRoute('/teacher/live/abc', ADMIN)).toBe(true);
  expect(canAccessRoute('/teacher/live/abc', STUDENT)).toBe(false);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/teacher/live/[agendaId]/_components/__tests__/LiveClassPage.test.tsx" src/lib/auth/__tests__/rbac.test.ts` → FAIL (módulos não existem; o caso de RBAC já deve passar e confirma que `rbac.ts` não muda).
- [ ] **Step 3: Implementar** `teacherLivePath`, `page.tsx` (aguarda `params` e renderiza `<LiveClassPage agendaId={agendaId} />`), `LiveClassPage` e `LessonScriptPanel`. Carregamento: `Skeleton` como a `ClassroomPage`; `notFound`/`error` do `useAgenda` → `<AgendaNotFound />`. `controls = liveControls(state, lesson?.timeScript.length ?? 0, pending !== null)`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` + `grep -rn "setInterval" "src/app/teacher/live"` (sem saída) → PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/constants/routes.ts "src/app/teacher/live" src/lib/auth/__tests__/rbac.test.ts
git commit -m "feat(aula): painel ao vivo do professor com roteiro, avanço e encerramento

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Link "Conduzir aula" nas agendas da turma

**Files:**
- Modify: `src/app/(teacher)/reports/_components/ClassAgendasSection.tsx` (célula "Ações", ~L150-176)
- Test: `src/app/(teacher)/reports/_components/__tests__/ClassAgendasSection.test.tsx` (novo)

**Interfaces:**
- Consumes: `teacherLivePath` (Task 5).
- Produces: para `agenda.type === 'CLASSROOM' && agenda.status === 'LIVE'`, primeiro item das ações: `<Button size="sm" asChild><Link href={teacherLivePath(agenda.id)}>Conduzir aula</Link></Button>` (fica habilitado mesmo com outra ação pendente: é navegação).

- [ ] **Step 1: Teste falhando** — `agenda(overrides)` monta um `AgendaDTO` mínimo; `render(<ClassAgendasSection agendas={[...]} isLoading={false} error={null} onChanged={vi.fn()} />)`.
```tsx
it('CLASSROOM ao vivo tem o link Conduzir aula para o painel', () => {
  render(/* agenda({ id: 'a1', type: 'CLASSROOM', status: 'LIVE' }) */);
  expect(screen.getByRole('link', { name: 'Conduzir aula' }).getAttribute('href')).toBe('/teacher/live/a1');
});
it('sem link para aula agendada ou encerrada e para outros tipos ao vivo', () => {
  // CLASSROOM SCHEDULED, CLASSROOM COMPLETED, STUDY_GROUP LIVE
  expect(screen.queryByRole('link', { name: 'Conduzir aula' })).toBeNull();
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/(teacher)/reports/_components/__tests__/ClassAgendasSection.test.tsx"` → FAIL (link ausente).
- [ ] **Step 3: Implementar** o link com `next/link` dentro de `div.flex.justify-end.gap-2`, antes de "Encerrar".
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run "src/app/(teacher)/reports"` → PASS.
- [ ] **Step 5: Commit**
```bash
git add "src/app/(teacher)/reports/_components/ClassAgendasSection.tsx" "src/app/(teacher)/reports/_components/__tests__/ClassAgendasSection.test.tsx"
git commit -m "feat(aula): link Conduzir aula nas agendas ao vivo da turma

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Roteiro de 3 passos na aula de demonstração

**Files:**
- Modify: `prisma/seed-data/academic.ts` (`DEMO_LESSON_PLANS` ganha `timeScript`)
- Modify: `prisma/seed.ts` (L28 `EMPTY_TIME_SCRIPT` sai; L186 usa `lesson.timeScript`)
- Test: `prisma/seed-data/__tests__/academic.test.ts`

**Interfaces:**
- Produces: `DEMO_LIVE_TIME_SCRIPT: TimeScriptItem[]` exportado de `academic.ts`; o plano com `classNumber === 3` (o que `seed.ts` vincula à agenda CLASSROOM `'Modelagem Conceitual e Álgebra Relacional (JOINs)'` e publica) recebe esse roteiro; os demais, `[]`. Valores:
```ts
export const DEMO_LIVE_TIME_SCRIPT: TimeScriptItem[] = [
  { timeSeconds: 0,    timeRange: '0-10 min',  activity: 'Revisão: chaves e relacionamentos',
    description: 'Retomar chave primária, chave estrangeira e cardinalidade com o modelo da aula anterior.' },
  { timeSeconds: 600,  timeRange: '10-30 min', activity: 'INNER JOIN e LEFT JOIN na prática',
    description: 'Comparar os resultados das duas junções sobre Estudantes e Matriculas.',
    socraticQuestion: 'O que acontece com um estudante sem matrícula num INNER JOIN?' },
  { timeSeconds: 1800, timeRange: '30-50 min', activity: 'Subqueries e operações de conjunto',
    description: 'Reescrever uma junção como subquery e combinar consultas com UNION e EXCEPT.' },
];
```

- [ ] **Step 1: Teste falhando**
```ts
it('aula 3 tem roteiro de 3 passos válido para eventos de aula', () => {
  const plan = DEMO_LESSON_PLANS.find((p) => p.classNumber === 3)!;
  const script = timeScriptSchema.parse(plan.timeScript);
  expect(script.map((s) => s.activity)).toEqual(['Revisão: chaves e relacionamentos', 'INNER JOIN e LEFT JOIN na prática', 'Subqueries e operações de conjunto']);
  for (const s of script) { expect(s.activity.length).toBeLessThanOrEqual(200); expect(s.timeRange.length).toBeLessThanOrEqual(40); }
  expect(script.map((s) => s.timeSeconds)).toEqual([0, 600, 1800]);
});
it('as outras aulas seguem sem roteiro', () => {
  expect(DEMO_LESSON_PLANS.filter((p) => p.classNumber !== 3).every((p) => p.timeScript.length === 0)).toBe(true);
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run prisma/seed-data/__tests__/academic.test.ts` → FAIL (`timeScript` undefined).
- [ ] **Step 3: Implementar** — `timeScript: DEMO_MEETINGS[index].classNumber === 3 ? DEMO_LIVE_TIME_SCRIPT : []` no `map`; em `seed.ts`, `timeScript: lesson.timeScript`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx tsc --noEmit` + rodar o seed só no banco docker descartável de teste, porta 5433 (`DATABASE_URL=<DATABASE_URL do .env com a porta trocada para 5433> npm run db:seed`, nunca imprimir a URL), seguido de um pequeno script Prisma que confirma 3 itens no `timeScript` do plano da `classNumber 3` → PASS. Nunca rode o seed no banco de dev (5432): ele apaga dados criados pelo usuário.
- [ ] **Step 5: Commit**
```bash
git add prisma/seed-data/academic.ts prisma/seed.ts prisma/seed-data/__tests__/academic.test.ts
git commit -m "feat(seed): roteiro de 3 passos na aula de demonstração

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Playwright: professor conduz e aluno acompanha

**Files:**
- Modify: `package.json` (devDependency `@playwright/test`; script `"test:e2e:ui": "playwright test"`), `package-lock.json`
- Create: `playwright.config.ts`, `tests/playwright/aula-ao-vivo.spec.ts`
- Modify: `vitest.config.ts` (`exclude` ganha `'tests/playwright/**'`), `.gitignore` (`test-results/`, `playwright-report/`, `playwright/.cache/`)
- Modify: `README.md` e `README.pt-BR.md` (uma linha na seção de eventos de aula: como rodar `npm run test:e2e:ui`, pré-requisitos e que o CI não roda)

**Interfaces:**
- Consumes: seed (Task 7), `DEMO_CREDENTIALS` (`src/lib/constants/demo-credentials.ts`: professor `PROF001`/`prof123`, aluno `202601001`/`aluno123`), login em `/login` (`#identifier`, `#password`, botão "Acessar Ambiente"), painel (Task 5), faixa (Task 4).
- Produces: `playwright.config.ts`:
```ts
export default defineConfig({
  testDir: './tests/playwright', timeout: 60_000, fullyParallel: false, workers: 1,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
```

- [ ] **Step 1: Escrever o teste** (`npm i -D @playwright/test` e `npx playwright install chromium` antes)
  - `beforeAll`: `const prisma = new PrismaClient()` (lê `DATABASE_URL` do `.env`, o mesmo banco do `npm run dev`); agenda `findFirstOrThrow({ where: { title: 'Modelagem Conceitual e Álgebra Relacional (JOINs)', type: 'CLASSROOM' } })`; em vez de lançar erro quando o `timeScript` tem menos de 3 itens, o teste o define: `lessonPlan.update({ where: { id: agenda.lessonPlanId }, data: { timeScript: DEMO_LIVE_TIME_SCRIPT } })` (import de `prisma/seed-data/academic.ts`), e `steps` vêm de `DEMO_LIVE_TIME_SCRIPT`; `classEvent.deleteMany({ where: { agendaId } })`; `agenda.update({ status: 'LIVE', startTime: agora − 5 min, endTime: agora + 60 min })`. `afterAll`: `$disconnect()` e nada mais (o roteiro fica; é dado de demonstração).
  - `login(page, identifier, password)`: `goto('/login')`, preencher `#identifier` e `#password`, clicar `getByRole('button', { name: 'Acessar Ambiente' })`, `waitForURL((u) => !u.pathname.startsWith('/login'))`.
  - Um teste, dois contextos (`browser.newContext()`), `const strip = student.getByTestId('now-in-class-strip')`:
```ts
test('professor inicia, avança, volta e encerra; aluno vê só o passo atual', async ({ browser }) => {
  await teacher.goto(`/teacher/live/${agendaId}`); await student.goto(`/classroom/${agendaId}`);
  await expect(strip).toHaveCount(0);
  await teacher.getByRole('button', { name: 'Iniciar aula' }).click();
  await expect(strip).toContainText(steps[0], { timeout: 5_000 });
  await expect(teacher.locator('[aria-current="step"]')).toContainText(steps[0], { timeout: 5_000 });
  await teacher.getByRole('button', { name: 'Próximo' }).click();
  await expect(strip).toContainText(steps[1], { timeout: 5_000 });
  await expect(student.getByText(steps[2])).toHaveCount(0);            // aluno não vê o roteiro
  await teacher.getByRole('button', { name: 'Anterior' }).click();
  await expect(strip).toContainText(steps[0], { timeout: 5_000 });
  teacher.once('dialog', (d) => d.accept());
  await teacher.getByRole('button', { name: 'Encerrar aula' }).click();
  await expect(teacher.getByText('Aula encerrada.')).toBeVisible({ timeout: 5_000 });
  await expect(strip).toHaveCount(0, { timeout: 5_000 });
  expect((await prisma.agenda.findUniqueOrThrow({ where: { id: agendaId } })).status).toBe('COMPLETED');
});
```
  (`steps` = `activity` dos 3 primeiros itens lidos do banco no `beforeAll`.)
- [ ] **Step 2: Rodar e ver falhar sem a app** — com o servidor de dev parado e `PLAYWRIGHT_BASE_URL=http://localhost:3999 npm run test:e2e:ui` → FAIL (conexão recusada), o que prova que o spec roda e não passa à toa. `npx vitest run` → a suíte não pega `tests/playwright` (contagem de arquivos igual à de antes).
- [ ] **Step 3: Implementar** config, script, exclude, `.gitignore` e as linhas do README (EN e PT): pré-requisitos: dev server ou `webServer`, `.env` com o banco de dev, Chromium instalado via `npx playwright install chromium`; nenhum seed necessário além das contas de demonstração; "O CI não roda este teste." / "CI does not run this test."
- [ ] **Step 4: Rodar e ver passar** — `npm run test:e2e:ui` (o `beforeAll` do spec prepara a agenda; sobe `npm run dev` ou reaproveita o que estiver na 3000) → 1 passed; `npx vitest run` e `npx tsc --noEmit` → verdes.
- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json playwright.config.ts tests/playwright vitest.config.ts .gitignore README.md README.pt-BR.md
git commit -m "test(aula): Playwright do painel ao vivo com professor e aluno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final

- `npx vitest run` (suíte inteira), `npx tsc --noEmit`, `npm run lint` → verdes.
- `grep -rn "setInterval" "src/app/(student)/classroom" "src/app/teacher/live" src/components/classroom` → sem saída.
- `npm run test:e2e:ui` → 1 passed (o `beforeAll` do spec prepara a agenda).
- Manual: em `/reports`, a agenda CLASSROOM ao vivo mostra "Conduzir aula"; o painel em duas abas (uma clicando "Iniciar aula" depois da outra) mostra o 409 "A aula já foi iniciada." na segunda.

## Critérios de aceite (Entrega 2, spec §6)

| Critério | Cumprido em |
|---|---|
| Professor inicia, avança, volta e encerra | Task 2, Task 3, Task 5, Task 8 |
| Aluno vê o passo sem ver o roteiro | Task 1, Task 4, Task 8 |
| Encerrar gera atas como o `PATCH` atual | Entrega 1 (`completeAgenda`); confirmação na Task 5; status `COMPLETED` conferido na Task 8 |
| Link "Conduzir aula" em `ClassAgendasSection.tsx` (CLASSROOM e LIVE) | Task 6 |
| Indicador "ao vivo" / "atualizando" | Task 4 (componente), Task 5 (painel) |
| `@playwright/test` + `playwright.config.ts` e fluxo verde | Task 7 (seed), Task 8 |
