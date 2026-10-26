# Aulas ancoradas em capítulos com IA — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amarrar cada aula (`LessonPlan`) a capítulos reais dos livros da bibliografia do plano, deixar a IA distribuir esses capítulos pelo cronograma e gerar/refinar o conteúdo de cada aula a partir deles, e só expor ao aluno aulas publicadas.

**Architecture:** Novos models relacionais (`MaterialChapter`, `TeachingPlanReference`, `LessonPlanChapter`, `LessonPlan.status`) com migrations aditivas e backfill em SQL. Capítulos nascem na biblioteca (outline do PDF → sumário por IA → nenhum) e os chunks recebem `chapterId` por faixa de página; a busca híbrida ganha filtro por `chapterIds`. Três serviços de IA novos (distribuição, geração e refino) seguem o padrão de `plan-generation-service.ts`: deps injetáveis, `loggedStreamChat`, prompt em `src/domains/agents/prompts/`, JSON extraído e validado com zod, 503 sem IA real e 422 sem fonte.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma 6 + Postgres/pgvector, zod, pdf-parse 2.4.5 (pdfjs-dist 5.4.296), vitest 3 + `@testing-library/react` 16 + jsdom (`// @vitest-environment jsdom`, sem `jest-dom`/`user-event`: usar `fireEvent` e asserções nativas).

**Spec:** docs/superpowers/specs/2026-10-26-aulas-capitulos-ia-design.md

## Global Constraints

- Nunca inventar conteúdo pedagógico: provider mock, `chunk.fallback`, exceção ou JSON inválido → `DomainError(503, AI_UNAVAILABLE_MESSAGE)` importado de `src/domains/teaching/services/plan-generation-service.ts:82`. Nenhum fallback textual.
- Sem fonte RAG → `DomainError(422, ...)` com mensagem específica. Geração e refino de aula: exatamente `'Os capítulos selecionados não têm conteúdo indexado'`.
- Toda chamada de IA nova passa por `loggedStreamChat` (`src/domains/telemetry/services/logged-stream-chat.ts:53`), injetado como `deps.streamChat`.
- Rotas novas do professor: `requireUser(req, [Role.TEACHER, Role.ADMIN])` (`@/lib/auth/request-user`), dono via `assertOwner` (`src/domains/teaching/ownership.ts`) dentro do service, erros por `apiError` (`@/lib/api/api-error`). Rotas de biblioteca: mesma permissão de `reindex` (`requireUser` TEACHER/ADMIN, sem dono — materiais não têm dono).
- Migrations só aditivas (colunas/tabelas/enums novos; nada removido ou renomeado). Backfill em migration SQL separada, no padrão de `prisma/migrations/20261023160000_ai_fallback_backfill_legacy/`.
- Trabalho direto em `main`, sem branch nem worktree, sem PR. `git add` com caminhos explícitos; nunca commitar `package.json`, `package-lock.json`, `.mcp.json`. Commits frequentes, mensagens em pt-BR terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Duração da aula = `LESSON_DEFAULT_DURATION_MINUTES` (100, `src/lib/constants/teaching.ts:21`); não existe duração por aula no schema.
- Extração de capítulos só para PDF (`mimeType === 'application/pdf'`); DOCX/TXT/MD não têm páginas reais.
- Componentes de cliente não importam `@prisma/client`; enums de status do cliente vêm de constantes em `src/lib/constants/teaching.ts`.
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar isolado.
- Gate de tipo por task: `npx tsc --noEmit` sem erros novos nos arquivos tocados.

## Review Focus

1. **Páginas fora de qualquer capítulo (pré-textuais antes do Cap. 1) voltam a "Página N" com `chapterId` nulo** ao reeditar capítulos; senão chunks antigos ficam com título de capítulo que não existe mais. Teste em Task 3 (`'páginas antes do primeiro capítulo ficam sem capítulo'`).
2. **Reprocessar com o mesmo número de capítulos re-vincula as aulas por `order`; com número diferente devolve `lostLessonLinks` igual ao número de aulas distintas que tinham vínculo.** Teste em Task 4 (`'mesma contagem re-vincula por ordem; contagem diferente informa aulas sem vínculo'`).
3. **`PUT /plans/[id]` sem o campo `references` não apaga as referências existentes** (ex.: mudança só de status). Teste em Task 8 (`'update sem references preserva o conjunto; com [] limpa'`).
4. **Republicar depois de despublicar tira a agenda de `CANCELLED`** (o upsert preserva status, `agenda-repository.ts:79`), e editar aula `DRAFT` não recria agenda. Teste em Task 11 (`'despublicar cancela, republicar volta a SCHEDULED; editar rascunho não cria agenda'`).
5. **`updateLesson` rejeita `chapterIds` de livro fora do plano e um salvar sem `chapterIds` não apaga os capítulos.** Teste em Task 15 (`'rejeita capítulo de fora do plano; salvar sem chapterIds preserva vínculos'`).

---

## Estrutura de arquivos

**Schema e dados**
- `prisma/schema.prisma` — enums `ChapterSource`, `ReferenceKind`, `LessonStatus`; models `MaterialChapter`, `TeachingPlanReference`, `LessonPlanChapter`; `MaterialChunk.chapterId`; `LessonPlan.status`.
- `prisma/migrations/20261026120000_aulas_capitulos_schema/migration.sql` — DDL gerado (aditivo).
- `prisma/migrations/20261026120100_aulas_capitulos_backfill/migration.sql` — backfill de `teaching_plan_references` e `lesson_plans.status`.
- `prisma/seed.ts` — aula com agenda sai `PUBLISHED`; referências do plano demo.

**RAG / biblioteca**
- `src/domains/rag/chapters.ts` (novo, puro) — tipos de capítulo, validação de sequência, `endPage`, faixas de chunks, re-vínculo por ordem.
- `src/domains/rag/file-parser.ts` — `readPdfNavigation` (outline 1º nível + páginas resolvidas + rótulos de página).
- `src/domains/agents/prompts/chapter-extraction-prompt.ts` (novo) — mensagens e parse do sumário por IA.
- `src/domains/rag/services/chapter-repository.ts` (novo) — leitura/substituição transacional de capítulos, vínculos e chunks.
- `src/domains/rag/services/chapter-extraction-service.ts` (novo) — cascata, gravação, reprocessamento, edição manual, listagem.
- `src/domains/rag/services/library-service.ts` — `uploadAndIngest` chama a extração após gravar chunks.
- `src/domains/rag/services/chunk-repository.ts` — filtro `chapterIds` em `chunkFilters`.
- `src/domains/rag/hybrid-search.ts`, `src/domains/rag/types.ts` — `allowedChapterIds` em `RAGSearchQuery`.
- `src/domains/rag/constants.ts` — `CHAPTER_TOC_PAGES = 12`, `CHAPTER_TOC_PAGE_CHARS = 1200`.
- `src/lib/validators/material-chapters.validator.ts` (novo) — body do `PUT` de capítulos.
- `src/app/api/v1/library/materials/[id]/chapters/route.ts` (novo) — `GET`/`PUT`.
- `src/app/api/v1/library/materials/[id]/chapters/extract/route.ts` (novo) — `POST`.
- `src/app/teacher/materials/_components/use-material-chapters.ts` (novo) — cliente das rotas de capítulos.
- `src/app/teacher/materials/_components/MaterialChaptersPanel.tsx` (novo) — painel "Capítulos".
- `src/app/teacher/materials/_components/MaterialsTable.tsx`, `materials-constants.ts` — botão que abre o painel; `totalPages` no item.

**Plano de ensino**
- `src/lib/validators/teaching-plan.validator.ts` — `references` opcional.
- `src/domains/teaching/services/teaching-plan-repository.ts` — `replacePlanReferences`, `listPlanChapters`, include de `references`.
- `src/domains/teaching/services/teaching-plan-service.ts` — grava referências no create/update.
- `src/domains/teaching/services/plan-chapters-service.ts` (novo) — capítulos do plano agrupados por livro.
- `src/app/api/v1/teacher/plans/[id]/chapters/route.ts` (novo) — `GET`.
- `src/components/teaching/chapter-combobox-item.ts` (novo) — `chapterToComboboxItem`, `formatChapterShortList`.
- `src/components/teaching/use-plan-chapters.ts` (novo) — hook do `GET` acima.
- `src/app/teacher/plans/new/types.ts`, `_components/TeachingPlanNewPage.tsx`, `_components/ReferenceSelectionModal.tsx`, `_components/PlanBibliographyCard.tsx` — tipo de referência, abas Básica/Complementar, `references` no salvar, restauração por id.

**Aulas, cronograma, tutor**
- `src/lib/constants/teaching.ts` — `LESSON_STATUS` e mensagens de bloqueio compartilhadas entre service e UI (`NO_SYNCED_LESSONS`, `NO_PLAN_CHAPTERS`, `NO_LESSON_CHAPTERS`).
- `src/domains/teaching/lesson-publish.ts` (novo, puro) — `publishBlockReason`, usado pelo service e pelo editor (precedente: `schedule-generator.ts` importado por `MeetingsTable.tsx`).
- `src/domains/agendas/services/agenda-repository.ts` — `setAgendaStatusByLessonPlanId`.
- `src/domains/teaching/services/lesson-plan-repository.ts` — include de capítulos/status, `replaceLessonChapters`, `findLessonForGeneration`, `applyChapterDistribution`, `findLessonTutorScope`.
- `src/domains/teaching/services/lesson-service.ts` — status no sync de agenda, `setLessonStatus`, `chapterIds` em `updateLesson`.
- `src/lib/validators/lesson.validator.ts` — `chapterIds`, `lessonStatusSchema`, `refineLessonSchema`.
- `src/domains/teaching/services/course-schedule-repository.ts` — `findScheduleForDistribution`.
- `src/domains/agents/prompts/chapter-distribution-prompt.ts` (novo), `src/domains/teaching/services/chapter-distribution-service.ts` (novo).
- `src/domains/agents/prompts/lesson-generation-prompt.ts` (novo), `src/domains/teaching/services/lesson-generation-service.ts` (novo).
- `src/app/api/v1/teacher/lessons/[id]/status/route.ts`, `[id]/generate/route.ts`, `[id]/refine/route.ts`, `src/app/api/v1/teacher/schedules/[id]/distribute-chapters/route.ts` (novos).
- `src/components/teaching/use-lessons.ts`, `use-schedules.ts` — tipos e chamadas novas.
- `src/app/teacher/schedules/_components/SchedulesPage.tsx`, `MeetingsTable.tsx` — botão de distribuição e coluna de capítulos.
- `src/app/teacher/lessons/_components/LessonEditor.tsx`, `RefineField.tsx` (novo), `LessonsPage.tsx` — capítulos, gerar, refinar, publicar, badges.
- `src/domains/agents/tutor-pipeline.ts`, `src/domains/agents/services/chat-service.ts` — escopo por capítulos/materiais.

---

### Task 1: Schema, migrations e backfill

