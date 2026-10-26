# Follow-ups de aulas ancoradas em capítulos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as pendências da feature de aulas por capítulos: um laço de streaming compartilhado, geração de aula que não falha sem embeddings, confirmação antes de sobrescrever títulos personalizados, proteção dos vínculos de capítulos de outros professores, unidades do plano geradas a partir da distribuição (destrava o gerador de avaliações) e um editor de aula dividido em hooks.

**Architecture:** `collectStream` (novo, em `src/domains/agents/`) substitui o laço `for await` dos quatro serviços de IA da feature e é usado pelo novo `plan-units-service`. A geração de aula ganha uma amostra por capítulo (`sampleChunksByChapter`) como segunda fonte antes do 422. A edição/reextração de capítulos ganha uma guarda que lê os vínculos com rótulos (`listChapterLinkDetails`) e lança `DomainError(409, ..., details)`; `DomainError` passa a carregar `details` e `apiError` os devolve. Unidades: prompt + validação pura em `plan-units-prompt.ts`, serviço com deps injetáveis, rota `POST /teacher/schedules/[id]/generate-units`, botão no cronograma e card editável no plano salvo pelo `PUT` já existente. O editor de aula extrai `useLessonGeneration` e `useLessonStatus` sem mudar textos nem testes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 6 + Postgres, zod, vitest 3 + `@testing-library/react` 16 + jsdom (`// @vitest-environment jsdom`, sem `jest-dom`/`user-event`: `fireEvent`, `renderHook` e asserções nativas).

**Spec:** docs/superpowers/specs/2026-10-26-aulas-capitulos-follow-ups-design.md

## Global Constraints

- Nunca inventar conteúdo: provider mock, `fallback`, exceção ou JSON inválido → `DomainError(503, <mensagem do contexto>)` (`LESSON_AI_UNAVAILABLE_MESSAGE`, `DISTRIBUTION_AI_UNAVAILABLE_MESSAGE`, novo `PLAN_UNITS_AI_UNAVAILABLE_MESSAGE` em `src/lib/constants/teaching.ts`). Nenhum texto de reserva.
- Sem fonte → `DomainError(422, ...)` com mensagem específica (`NO_INDEXED_CHAPTER_CONTENT`, novo `NO_DISTRIBUTED_CHAPTERS`).
- Toda chamada de IA desta entrega passa por `collectStream(deps.streamChat, ...)`; `deps.streamChat` padrão é `loggedStreamChat` (`src/domains/telemetry/services/logged-stream-chat.ts`).
- Rotas do professor: `requireUser(req, [Role.TEACHER, Role.ADMIN])`, dono via `assertOwner` (`src/domains/teaching/ownership.ts:5`) dentro do service, erros por `apiError`.
- Sem migrations: `TeachingPlan.unitsContent` já é `Json`; `TeachingPlan` não tem relação `teacher` (o nome do professor sai de uma segunda consulta a `user`).
- Trabalho direto em `main`, sem branch, worktree nem PR; `git add` com caminhos explícitos.
- Commits em pt-BR: título, linha em branco e `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (use `git commit -m "<título>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`).
- Nunca commitar `package.json`, `package-lock.json`, `.mcp.json`.
- Componentes de cliente não importam `@prisma/client` (nem `Role`): papel do usuário comparado com o literal `'ADMIN'` via `useCurrentUser` (`src/components/layout/use-current-user.ts`).
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar isolado.
- Gate por task: `npx tsc --noEmit` sem erros novos e `npx next lint --file <arquivos tocados>` limpo.

## Review Focus

1. **Contagem diferente com vínculo de aula de outro professor devolve 409 com `details` e não grava; vínculos só do próprio professor não bloqueiam e seguem em `lostLessonLinks`.** Testes em Task 4 (`'contagem diferente com aula de outro professor → 409 com details e nada gravado'`, `'vínculos só do próprio professor não bloqueiam'`).
2. **`force` só vale para ADMIN: TEACHER com `force` recebe 403 antes de ler o material; ADMIN com `force` grava mesmo com vínculos alheios.** Teste em Task 4 (`'force: TEACHER → 403; ADMIN grava'`).
3. **A amostra por capítulo só entra quando as buscas filtradas devolvem zero, e as citações passam a vir da amostra.** Teste em Task 2 (`'busca vazia usa a amostra por capítulo e cita a amostra; busca não vazia não amostra'`).
4. **Aula com capítulos em duas unidades (ou em nenhuma) invalida a resposta: 503 e nada gravado.** Testes em Task 6 (`'aula com capítulos em duas unidades ou em nenhuma é inválida'`) e Task 7 (`'resposta inválida, fallback ou exceção → 503 sem gravar'`).
5. **O `PUT` do plano só envia `unitsContent` quando o professor editou o card; abrir e salvar sem mexer não sobrescreve unidades geradas no cronograma.** Teste em Task 9 (`'PUT só envia unitsContent quando o card foi editado'`).

---

## Estrutura de arquivos

**IA compartilhada**
- `src/domains/agents/collect-stream.ts` (novo) — `collectStream`.
- `src/domains/teaching/services/plan-generation-service.ts`, `src/domains/rag/services/chapter-extraction-service.ts`, `src/domains/teaching/services/chapter-distribution-service.ts`, `src/domains/teaching/services/lesson-generation-service.ts` — `askModel`/`askRefine` usam `collectStream`.

**Geração de aula**
- `src/domains/rag/services/chunk-repository.ts` — `sampleChunksByChapter` e mapeamento `toDidacticChunk` compartilhado com `sampleChunksByMaterial`.
- `src/domains/teaching/services/lesson-generation-service.ts` — `LessonGenerationDeps.sampleByChapter`.

**Cronograma**
- `src/components/teaching/use-schedules.ts` — `ScheduleLesson.topicTitle`, `generatePlanUnits`.
- `src/app/teacher/schedules/_components/SchedulesPage.tsx` — novo confirm da distribuição, botão de unidades.

