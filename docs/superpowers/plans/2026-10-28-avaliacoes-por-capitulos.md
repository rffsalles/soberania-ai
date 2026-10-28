# Avaliações ancoradas em capítulos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O professor restringe a avaliação a capítulos dos livros do plano, a IA gera questões só desses capítulos rotulando a origem, e a prova salva/publicada segue pelo fluxo de prova do aluno que já existe.

**Architecture:** Nova junção `AssessmentChapter` (espelho de `LessonPlanChapter`) guarda a seleção normalizada; um helper `chapter-scope` centraliza expansão de descendentes e rótulo, reutilizado por aula, tutora e prova. `generateQuestions` passa de unidades para capítulos (uma busca híbrida por capítulo com `allowedChapterIds`), e o `AssessmentEditor` troca o card de unidades por `ChapterTreeSelect`.

**Tech Stack:** Next.js (App Router), Prisma/PostgreSQL, zod, vitest + Testing Library (jsdom).

**Spec:** docs/superpowers/specs/2026-10-28-avaliacoes-por-capitulos-design.md

## Global Constraints

- Todo trabalho em `main`; nenhum passo cria branch ou worktree; sem pull request.
- Commits em português, conventional commits, terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Migration só com `npx prisma migrate dev --name assessment_chapters` seguido de `npx prisma generate`. Proibido `prisma migrate reset` e `db seed`; se o `migrate dev` pedir reset, pare e avise o usuário.
- `chapterId` é opcional em `questionSchema` (`z.string().optional()`): provas antigas continuam válidas.
- Lista expandida vazia nunca abre o escopo: volta aos ids escolhidos.
- Seleção gravada = só a raiz de cada ramo (`normalizeChapterSelection`); expansão só na leitura.
- Orçamento: `assessmentMaxTokens = (n) => Math.min(8000, 800 + 250 * n)`; temperatura `0.4`.
- Busca: uma por capítulo escolhido, `topK: 4`, em paralelo, dedupe por `chunk.id`; amostra `sampleByChapter(expandidos, 4, 12)`.
- Erros: `CHAPTER_OUTSIDE_PLAN` 400 (POST, PUT, generate); `NO_INDEXED_CHAPTER_CONTENT` 422; `ASSESSMENT_PUBLISHED` 409; questões/rubricas inválidas no POST 400; `rate_limit` do provedor 429.
- `DomainError(status, message)` não tem campo de código: "código" = constante de mensagem exportada.
- Testes focados: `npx vitest run <path>`; tipos: `npm run typecheck` (`tsc --noEmit`).

## Review Focus

1. `PUT` sem a chave `chapterIds` (cliente antigo, outra tela) → a junção não é tocada (`replaceAssessmentChapters` não é chamado). Teste na Task 5.
2. Payload com duplicata e pai+filho (`['u2', 's22', 'u2']`) → gravado `['u2']`; na geração, uma única busca com `allowedChapterIds` expandidos de `u2`. Testes nas Tasks 4 e 5.
3. Prova antiga reaberta (`chapterIds: []`, questões sem `chapterId`) → editor sem rótulo de capítulo, "Gerar com IA" travado com "Selecione ao menos um capítulo.", "Salvar" continua habilitado. Teste na Task 6.
4. IA devolve `chapterId: null` ou numérico numa questão → o campo vira `undefined` e a questão é mantida (não cai no fallback). Teste na Task 4 (parser).
5. Provedor devolve JSON válido mas com chunk `fallbackReason: 'rate_limit'` → 429, nunca questões. Teste na Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | model `AssessmentChapter` + relações em `Assessment` e `MaterialChapter` |
| `prisma/migrations/<ts>_assessment_chapters/` | gerado pelo `migrate dev` |
| `prisma/seed-data/academic.ts` | `DEMO_ASSESSMENT` com ids string e `rationale` |
| `prisma/seed-data/__tests__/academic.test.ts` (novo) | seed passa em `questionSchema` |
| `src/lib/constants/teaching.ts` | passa a abrigar `CHAPTER_OUTSIDE_PLAN`, `NO_INDEXED_CHAPTER_CONTENT`, novo `ASSESSMENT_PUBLISHED` |
| `src/domains/rag/chapter-label.ts` (novo) | `formatChapterLabel` puro (importável no cliente) |
| `src/domains/rag/services/chapter-scope.ts` (novo) | `expandChapterScope`; reexporta `formatChapterLabel` |
| `src/domains/teaching/services/plan-chapters-service.ts` | novo `resolveChapterSelection` (dedup + valida + normaliza) |
| `lesson-generation-service.ts`, `chat-service.ts`, `lesson-generation-prompt.ts` | migram para o helper sem mudar comportamento |
| `src/domains/assessments/question-schema.ts` | `chapterId` opcional |
| `src/domains/assessments/services/exam-service.ts` | projeção pública repassa `chapterId` |
| `src/lib/validators/assessment.validator.ts` | `chapterIds` em generate (obrigatório) e update (opcional) |
| `src/domains/agents/prompts/assessment-prompt.ts` | prompt por capítulos; parser tolerante a `chapterId` |
| `src/domains/assessments/services/assessment-service.ts` | geração por capítulos; `updateAssessment` com 409 e escopo |
| `src/domains/teaching/services/assessment-repository.ts` | `replaceAssessmentChapters`; listagem/consulta com capítulos |
| `src/domains/teaching/services/teaching-content-service.ts` | `createAssessment` valida e grava escopo; `listAssessments` devolve `chapterIds` |
| `src/components/assessments/use-assessments.ts` | tipos `chapterIds` no cliente |
| `src/app/teacher/assessments/_components/AssessmentEditor.tsx` | árvore, `lockReason`, rótulo por questão, aviso offline |