**Files:**
- Modify: `prisma/schema.prisma:242-269` (TeachingPlan), `:289-311` (LessonPlan), `:347-388` (DidacticMaterial, MaterialChunk)
- Create: `prisma/migrations/20261026120000_aulas_capitulos_schema/migration.sql` (gerado)
- Create: `prisma/migrations/20261026120100_aulas_capitulos_backfill/migration.sql`
- Modify: `prisma/seed.ts:177-237`
- Test: `npx prisma validate` + consultas de verificação

**Interfaces:**
- Produces (Prisma Client):
  - `enum ChapterSource { OUTLINE AI MANUAL }`, `enum ReferenceKind { BASIC COMPLEMENTARY }`, `enum LessonStatus { DRAFT PUBLISHED }`
  - `MaterialChapter { id, materialId, title, order Int, startPage Int, endPage Int?, source ChapterSource, createdAt }`, `@@unique([materialId, order])`, `@@map("material_chapters")`, relação `material` com `onDelete: Cascade`; back-relations `chunks MaterialChunk[]`, `lessonLinks LessonPlanChapter[]`.
  - `MaterialChunk.chapterId String?` com relação **`chapterRef`** (o nome `chapter` já é a coluna texto) `onDelete: SetNull`, `@@index([chapterId])`.
  - `TeachingPlanReference { id, teachingPlanId, materialId, kind ReferenceKind }`, `@@unique([teachingPlanId, materialId])`, cascade nos dois lados, `@@map("teaching_plan_references")`; back-relations `TeachingPlan.references`, `DidacticMaterial.planReferences`.
  - `LessonPlan.status LessonStatus @default(DRAFT)`, `LessonPlan.chapters LessonPlanChapter[]`.
  - `LessonPlanChapter { lessonPlanId, chapterId }`, `@@id([lessonPlanId, chapterId])`, cascade nos dois lados, `@@map("lesson_plan_chapters")`; relações `lessonPlan`, `chapter`.
  - `DidacticMaterial.chapters MaterialChapter[]`.

- [ ] **Step 1: Editar `prisma/schema.prisma`** com exatamente os campos acima e rodar `npx prisma validate` — Expected: `The schema at prisma/schema.prisma is valid`.
- [ ] **Step 2: Gerar a migration DDL** — `npx prisma migrate dev --create-only --name aulas_capitulos_schema`, renomear a pasta para `20261026120000_aulas_capitulos_schema`. Conferir no SQL: só `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX`, `ADD CONSTRAINT`. Nenhum `DROP`.
- [ ] **Step 3: Escrever `20261026120100_aulas_capitulos_backfill/migration.sql`** com duas instruções comentadas em pt-BR:
  - `UPDATE "lesson_plans" SET "status" = 'PUBLISHED' WHERE EXISTS (SELECT 1 FROM "agendas" a WHERE a."lessonPlanId" = "lesson_plans"."id");`
  - `INSERT INTO "teaching_plan_references" ("id","teachingPlanId","materialId","kind") ... ON CONFLICT ("teachingPlanId","materialId") DO NOTHING;` — primeiro `unnest("basicBibliography")` com `kind 'BASIC'`, depois `unnest("complementaryBiblio")` com `'COMPLEMENTARY'` (básica vence em conflito). Casamento igual a `restoreReferences` (`TeachingPlanNewPage.tsx:24-43`): `lower(trim(m."title")) = lower(trim(regexp_replace(entry, '\s*\([^)]*\).*$', '')))`. `id = 'tpr_' || md5(tp."id" || ':' || m."id")` (determinístico, sem extensão). Linha sem material casado não gera nada.
- [ ] **Step 4: Aplicar e gerar cliente** — `npx prisma migrate dev && npx prisma generate` — Expected: as duas migrations aplicadas, sem drift.
- [ ] **Step 5: Verificar o backfill** — `npx tsx -e` com `PrismaClient` imprimindo: `lessonPlan.count({where:{status:'PUBLISHED', agenda:{isNot:null}}})` igual a `agenda.count({where:{lessonPlanId:{not:null}}})`, `lessonPlan.count({where:{status:'PUBLISHED', agenda:null}})` = 0, e `teachingPlanReference.count()` > 0 se algum plano tem bibliografia que casa com material.
- [ ] **Step 6: Seed** — em `prisma/seed.ts`, depois de criar as agendas, `lessonPlan.update({ status: 'PUBLISHED' })` na aula vinculada (`lessonPlans[3]`); depois de criar o plano, `teachingPlanReference.upsert` para cada material do seed cujo título aparece em `DEMO_TEACHING_PLAN.basicBibliography` (`kind: 'BASIC'`). Rodar `npx prisma db seed` — Expected: termina sem erro e imprime as contagens.
- [ ] **Step 7: Commit** — `git add prisma/schema.prisma prisma/migrations/20261026120000_aulas_capitulos_schema prisma/migrations/20261026120100_aulas_capitulos_backfill prisma/seed.ts && git commit -m "feat(dados): capítulos de material, referências do plano e status da aula"`

---

### Task 2: `readPdfNavigation` (outline do PDF)

**Files:**
- Modify: `src/domains/rag/file-parser.ts` (após `readPdfInfo`, ~linha 138)
- Modify: `src/domains/rag/types.ts`
- Test: `src/domains/rag/__tests__/file-parser.navigation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface OutlineEntry { title: string; pageNumber: number | null }
  export interface PdfNavigation { outline: OutlineEntry[]; pageLabels: string[] | null }
  // file-parser.ts
  export async function readPdfNavigation(buffer: Buffer): Promise<PdfNavigation>
  ```
  Decisões fixadas: pdf-parse 2.4.5 expõe o outline em `getInfo().outline`, mas com `dest` cru (sem página). A função acessa o documento pdf.js pelo método privado em runtime `load()` (`(parser as unknown as { load(): Promise<PdfDocLike> }).load()`, com `PdfDocLike` declarado localmente: `getOutline`, `getDestination(name)`, `getPageIndex(ref)`, `getPageLabels()`). Só itens de 1º nível. `dest` string → `getDestination`; array → `dest[0]` é `{num, gen}` → `getPageIndex(ref) + 1`, ou número → `+ 1`. Falha em qualquer item → `pageNumber: null`. Qualquer exceção geral → `{ outline: [], pageLabels: null }`. `parser.destroy()` sempre em `finally`.

- [ ] **Step 1: Escrever o teste que falha** — mock de `pdf-parse` no padrão de `file-parser.pdf.test.ts:3-18`, com classe que expõe `load` devolvendo doc falso:
  ```ts
  it('resolve destinos nomeados e explícitos para página física (1-based)', async () => {
    doc.getOutline.mockResolvedValue([
      { title: 'Cap. 1 Introdução', dest: 'c1', items: [{ title: '1.1', dest: 'x', items: [] }] },
      { title: 'Cap. 2 Modelo ER', dest: [{ num: 7, gen: 0 }, { name: 'XYZ' }], items: [] },
    ]);
    doc.getDestination.mockResolvedValue([{ num: 3, gen: 0 }]);
    doc.getPageIndex.mockImplementation(async (ref) => (ref.num === 3 ? 11 : 24));
    doc.getPageLabels.mockResolvedValue(['i', 'ii', '1']);
    expect(await readPdfNavigation(Buffer.from('%PDF'))).toEqual({
      outline: [{ title: 'Cap. 1 Introdução', pageNumber: 12 }, { title: 'Cap. 2 Modelo ER', pageNumber: 25 }],
      pageLabels: ['i', 'ii', '1'],
    });
    expect(destroy).toHaveBeenCalled();
  });
  it('destino irresolúvel vira pageNumber null', ...)        // getDestination rejeita → { title, pageNumber: null }
  it('PDF sem outline devolve lista vazia', ...)               // getOutline → null → outline: []
  it('erro ao abrir o PDF devolve navegação vazia', ...)       // load rejeita → { outline: [], pageLabels: null }
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/__tests__/file-parser.navigation.test.ts` — Expected: FAIL com "readPdfNavigation is not a function" (ou erro de import).
- [ ] **Step 3: Implementar `readPdfNavigation(buffer: Buffer): Promise<PdfNavigation>` em `src/domains/rag/file-parser.ts`** conforme as decisões acima (mesmo construtor tolerante de `PDFParse` usado em `parseDocumentFile`, linha ~158).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando + `npx vitest run src/domains/rag/__tests__/file-parser.pdf.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/rag/file-parser.ts src/domains/rag/types.ts src/domains/rag/__tests__/file-parser.navigation.test.ts && git commit -m "feat(rag): leitura do outline do PDF com página física"`

---

### Task 3: Regras puras de capítulos e prompt do sumário

**Files:**
- Create: `src/domains/rag/chapters.ts`
- Create: `src/domains/agents/prompts/chapter-extraction-prompt.ts`
- Modify: `src/domains/rag/constants.ts`
- Test: `src/domains/rag/__tests__/chapters.test.ts`, `src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts`