**Vínculos de capítulos**
- `src/lib/api/domain-error.ts`, `src/lib/api/api-error.ts` — `details`.
- `src/domains/rag/services/chapter-repository.ts` — `listChapterLinkDetails`, tipos `ChapterLinkDetail`, `ChapterLinkConflict`.
- `src/domains/rag/services/chapter-extraction-service.ts` — `ChapterWriteOptions`, guarda de vínculos.
- `src/app/api/v1/library/materials/[id]/chapters/route.ts`, `.../chapters/extract/route.ts` — `?force=1` e usuário.
- `src/components/assessments/use-assessments.ts` — `RequestError.details`.
- `src/app/teacher/materials/_components/use-material-chapters.ts`, `MaterialChaptersPanel.tsx` — `force` e lista de aulas afetadas.

**Unidades do plano**
- `src/lib/constants/teaching.ts` — `NO_DISTRIBUTED_CHAPTERS`, `PLAN_UNITS_AI_UNAVAILABLE_MESSAGE`.
- `src/domains/agents/prompts/plan-units-prompt.ts` (novo) — mensagens, parse tolerante, validação.
- `src/domains/teaching/services/course-schedule-repository.ts` — `findScheduleForDistribution` passa a trazer `topicTitle` e capítulos das aulas.
- `src/domains/teaching/services/plan-units-service.ts` (novo) — `generateUnitsFromDistribution`.
- `src/app/api/v1/teacher/schedules/[id]/generate-units/route.ts` (novo).
- `src/lib/validators/teaching-plan.validator.ts` — `planUnitSchema`, `PlanUnit`, `unitsContent` validado.
- `src/app/teacher/plans/new/_components/PlanUnitsCard.tsx` (novo), `TeachingPlanNewPage.tsx` — card e `PUT`.

**Editor de aula**
- `src/app/teacher/lessons/_components/use-lesson-generation.ts` (novo), `use-lesson-status.ts` (novo), `LessonEditor.tsx`.

---

### Task 1: `collectStream` e migração dos quatro laços

**Files:**
- Create: `src/domains/agents/collect-stream.ts`
- Modify: `src/domains/teaching/services/plan-generation-service.ts:118-133`, `src/domains/rag/services/chapter-extraction-service.ts:64-90`, `src/domains/teaching/services/chapter-distribution-service.ts:55-75`, `src/domains/teaching/services/lesson-generation-service.ts:40-59` e `:117-136`
- Test: `src/domains/agents/__tests__/collect-stream.test.ts`; suítes existentes `plan-generation-service.test.ts`, `chapter-extraction-service.test.ts`, `chapter-distribution-service.test.ts`, `lesson-generation-service.test.ts` sem alteração

**Interfaces:**
- Consumes: `StreamChatFn` (`@/domains/telemetry/services/logged-stream-chat`), `AIMessage` (`@/lib/ai-provider`).
- Produces:
  ```ts
  export type CollectStreamOptions = { temperature: number; maxTokens: number };
  export async function collectStream(
    streamChat: StreamChatFn, messages: AIMessage[], options: CollectStreamOptions
  ): Promise<{ text: string; fallback: boolean }>
  ```
  Decisão: `collectStream` não captura exceções; cada `askModel`/`askRefine` mantém seu `try/catch` e o `console.warn` atual. Os demais laços do repositório (`assessment-service`, `draft-service`, `minutes-service`, `answer-judge`, `document-inspector`, `chat-service`) ficam fora (fora da spec).

- [ ] **Step 1: Escrever o teste que falha** — `collect-stream.test.ts`:
  - `'concatena os tokens e repassa temperature e maxTokens'`: `streamChat` gera `{token:'a'}`, `{token:'b'}`; espera `{ text: 'ab', fallback: false }` e `streamChat` chamado com `(messages, { temperature: 0.2, maxTokens: 100 })`.
  - `'qualquer chunk com fallback marca fallback'`: chunks `{token:'x', fallback:false}`, `{token:'y', fallback:true}` → `{ text: 'xy', fallback: true }`.
  - `'exceção do stream propaga'`: gerador lança `new Error('boom')` → `rejects.toThrow('boom')`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/agents/__tests__/collect-stream.test.ts` — Expected: FAIL com "Failed to resolve import \"../collect-stream\"".
- [ ] **Step 3: Implementar `collectStream` em `src/domains/agents/collect-stream.ts`** e trocar o laço nos cinco pontos por `const { text, fallback } = await collectStream(deps.streamChat, messages, { temperature: <constante atual>, maxTokens: <atual> })`, mantendo o `return fallback ? null : parse...(text)` de cada um (refino: `text.trim() || null`).
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/domains/agents/__tests__/collect-stream.test.ts src/domains/teaching/services/__tests__/plan-generation-service.test.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts` — Expected: PASS. Conferir `grep -n "for await" ` nos quatro serviços: nenhuma ocorrência.
- [ ] **Step 5: Commit** — `git add src/domains/agents/collect-stream.ts src/domains/agents/__tests__/collect-stream.test.ts src/domains/teaching/services/plan-generation-service.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/teaching/services/chapter-distribution-service.ts src/domains/teaching/services/lesson-generation-service.ts && git commit -m "refactor(ia): laço de streaming compartilhado em collectStream" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 2: Amostra por capítulo quando a busca não acha nada

**Files:**
- Modify: `src/domains/rag/services/chunk-repository.ts:58-77`
- Modify: `src/domains/teaching/services/lesson-generation-service.ts:23-34` (deps), `:76-84` (geração), `:151-157` (refino)
- Test: `src/domains/rag/services/__tests__/chunk-repository.sample.test.ts` (novo); `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // chunk-repository.ts
  export async function sampleChunksByChapter(chapterIds: string[], perChapter: number, max: number): Promise<DidacticChunk[]>
  // lesson-generation-service.ts
  export type LessonGenerationDeps = { findLesson; search; sampleByChapter: typeof sampleChunksByChapter; streamChat: StreamChatFn };
  export const SAMPLE_PER_CHAPTER = 4; export const SAMPLE_MAX = 12;
  ```
  Decisões: uma `db.materialChunk.findMany` por capítulo (`where: { chapterId }`, `orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }]`, `take: perChapter`, mesmo `include` de `sampleChunksByMaterial`), concatenadas na ordem de `chapterIds` e cortadas em `max`. O mapeamento linha → `DidacticChunk` vira `toDidacticChunk` local, usado pelas duas funções. Geração e refino chamam `deps.sampleByChapter(allowedChapterIds, SAMPLE_PER_CHAPTER, SAMPLE_MAX)` só quando o resultado deduplicado da busca é vazio; se a amostra também vier vazia, 422 `NO_INDEXED_CHAPTER_CONTENT`. O refino usa a amostra inteira como `chunks`.

- [ ] **Step 1: Escrever o teste que falha**
  - `chunk-repository.sample.test.ts` (mock de `@/lib/db` no padrão de `chapter-repository.test.ts`): `'amostra por capítulo respeita perChapter, ordem dos capítulos e max'` — `findMany` devolve 2 linhas por chamada; `sampleChunksByChapter(['ch1','ch2','ch3'], 2, 5)` chama `findMany` 3 vezes com `where: { chapterId: 'ch1' }` (…`ch2`, `ch3`), `take: 2`, e devolve 5 itens começando pelos de `ch1`, no formato `{ id, materialId, bookTitle, author, chapter, pageNumber, content }`.
  - `lesson-generation-service.test.ts`: `makeDeps` ganha `sampleByChapter: vi.fn().mockResolvedValue(opts.sample ?? [])` (sem mudar asserts existentes). Novo teste `'busca vazia usa a amostra por capítulo e cita a amostra; busca não vazia não amostra'`: com `chunks: []` e `sample: [{ ...chunk, id: 's1', pageNumber: 50 }]`, `generateLessonContent` devolve `citations: ['[Sistemas de Banco de Dados · Cap. 3, pág. 50]']` e `sampleByChapter` foi chamado com `(['ch3'], 4, 12)`; com o padrão (`[chunk]`) `sampleByChapter` não é chamado.
  - `'refino: busca vazia usa a amostra; amostra vazia → 422 sem chamar o modelo'`: `refineLessonField` com `chunks: []`, `sample: [chunk]` devolve o texto; com `sample: []` rejeita `{ status: 422, message: NO_INDEXED_CHAPTER_CONTENT }` e `streamChat` não chamado.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/services/__tests__/chunk-repository.sample.test.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts` — Expected: FAIL com "sampleChunksByChapter is not a function" e "expected 422 to be …" (geração lança 422 com amostra disponível).