---

### Task 1: Dados — junção, migration e seed válido

**Files:**
- Modify: `prisma/schema.prisma:358-374` (Assessment), `prisma/schema.prisma:416-436` (MaterialChapter)
- Modify: `prisma/seed-data/academic.ts:90-136`
- Create: `prisma/seed-data/__tests__/academic.test.ts`

**Interfaces:**
- Produces: `db.assessmentChapter` (`{ assessmentId, chapterId }`), `Assessment.chapters`, `MaterialChapter.assessmentLinks`.

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { questionSchema } from '@/domains/assessments/question-schema';
import { DEMO_ASSESSMENT } from '../academic';

describe('DEMO_ASSESSMENT', () => {
  it('questões passam em questionSchema com ids q1..qN', () => {
    expect(z.array(questionSchema).safeParse(DEMO_ASSESSMENT.questions).success).toBe(true);
    expect(DEMO_ASSESSMENT.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run prisma/seed-data/__tests__/academic.test.ts` — Expected: FAIL (`success` false: `id` numérico, `rationale` ausente).
- [ ] **Step 3: Implement schema, migration e seed**
  - Em `schema.prisma`, adicione o model `AssessmentChapter` exatamente como na seção 1 do spec (`@@id([assessmentId, chapterId])`, `@@map("assessment_chapters")`, ambos `onDelete: Cascade`); `Assessment` ganha `chapters AssessmentChapter[]`; `MaterialChapter` ganha `assessmentLinks AssessmentChapter[]`.
  - Rode `npx prisma migrate dev --name assessment_chapters` e depois `npx prisma generate`.
  - No seed, ids `1,2,3` → `'q1','q2','q3'`; cada questão ganha `rationale` de uma frase justificando a alternativa correta.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run prisma/seed-data/__tests__/academic.test.ts && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations prisma/seed-data
git commit -m "feat(avaliacoes): junção assessment_chapters e seed da prova demo válido

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Escopo de capítulos compartilhado

**Files:**
- Create: `src/domains/rag/chapter-label.ts`, `src/domains/rag/services/chapter-scope.ts`
- Create: `src/domains/rag/services/__tests__/chapter-scope.test.ts`
- Modify: `src/lib/constants/teaching.ts:95` (constantes), `src/domains/teaching/services/lesson-service.ts:31`, `src/domains/teaching/services/lesson-generation-service.ts:22,72-76,89,164`
- Modify: `src/domains/teaching/services/plan-chapters-service.ts:37-57`
- Modify: `src/domains/agents/services/chat-service.ts:81-97`
- Modify: `src/domains/agents/prompts/lesson-generation-prompt.ts:46-51`
- Test: `src/domains/teaching/services/__tests__/plan-chapters-service.test.ts`

**Interfaces:**
- Produces:
  - `formatChapterLabel(chapter: { number: string; title: string; book: { title: string; author: string }; startPage: number; endPage: number | null }): string` em `src/domains/rag/chapter-label.ts` (reexportado por `chapter-scope.ts`).
  - `type ChapterScopeDeps = { listDescendantIds(chapterIds: string[]): Promise<string[]> }`; `expandChapterScope(chapterIds: string[], deps?: ChapterScopeDeps): Promise<string[]>`.
  - `resolveChapterSelection(ids: string[], books: PlanChapterBook[]): string[]` — lança `DomainError(400, CHAPTER_OUTSIDE_PLAN)`.
  - Em `src/lib/constants/teaching.ts`: `CHAPTER_OUTSIDE_PLAN`, `NO_INDEXED_CHAPTER_CONTENT` (movidos, mesmos textos), `ASSESSMENT_PUBLISHED = 'Avaliação publicada não pode ser editada.'`. `lesson-service.ts` e `lesson-generation-service.ts` reexportam os dois primeiros (imports atuais seguem válidos).

- [ ] **Step 1: Write the failing test**
`chapter-scope.test.ts`:
```ts
const book = { title: 'Matemática Básica', author: 'Silva' };
it('expande escolhidos + descendentes', async () => {
  const listDescendantIds = vi.fn(async () => ['s22', 's221', 's222']);
  expect(await expandChapterScope(['s22'], { listDescendantIds })).toEqual(['s22', 's221', 's222']);
  expect(listDescendantIds).toHaveBeenCalledWith(['s22']);
});
it('expansão vazia volta aos escolhidos', async () => {
  expect(await expandChapterScope(['s22'], { listDescendantIds: async () => [] })).toEqual(['s22']);
});
it('rótulo com e sem endPage', () => {
  const c = { number: '2.2', title: 'Frações', book, startPage: 48 };
  expect(formatChapterLabel({ ...c, endPage: 66 })).toBe('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66');
  expect(formatChapterLabel({ ...c, endPage: null })).toBe('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48');
});
```
Em `plan-chapters-service.test.ts` (usar `MAT_BOOK` de `@/components/teaching/__tests__/chapter-tree-fixtures`):
```ts
it('resolveChapterSelection deduplica e normaliza pai+filho', () => {
  expect(resolveChapterSelection(['u2', 's22', 'u2'], [MAT_BOOK])).toEqual(['u2']);
});
it('resolveChapterSelection rejeita id fora do plano', () => {
  expect(() => resolveChapterSelection(['zz'], [MAT_BOOK])).toThrow(CHAPTER_OUTSIDE_PLAN);
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/domains/rag/services/__tests__/chapter-scope.test.ts src/domains/teaching/services/__tests__/plan-chapters-service.test.ts` — Expected: FAIL (módulo `chapter-scope` não existe; `resolveChapterSelection` não exportado).
- [ ] **Step 3: Implement**
  - Formato do rótulo = o que `buildLessonGenerationMessages` monta hoje (`p. a a b`), para os testes de aula seguirem verdes.
  - `expandChapterScope` usa como deps padrão `{ listDescendantIds }` de `chapter-repository`.
  - `resolveChapterSelection` = corpo das linhas 147-153 de `lesson-service.updateLesson` (dedup, `planChapterIds`, `normalizeChapterSelection`); `updateLesson` passa a chamá-lo.
  - `lesson-generation-service`: apague `expandChapterIds`; linhas 89 e 164 chamam `expandChapterScope(ids, deps)`.
  - `chat-service.loadTutorScope`: `toTutorScope(raw, await expandChapterScope(chosenIds, deps))`.
  - `lesson-generation-prompt.ts:46-51`: `formatChapterLabel({ ...c, book: c.material })`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/domains/rag src/domains/teaching src/domains/agents && npm run typecheck` — Expected: PASS (inclui `lesson-generation-service.test.ts`, `lesson-generation-prompt.test.ts`, `chat-service.test.ts`, `lesson-service.test.ts` sem alteração).
- [ ] **Step 5: Commit**
```bash
git add src/domains/rag src/domains/teaching src/domains/agents src/lib/constants/teaching.ts
git commit -m "refactor(rag): helper de escopo e rótulo de capítulos compartilhado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Questão com `chapterId` e projeção do aluno

**Files:**
- Modify: `src/domains/assessments/question-schema.ts:5-12`
- Modify: `src/domains/assessments/services/exam-service.ts:69-74`
- Test: `src/domains/assessments/services/__tests__/exam-service.test.ts`

**Interfaces:**
- Produces: `Question.chapterId?: string`; `PublicQuestion` (inalterado: `Omit<Question, 'correctKey' | 'rationale'>`) passa a carregar `chapterId`.

- [ ] **Step 1: Write the failing test**
Em `describe('getExamForStudent')`:
```ts
it('questão com chapterId passa pela projeção pública sem gabarito', async () => {
  const { deps } = makeDeps({ now: new Date('2026-10-20T10:10:00Z') });
  deps.findAssessment = async () => ({ id: 'as1', questions: questions.map((q) => ({ ...q, chapterId: 's22' })), maxScore: 10, durationMinutes: 60 });
  const exam = await getExamForStudent(student, 'ag1', deps);
  expect(exam.questions[0]).toMatchObject({ id: 'q1', chapterId: 's22' });
  expect(JSON.stringify(exam.questions)).not.toMatch(/correctKey|rationale/);
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/domains/assessments/services/__tests__/exam-service.test.ts` — Expected: FAIL (`chapterId` ausente: a projeção desestrutura só `id, enunciation, options, topic`).
- [ ] **Step 3: Implement**
`questionSchema` ganha `chapterId: z.string().optional()`; a projeção em `getExamForStudent` inclui `...(chapterId ? { chapterId } : {})`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/domains/assessments` — Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/domains/assessments
git commit -m "feat(avaliacoes): questão aceita chapterId opcional e o aluno o recebe sem gabarito

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Geração por capítulos (validador, prompt, serviço)

**Files:**
- Modify: `src/lib/validators/assessment.validator.ts:8-13`
- Create: `src/lib/validators/__tests__/assessment.validator.test.ts`
- Modify: `src/domains/agents/prompts/assessment-prompt.ts` (arquivo inteiro)
- Create: `src/domains/agents/prompts/__tests__/assessment-prompt.test.ts`
- Modify: `src/domains/assessments/services/assessment-service.ts:1-193`
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts:56-61` (remover `unitsContent` do select)
- Test: `src/domains/assessments/services/__tests__/assessment-service.test.ts`

**Interfaces:**
- Consumes: `expandChapterScope`, `formatChapterLabel`, `resolveChapterSelection`, `NO_INDEXED_CHAPTER_CONTENT` (Task 2); `Question.chapterId` (Task 3).
- Produces:
  - `generateAssessmentSchema = z.object({ teachingPlanId: z.string().min(1), chapterIds: z.array(z.string().min(1)).min(1), questionCount: z.number().int().min(1).max(MAX_QUESTION_COUNT), type: z.string().min(1) })` — sem `unitNumbers`.
  - `type AssessmentPromptChapter = { id: string; label: string }`; `type AssessmentPromptInput = { subjectName: string; chapters: AssessmentPromptChapter[]; chunks: DidacticChunk[]; questionCount: number; type: string }`; `buildAssessmentMessages(input: AssessmentPromptInput): AIMessage[]`; `parseAssessmentText(raw: string)` com a mesma assinatura. `AssessmentUnit` deixa de existir.
  - `export const assessmentMaxTokens = (n: number) => Math.min(8000, 800 + 250 * n)`.
  - `AssessmentDeps` ganha `listPlanChapters(planId: string): Promise<PlanChapterBook[]>`, `listDescendantIds(chapterIds: string[]): Promise<string[]>`, `sampleByChapter: typeof sampleChunksByChapter`, `replaceAssessmentChapters(assessmentId: string, chapterIds: string[]): Promise<void>` (o último é usado na Task 5; nesta task o default aponta para `assessmentRepo.replaceAssessmentChapters`, criado aqui como função de 4 linhas no padrão de `replaceLessonChapters`).
  - `PlanForAssessment` perde `unitsContent`.

- [ ] **Step 1: Write the failing tests**
`assessment.validator.test.ts`:
```ts
const base = { teachingPlanId: 'p1', questionCount: 5, type: 'EXAM' };
it('chapterIds obrigatório com mínimo 1', () => {
  expect(generateAssessmentSchema.safeParse({ ...base, chapterIds: ['c1'] }).success).toBe(true);
  expect(generateAssessmentSchema.safeParse({ ...base, chapterIds: [] }).success).toBe(false);
  expect(generateAssessmentSchema.safeParse(base).success).toBe(false);
});
it('unitNumbers não é mais aceito', () => {
  const r = generateAssessmentSchema.safeParse({ ...base, unitNumbers: [1] });
  expect(r.success).toBe(false);
});
```
`assessment-prompt.test.ts`:
```ts
const chunk = { id: 'k1', materialId: 'm', bookTitle: 'Matemática Básica', author: 'Silva', chapter: 'Cap. 2.2: Frações', pageNumber: 50, content: 'Fração é parte de um todo.' };
it('mensagem lista capítulos com id e rótulo e trechos com citação', () => {
  const [sys, user] = buildAssessmentMessages({ subjectName: 'Matemática', chapters: [{ id: 's22', label: 'Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66' }], chunks: [chunk], questionCount: 3, type: 'EXAM' });
  expect(sys.content).toContain('chapterId');
  expect(user.content).toContain('Disciplina: Matemática');
  expect(user.content).toContain('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66 (id: s22)');
  expect(user.content).toContain('[Matemática Básica · Cap. 2.2, pág. 50]\nFração é parte de um todo.');
  expect(user.content).not.toMatch(/Unidade/);
});
it('parser aceita chapterId, tolera ausência e descarta null/numérico', () => {
  const q = (extra: object) => ({ id: 'q1', enunciation: 'Enunciado válido?', options: ['A','B','C','D'].map((key) => ({ key, text: key })), correctKey: 'A', rationale: 'r', topic: 't', ...extra });
  const out = parseAssessmentText(JSON.stringify({ questions: [q({ chapterId: 's22' }), q({}), q({ chapterId: null }), q({ chapterId: 7 })] }));
  expect(out?.questions.map((x) => x.chapterId)).toEqual(['s22', undefined, undefined, undefined]);
});
```
`assessment-service.test.ts` — `makeDeps` passa a ter `listPlanChapters: async () => [MAT_BOOK]` (fixture de `@/components/teaching/__tests__/chapter-tree-fixtures`), `listDescendantIds: vi.fn(async (ids) => ids[0] === 'u2' ? ['u2','s21','s22','s221','s222'] : ids)`, `sampleByChapter: vi.fn(async () => [])`, `replaceAssessmentChapters: vi.fn(async () => {})`; o `input` vira `{ teachingPlanId: 'plan1', chapterIds: ['u2', 'u3'], questionCount: 5, type: 'EXAM' }`; o teste "busca trechos pelo nome da disciplina da matriz" é substituído pelos abaixo; os demais de `generateQuestions` seguem.
```ts
it('uma busca por capítulo, com allowedChapterIds expandidos e topK 4', async () => {
  const { deps } = makeDeps('não é json'); const search = vi.spyOn(deps, 'search');
  await generateQuestions(teacher, input, deps);
  expect(search).toHaveBeenCalledTimes(2);
  expect(search).toHaveBeenCalledWith({ query: 'Unidade 2', allowedChapterIds: ['u2','s21','s22','s221','s222'], topK: 4 });
  expect(search).toHaveBeenCalledWith({ query: 'Unidade 3', allowedChapterIds: ['u3'], topK: 4 });
});
it('duplicata e pai+filho viram uma única busca', async () => {
  const { deps } = makeDeps('não é json'); const search = vi.spyOn(deps, 'search');
  await generateQuestions(teacher, { ...input, chapterIds: ['u2', 's22', 'u2'] }, deps);
  expect(search).toHaveBeenCalledTimes(1);
});
it('capítulo fora do plano dá 400', async () => {
  const { deps } = makeDeps('x');
  await expect(generateQuestions(teacher, { ...input, chapterIds: ['zz'] }, deps)).rejects.toMatchObject({ status: 400, message: CHAPTER_OUTSIDE_PLAN });
});
it('busca vazia cai em sampleByChapter(expandidos, 4, 12); amostra vazia dá 422', async () => {
  const { deps } = makeDeps('x'); deps.search = async () => ({ chunks: [] });
  await expect(generateQuestions(teacher, input, deps)).rejects.toMatchObject({ status: 422, message: NO_INDEXED_CHAPTER_CONTENT });
  expect(deps.sampleByChapter).toHaveBeenCalledWith(['u2','s21','s22','s221','s222','u3'], 4, 12);
});
it('chapterId fora da seleção é descartado e a questão mantida', async () => {
  const text = JSON.stringify({ questions: [{ ...validQuestion('a'), chapterId: 'u2' }, { ...validQuestion('b'), chapterId: 's22' }] });
  const { deps } = makeDeps(text);
  const out = await generateQuestions(teacher, { ...input, questionCount: 2 }, deps);
  expect(out.fallback).toBe(false);
  expect(out.questions.map((q) => q.chapterId)).toEqual(['u2', undefined]);
});
it('fallback do provedor devolve fallback: true', async () => { /* streamChat com fallback: true e fallbackReason 'provider_error' */ });
it('rate_limit dá 429 mesmo com JSON válido', async () => {
  const { deps } = makeDeps(JSON.stringify({ questions: [validQuestion('a')] }));
  deps.streamChat = async function* () { yield { token: JSON.stringify({ questions: [validQuestion('a')] }), isComplete: true, fallback: true, fallbackReason: 'rate_limit' }; };
  await expect(generateQuestions(teacher, { ...input, questionCount: 1 }, deps)).rejects.toMatchObject({ status: 429 });
});
it('maxTokens segue assessmentMaxTokens e temperatura 0.4', async () => {
  const { deps } = makeDeps('x'); const spy = vi.spyOn(deps, 'streamChat');
  await generateQuestions(teacher, input, deps);
  expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ temperature: 0.4, maxTokens: 2050 }));
  expect(assessmentMaxTokens(40)).toBe(8000);
});
```
- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run src/lib/validators/__tests__/assessment.validator.test.ts src/domains/agents/prompts/__tests__/assessment-prompt.test.ts src/domains/assessments/services/__tests__/assessment-service.test.ts` — Expected: FAIL (`unitNumbers` ainda exigido; prompt sem `Disciplina`/`id:`; serviço chama `selectUnits`).
- [ ] **Step 3: Implement `generateQuestions(user, input, deps)` em `assessment-service.ts`**
  - Fluxo, nesta ordem: `findPlan` + `assertOwner` → `books = await deps.listPlanChapters(plan.id)` → `chosen = resolveChapterSelection(input.chapterIds, books)` → mapa id → `{ title, label: formatChapterLabel({ ...c, book }) }` a partir de `books` (já trazem `number` hierárquico; não usar `chapterNumbersFor`) → `scopes = await Promise.all(chosen.map((id) => expandChapterScope([id], deps)))` → `Promise.all` de `deps.search({ query: title, allowedChapterIds: scopes[i], topK: 4 })` → dedupe por `id` → vazio: `deps.sampleByChapter([...new Set(scopes.flat())], 4, 12)` → vazio: `DomainError(422, NO_INDEXED_CHAPTER_CONTENT)`.
  - `askModel(messages, maxTokens, deps)`: `collectStream` com `{ temperature: 0.4, maxTokens }`; `fallbackReason === 'rate_limit'` → `DomainError(429, LESSON_AI_RATE_LIMITED_MESSAGE)`, relançado no `catch` (padrão de `lesson-generation-service.askModel`).
  - IA válida: `ids q1..qN` como hoje e `chapterId` mantido só se `chosen` o contém. Senão `buildFallbackQuestions(chunks, n)` com `fallback: true` (o ramo sintético com `plan.syllabus`/`units[0]` some: `chunks` nunca está vazio aqui).
  - Remova `selectUnits`, `CHUNKS_PER_UNIT`, `ASSESSMENT_MAX_TOKENS` e o import de `AssessmentUnit`. `subjectName` deixa de ir na busca (o filtro é por capítulo).
  - Prompt: system prompt mantém "Responda APENAS com um objeto JSON" com `questions[]`/`rubrics[]`, inclui `"chapterId":"..."` no exemplo e a regra "Cada questão deve ter \"chapterId\" escolhido entre os ids listados em Capítulos da avaliação; distribua as questões entre os capítulos."; user = `Disciplina: X`, `\nCapítulos da avaliação:\n` + linhas `${label} (id: ${id})`, `\nTrechos de apoio:\n` + `${formatCitation(c)}\n${c.content}` unidos por `\n\n`, `\nElabore N questões (type).`.
  - Parser: `aiResponseSchema` usa `questionSchema.extend({ chapterId: z.unknown().transform((v) => (typeof v === 'string' && v ? v : undefined)) })`.
- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run src/lib/validators src/domains/agents/prompts src/domains/assessments && npm run typecheck` — Expected: PASS nos testes; `typecheck` acusa só `AssessmentEditor.tsx`/`use-assessments.ts` (`unitNumbers` no cliente), resolvidos na Task 6. Nenhum outro erro.
- [ ] **Step 5: Commit**
```bash
git add src/lib/validators src/domains/agents/prompts src/domains/assessments src/domains/teaching/services/teaching-plan-repository.ts src/domains/teaching/services/assessment-repository.ts
git commit -m "feat(avaliacoes): geração de questões restrita aos capítulos escolhidos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Persistência do escopo — criação, edição e listagem

**Files:**
- Modify: `src/lib/validators/assessment.validator.ts:15-22` (`chapterIds` opcional no update)
- Modify: `src/domains/teaching/services/assessment-repository.ts:5-34`
- Modify: `src/domains/assessments/services/assessment-service.ts:38-44,202-223`
- Modify: `src/domains/teaching/services/teaching-content-service.ts:15-36,84-122`
- Test: `src/domains/assessments/services/__tests__/assessment-service.test.ts`, `src/domains/teaching/services/__tests__/teaching-content-service.test.ts`

**Interfaces:**
- Consumes: `resolveChapterSelection`, `ASSESSMENT_PUBLISHED` (Task 2); `AssessmentDeps.listPlanChapters`/`replaceAssessmentChapters` (Task 4).
- Produces:
  - `updateAssessmentSchema` ganha `chapterIds: z.array(z.string().min(1)).optional()`.
  - `AssessmentWithPlan.teachingPlan` = `{ id: string; teacherId: string; subjectId: string }` (repo seleciona `id`).
  - `TeachingContentDeps.repo` ganha `listPlanChapters(planId: string): Promise<PlanChapterBook[]>`; `listAssessmentsByPlan` passa a devolver `Promise<Array<{ chapters: { chapterId: string }[] } & Record<string, unknown>>>` (repo inclui `chapters: { select: { chapterId: true } }`).
  - `listAssessments(...)` devolve itens com `chapterIds: string[]` e sem `chapters`.
  - `createAssessment(user, input: { teachingPlanId?: string; title?: string; type?: string; questions?: unknown; rubrics?: unknown; chapterIds?: unknown; maxScore?: number | string; durationMinutes?: number }, deps)`.

- [ ] **Step 1: Write the failing tests**
`assessment-service.test.ts`, `describe('updateAssessment')` (`findAssessment` dos fixtures passa a ter `teachingPlan: { id: 'plan1', teacherId: 't1', subjectId: 's1' }`):
```ts
it('PUBLISHED dá 409 sem gravar', async () => {
  const { deps, updateAssessmentById } = makeDeps('x');
  await expect(updateAssessment('pub1', teacher, { title: 'Nova' }, deps)).rejects.toMatchObject({ status: 409, message: ASSESSMENT_PUBLISHED });
  expect(updateAssessmentById).not.toHaveBeenCalled();
});
it('grava chapterIds normalizados', async () => {
  const { deps } = makeDeps('x');
  await updateAssessment('as1', teacher, { chapterIds: ['u2', 's22', 'u2'] }, deps);
  expect(deps.replaceAssessmentChapters).toHaveBeenCalledWith('as1', ['u2']);
});
it('capítulo fora do plano dá 400 antes de gravar', async () => {
  const { deps, updateAssessmentById } = makeDeps('x');
  await expect(updateAssessment('as1', teacher, { chapterIds: ['zz'] }, deps)).rejects.toMatchObject({ status: 400 });
  expect(updateAssessmentById).not.toHaveBeenCalled();
});
it('sem a chave chapterIds não toca a junção', async () => {
  const { deps } = makeDeps('x');
  await updateAssessment('as1', teacher, { title: 'Nova' }, deps);
  expect(deps.replaceAssessmentChapters).not.toHaveBeenCalled();
});
```
`teaching-content-service.test.ts` (`makeDeps` ganha `listPlanChapters: async () => [MAT_BOOK]` e `listAssessmentsByPlan` devolvendo `[{ id: 'a1', chapters: [{ chapterId: 'u2' }] }]`):
```ts
it('createAssessment rejeita questão inválida (id numérico, sem rationale, 3 alternativas)', async () => {
  const { deps, calls } = makeDeps();
  const bad = { id: 1, enunciation: 'Enunciado longo', options: ['A','B','C'].map((key) => ({ key, text: key })), correctKey: 'A', topic: 't' };
  await expect(createAssessment(teacher, { teachingPlanId: 'own', title: 'Prova', questions: [bad] }, deps)).rejects.toMatchObject({ status: 400 });
  expect(calls.createAssessment).toBeUndefined();
});
it('createAssessment rejeita rubrica inválida', async () => { /* rubrics: [{ criterion: '' }] → 400 */ });
it('createAssessment grava chapterIds normalizados na mesma criação', async () => {
  const { deps, calls } = makeDeps();
  await createAssessment(teacher, { teachingPlanId: 'own', title: 'Prova', chapterIds: ['u2', 's22'] }, deps);
  expect(calls.createAssessment[0]).toMatchObject({ rubrics: [], chapters: { create: [{ chapterId: 'u2' }] } });
});
it('createAssessment com capítulo fora do plano dá 400', async () => { /* chapterIds: ['zz'] → 400, sem criar */ });
it('listAssessments devolve chapterIds', async () => {
  const { deps } = makeDeps();
  expect(await listAssessments(teacher, 'p1', deps)).toEqual([{ id: 'a1', chapterIds: ['u2'] }]);
});
```
- [ ] **Step 2: Run tests to verify they fail**
Run: `npx vitest run src/domains/assessments/services/__tests__/assessment-service.test.ts src/domains/teaching/services/__tests__/teaching-content-service.test.ts` — Expected: FAIL (`updateAssessment` grava em PUBLISHED; `createAssessment` aceita qualquer JSON; listagem sem `chapterIds`).
- [ ] **Step 3: Implement**
  - `updateAssessment`: depois de `loadOwnedAssessment`, `status === ASSESSMENT_STATUS.PUBLISHED` → `DomainError(409, ASSESSMENT_PUBLISHED)`; se `input.chapterIds !== undefined`, `resolveChapterSelection(input.chapterIds, await deps.listPlanChapters(assessment.teachingPlan.id))` antes de qualquer gravação; após `updateAssessmentById`, `replaceAssessmentChapters(id, chapterIds)`.
  - `createAssessment`: valida `questions` com `z.array(questionSchema).optional()` (mensagem igual à do PUT), `rubrics` com `z.array(rubricSchema).optional()` (`'Rubricas inválidas.'`), `chapterIds` com `z.array(z.string()).optional()`; depois de `assertOwnsPlanId`, resolve a seleção com `deps.repo.listPlanChapters`; grava em uma única chamada com `chapters: { create: ids.map((chapterId) => ({ chapterId })) }` (atômico) e `rubrics` padrão `[]`.
  - `replaceAssessmentChapters` (repo, Task 4) usa `db.$transaction([deleteMany, createMany])`.
  - A rota `PUT` já repassa `parsed.data`; a `POST` já repassa o body: nenhuma mudança nas rotas.
- [ ] **Step 4: Run tests to verify they pass**
Run: `npx vitest run src/domains/assessments src/domains/teaching` — Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/validators src/domains/assessments src/domains/teaching
git commit -m "feat(avaliacoes): grava e lista o escopo de capítulos; bloqueia edição de prova publicada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Editor do professor com árvore de capítulos

**Files:**
- Modify: `src/components/assessments/use-assessments.ts:34-45,58-67`
- Modify: `src/app/teacher/assessments/_components/AssessmentEditor.tsx` (linhas 4-6, 46-76, 90-101, 164-210, 225-242)
- Test: `src/app/teacher/assessments/_components/__tests__/AssessmentEditor.test.tsx`

**Interfaces:**
- Consumes: `formatChapterLabel` de `@/domains/rag/chapter-label` (nunca de `chapter-scope.ts`, que importa Prisma); `usePlanChapters`, `ChapterTreeSelect`.
- Produces: `AssessmentItem.chapterIds: string[]`; `AssessmentDraft.chapterIds: string[]`; `GenerateInput = { teachingPlanId: string; chapterIds: string[]; questionCount: number; type: string }`.

- [ ] **Step 1: Write the failing test**
Substitua os 4 testes de unidades. Mock de `@/components/teaching/use-plan-chapters` igual ao de `LessonEditor.test.tsx:6-15` (`MAT_BOOK`, flag `loading`); `generateAssessment`/`saveAssessment` continuam `vi.fn()`.
```ts
it('árvore renderiza com os livros do plano', () => {
  renderEditor();
  expect(screen.getByRole('tree')).toBeTruthy();
  expect(screen.getByRole('treeitem', { name: '2 Unidade 2' })).toBeTruthy();
});
it('sem capítulos trava o botão; prova antiga continua salvável', () => {
  renderEditor({ ...existing, chapterIds: [] });
  expect(screen.getByText('Selecione ao menos um capítulo.')).toBeTruthy();
  expect(genButton().disabled).toBe(true);
  expect(screen.queryByText(/^Cap\./)).toBeNull();
  expect((screen.getByRole('button', { name: /salvar/i }) as HTMLButtonElement).disabled).toBe(false);
});
it('árvore carregando trava o botão', () => { chaptersState.loading = true; renderEditor(); expect(genButton().disabled).toBe(true); });
it('quantidade inválida bloqueia com o motivo de intervalo', () => { /* seleciona '2 Unidade 2'; count 25 → 'Informe entre 1 e 20 questões.' */ });
it('payload de geração leva chapterIds; aviso offline e rótulo aparecem', async () => {
  vi.mocked(generateAssessment).mockResolvedValue({ questions: [{ ...q('q1'), chapterId: 's22' }], rubrics: [], fallback: true });
  renderEditor();
  fireEvent.click(screen.getByRole('treeitem', { name: '2.2 Frações' }));
  fireEvent.click(genButton());
  await waitFor(() => expect(generateAssessment).toHaveBeenCalledWith({ teachingPlanId: 'plan-1', chapterIds: ['s22'], questionCount: 5, type: 'EXAM' }));
  expect(await screen.findByText('Questões geradas sem IA (modo offline). Revise antes de publicar.')).toBeTruthy();
  expect(screen.getByText('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66')).toBeTruthy();
});
it('salvar envia chapterIds', async () => { /* initial com chapterIds ['u2'] → saveAssessment(plan-1, id, objectContaining({ chapterIds: ['u2'] })) */ });
```
`existing` é um `AssessmentItem` com uma questão válida sem `chapterId`; `q(id)` monta questão válida.
- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/app/teacher/assessments` — Expected: FAIL (não há `tree`; editor ainda mostra unidades).
- [ ] **Step 3: Implement**
  - Tipos de `use-assessments.ts` conforme Produces.
  - Editor: estado `chapterIds` inicial `initial?.chapterIds ?? []`; `const { books, isLoading: chaptersLoading } = usePlanChapters(plan.id)`; o card de unidades vira o bloco de `LessonEditor.tsx:177-187` com `id="assessment-chapters"`, `label="Capítulos desta avaliação"`.
  - `lockReason`, nesta ordem: `chaptersLoading` → `'Carregando capítulos...'`; `chapterIds.length === 0` → `'Selecione ao menos um capítulo.'`; faixa de questões como hoje. Remova `planUnits`.
  - Rótulo: mapa `useMemo` id → `formatChapterLabel({ ...c, book })` sobre `books`; renderize `<p className="text-xs text-slate-500">` acima do `Textarea` só quando há rótulo.
  - Offline: troque a `Badge` por `<div role="status">` âmbar com ícone `AlertTriangle` e o texto exato do spec (não há `Alert` em `src/components/ui`; use `role="status"` para não colidir com o `role="alert"` do erro).
  - `save` envia `{ ...draft, chapterIds }`.
- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/app/teacher src/components && npm run typecheck` — Expected: PASS, typecheck limpo.
- [ ] **Step 5: Commit**
```bash
git add src/components/assessments src/app/teacher/assessments
git commit -m "feat(avaliacoes): editor seleciona capítulos do plano e mostra a origem de cada questão

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Verificação final e checklist manual

**Files:** nenhum (sem commit).

- [ ] **Step 1:** `npm run typecheck` — Expected: sem erros.
- [ ] **Step 2:** `npx vitest run` — Expected: tudo verde (se falhar `chat-route` CLASSROOM ou `MaterialChaptersPanel "remover subárvore"`, rode de novo antes de investigar: flakies conhecidos).
- [ ] **Step 3:** `grep -rn "unitNumbers\|AssessmentUnit" src` — Expected: nenhuma ocorrência.
- [ ] **Step 4: Checklist manual (copiado do spec, executado pelo usuário)**
  1. `npx prisma migrate dev` aplicado; `npm run typecheck` e `npx vitest run` verdes.
  2. Em `/teacher/assessments`, escolher um plano com livro indexado, criar prova, selecionar um capítulo com subníveis, gerar 5 questões; cada questão mostra o capítulo de origem.
  3. Editar uma alternativa, salvar, reabrir: capítulos e questões persistem.
  4. Publicar para a turma com início agora (`NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=true` se precisar).
  5. Como aluno da turma, abrir a prova pela agenda, responder, enviar; a nota aparece em Submissões.
  6. Com `AI_PROVIDER=mock`, gerar de novo: o aviso de modo offline aparece.
  - Lembrete: reiniciar o `next dev` depois do `prisma generate`.