**Interfaces:**
- Consumes: `OutlineEntry` (Task 2).
- Produces:
  ```ts
  // constants.ts
  export const CHAPTER_TOC_PAGES = 12;
  export const CHAPTER_TOC_PAGE_CHARS = 1200;
  export const MIN_EXTRACTED_CHAPTERS = 2;
  // chapters.ts (sem imports de banco)
  export type ChapterDraft = { title: string; startPage: number };
  export type ChapterRow = { title: string; order: number; startPage: number; endPage: number };
  export type ChunkAssignment = { order: number | null; title: string | null; fromPage: number; toPage: number };
  export type ChapterLinks = { order: number; lessonPlanIds: string[] };
  export function outlineToDrafts(entries: OutlineEntry[]): ChapterDraft[] | null;
  export function isValidChapterSequence(drafts: ChapterDraft[], totalPages: number, minCount: number): boolean;
  export function toChapterRows(drafts: ChapterDraft[], totalPages: number): ChapterRow[];
  export function buildChunkAssignments(rows: ChapterRow[], totalPages: number): ChunkAssignment[];
  export function relinkByOrder(old: ChapterLinks[], newCount: number): { relinks: { order: number; lessonPlanId: string }[]; lostLessonLinks: number };
  // chapter-extraction-prompt.ts
  export type TocPage = { pageNumber: number; label?: string; text: string };
  export function buildChapterExtractionMessages(input: { pages: TocPage[]; totalPages: number }): AIMessage[];
  export function parseChapterExtraction(raw: string): ChapterDraft[] | null;
  ```
  Regras: `outlineToDrafts` descarta entradas sem `pageNumber` ou com título vazio, mantém só páginas estritamente crescentes na ordem do outline, devolve `null` se sobrarem menos de `MIN_EXTRACTED_CHAPTERS`. `isValidChapterSequence`: inteiros em `[1, totalPages]`, estritamente crescentes, `length >= minCount`. `toChapterRows`: `order = i + 1`, `endPage = próximo.startPage - 1`, último `= totalPages`. `buildChunkAssignments`: uma faixa por capítulo mais uma faixa `{order: null, title: null}` para `1..primeiro.startPage-1` quando existir; lista vazia de capítulos → uma faixa nula `1..totalPages`. `relinkByOrder`: mesma contagem (`old.length === newCount`) → todos os pares; diferente → `relinks: []` e `lostLessonLinks` = número de `lessonPlanId` distintos. Prompt: cada página como `--- Página física {n} (impressa: {label}) ---` (sem o parêntese quando não há rótulo), texto cortado em `CHAPTER_TOC_PAGE_CHARS`; pede `{"chapters":[{"title":"...","startPage":N}]}` com **página física**; parse extrai o primeiro `{...}` como `parseTeachingPlanText` (`teaching-plan-prompt.ts:66-77`), zod tolerante (`startPage` aceita string numérica via `z.coerce.number().int()`, títulos `trim().min(1)`), `null` se inválido.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('outline com 2 entradas de 1º nível com página vira rascunho', () =>
    expect(outlineToDrafts([{ title: 'Cap. 1', pageNumber: 12 }, { title: 'Cap. 2', pageNumber: 25 }, { title: 'Sem destino', pageNumber: null }]))
      .toEqual([{ title: 'Cap. 1', startPage: 12 }, { title: 'Cap. 2', startPage: 25 }]));
  it('outline com 1 entrada válida devolve null', ...);
  it('sequência rejeita página fora do intervalo, fora de ordem e contagem menor que o mínimo', () => {
    expect(isValidChapterSequence([{ title: 'a', startPage: 1 }, { title: 'b', startPage: 301 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 50 }, { title: 'b', startPage: 20 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 5 }], 300, 2)).toBe(false);
    expect(isValidChapterSequence([{ title: 'a', startPage: 5 }], 300, 1)).toBe(true);
  });
  it('endPage deriva do próximo capítulo e o último vai até totalPages', () =>
    expect(toChapterRows([{ title: 'a', startPage: 12 }, { title: 'b', startPage: 25 }], 300))
      .toEqual([{ title: 'a', order: 1, startPage: 12, endPage: 24 }, { title: 'b', order: 2, startPage: 25, endPage: 300 }]));
  it('páginas antes do primeiro capítulo ficam sem capítulo', () =>   // Review Focus 1
    expect(buildChunkAssignments(toChapterRows([{ title: 'a', startPage: 12 }, { title: 'b', startPage: 25 }], 300), 300)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 11 },
      { order: 1, title: 'a', fromPage: 12, toPage: 24 },
      { order: 2, title: 'b', fromPage: 25, toPage: 300 },
    ]));
  it('relinkByOrder: mesma contagem mantém pares; diferente conta aulas distintas', () => {
    const old = [{ order: 1, lessonPlanIds: ['l1', 'l2'] }, { order: 2, lessonPlanIds: ['l2'] }];
    expect(relinkByOrder(old, 2).relinks).toHaveLength(3);
    expect(relinkByOrder(old, 3)).toEqual({ relinks: [], lostLessonLinks: 2 });
  });
  // prompt
  it('marca página física e impressa e pede página física', () => {
    const [sys, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 7, label: 'v', text: 'Sumário' }], totalPages: 300 });
    expect(user.content).toContain('--- Página física 7 (impressa: v) ---');
    expect(sys.content).toContain('página física');
  });
  it('parse aceita JSON com texto ao redor e startPage em string; rejeita sem chapters', () => {
    expect(parseChapterExtraction('ok {"chapters":[{"title":" Cap 1 ","startPage":"12"}]} fim')).toEqual([{ title: 'Cap 1', startPage: 12 }]);
    expect(parseChapterExtraction('nada')).toBeNull();
  });
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts` — Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar** as funções e constantes acima em `chapters.ts`, `constants.ts` e `chapter-extraction-prompt.ts`.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/rag/chapters.ts src/domains/rag/constants.ts src/domains/agents/prompts/chapter-extraction-prompt.ts src/domains/rag/__tests__/chapters.test.ts src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts && git commit -m "feat(rag): regras de capítulos e prompt de sumário"`

---

### Task 4: Repositório e serviço de extração de capítulos

**Files:**
- Create: `src/domains/rag/services/chapter-repository.ts`
- Create: `src/domains/rag/services/chapter-extraction-service.ts`
- Test: `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`

**Interfaces:**
- Consumes: Task 2 (`readPdfNavigation`), Task 3 (todas as funções de `chapters.ts`, prompt), `parseDocumentFile` (`file-parser.ts`), `storageService.getFileBuffer`, `findMaterial` (`material-repository.ts:12`), `loggedStreamChat`.
- Produces:
  ```ts
  // chapter-repository.ts
  export type ChapterDTO = { id: string; order: number; title: string; startPage: number; endPage: number | null; source: ChapterSource };
  export function listChapters(materialId: string): Promise<ChapterDTO[]>;
  export function listChapterLinks(materialId: string): Promise<ChapterLinks[]>;
  /** Uma $transaction: apaga capítulos do material, cria `rows`, recria `relinks` (order → id novo), aplica `assignments`
   *  com UPDATE material_chunks SET "chapterId", chapter = COALESCE(title, 'Página ' || "pageNumber") por faixa de página. */
  export function replaceChapters(materialId: string, rows: ChapterRow[], source: ChapterSource,
    relinks: { order: number; lessonPlanId: string }[], assignments: ChunkAssignment[]): Promise<ChapterDTO[]>;
  // chapter-extraction-service.ts
  export type ChapterExtractionDeps = {
    readNavigation(buffer: Buffer): Promise<PdfNavigation>;
    streamChat: StreamChatFn;
    repo: { listChapters: typeof listChapters; listChapterLinks: typeof listChapterLinks; replaceChapters: typeof replaceChapters };
    materials: { findMaterial(id: string): Promise<{ id: string; totalPages: number; mimeType: string | null; filePath: string; originalFilename: string | null } | null> };
    files: { getFileBuffer(path: string): Promise<{ buffer: Buffer }> };
  };
  export type ExtractionInput = { buffer: Buffer; pages: RawDocumentPage[]; totalPages: number };
  export type ChapterSaveResult = { source: ChapterSource | null; chapters: ChapterDTO[]; lostLessonLinks: number };
  export function extractChapterDrafts(input: ExtractionInput, deps?): Promise<{ source: ChapterSource; drafts: ChapterDraft[] } | null>;
  export function extractAndSaveChapters(materialId: string, input: ExtractionInput, deps?): Promise<ChapterSaveResult>;
  export function reextractMaterialChapters(materialId: string, deps?): Promise<ChapterSaveResult>;
  export function replaceManualChapters(materialId: string, drafts: ChapterDraft[], deps?): Promise<ChapterSaveResult>;
  export function listMaterialChapters(materialId: string, deps?): Promise<ChapterDTO[]>;
  export const CHAPTERS_PDF_ONLY = 'A extração de capítulos está disponível apenas para PDF.';
  ```
  Decisões: cascata em `extractChapterDrafts` — (1) `outlineToDrafts(nav.outline)` validado com `isValidChapterSequence(..., totalPages, 2)` → `OUTLINE`; (2) IA sobre `pages.slice(0, CHAPTER_TOC_PAGES)` com rótulo `nav.pageLabels?.[pageNumber - 1]`, `temperature: 0.1`, `maxTokens: 1200`; resposta com `fallback`, exceção, parse `null` ou sequência inválida → passa adiante (sem 503: extração nunca falha o upload); válida → `AI`; (3) `null`. Gravação comum (`saveDrafts`, privada): `listChapterLinks` → `relinkByOrder` → `toChapterRows` → `buildChunkAssignments` → `replaceChapters`. `reextractMaterialChapters`: 404 `'Material não encontrado.'`; não-PDF → 400 `CHAPTERS_PDF_ONLY`; lê o arquivo, `parseDocumentFile(buffer, nome, { maxPages: CHAPTER_TOC_PAGES, skipOcr: true })`, usa `material.totalPages`; cascata `null` → devolve `{ source: null, chapters: <atuais>, lostLessonLinks: 0 }` **sem apagar** os atuais. `replaceManualChapters`: valida `isValidChapterSequence(drafts, totalPages, 0)` senão 400 `` `As páginas iniciais devem ser crescentes e estar entre 1 e ${totalPages}.` ``, grava com `MANUAL`; não-PDF → 400 `CHAPTERS_PDF_ONLY`.

- [ ] **Step 1: Escrever o teste que falha** (deps falsos; `streamChat` como em `plan-generation-service.test.ts:26-38`)
  ```ts
  it('PDF com outline grava capítulos OUTLINE sem chamar a IA', async () => {
    const r = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 300 }, depsWith({ outline: [{ title: 'Cap. 1', pageNumber: 12 }, { title: 'Cap. 2', pageNumber: 25 }] }));
    expect(r.source).toBe('OUTLINE');
    expect(streamChat).not.toHaveBeenCalled();
    expect(replaceChapters).toHaveBeenCalledWith('m1', [expect.objectContaining({ order: 1, startPage: 12, endPage: 24 }), expect.objectContaining({ order: 2, endPage: 300 })],
      'OUTLINE', [], expect.arrayContaining([{ order: null, title: null, fromPage: 1, toPage: 11 }]));
  });
  it('PDF sem outline usa a IA nas 12 primeiras páginas e grava AI', ...);   // pages com 20 itens → prompt contém 'Página física 12' e não 'Página física 13'
  it('IA fora de ordem, fora do intervalo ou com 1 capítulo não grava nada', ...);  // source null, replaceChapters não chamado
  it('IA indisponível (fallback) não lança e devolve sem capítulos', ...);
  it('mesma contagem re-vincula por ordem; contagem diferente informa aulas sem vínculo', ...);  // Review Focus 2: listChapterLinks → [{order:1,lessonPlanIds:['l1']},{order:2,lessonPlanIds:['l1','l2']}]; 2 capítulos novos → relinks com 3 pares; 3 capítulos → lostLessonLinks 2
  it('reextract: material inexistente 404, DOCX 400, cascata vazia mantém capítulos atuais', ...);
  it('manual: páginas decrescentes → 400 com a mensagem exata; válidas → source MANUAL', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/services/__tests__/chapter-extraction-service.test.ts` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `chapter-repository.ts` (Prisma; o UPDATE de chunks por faixa via `db.$executeRaw` com `"pageNumber" BETWEEN fromPage AND toPage`) e `chapter-extraction-service.ts` com as assinaturas e decisões acima; `defaultDeps` usa `readPdfNavigation`, `loggedStreamChat`, os repositórios e `storageService`.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/rag/services/chapter-repository.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts && git commit -m "feat(rag): cascata de extração de capítulos e vínculo dos chunks"`

---

### Task 5: Extração de capítulos no upload

**Files:**
- Modify: `src/domains/rag/services/library-service.ts:19-41` (`LibraryDeps`, `defaultDeps`), `:174-180` (após `indexEmbeddings`)
- Test: `src/domains/rag/services/__tests__/library-service.test.ts`

**Interfaces:**
- Consumes: `extractAndSaveChapters` (Task 4).
- Produces: `LibraryDeps.chapters: { extractAndSave(materialId: string, input: ExtractionInput): Promise<unknown> }`. Chamado só quando `validation.mimeType === 'application/pdf'`, depois de `indexEmbeddings`, com `{ buffer: file.buffer, pages: parsed.pages, totalPages: parsed.totalPages }`. Exceção é capturada com `console.warn('[LibraryService] Falha ao extrair capítulos ...')` e não altera o retorno nem o status.

- [ ] **Step 1: Escrever o teste que falha** — adicionar `chapters: { extractAndSave: vi.fn(async () => undefined) }` ao `makeDeps` (`library-service.test.ts:11-58`) e:
  ```ts
  it('PDF chama a extração de capítulos depois de gravar os chunks', ...);   // ordem: createChunks antes de extractAndSave; args ('m1', { totalPages, pages })
  it('falha na extração de capítulos não derruba o upload', ...);           // extractAndSave rejeita → resolve com material.status INDEXED
  it('texto colado (.txt) não chama a extração', ...);                      // ingestTextDocument → extractAndSave não chamado
  ```
  O teste de PDF mocka `parseDocumentFile` (`vi.mock('../../file-parser', ...)` mantendo `validateFileSafety` real) e usa buffer iniciando com `%PDF`.
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/services/__tests__/library-service.test.ts` — Expected: FAIL ("expected spy to be called").
- [ ] **Step 3: Implementar** a chamada em `uploadAndIngest` e o campo em `LibraryDeps`/`defaultDeps` (`{ extractAndSave: extractAndSaveChapters }`).
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS (incluindo os testes antigos do arquivo).
- [ ] **Step 5: Commit** — `git add src/domains/rag/services/library-service.ts src/domains/rag/services/__tests__/library-service.test.ts && git commit -m "feat(biblioteca): extrai capítulos ao enviar PDF"`