- [ ] **Step 3: Implementar `sampleChunksByChapter` em `chunk-repository.ts` e o fallback em `lesson-generation-service.ts`** (`defaultDeps.sampleByChapter = sampleChunksByChapter`).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando — Expected: PASS (inclusive `'sem chunks → 422 com a mensagem exata'` e `'sem chunks → 422; sem chamar o modelo'`, agora com amostra vazia).
- [ ] **Step 5: Commit** — `git add src/domains/rag/services/chunk-repository.ts src/domains/rag/services/__tests__/chunk-repository.sample.test.ts src/domains/teaching/services/lesson-generation-service.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts && git commit -m "fix(aulas): geração usa amostra dos capítulos quando a busca não acha trechos" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 3: Confirmação da distribuição considera títulos personalizados

**Files:**
- Modify: `src/components/teaching/use-schedules.ts:7-12`
- Modify: `src/app/teacher/schedules/_components/SchedulesPage.tsx:19` e `:62-64`
- Test: `src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx`

**Interfaces:**
- Produces: `ScheduleLesson = { id; classNumber; topicTitle: string; status: 'DRAFT' | 'PUBLISHED'; chapters: ... }` (o `GET /teacher/lessons?scheduleId=` já devolve todas as colunas via `listLessonsBySchedule`, `lesson-plan-repository.ts:4-16`; nada muda no servidor).
- Decisão: `DISTRIBUTE_CONFIRM = 'Algumas aulas em rascunho já têm capítulos ou título personalizado. Substituir?'`; condição `lessons.some((l) => l.status === LESSON_STATUS.DRAFT && (l.chapters.length > 0 || l.topicTitle.trim() !== \`Aula ${l.classNumber}\`))` (`LESSON_STATUS` de `@/lib/constants/teaching`).

- [ ] **Step 1: Escrever o teste que falha** — fixtures existentes de `lessonsState.lessons` ganham `topicTitle: 'Aula 1'`; o teste `'com aulas já mapeadas pede confirmação; cancelar não chama a API'` passa a esperar o texto novo. Novos:
  - `'aula em rascunho sem capítulos com título personalizado pede confirmação; cancelar não chama a API'`: `{ id:'l1', classNumber:1, topicTitle:'Modelagem ER', status:'DRAFT', chapters:[] }`, `confirm` → `false`; espera `confirm` com `'Algumas aulas em rascunho já têm capítulos ou título personalizado. Substituir?'` e `distributeChapters` não chamado.
  - `'aula publicada com título personalizado não pede confirmação'`: mesmo item com `status:'PUBLISHED'` → `confirm` não chamado, `distributeChapters` chamado com `'sch-9'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx` — Expected: FAIL com "expected \"spy\" to be called with arguments: [ 'Algumas aulas em rascunho…' ]".
- [ ] **Step 3: Implementar o tipo e a condição** em `use-schedules.ts` e `SchedulesPage.tsx`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/components/teaching/use-schedules.ts src/app/teacher/schedules/_components/SchedulesPage.tsx src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx && git commit -m "fix(cronograma): confirmar antes de substituir títulos personalizados" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 4: Guarda dos vínculos de capítulos no serviço

**Files:**
- Modify: `src/lib/api/domain-error.ts` (todo), `src/lib/api/api-error.ts:20`
- Modify: `src/domains/rag/services/chapter-repository.ts` (após `listChapterLinks`, `:20-27`)
- Modify: `src/domains/rag/services/chapter-extraction-service.ts:30-37` (deps), `:116-177` (`saveDrafts`, `extractAndSaveChapters`, `reextractMaterialChapters`, `replaceManualChapters`)
- Test: `src/lib/api/__tests__/api-error.test.ts`, `src/domains/rag/services/__tests__/chapter-repository.test.ts`, `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // domain-error.ts
  constructor(public status: number, message: string, public details?: unknown)
  // chapter-repository.ts
  export type ChapterLinkConflict = { disciplina: string; turma: string; classNumber: number; topicTitle: string; professor: string };
  export type ChapterLinkDetail = ChapterLinkConflict & { lessonPlanId: string; teacherId: string };
  export async function listChapterLinkDetails(materialId: string): Promise<ChapterLinkDetail[]>
  // chapter-extraction-service.ts
  export const LINKS_CONFLICT_MESSAGE = 'Alterar o número de capítulos desfaz vínculos de aulas de outros professores.';
  export const FORCE_ADMIN_ONLY_MESSAGE = 'Apenas administradores podem forçar a alteração dos capítulos.';
  export type ChapterWriteOptions = { user: { id: string; role: Role }; force?: boolean };
  export async function replaceManualChapters(materialId: string, drafts: ChapterDraft[], opts: ChapterWriteOptions, deps?: ChapterExtractionDeps): Promise<ChapterSaveResult>
  export async function reextractMaterialChapters(materialId: string, opts: ChapterWriteOptions, deps?: ChapterExtractionDeps): Promise<ChapterSaveResult>
  export async function extractAndSaveChapters(materialId: string, input: ExtractionInput, deps?: ChapterExtractionDeps, opts?: ChapterWriteOptions): Promise<ChapterSaveResult>
  ```
  `ChapterExtractionDeps.repo` ganha `listChapterLinkDetails`. `listChapterLinks` não muda de contrato.
- Decisões:
  - `apiError`: `fail(err.status, err.message, err.details)` (sem `details` o corpo continua `{ success, error }`).
  - `listChapterLinkDetails`: `db.lessonPlanChapter.findMany({ where: { chapter: { materialId } }, select: lessonPlan → id, classNumber, topicTitle, courseSchedule.teachingPlan → teacherId, subject.discipline.name, subject.class.name })`, deduplicado por `lessonPlanId`, ordenado por disciplina e `classNumber`; nomes por `db.user.findMany({ where: { id: { in } }, select: { id, name } })` (sem relação `teacher` no schema); professor ausente → `'—'`.
  - `FORCE_ADMIN_ONLY_MESSAGE` (403) é checado primeiro, antes de buscar o material.
  - A guarda roda dentro de `saveDrafts` só quando `opts` existe, depois de ler `oldLinks` e antes de `replaceChapters`: se `drafts.length !== oldLinks.length` e não `force`, lê `listChapterLinkDetails` e, se houver itens com `teacherId !== opts.user.id`, lança `new DomainError(409, LINKS_CONFLICT_MESSAGE, conflitos)` com só os campos de `ChapterLinkConflict`. O upload (`library-service`) continua chamando `extractAndSaveChapters` sem `opts`.

- [ ] **Step 1: Escrever o teste que falha**
  - `api-error.test.ts`: `'DomainError com details devolve details no corpo'` → `apiError(new DomainError(409, 'x', [{ a: 1 }]))` responde 409 e `{ success: false, error: 'x', details: [{ a: 1 }] }`.
  - `chapter-repository.test.ts`: `'listChapterLinkDetails deduplica por aula e resolve o nome do professor'` — `lessonPlanChapter.findMany` devolve a mesma aula duas vezes (dois capítulos) e uma aula de `t2`; `user.findMany` devolve `[{ id: 't2', name: 'Ana' }]`; espera 2 itens, o de `t2` com `professor: 'Ana'`, o outro com `'—'`.
  - `chapter-extraction-service.test.ts`: chamadas existentes passam a `replaceManualChapters('m1', drafts, { user: teacher }, depsWith())` e `reextractMaterialChapters('m1', { user: teacher }, depsWith())` (asserts iguais); `depsWith` ganha `listChapterLinkDetails`. Novos, com `teacher = { id: 't1', role: Role.TEACHER }`, `admin = { id: 'a1', role: Role.ADMIN }`, `listChapterLinks` com 2 capítulos vinculados e drafts com 3:
    - `'contagem diferente com aula de outro professor → 409 com details e nada gravado'`: `listChapterLinkDetails` devolve `[{ lessonPlanId:'l9', teacherId:'t2', disciplina:'BD', turma:'A', classNumber:4, topicTitle:'Joins', professor:'Ana' }]` → rejeita `{ status: 409, message: LINKS_CONFLICT_MESSAGE, details: [{ disciplina:'BD', turma:'A', classNumber:4, topicTitle:'Joins', professor:'Ana' }] }`; `replaceChapters` não chamado.
    - `'vínculos só do próprio professor não bloqueiam'`: detalhes só com `teacherId:'t1'` → grava e devolve `lostLessonLinks` igual ao de hoje.
    - `'mesma contagem nunca bloqueia'`: 2 drafts e vínculos de `t2` → grava; `listChapterLinkDetails` não chamado.
    - `'force: TEACHER → 403; ADMIN grava'`: `{ user: teacher, force: true }` → `{ status: 403, message: FORCE_ADMIN_ONLY_MESSAGE }` e `findMaterial` não chamado; `{ user: admin, force: true }` com vínculos de `t2` → `replaceChapters` chamado.
    - `'reextração com contagem diferente e vínculo alheio → 409'`: outline de 3 capítulos via `readNavigation` → 409 e `replaceChapters` não chamado.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/api/__tests__/api-error.test.ts src/domains/rag/services/__tests__/chapter-repository.test.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts` — Expected: FAIL com "listChapterLinkDetails is not a function" e "promise resolved … instead of rejecting".
- [ ] **Step 3: Implementar `DomainError.details`, `apiError`, `listChapterLinkDetails` e a guarda** conforme as decisões acima.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando, mais `npx vitest run src/domains/rag/services/__tests__/library-service.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/api/domain-error.ts src/lib/api/api-error.ts src/lib/api/__tests__/api-error.test.ts src/domains/rag/services/chapter-repository.ts src/domains/rag/services/__tests__/chapter-repository.test.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts && git commit -m "feat(biblioteca): proteger vínculos de capítulos de aulas de outros professores" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 5: Rotas com `?force=1` e painel com aulas afetadas

**Files:**
- Modify: `src/app/api/v1/library/materials/[id]/chapters/route.ts:19-35`, `.../chapters/extract/route.ts:7-15`
- Modify: `src/components/assessments/use-assessments.ts:72-94` (`RequestError`, `requestJson`)
- Modify: `src/app/teacher/materials/_components/use-material-chapters.ts:37-44`
- Modify: `src/app/teacher/materials/_components/MaterialChaptersPanel.tsx:71-118` e `:177-187`
- Test: `src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts`, `src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx`

**Interfaces:**
- Consumes: `replaceManualChapters(id, drafts, { user, force })`, `reextractMaterialChapters(id, { user, force })` (Task 4); `useCurrentUser()`.
- Produces:
  ```ts
  // use-assessments.ts
  class RequestError { constructor(message: string, readonly status: number, readonly details?: unknown) }
  // use-material-chapters.ts
  export type LinkConflict = { disciplina: string; turma: string; classNumber: number; topicTitle: string; professor: string };
  export function saveMaterialChapters(id: string, chapters: { title: string; startPage: number }[], force?: boolean): Promise<ChapterSaveResult>
  export function extractMaterialChapters(id: string, force?: boolean): Promise<ChapterSaveResult>
  ```
- Decisões: rotas leem `force = new URL(req.url).searchParams.get('force') === '1'` e repassam o `user` de `requireUser`. Cliente acrescenta `?force=1` só quando `force`. No painel, `RequestError` com `status === 409` e `details` em array guarda `conflict = { items, retry }` (retry = a mesma ação com `force = true`) e renderiza, no lugar do `<p role="alert">`, um `<div role="alert">` com a mensagem do servidor e `<ul>` de itens `` `${disciplina} · ${turma} · Aula ${classNumber}: ${topicTitle} (${professor})` ``; se `user?.role === 'ADMIN'`, botão `'Forçar mesmo assim'` que chama `run(retry)`. Qualquer nova ação limpa `conflict`.

- [ ] **Step 1: Escrever o teste que falha**
  - `route.test.ts`: os `toHaveBeenCalledWith` existentes passam a `('m1', [{ title: 'Cap 1', startPage: 3 }], { user: teacher, force: false })` e `('m1', { user: teacher, force: false })`. Novos: `'PUT e POST com ?force=1 repassam force: true'`; `'409 do service devolve details no corpo'` (`mockRejectedValue(new DomainError(409, LINKS_CONFLICT_MESSAGE, [item]))` → status 409, `{ success: false, error: LINKS_CONFLICT_MESSAGE, details: [item] }`).
  - `MaterialChaptersPanel.test.tsx`: helper que responde `PUT ${BASE}` com status 409 e `{ success:false, error:'Alterar o número de capítulos desfaz vínculos de aulas de outros professores.', details:[{ disciplina:'BD', turma:'A', classNumber:4, topicTitle:'Joins', professor:'Ana' }] }` e `GET /api/v1/auth/me` com o papel do teste.
    - `'409 mostra as aulas afetadas e o professor não vê o botão de forçar'`: papel `TEACHER`; após salvar, `getByRole('alert').textContent` contém `'BD · A · Aula 4: Joins (Ana)'`; `queryByRole('button', { name: 'Forçar mesmo assim' })` é `null`.
    - `'admin força e o painel repete o PUT com force=1'`: papel `ADMIN`; clicar `'Forçar mesmo assim'` dispara `PUT ${BASE}?force=1` com o mesmo corpo e, com resposta 200, o alerta some.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts" src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx` — Expected: FAIL com "expected last call … { user: …, force: false }" e "Unable to find role=\"alert\" containing BD · A · Aula 4".
- [ ] **Step 3: Implementar rotas, `RequestError.details`, cliente e painel** conforme as decisões.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando — Expected: PASS (os 3 testes antigos do painel continuam verdes: o `GET /api/v1/auth/me` inesperado é engolido pelo `.catch` do hook).
- [ ] **Step 5: Commit** — `git add "src/app/api/v1/library/materials/[id]/chapters/route.ts" "src/app/api/v1/library/materials/[id]/chapters/extract/route.ts" "src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts" src/components/assessments/use-assessments.ts src/app/teacher/materials/_components/use-material-chapters.ts src/app/teacher/materials/_components/MaterialChaptersPanel.tsx src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx && git commit -m "feat(biblioteca): painel mostra aulas afetadas e admin pode forçar" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 6: Prompt e validação das unidades

**Files:**
- Create: `src/domains/agents/prompts/plan-units-prompt.ts`
- Modify: `src/lib/constants/teaching.ts:79-88` (após `DISTRIBUTION_AI_UNAVAILABLE_MESSAGE`)
- Test: `src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts`

**Interfaces:**
- Consumes: `PlanChapterBook` (`@/domains/teaching/services/plan-chapters-service`), `AIMessage`.
- Produces:
  ```ts
  // teaching.ts
  export const NO_DISTRIBUTED_CHAPTERS = 'Distribua os capítulos antes de gerar as unidades.';
  export const PLAN_UNITS_AI_UNAVAILABLE_MESSAGE =
    'IA indisponível no momento. Tente novamente mais tarde ou cadastre as unidades manualmente no plano.';
  // plan-units-prompt.ts
  export type PlanUnitItem = { unitNumber: number; title: string; topics: string[]; chapterIds: string[] };
  export type PlanUnitsPromptInput = {
    subjectName: string; syllabus: string; objectives: string;
    lessons: { classNumber: number; topicTitle: string; chapterIds: string[] }[];
    books: PlanChapterBook[];
  };
  export function buildPlanUnitsMessages(input: PlanUnitsPromptInput): AIMessage[]
  export function parsePlanUnits(raw: string): PlanUnitItem[] | null
  export function isValidPlanUnits(units: PlanUnitItem[], lessons: { classNumber: number; chapterIds: string[] }[], planChapterIds: Set<string>): boolean
  export const PLAN_UNITS_MIN = 3; export const PLAN_UNITS_MAX = 6;
  ```
- Decisões: mesmo formato de `chapter-distribution-prompt.ts` (system prompt em pt-BR com regras: 3 a 6 unidades, `unitNumber` de 1 em diante, usar só ids fornecidos, cada aula inteira numa só unidade, tópicos curtos não vazios; resposta `{"units":[{"unitNumber":1,"title":"...","topics":["..."],"chapterIds":["id"]}]}`; mensagem do usuário lista aulas como `Aula N · <topicTitle> · capítulos: id1, id2` e livros como na distribuição). Parse tolerante: primeiro `{…}` do texto; `title` trim, `min(1)`, cortado em 200; `topics` trim e filtra vazios; `chapterIds` deduplicados. Validação: `PLAN_UNITS_MIN ≤ n ≤ PLAN_UNITS_MAX`; `units[i].unitNumber === i + 1`; `topics.length > 0` em todas; todo `chapterId` em `planChapterIds`; para cada aula, as unidades que contêm algum capítulo dela são exatamente uma, e essa unidade contém todos os capítulos da aula.

- [ ] **Step 1: Escrever o teste que falha** — com aulas `[{1,['ch1']},{2,['ch1','ch2']},{3,['ch3']},{4,['ch4']}]` e plano `{ch1..ch4}`:
  - `'parse aceita texto em volta, apara títulos e tópicos e deduplica capítulos'`.
  - `'resposta válida com 3 unidades passa'`: U1 `[ch1,ch2]`, U2 `[ch3]`, U3 `[ch4]`.
  - `'menos de 3 ou mais de 6 unidades, numeração fora de sequência ou tópicos vazios é inválida'`.
  - `'capítulo de fora do plano é inválido'` (`'chX'`).
  - `'aula com capítulos em duas unidades ou em nenhuma é inválida'`: U1 `[ch1]`, U2 `[ch2,ch3]`, U3 `[ch4]` → `false` (aula 2 dividida); U1 `[ch1,ch2]`, U2 `[ch3]`, U3 `[]` → `false` (aula 4 sem unidade).
  - `'mensagens trazem disciplina, aulas com capítulos e ids dos livros'`: `buildPlanUnitsMessages` → 2 mensagens; a do usuário contém `'Aula 2 · Joins · capítulos: ch1, ch2'` e `'id=ch3'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts` — Expected: FAIL com "Failed to resolve import \"../plan-units-prompt\"".
- [ ] **Step 3: Implementar `plan-units-prompt.ts` e as constantes.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/agents/prompts/plan-units-prompt.ts src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts src/lib/constants/teaching.ts && git commit -m "feat(plano): prompt e validação das unidades a partir da distribuição" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 7: Serviço `generateUnitsFromDistribution` e rota `generate-units`

**Files:**
- Modify: `src/domains/teaching/services/course-schedule-repository.ts:62-65` (select de `lessonPlans`)
- Create: `src/domains/teaching/services/plan-units-service.ts`
- Create: `src/app/api/v1/teacher/schedules/[id]/generate-units/route.ts`
- Test: `src/domains/teaching/services/__tests__/plan-units-service.test.ts`, `src/app/api/v1/teacher/schedules/[id]/generate-units/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `collectStream` (Task 1), `buildPlanUnitsMessages`/`parsePlanUnits`/`isValidPlanUnits` (Task 6), `listPlanChapters` e `updatePlanById` (`teaching-plan-repository.ts:37`, `:62`), `planChapterIds`, `assertOwner`, `PlanActor`.
- Produces:
  ```ts
  export type PlanUnitsDeps = {
    findSchedule: typeof findScheduleForDistribution;
    listPlanChapters(planId: string): Promise<PlanChapterBook[]>;
    saveUnits(planId: string, units: PlanUnitItem[]): Promise<void>;
    streamChat: StreamChatFn;
  };
  export const PLAN_UNITS_TEMPERATURE = 0.2; export const PLAN_UNITS_MAX_TOKENS = 1500;
  export async function generateUnitsFromDistribution(scheduleId: string, user: PlanActor, deps?: PlanUnitsDeps): Promise<PlanUnitItem[]>
  // route: POST → { success: true, units }
  ```
- Decisões: `findScheduleForDistribution` passa a selecionar também `topicTitle: true, chapters: { select: { chapterId: true } }` nas aulas (reaproveitado; a distribuição ignora os campos extras). Ordem: 404 `'Cronograma não encontrado.'` → `assertOwner` (403) → aulas com capítulos vazias → 422 `NO_DISTRIBUTED_CHAPTERS` → `listPlanChapters` → `collectStream` em `try/catch` (`console.warn('[plan-units] …')`) → `fallback`, parse nulo ou `isValidPlanUnits` falso → 503 `PLAN_UNITS_AI_UNAVAILABLE_MESSAGE` → `saveUnits(plan.id, units)` → devolve `units`. Padrão de `saveUnits`: `updatePlanById(id, { unitsContent: units })`.

- [ ] **Step 1: Escrever o teste que falha**
  - `plan-units-service.test.ts` (fixture no padrão de `chapter-distribution-service.test.ts`, 4 aulas com capítulos e uma sem):
    - `'resposta válida grava unitsContent e devolve as unidades'`: `saveUnits` chamado com `('p1', units)` e `streamChat.mock.calls[0][1]` igual a `{ temperature: 0.2, maxTokens: 1500 }`.
    - `'sem aulas com capítulos → 422'` (`NO_DISTRIBUTED_CHAPTERS`), sem chamar `streamChat`.
    - `'cronograma inexistente → 404; outro professor → 403'`.
    - `'resposta inválida, fallback ou exceção → 503 sem gravar'`: aula dividida entre unidades, `fallback: true` e gerador que lança → `{ status: 503, message: PLAN_UNITS_AI_UNAVAILABLE_MESSAGE }`; `saveUnits` nunca chamado.
  - `route.test.ts` (padrão de `distribute-chapters/__tests__/route.test.ts`): `'POST delega com o usuário e devolve units'` (`toHaveBeenCalledWith('sch-1', teacher)`, corpo `{ success: true, units }`) e `'422 do service vira 422 com a mensagem'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/plan-units-service.test.ts "src/app/api/v1/teacher/schedules/[id]/generate-units/__tests__/route.test.ts"` — Expected: FAIL com "Failed to resolve import \"../plan-units-service\"".
- [ ] **Step 3: Implementar repo, serviço e rota** (rota igual à de `distribute-chapters`, devolvendo `{ success: true, units }`).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando, mais `npx vitest run src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/teaching/services/course-schedule-repository.ts src/domains/teaching/services/plan-units-service.ts src/domains/teaching/services/__tests__/plan-units-service.test.ts "src/app/api/v1/teacher/schedules/[id]/generate-units" && git commit -m "feat(plano): gerar unidades do plano a partir da distribuição de capítulos" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 8: Botão "Gerar unidades do plano" no cronograma

**Files:**
- Modify: `src/components/teaching/use-schedules.ts:86-89` (nova função ao final)
- Modify: `src/app/teacher/schedules/_components/SchedulesPage.tsx:27`, `:62-77` (novo handler), `:175-186` (botão)
- Test: `src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/teacher/schedules/[id]/generate-units` (Task 7); `useTeacherPlans()` (`plans`, `reload`).
- Produces: `export async function generatePlanUnits(scheduleId: string): Promise<{ unitNumber: number; title: string; topics: string[]; chapterIds: string[] }[]>` (lê `body.units`).
- Decisões: botão `'Gerar unidades do plano'` (`'Gerando unidades...'` em andamento) ao lado de distribuir, `disabled` quando `!lessons.some((l) => l.chapters.length > 0)` ou em andamento. `planHasUnits` = `unitsContent` do plano do cronograma é array não vazio; nesse caso `window.confirm('O plano já tem unidades. Substituir pelas geradas?')`. Sucesso: `setNotice(\`${units.length} unidades geradas no plano.\`)` (`role="status"` existente) e `reload()` dos planos; erro na área `role="alert"` existente com fallback `'Não foi possível gerar as unidades. Tente novamente.'`.

- [ ] **Step 1: Escrever o teste que falha** — mocks: `use-schedules` ganha `generatePlanUnits: (id) => lessonsState.generatePlanUnits(id)`; `useTeacherPlans` ganha `reload: lessonsState.reloadPlans`. Novos em `describe('SchedulesPage unidades do plano')`:
  - `'gerar unidades fica desabilitado sem aulas com capítulos'`.
  - `'plano sem unidades gera sem confirmar e mostra quantas unidades'`: aula com capítulos, `generatePlanUnits` resolve 4 unidades → status `'4 unidades geradas no plano.'`, chamado com `'sch-9'`, `reloadPlans` chamado, `confirm` não chamado.
  - `'plano com unidades pede confirmação; cancelar não chama a API'`: `plans[1].unitsContent = [{ unitNumber: 1, title: 'U1', topics: ['t'] }]` no teste (restaurado no `afterEach`), `confirm` → `false` com `'O plano já tem unidades. Substituir pelas geradas?'`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx` — Expected: FAIL com "Unable to find an accessible element with the role \"button\" and name `/Gerar unidades do plano/`".
- [ ] **Step 3: Implementar `generatePlanUnits` e o botão/handler.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/components/teaching/use-schedules.ts src/app/teacher/schedules/_components/SchedulesPage.tsx src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx && git commit -m "feat(cronograma): botão para gerar unidades do plano" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 9: Validação de `unitsContent` e card de unidades no plano

**Files:**
- Modify: `src/lib/validators/teaching-plan.validator.ts:12`
- Create: `src/app/teacher/plans/new/_components/PlanUnitsCard.tsx`
- Modify: `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx:121-157` (carga), `:280-297` (corpo do `PUT`), `:343` (render após `PlanEditorForm`)
- Test: `src/lib/validators/__tests__/teaching-plan.validator.test.ts`, `src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx` (novo), `src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx`

**Interfaces:**
- Consumes: `usePlanChapters(planId)` (`@/components/teaching/use-plan-chapters`), `formatChapterShortList` (`@/components/teaching/chapter-combobox-item`).
- Produces:
  ```ts
  // teaching-plan.validator.ts
  export const planUnitSchema = z.object({
    unitNumber: z.number().int().min(1),
    title: z.string().trim().min(1).max(200),
    topics: z.array(z.string().trim().min(1)),
    chapterIds: z.array(z.string()).optional(),
  });
  export type PlanUnit = z.infer<typeof planUnitSchema>;
  // updateTeachingPlanSchema.unitsContent: z.array(planUnitSchema).optional()
  // PlanUnitsCard.tsx
  export function PlanUnitsCard(props: { planId: string; units: PlanUnit[]; onChange(units: PlanUnit[]): void }): JSX.Element
  ```
- Decisões: o card só aparece na edição (`editingPlanId`). Por unidade: `Input` de título (`aria-label` `` `Título da unidade ${unitNumber}` ``), `Textarea` de tópicos um por linha (`aria-label` `` `Tópicos da unidade ${unitNumber}` ``; `onChange` faz `split('\n')` sem filtrar) e `Badge` com `formatChapterShortList` das ordens dos `chapterIds` resolvidas pelos livros de `usePlanChapters` (ids desconhecidos ignorados). Sem unidades: texto `'Nenhuma unidade cadastrada. Distribua os capítulos no cronograma e use "Gerar unidades do plano".'`. Página: estado `units` carregado de `plan.unitsContent` via `z.array(planUnitSchema).safeParse` (falha → `[]`) e flag `unitsEdited` ligada pelo `onChange`; o `PUT` inclui `unitsContent` (tópicos aparados, linhas vazias removidas) só quando `unitsEdited`.

- [ ] **Step 1: Escrever o teste que falha**
  - `teaching-plan.validator.test.ts`: `'unitsContent aceita unidades com chapterIds opcionais e rejeita título vazio, unitNumber 0 e tópico vazio'`.
  - `PlanUnitsCard.test.tsx` (jsdom, mock de `usePlanChapters` com `ch1` ordem 1 e `ch2` ordem 2): `'mostra título, tópicos por linha e capítulos; editar o título chama onChange'` — badge `'Cap. 1, 2'`, textarea com `'Joins\nÍndices'`, `fireEvent.change` no título → `onChange` com a unidade de título novo; `'sem unidades mostra o texto de orientação'`.
  - `TeachingPlanNewPage.test.tsx`: `'PUT só envia unitsContent quando o card foi editado'` — plano salvo com `unitsContent: [{ unitNumber: 1, title: 'Fundamentos', topics: ['Joins'], chapterIds: ['ch1'] }]` (mock de módulo de `@/components/teaching/use-plan-chapters` com `books: []` no topo do arquivo, para os testes de edição existentes não dispararem `GET .../chapters`); salvar sem mexer → corpo sem `unitsContent`; editar o título para `'Base'` e salvar → `unitsContent: [{ unitNumber: 1, title: 'Base', topics: ['Joins'], chapterIds: ['ch1'] }]`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/lib/validators/__tests__/teaching-plan.validator.test.ts src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx` — Expected: FAIL com "Failed to resolve import \"../PlanUnitsCard\"" e "expected success to be false".
- [ ] **Step 3: Implementar schema, card e integração na página.**
- [ ] **Step 4: Rodar e ver passar** — mesmo comando, mais `npx vitest run src/domains/teaching/services/__tests__/teaching-plan-service.test.ts src/domains/assessments/services/__tests__/assessment-service.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/validators/teaching-plan.validator.ts src/lib/validators/__tests__/teaching-plan.validator.test.ts src/app/teacher/plans/new/_components/PlanUnitsCard.tsx src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx && git commit -m "feat(plano): card de unidades editável salvo com o plano" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 10: Hooks `useLessonGeneration` e `useLessonStatus`

**Files:**
- Create: `src/app/teacher/lessons/_components/use-lesson-generation.ts`, `src/app/teacher/lessons/_components/use-lesson-status.ts`
- Modify: `src/app/teacher/lessons/_components/LessonEditor.tsx:29-33` (constantes), `:70-139` (estado, `generate`, `changeStatus`, locks)
- Test: `src/app/teacher/lessons/_components/__tests__/use-lesson-hooks.test.tsx` (novo); `LessonEditor.test.tsx` e `RefineField.test.tsx` sem alteração

**Interfaces:**
- Consumes: `generateLesson`, `setLessonStatus`, `LessonItem` (`@/components/teaching/use-lessons`), `publishBlockReason`, `LESSON_STATUS`, `NO_LESSON_CHAPTERS`.
- Produces:
  ```ts
  type Feedback = { onStart(): void; onError(message: string): void };
  export function useLessonGeneration(args: Feedback & {
    lessonId: string; savedChapterIds: string[]; selectionKey: string; hasContent: boolean;
    applyGenerated(data: Awaited<ReturnType<typeof generateLesson>>): void;
  }): { generate(): Promise<void>; generating: boolean; citations: string[]; lockReason: string | undefined }
  export function useLessonStatus(args: Feedback & { lesson: LessonItem; dirty: boolean; onSaved(): void }):
    { changeStatus(): Promise<void>; changing: boolean; publishLock: string | null }
  ```
- Decisões: `onStart`/`onError` foram acrescentados à assinatura da spec para manter o comportamento atual (cada ação limpa erro e aviso e mostra o erro no `role="alert"` do editor). `GENERATE_ERROR`, `UNSAVED_CHAPTERS`, `CONFIRM_REPLACE` mudam para `use-lesson-generation.ts`; `STATUS_ERROR`, `UNSAVED_PUBLISH` para `use-lesson-status.ts`, com os mesmos textos. `lockReason` calcula `savedKey` a partir de `savedChapterIds`. O editor usa `busy = generating || changing` nos `disabled` atuais.

- [ ] **Step 1: Escrever o teste que falha** — `use-lesson-hooks.test.tsx` (jsdom, `renderHook`, mock de `@/components/teaching/use-lessons`):
  - `'useLessonGeneration: sem capítulo salvo e seleção diferente dão o motivo certo'` → `NO_LESSON_CHAPTERS` com `savedChapterIds: []`; `'Salve os capítulos selecionados antes de gerar.'` com `savedChapterIds: ['b','a']` e `selectionKey: 'a'`; `undefined` com `selectionKey: 'a,b'`.
  - `'useLessonStatus: formulário sujo bloqueia publicar'` → `publishLock === 'Salve as alterações antes de publicar.'` com `dirty: true`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/use-lesson-hooks.test.tsx` — Expected: FAIL com "Failed to resolve import \"../use-lesson-generation\"".
- [ ] **Step 3: Implementar os dois hooks e trocar o código do editor por eles** (JSX intocado).
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/` — Expected: PASS nos 9 testes de `LessonEditor.test.tsx`, nos 3 de `RefineField.test.tsx`, nos de `LessonsPage.test.tsx` e nos novos; `git diff --stat src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx` vazio.
- [ ] **Step 5: Commit** — `git add src/app/teacher/lessons/_components/use-lesson-generation.ts src/app/teacher/lessons/_components/use-lesson-status.ts src/app/teacher/lessons/_components/LessonEditor.tsx src/app/teacher/lessons/_components/__tests__/use-lesson-hooks.test.tsx && git commit -m "refactor(aulas): hooks de geração e de situação fora do editor" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 11: Verificação final

**Files:** nenhum arquivo novo; correções só onde a verificação apontar.

- [ ] **Step 1: Tipos** — `npx tsc --noEmit` — Expected: sem erros.
- [ ] **Step 2: Lint dos arquivos tocados** — `npx next lint --file` com todos os arquivos das Tasks 1-10 — Expected: `No ESLint warnings or errors`.
- [ ] **Step 3: Suíte completa** — `npx vitest run` — Expected: PASS; se a única falha for o fallback CLASSROOM de `src/app/api/v1/agent/chat/__tests__/route.test.ts`, rodar esse arquivo isolado e confirmar PASS. Não resetar o banco.
- [ ] **Step 4: Conferências da spec** — `grep -rn "for await (const chunk of deps.streamChat" src/domains/teaching/services/plan-generation-service.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/teaching/services/chapter-distribution-service.ts src/domains/teaching/services/lesson-generation-service.ts src/domains/teaching/services/plan-units-service.ts` — Expected: nenhuma linha; `wc -l src/app/teacher/lessons/_components/LessonEditor.tsx` menor que antes (388).
- [ ] **Step 5: Commit** — só se houve correção: `git add <arquivos corrigidos> && git commit -m "fix: ajustes da verificação final dos follow-ups de aulas" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`