---

### Task 6: Rotas de capítulos do material

**Files:**
- Create: `src/lib/validators/material-chapters.validator.ts`
- Create: `src/app/api/v1/library/materials/[id]/chapters/route.ts`
- Create: `src/app/api/v1/library/materials/[id]/chapters/extract/route.ts`
- Test: `src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `listMaterialChapters`, `replaceManualChapters`, `reextractMaterialChapters` (Task 4).
- Produces:
  ```ts
  export const materialChaptersSchema = z.object({
    chapters: z.array(z.object({ title: z.string().trim().min(1).max(200), startPage: z.number().int().min(1) })).max(200),
  });
  ```
  `GET` → `{ success: true, chapters }`. `PUT` → body inválido 400 `{ success: false, error: 'Capítulos inválidos: informe título e página inicial de cada capítulo.' }`; válido → `{ success: true, ...ChapterSaveResult }`. `POST .../extract` → `{ success: true, ...ChapterSaveResult }`. Todas: `requireUser(req, [Role.TEACHER, Role.ADMIN])`, `apiError`. Padrão de rota: `reindex/route.ts`.

- [ ] **Step 1: Escrever o teste que falha** (mocks com `vi.hoisted` como `plans/__tests__/route.test.ts:4-15`)
  ```ts
  it('PUT com startPage não inteiro devolve 400 e não chama o service', ...);
  it('PUT válido delega a replaceManualChapters com { title, startPage } e devolve lostLessonLinks', ...);
  it('PUT propaga 400 de páginas decrescentes do service via apiError', ...);  // service lança DomainError(400, 'As páginas iniciais devem ser crescentes e estar entre 1 e 300.')
  it('POST extract devolve source e capítulos', ...);
  it('aluno recebe 403', ...);                                                 // requireUser rejeita DomainError(403)
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run "src/app/api/v1/library/materials/[id]/chapters"` — Expected: FAIL (rota inexistente).
- [ ] **Step 3: Implementar** validator e as duas rotas.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/validators/material-chapters.validator.ts "src/app/api/v1/library/materials/[id]/chapters" && git commit -m "feat(biblioteca): rotas de listar, editar e extrair capítulos"`

---

### Task 7: Painel "Capítulos" na biblioteca

**Files:**
- Create: `src/app/teacher/materials/_components/use-material-chapters.ts`
- Create: `src/app/teacher/materials/_components/MaterialChaptersPanel.tsx`
- Modify: `src/app/teacher/materials/_components/MaterialsTable.tsx:234-244` (novo botão antes do de excluir), `materials-constants.ts:1-15` (`totalPages: number`)
- Test: `src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx`

**Interfaces:**
- Consumes: rotas da Task 6; `requestJson` (`@/components/assessments/use-assessments`); `AdaptiveModal` (`@/components/adaptive/adaptive-modal`).
- Produces:
  ```ts
  export function fetchMaterialChapters(id: string): Promise<ChapterDTO[]>;
  export function saveMaterialChapters(id: string, chapters: { title: string; startPage: number }[]): Promise<ChapterSaveResult>;
  export function extractMaterialChapters(id: string): Promise<ChapterSaveResult>;
  export function MaterialChaptersPanel(props: { material: { id: string; title: string; totalPages: number; mimeType?: string | null }; open: boolean; onOpenChange(open: boolean): void }): JSX.Element;
  export const CHAPTER_SOURCE_LABEL = { OUTLINE: 'Marcadores do PDF', AI: 'Extraído por IA', MANUAL: 'Manual' } as const;
  ```
  Tipos `ChapterDTO`/`ChapterSaveResult` redeclarados localmente no arquivo do cliente (sem importar de `src/domains`). Comportamento: lista vazia mostra `'Sem capítulos'` e os botões `'Extrair de novo'` e `'Adicionar capítulo'`; cada linha tem inputs com `aria-label` `` `Título do capítulo ${n}` `` e `` `Página inicial do capítulo ${n}` `` e botão `` `Remover capítulo ${n}` ``; badge com `CHAPTER_SOURCE_LABEL[chapters[0].source]`; `'Salvar capítulos'` faz PUT; resposta com `lostLessonLinks > 0` mostra `` `${n} aula(s) perderam o vínculo com os capítulos deste livro.` `` em `role="status"`; extração com `source: null` mostra `'Nenhum capítulo encontrado; os capítulos atuais foram mantidos.'`; erro em `role="alert"`. Material não-PDF: botão de abrir o painel não aparece na tabela.

- [ ] **Step 1: Escrever o teste que falha** (`routeFetch` como em `TeachingPlanNewPage.test.tsx:44-50`)
  ```ts
  it('material sem capítulos mostra "Sem capítulos" e extrair de novo chama POST extract', ...);
  it('mostra a origem e salva a lista editada com PUT { chapters: [{ title, startPage }] }', ...);
  it('avisa quantas aulas perderam vínculo', ...);   // PUT → { lostLessonLinks: 3 } → '3 aula(s) perderam o vínculo com os capítulos deste livro.'
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** cliente, painel e botão `title="Capítulos"` (ícone `ListTree` do lucide) em `MaterialsTable`, só para `mimeType === 'application/pdf'`.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS; `npx next lint --file src/app/teacher/materials/_components/MaterialChaptersPanel.tsx` limpo.
- [ ] **Step 5: Commit** — `git add src/app/teacher/materials/_components && git commit -m "feat(biblioteca): painel de capítulos editável por material"`

---

### Task 8: Referências do plano ligadas aos materiais (backend)

**Files:**
- Modify: `src/lib/validators/teaching-plan.validator.ts:3-16`
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts:9-13` (include), novo `replacePlanReferences`
- Modify: `src/domains/teaching/services/teaching-plan-service.ts:13-24` (deps), `:26-41` (`CreatePlanInput`), `:86-116` (create), `:118-149` (update)
- Test: `src/domains/teaching/services/__tests__/teaching-plan-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // validator
  export const planReferenceSchema = z.object({ materialId: z.string().min(1), kind: z.enum(['BASIC', 'COMPLEMENTARY']) });
  // updateTeachingPlanSchema ganha: references: z.array(planReferenceSchema).max(100).optional()
  export type PlanReferenceInput = z.infer<typeof planReferenceSchema>;
  // repo
  export function replacePlanReferences(teachingPlanId: string, refs: PlanReferenceInput[]): Promise<void>; // $transaction deleteMany + createMany(skipDuplicates)
  // planFull ganha: references: { select: { materialId: true, kind: true } }
  // TeachingPlanDeps ganha: references: { replacePlanReferences: typeof replacePlanReferences }
  ```
  Regras: `references === undefined` → não toca; `[]` → apaga todas. Ids duplicados no input: o primeiro vence. `references` é removido do objeto antes de `insertPlan`/`updatePlanById` (não é coluna). Gravação depois do insert/update, com o id do plano.

- [ ] **Step 1: Escrever o teste que falha** (adicionar `references: { replacePlanReferences: vi.fn() }` aos deps existentes)
  ```ts
  it('create grava as referências com o id do plano criado', ...);   // replacePlanReferences('p-new', [{ materialId: 'cm1', kind: 'BASIC' }, { materialId: 'cm2', kind: 'COMPLEMENTARY' }])
  it('update sem references preserva o conjunto; com [] limpa', ...); // Review Focus 3: sem campo → não chamado; [] → chamado com []
  it('references não vai para o repo do plano', ...);                // insertPlan/updatePlanById recebem data sem a chave references
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/teaching-plan-service.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** validator, repo e service.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS; `npx vitest run src/app/api/v1/teacher/plans` também PASS.
- [ ] **Step 5: Commit** — `git add src/lib/validators/teaching-plan.validator.ts src/domains/teaching/services/teaching-plan-repository.ts src/domains/teaching/services/teaching-plan-service.ts src/domains/teaching/services/__tests__/teaching-plan-service.test.ts && git commit -m "feat(plano): referências bibliográficas ligadas aos materiais"`

---

### Task 9: Bibliografia básica e complementar na tela do plano

**Files:**
- Modify: `src/app/teacher/plans/new/types.ts` (`DocumentReference`)
- Modify: `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx:24-43` (`restoreReferences`), `:110-112` (carga), `:244` (salvar)
- Modify: `src/app/teacher/plans/new/_components/ReferenceSelectionModal.tsx:29-37,123,136` (abas de tipo)
- Modify: `src/app/teacher/plans/new/_components/PlanBibliographyCard.tsx` (badge)
- Test: `src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx`

**Interfaces:**
- Consumes: `plan.references` do `GET /plans/[id]` (Task 8).
- Produces:
  ```ts
  // types.ts
  export type ReferenceKindValue = 'BASIC' | 'COMPLEMENTARY';
  export interface DocumentReference { /* atuais */ kind?: ReferenceKindValue } // ausente = BASIC
  // TeachingPlanNewPage.tsx
  async function restoreReferences(plan: { references?: { materialId: string; kind: ReferenceKindValue }[]; basicBibliography: string[]; complementaryBiblio: string[] }): Promise<DocumentReference[]>
  ```
  Regras: com `plan.references` não vazio, monta as referências pelo `id` dos documentos de `GET ${API_ROUTES.LIBRARY}/documents` (material que sumiu do acervo é omitido); sem `references`, cai no casamento por título atual para `basicBibliography` (`BASIC`) e `complementaryBiblio` (`COMPLEMENTARY`). Salvar envia `basicBibliography` (refs `BASIC`), `complementaryBiblio` (refs `COMPLEMENTARY`), ambos em `"Título (Autor) [Categoria]"`, e `references: [{ materialId, kind }]` só das refs com id real (exclui `id.startsWith('ref-loaded-')`). Modal: duas abas no topo, `'Bibliografia básica'` e `'Bibliografia complementar'` (`role="tab"`), acima das abas de modo; o `kind` da aba ativa é gravado em cada ref passada a `onAddReferences`. Card: badge `'Complementar'` nas refs `COMPLEMENTARY`.

- [ ] **Step 1: Escrever o teste que falha**
  ```ts
  it('salvar envia references com materialId e kind, e separa básica de complementar', ...);
  // mock do modal passa [REF, { ...REF2, kind: 'COMPLEMENTARY' }]; body do POST:
  // basicBibliography: ['Sistemas de Banco de Dados (Elmasri) [Banco de Dados]'], complementaryBiblio: [<REF2>],
  // references: [{ materialId: 'cdoc0000001', kind: 'BASIC' }, { materialId: 'cdoc0000002', kind: 'COMPLEMENTARY' }]
  it('plano com references reabre pelos ids, sem casar por título', ...);   // título no texto diferente do acervo, mas id casa → referência aparece com o título do acervo
  it('plano antigo sem references cai no casamento por título', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** as mudanças acima.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS (os 6 testes antigos continuam verdes).
- [ ] **Step 5: Commit** — `git add src/app/teacher/plans/new && git commit -m "feat(plano): bibliografia básica e complementar ligadas ao acervo"`

---

### Task 10: Capítulos do plano (rota, helper do combobox, hook)

**Files:**
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts` (novo `listPlanChapters`)
- Create: `src/domains/teaching/services/plan-chapters-service.ts`
- Create: `src/app/api/v1/teacher/plans/[id]/chapters/route.ts`
- Create: `src/components/teaching/chapter-combobox-item.ts`
- Create: `src/components/teaching/use-plan-chapters.ts`
- Test: `src/domains/teaching/services/__tests__/plan-chapters-service.test.ts`, `src/components/teaching/__tests__/chapter-combobox-item.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // plan-chapters-service.ts
  export type PlanChapter = { id: string; order: number; title: string; startPage: number; endPage: number | null };
  export type PlanChapterBook = { materialId: string; title: string; author: string; kind: 'BASIC' | 'COMPLEMENTARY'; chapters: PlanChapter[] };
  export type PlanChaptersDeps = { findPlanOwner(id: string): Promise<{ teacherId: string } | null>; listPlanChapters(planId: string): Promise<PlanChapterBook[]> };
  export function listPlanChapters(planId: string, user: PlanActor, deps?): Promise<PlanChapterBook[]>; // 404 'Plano de ensino não encontrado.', assertOwner
  export function planChapterIds(books: PlanChapterBook[]): Set<string>;
  // repo: listPlanChapters(planId) — references → material → chapters ordenados; livros BASIC antes de COMPLEMENTARY, depois por título; livros sem capítulos incluídos com chapters: []
  // rota GET → { success: true, books }
  // chapter-combobox-item.ts (cliente; tipos estruturais locais)
  export function chapterToComboboxItem(chapter: { id: string; order: number; title: string; startPage: number; endPage: number | null }, book: { title: string; author: string }): ComboboxItem;
  export function planChaptersToComboboxItems(books: ClientPlanChapterBook[]): ComboboxItem[];
  export function formatChapterShortList(orders: number[]): string;
  // use-plan-chapters.ts
  export function usePlanChapters(planId: string | null): { books: ClientPlanChapterBook[]; isLoading: boolean; error: string | null; reload(): void };
  ```
  Formatos: título `` `Cap. ${order}: ${title}` ``, subtítulo `` `${book.title} (${book.author})` ``, badge `` `p. ${startPage} a ${endPage}` `` ou `` `p. ${startPage}` `` sem `endPage`. `formatChapterShortList([4, 3, 3])` → `'Cap. 3, 4'`; `[]` → `'—'`.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('chapterToComboboxItem formata título, subtítulo e páginas', () =>
    expect(chapterToComboboxItem({ id: 'ch1', order: 3, title: 'Modelo ER', startPage: 41, endPage: 67 }, { title: 'Sistemas de Banco de Dados', author: 'Elmasri' }))
      .toEqual({ id: 'ch1', title: 'Cap. 3: Modelo ER', subtitle: 'Sistemas de Banco de Dados (Elmasri)', badge: 'p. 41 a 67' }));
  it('formatChapterShortList ordena, deduplica e usa travessão quando vazio', ...);
  it('listPlanChapters: 404 sem plano, 403 de outro professor, devolve livros do repo', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/plan-chapters-service.test.ts src/components/teaching/__tests__/chapter-combobox-item.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** repo, service, rota (`requireUser` TEACHER/ADMIN + `apiError`), helper e hook (padrão `useList` de `use-schedules.ts:34-58`, `requestJson`).
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/teaching/services/teaching-plan-repository.ts src/domains/teaching/services/plan-chapters-service.ts src/domains/teaching/services/__tests__/plan-chapters-service.test.ts "src/app/api/v1/teacher/plans/[id]/chapters" src/components/teaching/chapter-combobox-item.ts src/components/teaching/use-plan-chapters.ts src/components/teaching/__tests__/chapter-combobox-item.test.ts && git commit -m "feat(plano): capítulos do plano agrupados por livro"`

---

### Task 11: Status da aula e agenda só para publicadas

**Files:**
- Modify: `src/lib/constants/teaching.ts` (`LESSON_STATUS`)
- Modify: `src/domains/agendas/services/agenda-repository.ts:77-86` (novo `setAgendaStatusByLessonPlanId`)
- Modify: `src/domains/teaching/services/lesson-service.ts:29-39` (`LessonWithContext`), `:41-62` (deps), `:73-87` (`syncAgendaForLesson`), novo `setLessonStatus`
- Modify: `src/lib/validators/lesson.validator.ts` (`lessonStatusSchema`)
- Create: `src/domains/teaching/lesson-publish.ts`
- Create: `src/app/api/v1/teacher/lessons/[id]/status/route.ts`
- Test: `src/domains/teaching/services/__tests__/lesson-service.test.ts`, `src/app/api/v1/teacher/lessons/[id]/status/__tests__/route.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LESSON_STATUS = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' } as const;
  export type LessonStatusValue = (typeof LESSON_STATUS)[keyof typeof LESSON_STATUS];
  // agenda-repository.ts
  export function setAgendaStatusByLessonPlanId(lessonPlanId: string, status: AgendaStatus): Promise<{ count: number }>; // updateMany
  // lesson-service.ts
  // LessonWithContext ganha: classNumber: number; status: LessonStatus; dailyObjective: string; timeScript: Prisma.JsonValue
  // LessonDeps.repo ganha: setAgendaStatusByLessonPlanId
  // lesson-publish.ts (puro, sem imports de banco)
  export function publishBlockReason(lesson: { classNumber: number; topicTitle: string; dailyObjective: string; timeScript: unknown }): string | null;
  export function setLessonStatus(id: string, user: LessonActor, status: LessonStatus, deps?): Promise<LessonWithContext>;
  // validator
  export const lessonStatusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED']) });
  ```
  Regras: `syncAgendaForLesson` retorna sem upsert quando `status !== PUBLISHED`. `publishBlockReason` (primeira regra que falhar): título igual a `` `Aula ${classNumber}` `` (após `trim`) → `'Defina um título diferente de "Aula N".'`; `dailyObjective.trim()` vazio → `'Preencha o objetivo da aula.'`; `timeScript` não-array ou vazio → `'Adicione ao menos uma etapa ao roteiro.'`. `setLessonStatus(PUBLISHED)`: motivo → 400 com o motivo; senão grava status, `syncAgendaForLesson(updated)` e `setAgendaStatusByLessonPlanId(id, SCHEDULED)` (o estado ao vivo/encerrado volta a ser derivado do relógio por `deriveAgendaStatus`, `agenda-validator.ts:96-105`). `setLessonStatus(DRAFT)`: grava status e `setAgendaStatusByLessonPlanId(id, CANCELLED)`. O editor (Task 18) importa `publishBlockReason` de `@/domains/teaching/lesson-publish`, nunca o service. Rota `PUT`: body inválido → 400 `'Status inválido.'`; resposta `{ success: true, lesson }`.

- [ ] **Step 1: Escrever o teste que falha** — atualizar `baseLesson` (`lesson-service.test.ts:19-27`) com `classNumber: 1, status: 'PUBLISHED', dailyObjective: 'Obj', timeScript: [{...}]` e `makeDeps` com `setAgendaStatusByLessonPlanId` gravando em `agendas`:
  ```ts
  it('aula DRAFT não cria agenda ao sincronizar', ...);
  it('publicar exige título, objetivo e etapa, nesta ordem', async () => {
    // topicTitle 'Aula 1' → 400 'Defina um título diferente de "Aula N".'; título ok e objetivo '' → 'Preencha o objetivo da aula.'; timeScript [] → 'Adicione ao menos uma etapa ao roteiro.'
  });
  it('despublicar cancela, republicar volta a SCHEDULED; editar rascunho não cria agenda', ...);  // Review Focus 4
  it('setLessonStatus respeita o dono (403)', ...);
  // rota
  it('PUT status com valor desconhecido devolve 400 "Status inválido."', ...);
  it('PUT status delega a setLessonStatus', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/lesson-service.test.ts "src/app/api/v1/teacher/lessons/[id]/status"` — Expected: FAIL.
- [ ] **Step 3: Implementar** conforme as regras. Testes antigos que dependem de agenda criada passam a usar aula `PUBLISHED` (fixture padrão).
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS; `npx vitest run src/domains/agendas` PASS.
- [ ] **Step 5: Commit** — `git add src/lib/constants/teaching.ts src/domains/teaching/lesson-publish.ts src/domains/agendas/services/agenda-repository.ts src/domains/teaching/services/lesson-service.ts src/lib/validators/lesson.validator.ts src/domains/teaching/services/__tests__/lesson-service.test.ts "src/app/api/v1/teacher/lessons/[id]/status" && git commit -m "feat(aulas): status rascunho/publicada e agenda só para publicadas"`

---

### Task 12: Serviço de distribuição de capítulos

**Files:**
- Create: `src/domains/agents/prompts/chapter-distribution-prompt.ts`
- Create: `src/domains/teaching/services/chapter-distribution-service.ts`
- Modify: `src/domains/teaching/services/course-schedule-repository.ts` (novo `findScheduleForDistribution`)
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts` (novo `applyChapterDistribution`)
- Modify: `src/lib/constants/teaching.ts`
- Test: `src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts`, `src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts`

**Interfaces:**
- Consumes: `PlanChapterBook`, `planChapterIds` (Task 10), `AI_UNAVAILABLE_MESSAGE`, `loggedStreamChat`, `LESSON_DEFAULT_DURATION_MINUTES`.
- Produces:
  ```ts
  // prompt
  export type DistributionItem = { classNumber: number; topicTitle: string; chapterIds: string[] };
  export function buildChapterDistributionMessages(input: {
    subjectName: string; syllabus: string; objectives: string;
    lessons: { classNumber: number; date: string; durationMinutes: number }[]; books: PlanChapterBook[];
  }): AIMessage[];
  export function parseChapterDistribution(raw: string): DistributionItem[] | null; // primeiro {...} com {"lessons":[...]}, zod tolerante
  export function isValidDistribution(items: DistributionItem[], classNumbers: number[], chapterIds: Set<string>): boolean;
  // repo
  export function findScheduleForDistribution(id: string): Promise<{ id: string; teachingPlan: { id: string; teacherId: string; syllabus: string; generalObjectives: string; specificObjectives: string; subject: { discipline: { name: string } } };
    lessonPlans: { id: string; classNumber: number; classDate: Date; status: LessonStatus }[] } | null>;
  export function applyChapterDistribution(rows: { lessonPlanId: string; topicTitle: string; chapterIds: string[] }[]): Promise<void>; // $transaction: deleteMany + createMany + update topicTitle
  // service
  export type ChapterDistributionDeps = { findSchedule: typeof findScheduleForDistribution; listPlanChapters(planId: string): Promise<PlanChapterBook[]>; apply: typeof applyChapterDistribution; streamChat: StreamChatFn };
  export type DistributionResult = { updated: number; skippedPublished: number };
  export function distributeChapters(scheduleId: string, user: PlanActor, deps?): Promise<DistributionResult>;
  // src/lib/constants/teaching.ts (compartilhado com a UI da Task 13)
  export const NO_SYNCED_LESSONS = 'Sincronize o calendário antes de distribuir os capítulos.';
  export const NO_PLAN_CHAPTERS = 'Nenhum livro do plano tem capítulos cadastrados.';
  ```
  Regras: 404 `'Cronograma não encontrado.'` → `assertOwner` → sem aulas 400 `NO_SYNCED_LESSONS` → sem nenhum capítulo nos livros 422 `NO_PLAN_CHAPTERS` → IA (`temperature: 0.2`, `maxTokens: 3000`). Prompt pede cobertura completa e ordem dos capítulos, permite repetir capítulo em aulas consecutivas, pede `topicTitle` curto; capítulos listados com id, `Cap. N: Título (p. X a Y)` por livro. `isValidDistribution`: cada `classNumber` do cronograma exatamente uma vez, nenhum extra, todo `chapterId` em `planChapterIds`, `chapterIds` não vazio. Inválida, fallback ou exceção → 503 `AI_UNAVAILABLE_MESSAGE`. `apply` só com aulas `DRAFT`; `skippedPublished` = aulas `PUBLISHED`.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('resposta válida grava só aulas DRAFT e conta as publicadas puladas', async () => {
    // aulas 1 DRAFT, 2 PUBLISHED, 3 DRAFT; IA cobre 1..3
    expect(await distributeChapters('sch1', teacher, deps)).toEqual({ updated: 2, skippedPublished: 1 });
    expect(apply).toHaveBeenCalledWith([{ lessonPlanId: 'l1', topicTitle: 'Introdução', chapterIds: ['ch1'] }, { lessonPlanId: 'l3', ... }]);
  });
  it('aula faltando na resposta → 503 e nada gravado', ...);
  it('capítulo inexistente no plano → 503 e nada gravado', ...);
  it('provider em fallback → 503 com AI_UNAVAILABLE_MESSAGE', ...);
  it('sem aulas 400, sem capítulos 422, outro professor 403', ...);
  // prompt
  it('prompt lista aulas com data e duração e capítulos com id e páginas', ...);  // contém 'Aula 1 · 2026-03-02 · 100 min' e 'id=ch1 · Cap. 1: Introdução (p. 12 a 24)'
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** prompt, repos e service.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/agents/prompts/chapter-distribution-prompt.ts src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts src/domains/teaching/services/chapter-distribution-service.ts src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts src/domains/teaching/services/course-schedule-repository.ts src/domains/teaching/services/lesson-plan-repository.ts src/lib/constants/teaching.ts && git commit -m "feat(cronograma): distribuição de capítulos pelas aulas com IA"`

---

### Task 13: Rota e tela da distribuição

**Files:**
- Create: `src/app/api/v1/teacher/schedules/[id]/distribute-chapters/route.ts`
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts:4-15` (`listLessonsBySchedule` inclui `chapters: { select: { chapterId: true, chapter: { select: { order: true } } } }`)
- Modify: `src/components/teaching/use-schedules.ts:6,32` (`ScheduleLesson`, `distributeChapters`)
- Modify: `src/app/teacher/schedules/_components/SchedulesPage.tsx:35-49,142-150`
- Modify: `src/app/teacher/schedules/_components/MeetingsTable.tsx:36-55`
- Test: `src/app/api/v1/teacher/schedules/[id]/distribute-chapters/__tests__/route.test.ts`, `src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx`

**Interfaces:**
- Consumes: `distributeChapters` (Task 12), `usePlanChapters`, `formatChapterShortList` (Task 10).
- Produces:
  ```ts
  export type ScheduleLesson = { id: string; classNumber: number; status: 'DRAFT' | 'PUBLISHED'; chapters: { chapterId: string; chapter: { order: number } }[] };
  export type DistributionResult = { updated: number; skippedPublished: number };
  export function distributeChapters(scheduleId: string): Promise<DistributionResult>;
  ```
  Rota: `POST` → `{ success: true, result }`. Tela: botão `'Distribuir capítulos com IA'` ao lado de `'Sincronizar calendário'`, desabilitado com `lockReason` (ícone `Lock` + texto, padrão `PlanHeaderControls.tsx:74-100`): sem aulas → `NO_SYNCED_LESSONS`; nenhum livro com capítulos → `NO_PLAN_CHAPTERS` (importados de `@/lib/constants/teaching`). Se alguma aula tem `chapters.length > 0`, `window.confirm('Algumas aulas já têm capítulos. Substituir a distribuição das aulas em rascunho?')` antes; cancelar não chama a API. Sucesso: `` `Capítulos distribuídos em ${updated} aulas; ${skippedPublished} aulas publicadas não foram alteradas.` `` em `role="status"` e `reloadLessons()`. Erro (inclui 503): mensagem do servidor em `role="alert"`. `MeetingsTable` ganha coluna `'Capítulos'` com `formatChapterShortList(lesson.chapters.map(c => c.chapter.order))` por `classNumber`.

- [ ] **Step 1: Escrever os testes que falham** — no `SchedulesPage.test.tsx`, mockar `@/components/teaching/use-plan-chapters` e estender o mock de `use-schedules` com `distributeChapters`:
  ```ts
  it('distribuir fica bloqueado sem aulas sincronizadas e mostra o motivo', ...);
  it('distribuir fica bloqueado quando nenhum livro do plano tem capítulos', ...);
  it('com aulas já mapeadas pede confirmação; cancelar não chama a API', ...);  // vi.spyOn(window, 'confirm').mockReturnValue(false)
  it('sucesso mostra atualizadas e puladas e a coluna Capítulos mostra "Cap. 3, 4"', ...);
  // rota
  it('POST delega a distributeChapters com o usuário e devolve result', ...);
  it('503 do service vira resposta 503 com a mensagem', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/schedules "src/app/api/v1/teacher/schedules/[id]/distribute-chapters"` — Expected: FAIL.
- [ ] **Step 3: Implementar** rota, include, cliente e UI.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add "src/app/api/v1/teacher/schedules/[id]/distribute-chapters" src/domains/teaching/services/lesson-plan-repository.ts src/components/teaching/use-schedules.ts src/app/teacher/schedules/_components && git commit -m "feat(cronograma): botão de distribuir capítulos e coluna de capítulos"`

---

### Task 14: Filtro por capítulo na busca híbrida

**Files:**
- Modify: `src/domains/rag/types.ts` (`RAGSearchQuery`)
- Modify: `src/domains/rag/services/chunk-repository.ts:24-32` (`HybridSearchParams`), `:107-118` (`chunkFilters`)
- Modify: `src/domains/rag/hybrid-search.ts:76-105`
- Test: `src/domains/rag/__tests__/hybrid-search.test.ts`

**Interfaces:**
- Produces: `RAGSearchQuery.allowedChapterIds?: string[]`; `HybridSearchParams.chapterIds?: string[]`; em `chunkFilters`, com lista não vazia: `material_chunks."chapterId" = ANY(${chapterIds}::text[])`. `executeHybridSearch` repassa `chapterIds` só quando não vazio (vazio = sem filtro, igual a `materialIds`). Remover o comentário "Kept for compatibility" só se `subjectId` continuar ignorado — não mexer nele.

- [ ] **Step 1: Escrever o teste que falha**
  ```ts
  it('repassa allowedChapterIds como chapterIds e omite quando vazio', async () => {
    await executeHybridSearch({ query: 'q', allowedChapterIds: ['ch1'] }, deps);
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ chapterIds: ['ch1'] }));
    await executeHybridSearch({ query: 'q', allowedChapterIds: [] }, deps);
    expect(search.mock.lastCall[0].chapterIds).toBeUndefined();
  });
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/rag/__tests__/hybrid-search.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar** os três pontos.
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/rag/types.ts src/domains/rag/services/chunk-repository.ts src/domains/rag/hybrid-search.ts src/domains/rag/__tests__/hybrid-search.test.ts && git commit -m "feat(rag): filtro de busca por capítulos"`

---

### Task 15: Capítulos da aula no `updateLesson`

**Files:**
- Modify: `src/lib/validators/lesson.validator.ts:55-71` (`chapterIds`)
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts:21-25` (`lessonContextInclude`: `teachingPlan.select.id: true`, `chapters: { select: { chapterId: true } }`), novo `replaceLessonChapters`
- Modify: `src/domains/teaching/services/lesson-service.ts:29-62,124-151`
- Test: `src/domains/teaching/services/__tests__/lesson-service.test.ts`

**Interfaces:**
- Consumes: `listPlanChapters` (repo, Task 10), `planChapterIds`.
- Produces:
  ```ts
  // lessonInputSchema ganha: chapterIds: z.array(z.string().min(1)).max(50).optional()
  export function replaceLessonChapters(lessonPlanId: string, chapterIds: string[]): Promise<void>; // $transaction deleteMany + createMany
  // LessonWithContext.courseSchedule.teachingPlan ganha id: string; LessonWithContext ganha chapters: { chapterId: string }[]
  // LessonDeps.repo ganha: listPlanChapters(planId: string): Promise<PlanChapterBook[]>; replaceLessonChapters
  export const CHAPTER_OUTSIDE_PLAN = 'Há capítulos que não pertencem à bibliografia do plano.';
  ```
  Regras: `chapterIds === undefined` → não toca; presente → todos em `planChapterIds(listPlanChapters(teachingPlan.id))` senão 400 `CHAPTER_OUTSIDE_PLAN` **antes** de qualquer gravação; depois `replaceLessonChapters` (ids deduplicados). `createLesson` (`teaching-content-service.ts`) ignora `chapterIds`.

- [ ] **Step 1: Escrever o teste que falha**
  ```ts
  it('grava capítulos do plano', ...);  // updateLesson('own', teacher, { chapterIds: ['ch1', 'ch1', 'ch2'] }) → replaceLessonChapters('own', ['ch1', 'ch2'])
  it('rejeita capítulo de fora do plano; salvar sem chapterIds preserva vínculos', ...);  // Review Focus 5: ['chX'] → 400 CHAPTER_OUTSIDE_PLAN e updateLesson do repo não chamado; { topicTitle } → replaceLessonChapters não chamado
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/lesson-service.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/validators/lesson.validator.ts src/domains/teaching/services/lesson-plan-repository.ts src/domains/teaching/services/lesson-service.ts src/domains/teaching/services/__tests__/lesson-service.test.ts && git commit -m "feat(aulas): capítulos da aula validados contra o plano"`

---

### Task 16: Geração da aula por IA (service)

**Files:**
- Create: `src/domains/agents/prompts/lesson-generation-prompt.ts`
- Create: `src/domains/teaching/services/lesson-generation-service.ts`
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts` (novo `findLessonForGeneration`)
- Modify: `src/lib/constants/teaching.ts` (`NO_LESSON_CHAPTERS`)
- Test: `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts`, `src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts`

**Interfaces:**
- Consumes: `executeHybridSearch` com `allowedChapterIds` (Task 14), `formatCitation`, `timeScriptSchema`/`TimeScriptItem` (`src/domains/teaching/time-script.ts`), `AI_UNAVAILABLE_MESSAGE`, `LESSON_DEFAULT_DURATION_MINUTES`.
- Produces:
  ```ts
  // repo
  export function findLessonForGeneration(id: string): Promise<GenerationLesson | null>;
  export type GenerationLesson = { id: string; classNumber: number; topicTitle: string;
    courseSchedule: { totalClasses: number; teachingPlan: { teacherId: string; syllabus: string; generalObjectives: string; subject: { discipline: { name: string } } } };
    chapters: { chapter: { id: string; order: number; title: string; startPage: number; endPage: number | null; material: { title: string; author: string } } }[] };
  // prompt
  export type GeneratedStep = { activity: string; description: string; durationMinutes: number; socraticQuestion?: string };
  export type GeneratedLessonText = { dailyObjective: string; methodology: string; resourcesNeeded: string[]; fixationExercise: string; steps: GeneratedStep[] };
  export function buildLessonGenerationMessages(input: { subjectName: string; syllabus: string; classNumber: number; totalClasses: number; durationMinutes: number;
    topicTitle: string; chapters: GenerationLesson['chapters']; chunks: DidacticChunk[] }): AIMessage[];
  export function parseLessonGeneration(raw: string): GeneratedLessonText | null;
  export function stepsToTimeScript(steps: GeneratedStep[]): TimeScriptItem[];
  // service
  export type LessonGenerationDeps = { findLesson: typeof findLessonForGeneration; search(q: RAGSearchQuery): Promise<Pick<RAGSearchResult, 'chunks'>>; streamChat: StreamChatFn };
  export type GeneratedLesson = Omit<GeneratedLessonText, 'steps'> & { timeScript: TimeScriptItem[]; citations: string[] };
  export function generateLessonContent(lessonId: string, user: PlanActor, deps?): Promise<GeneratedLesson>;
  export const NO_INDEXED_CHAPTER_CONTENT = 'Os capítulos selecionados não têm conteúdo indexado';
  // em src/lib/constants/teaching.ts (a UI da Task 18 usa o mesmo texto):
  export const NO_LESSON_CHAPTERS = 'Selecione e salve ao menos um capítulo para gerar a aula.';
  export const TIME_SCRIPT_TOLERANCE = 0.1;
  ```
  Regras: 404 `'Plano de aula não encontrado.'` → `assertOwner` → sem capítulos 400 `NO_LESSON_CHAPTERS` → três buscas em paralelo com `allowedChapterIds` = ids dos capítulos e `topK: 4`: `topicTitle`, `generalObjectives` do plano, `` `exemplos e exercícios de ${topicTitle}` `` → dedupe por id → vazio 422 `NO_INDEXED_CHAPTER_CONTENT` → IA (`temperature: 0.3`, `maxTokens: 2000`). Decisão sobre o roteiro: o schema guarda `timeSeconds` como **início** da etapa (checkpoint de vídeo, `interactive-video-player.tsx:71`), não duração; por isso a IA devolve `durationMinutes` por etapa e `stepsToTimeScript` deriva `timeSeconds = início acumulado × 60` e `timeRange = 'MM:00-MM:00'` com minutos em 2 dígitos (`'00:00-15:00'`, `'85:00-100:00'`). Soma de `durationMinutes` fora de `[duração × 0,9, duração × 1,1]` (duração 100 → 90..110) → 503 `AI_UNAVAILABLE_MESSAGE`; fallback/exceção/parse nulo → 503. `citations` = `Array.from(new Set(chunks.map(formatCitation)))`. Não grava nada.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('saída válida vira roteiro com início acumulado e citações', async () => {
    // steps 20+50+30 min
    const r = await generateLessonContent('l1', teacher, deps);
    expect(r.timeScript.map((s) => [s.timeSeconds, s.timeRange])).toEqual([[0, '00:00-20:00'], [1200, '20:00-70:00'], [4200, '70:00-100:00']]);
    expect(r.citations).toEqual(['[Sistemas de Banco de Dados · Cap. 3, pág. 41]']);
  });
  it('faz 3 buscas filtradas pelos capítulos da aula', ...);  // queries exatas e allowedChapterIds ['ch3']
  it('soma dos tempos fora da tolerância → 503', ...);         // 20+50 = 70 min
  it('soma dentro da tolerância (108 min) é aceita', ...);
  it('sem chunks → 422 com a mensagem exata', ...);
  it('sem capítulos → 400; fallback → 503; outro professor → 403', ...);
  // prompt
  it('contexto traz disciplina, ementa, "Aula 3 de 20", "100 minutos", capítulos com livro e páginas e trechos com citação', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/agents/prompts/lesson-generation-prompt.ts src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts src/domains/teaching/services/lesson-generation-service.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/domains/teaching/services/lesson-plan-repository.ts src/lib/constants/teaching.ts && git commit -m "feat(aulas): geração do conteúdo da aula a partir dos capítulos"`

---

### Task 17: Refino por campo e rotas de gerar/refinar

**Files:**
- Modify: `src/domains/agents/prompts/lesson-generation-prompt.ts` (refino)
- Modify: `src/domains/teaching/services/lesson-generation-service.ts` (`refineLessonField`)
- Modify: `src/lib/validators/lesson.validator.ts` (`refineLessonSchema`)
- Create: `src/app/api/v1/teacher/lessons/[id]/generate/route.ts`, `src/app/api/v1/teacher/lessons/[id]/refine/route.ts`
- Test: `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts`, `src/app/api/v1/teacher/lessons/[id]/generate/__tests__/route.test.ts`, `src/app/api/v1/teacher/lessons/[id]/refine/__tests__/route.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const REFINE_FIELDS = ['dailyObjective', 'methodology', 'fixationExercise', 'timeScript'] as const;
  export const refineLessonSchema = z.object({
    field: z.enum(REFINE_FIELDS), stepIndex: z.number().int().min(0).optional(),
    instruction: z.string().trim().min(1).max(500), current: z.string().max(LESSON_TEXT_MAX_LENGTH),
  }).refine((b) => (b.field === 'timeScript') === (b.stepIndex !== undefined));
  export type RefineLessonInput = z.infer<typeof refineLessonSchema>;
  export function buildLessonRefineMessages(input: { subjectName: string; topicTitle: string; chapters: GenerationLesson['chapters']; field: RefineLessonInput['field']; stepIndex?: number; instruction: string; current: string; chunks: DidacticChunk[] }): AIMessage[];
  export function refineLessonField(lessonId: string, user: PlanActor, input: RefineLessonInput, deps?): Promise<{ text: string }>;
  export const REFINE_TEMPERATURE = 0.4;
  ```
  Regras: mesmas checagens 404/403/400 da geração; **uma** busca, `query = \`${instruction} ${topicTitle}\``, `allowedChapterIds`, `topK: 2`; vazio → 422 `NO_INDEXED_CHAPTER_CONTENT`; `temperature: 0.4`, `maxTokens: 600`; resposta = texto puro `trim()` (o prompt pede só o novo texto do campo; para `timeScript` o texto é a descrição da etapa `stepIndex + 1`); vazio, fallback ou exceção → 503. Rotas: `POST generate` → `{ success: true, data: GeneratedLesson }`; `POST refine` → body inválido 400 `'Pedido de refino inválido.'`, válido → `{ success: true, text }`.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('refino usa 2 chunks dos capítulos, temperatura 0.4 e devolve o texto aparado', async () => {
    const r = await refineLessonField('l1', teacher, { field: 'methodology', instruction: 'mais prática', current: 'Aula expositiva' }, deps);
    expect(r).toEqual({ text: 'Metodologia refinada' });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'mais prática Modelo ER', topK: 2, allowedChapterIds: ['ch3'] }));
    expect(streamChat.mock.calls[0][1]).toMatchObject({ temperature: 0.4 });
  });
  it('refino sem chunks 422; resposta vazia 503', ...);
  // rotas
  it('refine sem stepIndex para timeScript devolve 400 "Pedido de refino inválido."', ...);
  it('generate devolve data do service; 422 do service vira 422', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/teaching/services/__tests__/lesson-generation-service.test.ts "src/app/api/v1/teacher/lessons/[id]/generate" "src/app/api/v1/teacher/lessons/[id]/refine"` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/domains/agents/prompts/lesson-generation-prompt.ts src/domains/teaching/services/lesson-generation-service.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/lib/validators/lesson.validator.ts "src/app/api/v1/teacher/lessons/[id]/generate" "src/app/api/v1/teacher/lessons/[id]/refine" && git commit -m "feat(aulas): refino por campo e rotas de gerar e refinar"`

---

### Task 18: Editor da aula — capítulos, gerar e publicar

**Files:**
- Modify: `src/components/teaching/use-lessons.ts:9-30,63-66`
- Modify: `src/app/teacher/lessons/_components/LessonEditor.tsx`
- Test: `src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx`

**Interfaces:**
- Consumes: rotas das Tasks 11, 15, 17; `usePlanChapters`, `planChaptersToComboboxItems` (Task 10); `AdvancedMultiCombobox` (`@/components/ui/advanced-multi-combobox`, props `selectedIds`, `onSelectionChange(ids, items)`).
- Produces:
  ```ts
  // use-lessons.ts
  // LessonItem ganha: status: LessonStatusValue; chapters: { chapterId: string; chapter: { order: number } }[]; courseSchedule: { teachingPlanId: string }
  // LessonDraft ganha: chapterIds?: string[]
  export type GeneratedLesson = { dailyObjective: string; methodology: string; resourcesNeeded: string[]; fixationExercise: string; timeScript: TimeScriptItem[]; citations: string[] };
  export function generateLesson(id: string): Promise<GeneratedLesson>;
  export function refineLesson(id: string, body: { field: 'dailyObjective' | 'methodology' | 'fixationExercise' | 'timeScript'; stepIndex?: number; instruction: string; current: string }): Promise<string>;
  export function setLessonStatus(id: string, status: LessonStatusValue): Promise<LessonItem>;
  ```
  UI: acima do card de campos, `AdvancedMultiCombobox id="lesson-chapters" label="Capítulos desta aula"` com itens do plano (`lesson.courseSchedule.teachingPlanId`); `chapterIds` vai no `saveLesson`. Botão `'Gerar aula com IA'` com `lockReason`: nenhum capítulo salvo → `NO_LESSON_CHAPTERS`; seleção diferente da salva → `'Salve os capítulos selecionados antes de gerar.'`. Com objetivo, metodologia, exercício ou etapas preenchidos, `window.confirm('Gerar com IA substitui o conteúdo atual do formulário. Continuar?')`. Sucesso preenche objetivo, metodologia, recursos (um por linha), exercício e etapas, e mostra as citações (`'Fontes: ...'`); não salva. Cabeçalho do card: badge `'Rascunho'`/`'Publicada'` e botão `'Publicar'` (desabilitado com `publishBlockReason(lesson)` de `@/domains/teaching/lesson-publish`, sobre o estado **salvo**) ou `'Despublicar'`; ambos chamam `setLessonStatus` e `onSaved()`. Notice do salvar passa a `'Aula salva.'` quando `DRAFT` e mantém `'Aula salva e agenda da turma atualizada.'` quando `PUBLISHED`.

- [ ] **Step 1: Escrever o teste que falha** — novo arquivo; mock de `@/components/ui/advanced-multi-combobox` renderizando checkboxes por item; mock de `@/components/teaching/use-plan-chapters`; `fetch` via `routeFetch`:
  ```ts
  it('"Gerar" bloqueado sem capítulo salvo e com seleção não salva, cada um com seu motivo', ...);
  it('gerar com conteúdo existente pede confirmação e preenche o formulário com a resposta', ...);  // POST /api/v1/teacher/lessons/l1/generate
  it('"Publicar" bloqueado mostra o que falta; aula completa publica com PUT status', ...);           // 'Defina um título diferente de "Aula N".'
  it('aula publicada mostra badge "Publicada" e botão "Despublicar"', ...);
  it('salvar envia chapterIds selecionados', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS; `npx vitest run src/app/teacher/lessons` PASS.
- [ ] **Step 5: Commit** — `git add src/components/teaching/use-lessons.ts src/app/teacher/lessons/_components/LessonEditor.tsx src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx && git commit -m "feat(aulas): capítulos, geração por IA e publicação no editor"`

---

### Task 19: Botão "Refinar" por campo

**Files:**
- Create: `src/app/teacher/lessons/_components/RefineField.tsx`
- Modify: `src/app/teacher/lessons/_components/LessonEditor.tsx` (objetivo, metodologia, exercício, descrição de cada etapa)
- Test: `src/app/teacher/lessons/_components/__tests__/RefineField.test.tsx`

**Interfaces:**
- Consumes: `refineLesson` (Task 18).
- Produces:
  ```ts
  export function RefineField(props: { label: string; value: string; onApply(text: string): void; request(instruction: string): Promise<string>; disabled?: boolean }): JSX.Element;
  ```
  Comportamento: botão `` `Refinar ${label}` `` abre input `aria-label={\`Instrução para refinar ${label}\`}` e botão `'Aplicar'`; sucesso chama `onApply(novo)` e mostra `'Antes:'` com o texto anterior e botão `'Desfazer'`, que chama `onApply(anterior)` uma vez e some; erro em `role="alert"`; `disabled` quando a aula não tem capítulo salvo (mesmo motivo do gerar).

- [ ] **Step 1: Escrever o teste que falha**
  ```ts
  it('aplica o texto refinado, mostra o anterior e desfaz uma vez', async () => {
    const onApply = vi.fn();
    render(<RefineField label="metodologia" value="Expositiva" onApply={onApply} request={async () => 'Prática guiada'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refinar metodologia' }));
    fireEvent.change(screen.getByLabelText('Instrução para refinar metodologia'), { target: { value: 'mais prática' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('Prática guiada'));
    expect(screen.getByText('Expositiva')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onApply).toHaveBeenLastCalledWith('Expositiva');
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });
  it('erro do servidor aparece em alert e não altera o campo', ...);
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/RefineField.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implementar** o componente e plugá-lo no editor (`field: 'timeScript'` + `stepIndex` para etapas, aplicando em `description`).
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS; `LessonEditor.test.tsx` continua PASS.
- [ ] **Step 5: Commit** — `git add src/app/teacher/lessons/_components/RefineField.tsx src/app/teacher/lessons/_components/LessonEditor.tsx src/app/teacher/lessons/_components/__tests__/RefineField.test.tsx && git commit -m "feat(aulas): refinar campo a campo com desfazer"`

---

### Task 20: Tutor escopado aos capítulos da aula

**Files:**
- Modify: `src/domains/agents/tutor-pipeline.ts:16-20` (request), `:73-77` (busca e prompt)
- Modify: `src/domains/agents/services/chat-service.ts:44-66` (deps), `:155-158` (chamada)
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts` (novo `findLessonTutorScope`)
- Test: `src/domains/agents/__tests__/tutor-pipeline.test.ts`, `src/domains/agents/services/__tests__/chat-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // tutor-pipeline.ts (continua sem acesso a banco)
  export type TutorScope = { allowedChapterIds?: string[]; allowedMaterialIds?: string[]; chapterLabels?: string[] };
  // TutorPipelineRequest ganha: scope?: TutorScope
  // repo
  export function findLessonTutorScope(lessonPlanId: string): Promise<{ chapters: { id: string; order: number; title: string; material: { title: string } }[]; planMaterialIds: string[] } | null>;
  // chat-service
  // ChatDeps ganha: findTutorScope?(lessonPlanId: string): Promise<TutorScope | undefined>
  export function toTutorScope(raw: Awaited<ReturnType<typeof findLessonTutorScope>>): TutorScope | undefined;
  ```
  Regras: `toTutorScope` — capítulos presentes → `{ allowedChapterIds, chapterLabels: ['Cap. 3: Modelo ER (Sistemas de Banco de Dados)'] }`; sem capítulos e com materiais → `{ allowedMaterialIds }`; nada → `undefined`. `runChat` chama `findTutorScope` só quando `agenda.lessonPlanId` existe. Pipeline: busca com `{ query, topK: 2, allowedChapterIds?, allowedMaterialIds? }`; com `chapterLabels` acrescenta ao system prompt a linha `` `Esta aula cobre: ${labels.join('; ')}.` ``. `defaultDeps.findTutorScope = async (id) => toTutorScope(await findLessonTutorScope(id))`.

- [ ] **Step 1: Escrever os testes que falham**
  ```ts
  it('com escopo de capítulos filtra a busca e cita os capítulos no prompt', ...);  // search recebe allowedChapterIds ['ch3']; prompt contém 'Esta aula cobre: Cap. 3: Modelo ER (Sistemas de Banco de Dados).'
  it('sem escopo busca no acervo inteiro como hoje', ...);                          // search recebe só { query, topK: 2 }
  it('toTutorScope: capítulos > materiais do plano > nada', ...);
  it('chat de agenda sem lessonPlanId não consulta o escopo', ...);                 // findTutorScope não chamado
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/domains/agents` — Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS (tolerar o instável conhecido do chat route só se isolado passar).
- [ ] **Step 5: Commit** — `git add src/domains/agents/tutor-pipeline.ts src/domains/agents/services/chat-service.ts src/domains/teaching/services/lesson-plan-repository.ts src/domains/agents/__tests__/tutor-pipeline.test.ts src/domains/agents/services/__tests__/chat-service.test.ts && git commit -m "feat(tutor): busca restrita aos capítulos da aula"`

---

### Task 21: Badges de status na lista de aulas

**Files:**
- Modify: `src/app/teacher/lessons/_components/LessonsPage.tsx:117-129`
- Test: `src/app/teacher/lessons/_components/__tests__/LessonsPage.test.tsx`

**Interfaces:**
- Consumes: `LessonItem.status` (Task 18), `LESSON_STATUS`.
- Produces: em cada botão de aula, `Badge` com `'Publicada'` (`status === 'PUBLISHED'`) ou `'Rascunho'`.

- [ ] **Step 1: Escrever o teste que falha** — o mock de `use-lessons` (`LessonsPage.test.tsx:45-47`) passa a devolver duas aulas:
  ```ts
  it('cada aula mostra badge Rascunho ou Publicada', () => {
    search = 'planId=plan-2&scheduleId=sch-9';
    render(<LessonsPage />);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Publicada')).toBeTruthy();
  });
  ```
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/app/teacher/lessons/_components/__tests__/LessonsPage.test.tsx` — Expected: FAIL ("Unable to find an element with the text: Rascunho").
- [ ] **Step 3: Implementar.** Ajustar o texto do cabeçalho (`LessonsPage.tsx:44-47`) para: `'Edite o roteiro de cada encontro, gere o conteúdo a partir dos capítulos e publique a aula para a turma.'`
- [ ] **Step 4: Rodar e ver passar** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/app/teacher/lessons/_components/LessonsPage.tsx src/app/teacher/lessons/_components/__tests__/LessonsPage.test.tsx && git commit -m "feat(aulas): badge de rascunho ou publicada na lista"`

---

### Task 22: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1:** `npx tsc --noEmit` — Expected: sem erros.
- [ ] **Step 2:** `npx next lint` — Expected: sem erros novos.
- [ ] **Step 3:** `npx vitest run` — Expected: tudo PASS (exceto, no máximo, o instável conhecido do chat route, que passa isolado).
- [ ] **Step 4:** `npx prisma migrate reset --force && npx prisma db seed` — Expected: reset e seed sem erro; aula 3 do seed `PUBLISHED`, demais `DRAFT`.
- [ ] **Step 5: Checklist manual** (app rodando): enviar PDF com marcadores → painel mostra "Marcadores do PDF"; editar e salvar capítulos; plano com bibliografia básica e complementar reabre igual; distribuir capítulos num cronograma sincronizado; gerar e refinar uma aula; publicar → aparece na agenda do aluno; despublicar → agenda cancelada; com provider mock, gerar devolve a mensagem de IA indisponível.
- [ ] **Step 6: Commit** só se houver ajuste: `git add <arquivos> && git commit -m "chore: ajustes da verificação final de aulas por capítulos"`
