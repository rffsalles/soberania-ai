# Capítulos em árvore, fase 3: consumidores e interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geração, refino e tutor passam a filtrar o RAG pelos nós escolhidos mais seus descendentes e a rotular com o número hierárquico ("Cap. 2.2"); distribuição e unidades continuam só nas raízes; o professor edita a árvore de capítulos do material e escolhe nós de qualquer nível na aula com um seletor em árvore.

**Architecture:** No servidor, `chapterNumbersFor` (chapter-repository, sobre o `numberChapters` da fase 1) dá o `number` aos capítulos que os repositórios de aula devolvem; os serviços de geração e o `loadTutorScope` do chat expandem a seleção com `listDescendantIds` (fase 1) e mantêm os rótulos dos nós escolhidos; um helper puro `chapter-roots.ts` reduz livros e seleções às raízes para distribuição e unidades. No cliente, dois módulos puros sem DOM, `chapter-tree.ts` (seleção sobre a lista plana em pré-ordem) e `chapter-tree-edit.ts` (edição da árvore), sustentam o novo `ChapterTreeSelect` (LessonEditor) e o editor de árvore do `MaterialChaptersPanel`.

**Tech Stack:** Next.js 15 (App Router, client components), React, TypeScript, Prisma, Tailwind, lucide-react, zod, vitest 3 + `@testing-library/react` + jsdom (`// @vitest-environment jsdom`; sem `jest-dom` nem `user-event`: usar `fireEvent` e asserções nativas).

**Spec:** `docs/superpowers/specs/2026-10-26-capitulos-em-arvore-design.md`, seções 8, 9, 10 (fluxos de aula, tutor e editor) e os testes de "Consumidores" e "UI" da seção 11, mais a verificação final da seção 11.

**Consumes (fases 1 e 2, planejadas em outros documentos; já em `main` quando esta fase começa, NÃO replanejar):**

- `MaterialChapter` com `parentId String?`, `depth Int`, `order` = posição em pré-ordem no material.
- `ChapterDTO = { id: string; order: number; title: string; startPage: number; endPage: number | null; source: ChapterSource; parentId: string | null; depth: number; number: string }` (`src/domains/rag/services/chapter-repository.ts`), devolvido por `listChapters(materialId)` e por GET `/api/v1/library/materials/[id]/chapters`, lista plana em pré-ordem.
- `PlanChapter` (`src/domains/teaching/services/plan-chapters-service.ts`) = `{ id; order; title; startPage; endPage: number | null; parentId: string | null; depth: number; number: string }`; GET `/api/v1/teacher/plans/[id]/chapters` devolve `{ books: PlanChapterBook[] }` com `chapters` planos em pré-ordem (BASIC antes de COMPLEMENTARY).
- PUT `/api/v1/library/materials/[id]/chapters` aceita `{ chapters: ChapterNodeInput[] }`, `ChapterNodeInput = { title: string; startPage: number; children?: ChapterNodeInput[] }`; 400 traz a invariante violada e o `number` do nó; 409 de vínculos mantido.
- `listDescendantIds(chapterIds: string[]): Promise<string[]>` em `src/domains/rag/services/chapter-repository.ts` (próprios ids + descendentes; lista vazia → `[]` sem consultar o banco).
- `numberChapters<T extends { id: string; order: number; parentId: string | null }>(chapters: T[]): (T & { number: string })[]` em `src/domains/rag/chapters.ts` (linhas de um material em `order` crescente).
- `lessonInputSchema.chapterIds.max(200)`; `updateLesson` normaliza a seleção com `normalizeChapterSelection(ids, books)` (`plan-chapters-service.ts`, fase 1: remove id com ancestral também selecionado) e devolve 400 `CHAPTER_OUTSIDE_PLAN` para id fora do plano em qualquer profundidade. `createLesson` não grava `chapterIds` (fase 1, Task 9).
- `MAX_CHAPTER_DEPTH = 6` e `MAX_CHAPTER_NODES = 500` em `src/domains/rag/constants.ts` (arquivo sem imports, seguro para o cliente).
- `findChapterTreeError` (fase 1, `src/domains/rag/chapters.ts`): regras do servidor que `validateEditable` (Task 10) espelha no cliente: irmãos com `startPage` não decrescente (iguais permitidos), filho não começa antes do pai nem depois do `endPage` herdado do pai, `endPage = max(startPage, próximoIrmão.startPage - 1)`.

## Global Constraints

- Trabalho direto em `main`, sem branch nem worktree, sem pull request. Um commit pequeno por task verde, mensagem em pt-BR (`feat(capitulos): ...`, `refactor(capitulos): ...`) terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `git add` sempre com caminhos explícitos; nunca commitar `package.json`, `package-lock.json` nem `.mcp.json`.
- Testes por arquivo com `npx vitest run <path>`. Nenhum teste chama modelo real nem banco real: `streamChat`, `search`, `sampleByChapter`, `listDescendantIds` e repositórios entram por `deps` mockados (como nos testes atuais); repositórios Prisma são testados com `vi.mock('@/lib/db')`.
- Textos de UI em português do Brasil. Rótulos fixados pela spec, sem variação:
  - geração: `Cap. {number}: {title} — {material} ({author}), p. {start} a {end}` (só `p. {start}` quando `endPage` é null, como hoje);
  - refino: `Cap. {number}: {title} — {material} ({author})`;
  - tutor: `Cap. {number}: {title} ({material})`, juntados por `; ` depois de `Esta aula cobre: `;
  - rótulo curto (tabela de encontros e unidades do plano): `Cap. 2.1, 2.3`.
- Nenhuma dependência nova. UI só com `src/components/ui/*` existentes (`Button`, `Input`, `Badge`, `Card`) e ícones `lucide-react` já instalados; não existe componente de checkbox em `src/components/ui`, o estado marcado é desenhado com `Check`/`Minus` dentro de um `span`.
- Componentes novos em `src/components/teaching/` não importam tipos de `src/domains/**` (exceção: as constantes de `src/domains/rag/constants.ts`, que não tem imports); os tipos de cliente são locais (`ClientPlanChapter`, `EditableChapter`).
- Constantes de profundidade e tamanho importadas de `src/domains/rag/constants.ts` (fase 1), sem duplicar: `MAX_CHAPTER_DEPTH` = 6 (valores 0..6), `MAX_CHAPTER_NODES` = 500 nós por material.
- Gate de tipo por task: `npx tsc --noEmit 2>&1 | grep -E "<pastas tocadas na task>"` sem saída.
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (dependente de ambiente, ~1 em 5). Se for a única falha, rodar `npx vitest run src/app/api/v1/agent/chat` isolado.

## Review Focus

1. **Aula antiga com raiz salva e material depois reextraído em árvore.** A raiz continua marcada, os filhos aparecem marcados (não parciais) e a geração busca na raiz mais todos os descendentes. Testes: Task 2 (`'raiz salva expande para toda a subárvore'`) e Task 8 (`'raiz salva marca visualmente todos os descendentes'`).
2. **Busca ativa esconde nós já marcados.** Marcar outro nó durante a busca não pode apagar a seleção que está oculta pelo filtro. Teste na Task 8 (`'marcar durante a busca preserva a seleção oculta'`).
3. **Id salvo que não está mais na árvore do plano** (livro removido da bibliografia). A seleção não pode sumir em silêncio no cliente; o servidor responde 400 `CHAPTER_OUTSIDE_PLAN` ao salvar. Teste na Task 7 (`'normalizeSelection preserva ids desconhecidos no fim'`).
4. **Recuar o primeiro irmão, ou recuar/adicionar filho além de 7 níveis.** Nada muda e o botão fica desabilitado; não pode virar um erro de validação depois. Testes na Task 10 (`'indent é no-op no primeiro irmão e além da profundidade 6'`) e Task 11 (`'"Recuar 2.1" desabilitado no primeiro irmão'`).
5. **Cancelar a confirmação de remover uma subárvore.** Nenhum nó some. Teste na Task 11 (`'remover subárvore pede confirmação; cancelar mantém tudo'`).

---

## Árvore de exemplo (usada nos testes)

Material "Matemática Básica" (autor "Silva", 174 páginas), lista plana em pré-ordem:

| id | order | number | title | startPage | endPage | parentId | depth |
|---|---|---|---|---|---|---|---|
| `u1` | 1 | `1` | Unidade 1 | 15 | 42 | null | 0 |
| `u2` | 2 | `2` | Unidade 2 | 43 | 66 | null | 0 |
| `s21` | 3 | `2.1` | Produtos notáveis | 43 | 47 | `u2` | 1 |
| `s22` | 4 | `2.2` | Frações | 48 | 66 | `u2` | 1 |
| `s221` | 5 | `2.2.1` | Operações com frações | 51 | 57 | `s22` | 2 |
| `s222` | 6 | `2.2.2` | Frações equivalentes | 58 | 66 | `s22` | 2 |
| `u3` | 7 | `3` | Unidade 3 | 67 | 174 | null | 0 |

---

### Task 1: Número hierárquico nos capítulos que os repositórios de aula devolvem

**Files:**
- Modify: `src/domains/rag/services/chapter-repository.ts` (nova `chapterNumbersFor`)
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts:4-16` (`listLessonsBySchedule`), `:96-126` (`GenerationLesson`, `findLessonForGeneration`), `:128-146` (`findLessonTutorScope`)
- Test: `src/domains/rag/services/__tests__/chapter-repository.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: `numberChapters<T extends { id: string; order: number; parentId: string | null }>(chapters: T[]): (T & { number: string })[]` de `src/domains/rag/chapters.ts` (fase 1, Task 2 daquele plano; recebe as linhas de UM material em `order` crescente).
- Produces:
  ```ts
  // chapter-repository.ts
  export async function chapterNumbersFor(chapterIds: string[]): Promise<Map<string, string>>
  // vazio → new Map() sem consultar. Uma única consulta traz TODOS os capítulos dos materiais envolvidos:
  // db.materialChapter.findMany({ where: { material: { chapters: { some: { id: { in: chapterIds } } } } },
  //   orderBy: [{ materialId: 'asc' }, { order: 'asc' }], select: { id: true, order: true, parentId: true, materialId: true } })
  // agrupa por materialId, aplica numberChapters em cada grupo e devolve id → number de todos.

  // lesson-plan-repository.ts
  export type GenerationLesson // chapter ganha `number: string`
  findLessonTutorScope(id): Promise<{ chapters: { id: string; order: number; number: string; title: string; material: { title: string } }[]; planMaterialIds: string[] } | null>
  listLessonsBySchedule(filter): Promise<...> // cada item de chapters vira { chapterId: string; chapter: { order: number; number: string } }
  ```
  Nos três repositórios o número vem de `chapterNumbersFor(ids)`, com fallback `String(chapter.order)` quando o id não estiver no mapa.

- [ ] **Step 1: Escrever o teste**

Em `chapter-repository.test.ts`, acrescentar `materialChapter: { findMany: (a: never) => materialChapterFindMany(a) }` ao mock de `db` (mantendo o que a fase 1 já mocka) e:

```ts
describe('chapterNumbersFor', () => {
  it('lista vazia não consulta o banco', async () => {
    expect((await chapterNumbersFor([])).size).toBe(0);
    expect(materialChapterFindMany).not.toHaveBeenCalled();
  });
  it('numera cada material separadamente', async () => {
    materialChapterFindMany.mockResolvedValueOnce([
      { id: 'u1', order: 1, parentId: null, materialId: 'm1' }, { id: 'u2', order: 2, parentId: null, materialId: 'm1' },
      { id: 's21', order: 3, parentId: 'u2', materialId: 'm1' }, { id: 's22', order: 4, parentId: 'u2', materialId: 'm1' },
      { id: 'x1', order: 1, parentId: null, materialId: 'm2' }, { id: 'x2', order: 2, parentId: 'x1', materialId: 'm2' },
    ]);
    const map = await chapterNumbersFor(['s22', 'x2']);
    expect(map.get('s22')).toBe('2.2');
    expect(map.get('x2')).toBe('1.1');
    expect(materialChapterFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { material: { chapters: { some: { id: { in: ['s22', 'x2'] } } } } },
      orderBy: [{ materialId: 'asc' }, { order: 'asc' }],
    }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/services/__tests__/chapter-repository.test.ts`
Expected: FAIL com `chapterNumbersFor is not a function` (ou `does not provide an export named 'chapterNumbersFor'`).

- [ ] **Step 3: Implementar `chapterNumbersFor` e anexar `number` nos três repositórios de aula**

`listLessonsBySchedule` vira `async`: depois do `findMany`, uma única chamada `chapterNumbersFor` com todos os `chapterId` das aulas. `findLessonForGeneration` e `findLessonTutorScope` fazem o mesmo com os ids da aula. Os `select` de capítulo continuam iguais (o número não é coluna).

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/domains/rag src/domains/teaching && npx tsc --noEmit 2>&1 | grep -E "src/domains/(rag|teaching)"`
Expected: PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/services/chapter-repository.ts src/domains/rag/services/__tests__/chapter-repository.test.ts src/domains/teaching/services/lesson-plan-repository.ts
git commit -m "feat(capitulos): número hierárquico nos capítulos das aulas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Geração e refino com a subárvore expandida e rótulo `Cap. {number}`

**Files:**
- Modify: `src/domains/teaching/services/lesson-generation-service.ts:28-41` (deps), `:78`, `:149`
- Modify: `src/domains/agents/prompts/lesson-generation-prompt.ts:47`, `:142`
- Test: `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts`, `src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts`

**Interfaces:**
- Consumes: `GenerationLesson` com `chapter.number` (Task 1); `listDescendantIds` (fase 1).
- Produces: `LessonGenerationDeps` ganha `listDescendantIds(chapterIds: string[]): Promise<string[]>` (default: o da fase 1). Em `generateLessonContent` e `refineLessonField`: `allowedChapterIds = await deps.listDescendantIds(lesson.chapters.map((c) => c.chapter.id))`, usado nas buscas e em `sampleByChapter`. Os prompts continuam recebendo `lesson.chapters` (só os nós escolhidos) e trocam `c.order` por `c.number`.

- [ ] **Step 1: Atualizar fixtures e escrever os testes**

Em `lesson-generation-service.test.ts`: a fixture `lesson()` ganha `number: '3'` no capítulo `ch3`; `makeDeps` ganha `listDescendantIds: vi.fn(async (ids: string[]) => ids)` e aceita `opts.descendants?: string[]` (quando informado, o mock devolve esse array). Os testes atuais continuam valendo sem mudança de expectativa. Novos testes:

```ts
const fracoes = {
  ...lesson(),
  chapters: [{ chapter: { id: 's22', order: 4, number: '2.2', title: 'Frações', startPage: 48, endPage: 66,
    material: { title: 'Matemática Básica', author: 'Silva' } } }],
};

it('expande os nós escolhidos com os descendentes no filtro e rotula só o escolhido', async () => {
  const { deps, search, streamChat } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'] });
  await generateLessonContent('l1', teacher, deps);
  expect(deps.listDescendantIds).toHaveBeenCalledWith(['s22']);
  expect(search.mock.calls.every((c) => JSON.stringify(c[0].allowedChapterIds) === '["s22","s221","s222"]')).toBe(true);
  const user = streamChat.mock.calls[0][0][1].content as string;
  expect(user).toContain('Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66');
  expect(user).not.toContain('Operações com frações');
});

it('amostragem de fallback usa o conjunto expandido', async () => {
  const { deps, sampleByChapter } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'], chunks: [], sample: [chunk] });
  await generateLessonContent('l1', teacher, deps);
  expect(sampleByChapter).toHaveBeenCalledWith(['s22', 's221', 's222'], 4, 12);
});

it('raiz salva expande para toda a subárvore', async () => {
  const raiz = { ...fracoes, chapters: [{ chapter: { ...fracoes.chapters[0].chapter, id: 'u2', number: '2', title: 'Unidade 2', startPage: 43 } }] };
  const { deps, search } = makeDeps({ lesson: raiz, descendants: ['u2', 's21', 's22', 's221', 's222'] });
  await generateLessonContent('l1', teacher, deps);
  expect(search.mock.calls[0][0].allowedChapterIds).toEqual(['u2', 's21', 's22', 's221', 's222']);
});

it('refino filtra pelo conjunto expandido e rotula sem páginas', async () => {
  const { deps, search, streamChat } = makeDeps({ lesson: fracoes, descendants: ['s22', 's221', 's222'], text: 'Novo texto' });
  await refineLessonField('l1', teacher, { field: 'methodology', instruction: 'mais curto', current: 'x' }, deps);
  expect(search.mock.calls[0][0].allowedChapterIds).toEqual(['s22', 's221', 's222']);
  const user = streamChat.mock.calls[0][0][1].content as string;
  expect(user).toContain('Cap. 2.2: Frações — Matemática Básica (Silva)');
  expect(user).not.toContain('p. 48');
});
```

Em `lesson-generation-prompt.test.ts`: fixture `ch3` ganha `number: '3'` (expectativa `'Cap. 3: Modelagem — ...'` inalterada) e um caso novo com `number: '2.2'` esperando `'Cap. 2.2: Frações — Matemática Básica (Silva), p. 48 a 66'` em `buildLessonGenerationMessages` e `'Cap. 2.2: Frações — Matemática Básica (Silva)'` em `buildLessonRefineMessages`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts`
Expected: FAIL: `listDescendantIds` não chamado; prompt contém `Cap. 4: Frações`.

- [ ] **Step 3: Implementar a dependência, a expansão nos dois fluxos e o `number` nos dois prompts**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/domains/agents/prompts && npx tsc --noEmit 2>&1 | grep -E "src/domains/(teaching|agents)"`
Expected: PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/teaching/services/lesson-generation-service.ts src/domains/agents/prompts/lesson-generation-prompt.ts src/domains/teaching/services/__tests__/lesson-generation-service.test.ts src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts
git commit -m "feat(capitulos): geração e refino buscam na subárvore dos nós escolhidos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Escopo do tutor com ids expandidos e rótulos dos nós escolhidos

**Files:**
- Modify: `src/domains/agents/services/chat-service.ts:60-80` (`toTutorScope`, nova `loadTutorScope`, `defaultDeps.findTutorScope`)
- Test: `src/domains/agents/services/__tests__/chat-service.test.ts:320-330`, `src/domains/agents/__tests__/tutor-pipeline.test.ts`

**Interfaces:**
- Consumes: `findLessonTutorScope` com `number` (Task 1); `listDescendantIds` (fase 1).
- Produces:
  ```ts
  export function toTutorScope(
    raw: Awaited<ReturnType<typeof findLessonTutorScope>>,
    expandedChapterIds: string[],
  ): TutorScope | undefined
  // puro: allowedChapterIds = expandedChapterIds; chapterLabels = raw.chapters (escolhidos) → `Cap. ${number}: ${title} (${material.title})`;
  // sem capítulos → { allowedMaterialIds } se houver; senão undefined. raw null → undefined.

  export type TutorScopeDeps = {
    findLessonTutorScope: typeof findLessonTutorScope;
    listDescendantIds(chapterIds: string[]): Promise<string[]>;
  };
  export async function loadTutorScope(lessonPlanId: string, deps?: TutorScopeDeps): Promise<TutorScope | undefined>
  // chama listDescendantIds só quando há capítulos; defaultDeps.findTutorScope = (id) => loadTutorScope(id)
  ```
  `tutor-pipeline.ts` não muda: `scopeLine` já junta `chapterLabels` com `; `.

- [ ] **Step 1: Escrever os testes**

Substituir o teste `'toTutorScope: capítulos > materiais do plano > nada'` por:

```ts
const fracoes = { id: 's22', order: 4, number: '2.2', title: 'Frações', material: { title: 'Matemática Básica' } };

it('toTutorScope: ids expandidos no filtro, rótulos só dos escolhidos', () => {
  expect(toTutorScope({ chapters: [fracoes], planMaterialIds: ['m1'] }, ['s22', 's221', 's222'])).toEqual({
    allowedChapterIds: ['s22', 's221', 's222'],
    chapterLabels: ['Cap. 2.2: Frações (Matemática Básica)'],
  });
  expect(toTutorScope({ chapters: [], planMaterialIds: ['m1', 'm2'] }, [])).toEqual({ allowedMaterialIds: ['m1', 'm2'] });
  expect(toTutorScope({ chapters: [], planMaterialIds: [] }, [])).toBeUndefined();
  expect(toTutorScope(null, [])).toBeUndefined();
});

it('loadTutorScope expande os capítulos da aula', async () => {
  const listDescendantIds = vi.fn(async () => ['s22', 's221', 's222']);
  const scope = await loadTutorScope('lp1', {
    findLessonTutorScope: vi.fn(async () => ({ chapters: [fracoes], planMaterialIds: ['m1'] })),
    listDescendantIds,
  });
  expect(listDescendantIds).toHaveBeenCalledWith(['s22']);
  expect(scope?.allowedChapterIds).toEqual(['s22', 's221', 's222']);
});

it('loadTutorScope sem capítulos não expande e cai nos materiais do plano', async () => {
  const listDescendantIds = vi.fn();
  const scope = await loadTutorScope('lp1', {
    findLessonTutorScope: vi.fn(async () => ({ chapters: [], planMaterialIds: ['m1'] })),
    listDescendantIds,
  });
  expect(listDescendantIds).not.toHaveBeenCalled();
  expect(scope).toEqual({ allowedMaterialIds: ['m1'] });
});
```

Em `tutor-pipeline.test.ts`, novo caso (fixa o formato; passa sem mudança de código):

```ts
it('"Esta aula cobre" junta os rótulos hierárquicos e filtra pelos ids expandidos', async () => {
  const { prompt, search } = await run({
    allowedChapterIds: ['s22', 's221', 's222', 'u3'],
    chapterLabels: ['Cap. 2.2: Frações (Matemática Básica)', 'Cap. 3: Unidade 3 (Matemática Básica)'],
  });
  expect(prompt).toContain('Esta aula cobre: Cap. 2.2: Frações (Matemática Básica); Cap. 3: Unidade 3 (Matemática Básica).');
  expect(search).toHaveBeenCalledWith(expect.objectContaining({ allowedChapterIds: ['s22', 's221', 's222', 'u3'] }));
});
```

(Se o helper `run` do arquivo não devolver `search`, expô-lo no retorno.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/agents/services/__tests__/chat-service.test.ts src/domains/agents/__tests__/tutor-pipeline.test.ts`
Expected: FAIL com `loadTutorScope is not a function` e `allowedChapterIds: ['s22']` em vez dos expandidos.

- [ ] **Step 3: Implementar `toTutorScope(raw, expandedChapterIds)` e `loadTutorScope`**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/domains/agents && npx tsc --noEmit 2>&1 | grep -E "src/domains/agents"`
Expected: PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/agents/services/chat-service.ts src/domains/agents/services/__tests__/chat-service.test.ts src/domains/agents/__tests__/tutor-pipeline.test.ts
git commit -m "feat(capitulos): tutor filtra pela subárvore e cita os nós escolhidos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Raízes do plano e distribuição no cronograma só com raízes

**Files:**
- Create: `src/domains/teaching/chapter-roots.ts`
- Modify: `src/domains/teaching/services/chapter-distribution-service.ts:87-89`
- Modify: `src/domains/agents/prompts/chapter-distribution-prompt.ts:34` (`c.order` → `c.number`)
- Test: `src/domains/teaching/__tests__/chapter-roots.test.ts` (novo), `src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts`, `src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts`

**Interfaces:**
- Consumes: `PlanChapterBook` com `parentId`, `depth`, `number` (fase 1).
- Produces (puro, sem Prisma):
  ```ts
  export type ChapterParentRef = { id: string; parentId: string | null };
  export function chapterParentIndex(books: PlanChapterBook[]): Map<string, ChapterParentRef>
  export function rootIdOf(chapterId: string, byId: Map<string, ChapterParentRef>): string
  // sobe por parentId; id desconhecido devolve ele mesmo; para em pai ausente; guarda contra ciclo com Set de visitados.
  export function toRootIds(chapterIds: string[], byId: Map<string, ChapterParentRef>): string[]
  // mapeia cada id para a raiz e deduplica mantendo a primeira ocorrência.
  export function rootBooks(books: PlanChapterBook[]): PlanChapterBook[]
  // mesmos livros, chapters filtrados por depth === 0.
  ```
  `distributeChapters` passa a usar `const books = rootBooks(await deps.listPlanChapters(...))` para o prompt e para `planChapterIds(books)`; a validação rejeita qualquer id de seção (503) e só raízes são gravadas.

- [ ] **Step 1: Escrever os testes**

`chapter-roots.test.ts` (livro "Matemática Básica" da tabela de exemplo como `PlanChapterBook`):

```ts
it('rootIdOf sobe até a raiz', () => {
  const idx = chapterParentIndex([book]);
  expect(rootIdOf('s221', idx)).toBe('u2');
  expect(rootIdOf('u3', idx)).toBe('u3');
  expect(rootIdOf('desconhecido', idx)).toBe('desconhecido');
});
it('toRootIds mapeia e deduplica na ordem', () => {
  expect(toRootIds(['s21', 's222', 'u1', 'u2'], chapterParentIndex([book]))).toEqual(['u2', 'u1']);
});
it('rootBooks mantém só depth 0', () => {
  expect(rootBooks([book])[0].chapters.map((c) => c.id)).toEqual(['u1', 'u2', 'u3']);
});
it('rootIdOf não entra em laço com ciclo', () => {
  const idx = new Map([['a', { id: 'a', parentId: 'b' }], ['b', { id: 'b', parentId: 'a' }]]);
  expect(['a', 'b']).toContain(rootIdOf('a', idx));
});
```

Em `chapter-distribution-service.test.ts`: as fixtures `ch1`/`ch2` ganham `parentId: null, depth: 0, number: '1'|'2'`; novos casos com `books: [book]` (árvore de exemplo):

```ts
it('prompt lista só as raízes', async () => {
  const { deps, streamChat } = makeDeps({ books: [book], text: JSON.stringify({ lessons: [1, 2, 3].map((n) => ({ classNumber: n, topicTitle: 'T', chapterIds: ['u2'] })) }) });
  await distributeChapters('sch1', teacher, deps);
  const user = streamChat.mock.calls[0][0][1].content as string;
  expect(user).toContain('id=u2 · Cap. 2: Unidade 2 (p. 43 a 66)');
  expect(user).not.toContain('id=s21');
});
it('resposta com id de seção é inválida (503) e nada é gravado', async () => {
  const { deps, apply } = makeDeps({ books: [book], text: JSON.stringify({ lessons: [1, 2, 3].map((n) => ({ classNumber: n, topicTitle: 'T', chapterIds: ['s22'] })) }) });
  await expect(distributeChapters('sch1', teacher, deps)).rejects.toMatchObject({ status: 503 });
  expect(apply).not.toHaveBeenCalled();
});
```

(Usar o mesmo nome de campo de status que os testes atuais do arquivo usam para `DomainError`.) Em `chapter-distribution-prompt.test.ts`: fixtures ganham `number`, expectativas `'id=ch1 · Cap. 1: Introdução (p. 12 a 24)'` inalteradas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/teaching/__tests__/chapter-roots.test.ts src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts`
Expected: FAIL com `Failed to resolve import "../chapter-roots"` e prompt contendo `id=s21`.

- [ ] **Step 3: Implementar `chapter-roots.ts`, filtrar as raízes no serviço e usar `number` no prompt**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/domains/teaching src/domains/agents/prompts && npx tsc --noEmit 2>&1 | grep -E "src/domains/(teaching|agents)"`
Expected: PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/teaching/chapter-roots.ts src/domains/teaching/__tests__/chapter-roots.test.ts src/domains/teaching/services/chapter-distribution-service.ts src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts src/domains/agents/prompts/chapter-distribution-prompt.ts src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts
git commit -m "feat(capitulos): distribuição no cronograma só com capítulos raiz

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Unidades do plano mapeando seções para a raiz

**Files:**
- Modify: `src/domains/teaching/services/plan-units-service.ts:67-84`
- Modify: `src/domains/agents/prompts/plan-units-prompt.ts:43` (`c.order` → `c.number`)
- Test: `src/domains/teaching/services/__tests__/plan-units-service.test.ts`, `src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts`

**Interfaces:**
- Consumes: `chapterParentIndex`, `toRootIds`, `rootBooks` (Task 4).
- Produces: em `generateUnitsFromDistribution`, a checagem de aulas sem capítulos (422 `NO_DISTRIBUTED_CHAPTERS`, sem chamar `listPlanChapters`, como o teste atual exige) continua sobre os ids crus; depois carrega `allBooks = await deps.listPlanChapters(...)` e substitui `lessons[i].chapterIds` por `toRootIds(ids da aula, chapterParentIndex(allBooks))`; `countLessonGroups`, o prompt e `isValidPlanUnits` recebem essas `lessons` e `rootBooks(allBooks)` / `planChapterIds(rootBooks(allBooks))`. `isValidPlanUnits` e `countLessonGroups` não mudam.

- [ ] **Step 1: Escrever os testes**

Fixtures atuais ganham `parentId: null, depth: 0, number: String(n)`. Novo caso com a árvore de exemplo:

```ts
it('aulas com seções contam pela raiz do ramo no agrupamento, no prompt e na validação', async () => {
  const sch = schedule(true, 't1', (n) => (n === 1 ? ['s21'] : n === 2 ? ['s221'] : n === 3 ? ['u1'] : ['u3']));
  const units = [
    { unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['u1'] },
    { unitNumber: 2, title: 'U2', topics: ['b'], chapterIds: ['u2'] },
    { unitNumber: 3, title: 'U3', topics: ['c'], chapterIds: ['u3'] },
  ];
  const { deps, saveUnits, streamChat, listPlanChapters } = makeDeps({ sch, text: JSON.stringify({ units }) });
  listPlanChapters.mockResolvedValue([book]);
  expect(await generateUnitsFromDistribution('sch1', teacher, deps)).toEqual(units);
  const user = streamChat.mock.calls[0][0][1].content as string;
  expect(user).toContain('Aula 1 · Aula 1 · capítulos: u2');
  expect(user).toContain('Aula 2 · Aula 2 · capítulos: u2');
  expect(user).not.toContain('id=s21');
  expect(saveUnits).toHaveBeenCalledWith('p1', units);
});

it('unidade com id de seção é inválida (503)', async () => {
  const sch = schedule(true, 't1', (n) => (n <= 2 ? ['s21'] : n === 3 ? ['u1'] : ['u3']));
  const bad = [
    { unitNumber: 1, title: 'U1', topics: ['a'], chapterIds: ['u1'] },
    { unitNumber: 2, title: 'U2', topics: ['b'], chapterIds: ['s21'] },
    { unitNumber: 3, title: 'U3', topics: ['c'], chapterIds: ['u3'] },
  ];
  const { deps, listPlanChapters } = makeDeps({ sch, text: JSON.stringify({ units: bad }) });
  listPlanChapters.mockResolvedValue([book]);
  await expect(generateUnitsFromDistribution('sch1', teacher, deps)).rejects.toThrow(PLAN_UNITS_AI_UNAVAILABLE_MESSAGE);
});
```

Em `plan-units-prompt.test.ts`: fixtures ganham `number`; expectativas `Cap. 1: ...` inalteradas.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/teaching/services/__tests__/plan-units-service.test.ts src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts`
Expected: FAIL: prompt com `capítulos: s21` e unidade com `u2` rejeitada.

- [ ] **Step 3: Implementar o mapeamento para a raiz no serviço e `number` no prompt**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/domains/teaching src/domains/agents/prompts && npx tsc --noEmit 2>&1 | grep -E "src/domains/(teaching|agents)"`
Expected: PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/teaching/services/plan-units-service.ts src/domains/teaching/services/__tests__/plan-units-service.test.ts src/domains/agents/prompts/plan-units-prompt.ts src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts
git commit -m "feat(capitulos): unidades do plano agrupam pela raiz do ramo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Rótulos curtos e item de combobox com `number`

**Files:**
- Modify: `src/components/teaching/chapter-combobox-item.ts` (tipos, `chapterToComboboxItem`, `formatChapterShortList`)
- Modify: `src/components/teaching/use-lessons.ts:22`, `src/components/teaching/use-schedules.ts:12` (`chapter: { order: number; number: string }`)
- Modify: `src/app/teacher/schedules/_components/MeetingsTable.tsx:35`
- Modify: `src/app/teacher/plans/new/_components/PlanUnitsCard.tsx:22-53` (`orderById` → `numberById`)
- Test: `src/components/teaching/__tests__/chapter-combobox-item.test.ts`, `src/app/teacher/schedules/_components/__tests__/MeetingsTable.test.tsx`, `src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx`

**Interfaces:**
- Consumes: `listLessonsBySchedule` com `chapter.number` (Task 1); `PlanChapter` com `parentId/depth/number` (fase 1).
- Produces:
  ```ts
  export type ClientPlanChapter = {
    id: string; order: number; title: string; startPage: number; endPage: number | null;
    parentId: string | null; depth: number; number: string;
  };
  export type ClientPlanChapterBook = { materialId: string; title: string; author: string; kind: 'BASIC' | 'COMPLEMENTARY'; chapters: ClientPlanChapter[] };
  export const CHAPTER_INDENT = ' '; // em space, não colapsa no HTML
  export function chapterToComboboxItem(chapter: ClientPlanChapter, book: { title: string; author: string }): ComboboxItem
  // title = `${CHAPTER_INDENT.repeat(depth)}${number} ${title}`; subtitle e badge como hoje.
  export function formatChapterShortList(numbers: string[]): string
  // deduplica, ordena por segmentos numéricos ("2.9" < "2.10"), `Cap. ${lista.join(', ')}`; vazio → '—'.
  ```

- [ ] **Step 1: Atualizar os testes**

```ts
it('chapterToComboboxItem usa number e recua por depth', () => {
  expect(chapterToComboboxItem({ id: 's221', order: 5, number: '2.2.1', title: 'Operações com frações', startPage: 51, endPage: 57, parentId: 's22', depth: 2 },
    { title: 'Matemática Básica', author: 'Silva' }))
    .toEqual({ id: 's221', title: '  2.2.1 Operações com frações', subtitle: 'Matemática Básica (Silva)', badge: 'p. 51 a 57' });
});
it('formatChapterShortList ordena por segmentos, deduplica e usa travessão quando vazio', () => {
  expect(formatChapterShortList(['2.3', '1', '2.10', '2.3'])).toBe('Cap. 1, 2.3, 2.10');
  expect(formatChapterShortList([])).toBe('—');
});
```

Os demais casos do arquivo ganham `parentId: null, depth: 0, number` igual ao `order` (raiz sem recuo). Para manter o gate de tipo verde até a Task 9, os objetos `chapter: { order: N }` em `LessonEditor.test.tsx` e `SchedulesPage.test.tsx` ganham `number: 'N'` (só isso; expectativas inalteradas). `MeetingsTable.test.tsx`: chapters `[{ chapterId: 'a', chapter: { order: 5, number: '2.3' } }, { chapterId: 'b', chapter: { order: 3, number: '2.1' } }]` e expectativa `screen.getByText('Cap. 2.1, 2.3')`. `PlanUnitsCard.test.tsx`: fixtures ganham `number: '1'|'2'`, expectativa `'Cap. 1, 2'` inalterada.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/teaching src/app/teacher/schedules src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx`
Expected: FAIL: título `'Cap. 5: Operações com frações'` e `'Cap. 3, 5'`.

- [ ] **Step 3: Implementar os tipos e as duas funções; trocar `order` por `number` em `MeetingsTable` e `PlanUnitsCard`**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/components/teaching src/app/teacher/schedules src/app/teacher/plans src/app/teacher/lessons && npx tsc --noEmit 2>&1 | grep -E "src/components/teaching|src/app/teacher"`
Expected: PASS (inclui `SchedulesPage.test.tsx` e `LessonEditor.test.tsx`, que ainda usa o combobox até a Task 9); grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/components/teaching/chapter-combobox-item.ts src/components/teaching/use-lessons.ts src/components/teaching/use-schedules.ts src/components/teaching/__tests__/chapter-combobox-item.test.ts src/app/teacher/schedules/_components/MeetingsTable.tsx src/app/teacher/schedules/_components/__tests__/MeetingsTable.test.tsx src/app/teacher/schedules/_components/__tests__/SchedulesPage.test.tsx src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx src/app/teacher/plans/new/_components/PlanUnitsCard.tsx src/app/teacher/plans/new/_components/__tests__/PlanUnitsCard.test.tsx
git commit -m "feat(capitulos): rótulo curto e item de combobox com número hierárquico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Regras puras de seleção em árvore (`chapter-tree.ts`)

**Files:**
- Create: `src/components/teaching/chapter-tree.ts`
- Create: `src/components/teaching/__tests__/chapter-tree-fixtures.ts` (livro "Matemática Básica" da tabela de exemplo como `ClientPlanChapterBook`, exportado como `MAT_BOOK`, e um segundo livro `COMP_BOOK` COMPLEMENTARY com uma raiz `x1` "Apêndice", `number: '1'`)
- Test: `src/components/teaching/__tests__/chapter-tree.test.ts`

**Interfaces:**
- Consumes: `ClientPlanChapter` (Task 6).
- Produces:
  ```ts
  export type ChapterTreeIndex = {
    order: string[];                                // ids em pré-ordem (livros na ordem recebida)
    byId: Map<string, ClientPlanChapter>;
    childrenOf: Map<string | null, string[]>;       // null = raízes; pai ausente → raiz
  };
  export type CheckState = 'checked' | 'mixed' | 'unchecked';
  export function indexChapters(chapters: ClientPlanChapter[]): ChapterTreeIndex
  export function ancestorsOf(id: string, index: ChapterTreeIndex): string[]          // do pai até a raiz
  export function normalizeSelection(ids: string[], index: ChapterTreeIndex): string[]
  // remove id com ancestral selecionado e duplicados; conhecidos em pré-ordem, desconhecidos no fim na ordem original.
  export function checkState(id: string, selected: ReadonlySet<string>, index: ChapterTreeIndex): CheckState
  // 'checked' se o id ou um ancestral está selecionado; 'mixed' se algum descendente está; senão 'unchecked'.
  // Todos os filhos marcados sem o pai continua 'mixed' (o pai cobre páginas que os filhos não cobrem).
  export function toggleNode(selected: string[], id: string, index: ChapterTreeIndex): string[]  // saída normalizada
  export function visibleForQuery(query: string, index: ChapterTreeIndex): Set<string> | null
  // null para busca vazia/só espaços; senão ids cujo `${number} ${title}` contém a busca (sem acento, sem caixa) + todos os ancestrais deles.
  ```
  `toggleNode`, ramo "desmarcar um descendente de nó marcado" (o único que a assinatura não determina):

  ```ts
  const covering = [id, ...ancestorsOf(id, index)].find((a) => selected.includes(a));
  if (covering === id) return normalizeSelection(selected.filter((s) => s !== id), index);
  if (covering) {
    // Troca o ancestral marcado pelos irmãos de cada nó do caminho até `id`.
    const path = [id, ...ancestorsOf(id, index)];
    const upTo = path.indexOf(covering);
    const replacement = path.slice(0, upTo).flatMap((node) => {
      const parent = index.byId.get(node)?.parentId ?? null;
      return (index.childrenOf.get(parent) ?? []).filter((sib) => sib !== node);
    });
    return normalizeSelection([...selected.filter((s) => s !== covering), ...replacement], index);
  }
  return normalizeSelection([...selected, id], index);
  ```

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { indexChapters, normalizeSelection, checkState, toggleNode, visibleForQuery, ancestorsOf } from '../chapter-tree';
import { MAT_BOOK } from './chapter-tree-fixtures';

const idx = indexChapters(MAT_BOOK.chapters);
const state = (sel: string[], id: string) => checkState(id, new Set(sel), idx);

describe('chapter-tree', () => {
  it('indexChapters e ancestorsOf', () => {
    expect(idx.childrenOf.get(null)).toEqual(['u1', 'u2', 'u3']);
    expect(idx.childrenOf.get('s22')).toEqual(['s221', 's222']);
    expect(ancestorsOf('s221', idx)).toEqual(['s22', 'u2']);
  });
  it('normalizeSelection remove descendente de selecionado e ordena em pré-ordem', () => {
    expect(normalizeSelection(['s221', 'u3', 'u2', 's21'], idx)).toEqual(['u2', 'u3']);
  });
  it('normalizeSelection preserva ids desconhecidos no fim', () => {
    expect(normalizeSelection(['zz', 's221', 'u2'], idx)).toEqual(['u2', 'zz']);
  });
  it('marcar pai emite só o pai', () => {
    expect(toggleNode([], 'u2', idx)).toEqual(['u2']);
    expect(toggleNode(['s21', 's221'], 'u2', idx)).toEqual(['u2']);
  });
  it('desmarcar o próprio nó', () => {
    expect(toggleNode(['u2'], 'u2', idx)).toEqual([]);
    expect(toggleNode(['s21', 'u3'], 's21', idx)).toEqual(['u3']);
  });
  it('desmarcar descendente de pai marcado troca o pai pelos irmãos restantes', () => {
    expect(toggleNode(['u2'], 's221', idx)).toEqual(['s21', 's222']);
    expect(toggleNode(['u2'], 's22', idx)).toEqual(['s21']);
    expect(toggleNode(['s22', 'u3'], 's221', idx)).toEqual(['s222', 'u3']);
  });
  it('estado parcial e marcado por herança', () => {
    expect(state(['s221'], 'u2')).toBe('mixed');
    expect(state(['s221'], 's22')).toBe('mixed');
    expect(state(['s221'], 's222')).toBe('unchecked');
    expect(state(['u2'], 's221')).toBe('checked');
    expect(state(['s21', 's22'], 'u2')).toBe('mixed');
  });
  it('busca mantém ancestrais e ignora acento e caixa', () => {
    expect(visibleForQuery('FRACOES', idx)).toEqual(new Set(['u2', 's22', 's221', 's222']));
    expect(visibleForQuery('notáveis', idx)).toEqual(new Set(['u2', 's21']));
    expect(visibleForQuery('   ', idx)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/teaching/__tests__/chapter-tree.test.ts`
Expected: FAIL com `Failed to resolve import "../chapter-tree"`.

- [ ] **Step 3: Implementar `chapter-tree.ts`** (normalização de texto: `normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()`).

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run src/components/teaching/__tests__/chapter-tree.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/teaching/chapter-tree.ts src/components/teaching/__tests__/chapter-tree.test.ts src/components/teaching/__tests__/chapter-tree-fixtures.ts
git commit -m "feat(capitulos): regras puras de seleção em árvore de capítulos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Componente `ChapterTreeSelect`

**Files:**
- Create: `src/components/teaching/ChapterTreeSelect.tsx`
- Test: `src/components/teaching/__tests__/ChapterTreeSelect.test.tsx`

**Interfaces:**
- Consumes: `indexChapters`, `ancestorsOf`, `checkState`, `toggleNode`, `visibleForQuery` (Task 7); `ClientPlanChapterBook` (Task 6); fixtures `MAT_BOOK`, `COMP_BOOK` (Task 7).
- Produces:
  ```ts
  export type ChapterTreeSelectProps = {
    id: string;
    label: string;
    books: ClientPlanChapterBook[];
    selectedIds: string[];
    onSelectionChange(ids: string[]): void;   // sempre a seleção normalizada
    disabled?: boolean;
  };
  export function ChapterTreeSelect(props: ChapterTreeSelectProps): JSX.Element
  ```
  Estrutura e textos fixos:
  - `<label id={`${id}-label`}>{label}</label>`; `Input` com `aria-label="Buscar capítulos"` e placeholder `'Buscar capítulos...'`.
  - `<ul role="tree" aria-labelledby={`${id}-label`} aria-multiselectable="true">`; cada livro é `<li role="none">` com o cabeçalho `{title} ({author})` e um `<ul role="group">` com as raízes. Livros na ordem recebida (o servidor já põe BASIC antes de COMPLEMENTARY).
  - Cada nó: `<li role="treeitem" aria-label={`${number} ${title}`} aria-level={depth + 1} aria-checked={'true'|'false'|'mixed'} aria-expanded={só quando tem filhos}>`; dentro, um botão `tabIndex={-1}` com `aria-label` `Expandir ${number}` / `Recolher ${number}` (com `stopPropagation`), o indicador visual (`Check` para checked, `Minus` para mixed), `{number} {title}` e o `Badge` `p. {start} a {end}`.
  - `onClick` e `onKeyDown` ficam no próprio `li` do treeitem e chamam `e.stopPropagation()` (os treeitems são aninhados; sem isso o clique ou a tecla num filho também age no pai). Clique, `Space` ou `Enter` → `onSelectionChange(toggleNode(selectedIds, id, index))`.
  - Teclado (foco itinerante, só o item ativo com `tabIndex=0`; o foco é movido com `ref.focus()` num efeito depois da renderização, para o filho recém-expandido já existir): `ArrowDown`/`ArrowUp` próximo/anterior visível; `ArrowRight` expande ou, se já expandido, vai ao primeiro filho; `ArrowLeft` recolhe ou, se recolhido/folha, vai ao pai.
  - Expansão inicial: os ancestrais de `selectedIds`. Com busca ativa, todo nó visível com filhos visíveis aparece expandido e os demais somem; sem resultado: `'Nenhum capítulo encontrado.'`. Sem livros ou sem capítulos: `'Nenhum capítulo nos livros do plano.'`.
  - `disabled` desabilita a busca e ignora cliques e teclas.

- [ ] **Step 1: Escrever o teste**

```tsx
// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChapterTreeSelect } from '../ChapterTreeSelect';
import { MAT_BOOK, COMP_BOOK } from './chapter-tree-fixtures';

afterEach(cleanup);

function setup(selectedIds: string[] = []) {
  const onSelectionChange = vi.fn();
  render(<ChapterTreeSelect id="t" label="Capítulos desta aula" books={[MAT_BOOK, COMP_BOOK]} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />);
  return { onSelectionChange, item: (name: string) => screen.getByRole('treeitem', { name }) };
}

describe('ChapterTreeSelect', () => {
  it('agrupa por livro, raízes visíveis e filhos recolhidos', () => {
    const { item } = setup();
    expect(screen.getByRole('tree')).toBeTruthy();
    expect(screen.getByText('Matemática Básica (Silva)')).toBeTruthy();
    expect(item('2 Unidade 2').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('treeitem', { name: '2.1 Produtos notáveis' })).toBeNull();
  });

  it('marcar pai emite só o pai', () => {
    const { onSelectionChange, item } = setup(['s21']);
    fireEvent.click(item('2 Unidade 2'));
    expect(onSelectionChange).toHaveBeenCalledWith(['u2']);
  });

  it('raiz salva marca visualmente todos os descendentes', () => {
    const { item } = setup(['u2']);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2.2' }));
    expect(item('2.2.1 Operações com frações').getAttribute('aria-checked')).toBe('true');
  });

  it('desmarcar filho de pai marcado emite os irmãos restantes', () => {
    const { onSelectionChange, item } = setup(['u2']);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir 2.2' }));
    fireEvent.click(item('2.2.1 Operações com frações'));
    expect(onSelectionChange).toHaveBeenCalledWith(['s21', 's222']);
  });

  it('estado parcial no pai e no avô; seleção salva abre os ancestrais', () => {
    const { item } = setup(['s221']);
    expect(item('2 Unidade 2').getAttribute('aria-checked')).toBe('mixed');
    expect(item('2.2 Frações').getAttribute('aria-checked')).toBe('mixed');
    expect(item('2.2.1 Operações com frações').getAttribute('aria-checked')).toBe('true');
  });

  it('busca mostra os resultados com os ancestrais', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'operações' } });
    expect(screen.getAllByRole('treeitem').map((e) => e.getAttribute('aria-label')))
      .toEqual(['2 Unidade 2', '2.2 Frações', '2.2.1 Operações com frações']);
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum capítulo encontrado.')).toBeTruthy();
  });

  it('marcar durante a busca preserva a seleção oculta', () => {
    const { onSelectionChange, item } = setup(['x1']);
    fireEvent.change(screen.getByLabelText('Buscar capítulos'), { target: { value: 'frações' } });
    expect(screen.queryByRole('treeitem', { name: '1 Apêndice' })).toBeNull();
    fireEvent.click(item('2.2 Frações'));
    expect(onSelectionChange).toHaveBeenCalledWith(['s22', 'x1']);
  });

  it('teclado: setas navegam e expandem, espaço marca', () => {
    const { onSelectionChange, item } = setup();
    const u2 = item('2 Unidade 2');
    fireEvent.keyDown(u2, { key: 'ArrowRight' });
    expect(u2.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(u2, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(item('2.1 Produtos notáveis'));
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(onSelectionChange).toHaveBeenCalledWith(['s21']);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(u2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/teaching/__tests__/ChapterTreeSelect.test.tsx`
Expected: FAIL com `Failed to resolve import "../ChapterTreeSelect"`.

- [ ] **Step 3: Implementar `ChapterTreeSelect`** sobre `chapter-tree.ts`, com `Input` e `Badge` de `@/components/ui` e ícones `ChevronRight`/`ChevronDown`/`Check`/`Minus`.

- [ ] **Step 4: Rodar teste e gate de tipo**

Run: `npx vitest run src/components/teaching && npx tsc --noEmit 2>&1 | grep -E "src/components/teaching"`
Expected: PASS (8 testes neste arquivo); grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/components/teaching/ChapterTreeSelect.tsx src/components/teaching/__tests__/ChapterTreeSelect.test.tsx
git commit -m "feat(capitulos): seletor de capítulos em árvore com estado parcial e busca

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `LessonEditor` usa o `ChapterTreeSelect`

**Files:**
- Modify: `src/app/teacher/lessons/_components/LessonEditor.tsx:9,22,64,178-184`
- Test: `src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx`

**Interfaces:**
- Consumes: `ChapterTreeSelect` (Task 8); `usePlanChapters` devolvendo `ClientPlanChapterBook[]` (Task 6).
- Produces: `<ChapterTreeSelect id="lesson-chapters" label="Capítulos desta aula" books={books} selectedIds={chapterIds} onSelectionChange={setChapterIds} />` no lugar do `AdvancedMultiCombobox`; saem os imports de `AdvancedMultiCombobox` e `planChaptersToComboboxItems` e o `chapterItems`. `savedChapterIds`, `savedKey`, `selectionKey` e `useLessonGeneration` não mudam.

- [ ] **Step 1: Atualizar o teste**

- Remover o `vi.mock('@/components/ui/advanced-multi-combobox', ...)`.
- O mock de `usePlanChapters` devolve `books: [MAT_BOOK]` (importado de `@/components/teaching/__tests__/chapter-tree-fixtures` dentro da factory com `await import`, ou fixture inline equivalente).
- Capítulos salvos nas fixtures: `[{ chapterId: 'u1', chapter: { order: 1, number: '1' } }]` no lugar de `ch1`.
- Trocar `fireEvent.click(screen.getByLabelText('Cap. 2: Modelo'))` por `fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }))`; em `'salvar envia chapterIds selecionados'` a expectativa vira `['u2']`.
- Novo caso:

```tsx
it('marcar a unidade com uma seção salva troca a seção pela unidade ao salvar', async () => {
  const fetchMock = routeFetch({ [`PUT ${BASE}`]: { success: true, lesson: makeLesson() } });
  vi.stubGlobal('fetch', fetchMock);
  const onSaved = vi.fn();
  render(<LessonEditor lesson={makeLesson({ chapters: [{ chapterId: 's21', chapter: { order: 3, number: '2.1' } }] })} onSaved={onSaved} />);
  expect(screen.getByRole('treeitem', { name: '2 Unidade 2' }).getAttribute('aria-checked')).toBe('mixed');
  fireEvent.click(screen.getByRole('treeitem', { name: '2 Unidade 2' }));
  expect(screen.getByText('Salve os capítulos selecionados antes de gerar.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).chapterIds).toEqual(['u2']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx`
Expected: FAIL: `Unable to find role="treeitem"`.

- [ ] **Step 3: Trocar o combobox pelo `ChapterTreeSelect` no `LessonEditor`**

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/app/teacher/lessons && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher/lessons|src/components/teaching"`
Expected: PASS em `LessonEditor.test.tsx` (10 testes), `LessonsPage.test.tsx`, `RefineField.test.tsx`, `use-lesson-hooks.test.tsx`; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/lessons/_components/LessonEditor.tsx src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx
git commit -m "feat(capitulos): aula escolhe capítulos e seções no seletor em árvore

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Operações puras do editor de árvore (`chapter-tree-edit.ts`)

**Files:**
- Create: `src/components/teaching/chapter-tree-edit.ts`
- Test: `src/components/teaching/__tests__/chapter-tree-edit.test.ts`

**Interfaces:**
- Consumes: `MAX_CHAPTER_DEPTH`, `MAX_CHAPTER_NODES` de `@/domains/rag/constants` (fase 1; o arquivo não importa nada, então é seguro no cliente). Tipos locais.
- Produces:
  ```ts
  import { MAX_CHAPTER_DEPTH, MAX_CHAPTER_NODES } from '@/domains/rag/constants'; // não redefinir aqui
  export type EditableChapter = { key: string; title: string; startPage: string; children: EditableChapter[] };
  export type ChapterNodeInput = { title: string; startPage: number; children?: ChapterNodeInput[] };
  export type TreeValidation = { byKey: Map<string, string>; global: string | null };

  export function newChapterKey(): string                                   // 'novo-1', 'novo-2', ...
  export function fromChapterDtos(dtos: { id: string; parentId: string | null; title: string; startPage: number }[]): EditableChapter[]  // key = id; entrada em pré-ordem
  export function toChapterPayload(nodes: EditableChapter[]): ChapterNodeInput[]   // title.trim(), Number(startPage); `children` só quando não vazio
  export function numberEditable(nodes: EditableChapter[]): Map<string, string>
  export function endPagesOf(nodes: EditableChapter[], totalPages: number): Map<string, number | null>
  // regra da seção 3: max(startPage, próximo irmão - 1); último filho herda o fim do pai; última raiz = totalPages; null quando a página não é inteiro válido.
  export function depthOf(nodes: EditableChapter[], key: string): number          // -1 se não existe
  export function subtreeHeight(node: EditableChapter): number                    // 0 para folha
  export function countDescendants(nodes: EditableChapter[], key: string): number
  export function addSibling(nodes: EditableChapter[], key: string, node: EditableChapter): EditableChapter[]   // logo abaixo
  export function addChild(nodes: EditableChapter[], key: string, node: EditableChapter): EditableChapter[]     // último filho; no-op se depthOf(key) === 6
  export function removeNode(nodes: EditableChapter[], key: string): EditableChapter[]                           // com a subárvore
  export function moveNode(nodes: EditableChapter[], key: string, delta: -1 | 1): EditableChapter[]             // troca com o irmão; no-op nas pontas
  export function indentNode(nodes: EditableChapter[], key: string): EditableChapter[]
  // vira o ÚLTIMO filho do irmão anterior, levando os próprios filhos; no-op se for o primeiro irmão
  // ou se depthOf(key) + 1 + subtreeHeight(node) > 6.
  export function outdentNode(nodes: EditableChapter[], key: string): EditableChapter[]
  // vira irmão do pai, logo após ele, levando os próprios filhos; os irmãos seguintes continuam filhos do pai; no-op em raiz.
  export function canIndent(nodes: EditableChapter[], key: string): boolean       // indentNode mudaria algo
  export function canOutdent(nodes: EditableChapter[], key: string): boolean
  export function validateEditable(nodes: EditableChapter[], totalPages: number): TreeValidation
  ```
  Todas imutáveis (devolvem árvore nova; no-op devolve a mesma referência). Mensagens de `validateEditable`, a primeira violação de cada nó, nesta ordem:
  1. título vazio após `trim` → `'Informe o título.'`
  2. página não inteira ou fora de `1..totalPages` → `` `A página deve estar entre 1 e ${totalPages}.` ``
  3. `startPage` menor que a do pai → `'Começa antes do capítulo pai.'`
  4. `startPage` menor que a do irmão anterior (igual é permitido) → `'Não pode começar antes do capítulo anterior.'`
  5. `startPage` maior que o `endPage` herdado do pai (de `endPagesOf`) → `'Começa depois do fim do capítulo pai.'`
  6. profundidade > `MAX_CHAPTER_DEPTH` → `'Ultrapassa o limite de 7 níveis.'`

  Global: mais de 500 nós → `'Máximo de 500 capítulos por material.'`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import * as t from '../chapter-tree-edit';

const n = (key: string, startPage: number, children: t.EditableChapter[] = [], title = key): t.EditableChapter =>
  ({ key, title, startPage: String(startPage), children });
const tree = () => [n('u1', 15), n('u2', 43, [n('s21', 43), n('s22', 48, [n('s221', 51)])]), n('u3', 67)];
const nums = (nodes: t.EditableChapter[]) => Object.fromEntries(t.numberEditable(nodes));

describe('chapter-tree-edit', () => {
  it('fromChapterDtos monta a árvore e toChapterPayload omite children vazio', () => {
    const dtos = [
      { id: 'u2', parentId: null, title: 'Unidade 2', startPage: 43 },
      { id: 's21', parentId: 'u2', title: ' Produtos notáveis ', startPage: 43 },
    ];
    expect(t.toChapterPayload(t.fromChapterDtos(dtos))).toEqual([
      { title: 'Unidade 2', startPage: 43, children: [{ title: 'Produtos notáveis', startPage: 43 }] },
    ]);
  });
  it('numera e deriva a página final', () => {
    expect(nums(tree())).toMatchObject({ u2: '2', s21: '2.1', s22: '2.2', s221: '2.2.1', u3: '3' });
    expect(Object.fromEntries(t.endPagesOf(tree(), 174))).toEqual({ u1: 42, u2: 66, s21: 47, s22: 66, s221: 66, u3: 174 });
  });
  it('indent vira último filho do irmão anterior levando os filhos', () => {
    expect(nums(t.indentNode(tree(), 's22'))).toMatchObject({ s21: '2.1', s22: '2.1.1', s221: '2.1.1.1', u3: '3' });
  });
  it('indent é no-op no primeiro irmão e além da profundidade 6', () => {
    const base = tree();
    expect(t.indentNode(base, 's21')).toBe(base);
    expect(t.canIndent(base, 's21')).toBe(false);
    let chain = n('d6', 7);
    for (let d = 5; d >= 0; d--) chain = n(`d${d}`, d + 1, [chain]);
    const deep = [chain, n('irmao', 50)];
    expect(t.addChild(deep, 'd6', n('d7', 8))).toBe(deep);
    // g tem altura 6; recuar o levaria a depth 1 + 6 = 7.
    const sib = [n('a', 1, [n('b', 2)]), n('g', 10, [n('h', 11, [n('i', 12, [n('j', 13, [n('k', 14, [n('l', 15, [n('m', 16)])])])])])])];
    expect(t.indentNode(sib, 'g')).toBe(sib);
    expect(t.canIndent(sib, 'g')).toBe(false);
  });
  it('outdent vira irmão do pai logo após ele; raiz é no-op', () => {
    const out = t.outdentNode(tree(), 's221');
    expect(nums(out)).toMatchObject({ s21: '2.1', s22: '2.2', s221: '2.3', u3: '3' });
    const base = tree();
    expect(t.outdentNode(base, 'u1')).toBe(base);
    expect(t.canOutdent(base, 'u1')).toBe(false);
  });
  it('move troca com o irmão e é no-op nas pontas', () => {
    expect(t.moveNode(tree(), 'u3', -1).map((x) => x.key)).toEqual(['u1', 'u3', 'u2']);
    const base = tree();
    expect(t.moveNode(base, 'u1', -1)).toBe(base);
  });
  it('remove a subárvore e conta descendentes', () => {
    expect(t.countDescendants(tree(), 'u2')).toBe(3);
    expect(nums(t.removeNode(tree(), 's22'))).toEqual({ u1: '1', u2: '2', s21: '2.1', u3: '3' });
  });
  it('adiciona irmão abaixo e filho no fim', () => {
    expect(nums(t.addSibling(tree(), 's21', n('novo', 45)))).toMatchObject({ novo: '2.2', s22: '2.3' });
    expect(nums(t.addChild(tree(), 's22', n('novo', 60)))).toMatchObject({ novo: '2.2.2' });
  });
  it('valida por nó com as invariantes', () => {
    const bad = [n('u1', 15), n('u2', 43, [n('s21', 40), n('s22', 40, [], '')]), n('u3', 0)];
    const v = t.validateEditable(bad, 174);
    expect(v.byKey.get('s21')).toBe('Começa antes do capítulo pai.');
    expect(v.byKey.get('s22')).toBe('Informe o título.');
    expect(v.byKey.get('u3')).toBe('A página deve estar entre 1 e 174.');
    expect(t.validateEditable(t.moveNode(tree(), 'u3', -1), 174).byKey.get('u2')).toBe('Não pode começar antes do capítulo anterior.');
    expect(t.validateEditable([n('u1', 15, [n('a', 21), n('b', 21)]), n('u2', 30)], 174).byKey.size).toBe(0); // irmãos na mesma página
    expect(t.validateEditable([n('u1', 15, [n('a', 20)]), n('u2', 18)], 174).byKey.get('a')).toBe('Começa depois do fim do capítulo pai.');
    expect(t.validateEditable(tree(), 174)).toEqual({ byKey: new Map(), global: null });
    const many = Array.from({ length: 501 }, (_, i) => n(`r${i}`, 1));
    expect(t.validateEditable(many, 174).global).toBe('Máximo de 500 capítulos por material.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/teaching/__tests__/chapter-tree-edit.test.ts`
Expected: FAIL com `Failed to resolve import "../chapter-tree-edit"`.

- [ ] **Step 3: Implementar `chapter-tree-edit.ts`** (helpers internos `findPath(nodes, key): number[] | null` e `updateAt(nodes, path, fn)` para manter as operações imutáveis).

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run src/components/teaching/__tests__/chapter-tree-edit.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/teaching/chapter-tree-edit.ts src/components/teaching/__tests__/chapter-tree-edit.test.ts
git commit -m "feat(capitulos): operações puras do editor de árvore de capítulos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Editor de árvore no `MaterialChaptersPanel`

**Files:**
- Modify: `src/app/teacher/materials/_components/use-material-chapters.ts:6-13,46-52` (`ChapterDTO` ganha `parentId: string | null; depth: number; number: string`; `saveMaterialChapters(id, chapters: ChapterNodeInput[], force?)`)
- Modify: `src/app/teacher/materials/_components/MaterialChaptersPanel.tsx` (estado `rows: Row[]` → `nodes: EditableChapter[]`)
- Test: `src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx`

**Interfaces:**
- Consumes: tudo de `chapter-tree-edit.ts` (Task 10); PUT recursivo, 400 com `number` e 409 (fase 1).
- Produces: painel com uma linha por nó (lista aninhada `<ul>`, recuo por profundidade), mostrando:
  - `number`; `Input` `aria-label={`Título do capítulo ${number}`}`; `Input type="number"` `aria-label={`Página inicial do capítulo ${number}`}`; `<span aria-label={`Página final do capítulo ${number}`}>` com o fim derivado de `endPagesOf` (`—` quando null);
  - botões só-ícone com `aria-label`: `Adicionar capítulo abaixo de ${number}` (`Plus`), `Adicionar subcapítulo em ${number}` (`CornerDownRight`, desabilitado em profundidade 6), `Mover ${number} para cima` (`ArrowUp`), `Mover ${number} para baixo` (`ArrowDown`), `Recuar ${number}` (`IndentIncrease`, `disabled={!canIndent}`), `Desrecuar ${number}` (`IndentDecrease`, `disabled={!canOutdent}`), `Remover capítulo ${number}` (`Trash2`);
  - a mensagem de `validateEditable` do nó em `<p id={...} className="text-xs text-danger">`, ligada aos inputs por `aria-describedby`; a mensagem global no topo da lista.
  - Remover com descendentes chama `window.confirm(`Remover "${title}" e ${count} subcapítulo(s)?`)` e só remove com `true`; sem descendentes remove direto.
  - "Adicionar capítulo" (existente) acrescenta raiz no fim com `{ key: newChapterKey(), title: '', startPage: '1', children: [] }`. "Adicionar capítulo abaixo" e "Adicionar subcapítulo" criam `{ key: newChapterKey(), title: '', startPage: <startPage do nó de referência>, children: [] }`.
  - "Salvar capítulos" desabilitado enquanto `validateEditable` tiver erro; envia `toChapterPayload(nodes)`. Reextração, origem (`source`), `lostLessonLinks`, 409 e "Forçar mesmo assim" seguem como hoje; o 400 do servidor aparece no `role="alert"` existente.
  - Qualquer edição limpa `conflict` (como `updateRow` faz hoje).

- [ ] **Step 1: Atualizar e escrever os testes**

Fixture atual `chapter` ganha `parentId: null, depth: 0, number: '1'` (os testes atuais continuam: rótulos `'Título do capítulo 1'` e o PUT `{ chapters: [{ title: 'Introdução', startPage: 2 }] }`). Fixture nova em pré-ordem com `number` (tabela de exemplo sem `s222`, `material.totalPages = 174`):

```tsx
const TREE = [
  { id: 'u1', order: 1, number: '1', title: 'Unidade 1', startPage: 15, endPage: 42, parentId: null, depth: 0, source: 'AI' },
  { id: 'u2', order: 2, number: '2', title: 'Unidade 2', startPage: 43, endPage: 66, parentId: null, depth: 0, source: 'AI' },
  { id: 's21', order: 3, number: '2.1', title: 'Produtos notáveis', startPage: 43, endPage: 47, parentId: 'u2', depth: 1, source: 'AI' },
  { id: 's22', order: 4, number: '2.2', title: 'Frações', startPage: 48, endPage: 66, parentId: 'u2', depth: 1, source: 'AI' },
  { id: 's221', order: 5, number: '2.2.1', title: 'Operações com frações', startPage: 51, endPage: 66, parentId: 's22', depth: 2, source: 'AI' },
  { id: 'u3', order: 6, number: '3', title: 'Unidade 3', startPage: 67, endPage: 174, parentId: null, depth: 0, source: 'AI' },
];
const renderTree = () => render(<MaterialChaptersPanel material={{ ...material, totalPages: 174 }} open onOpenChange={() => {}} />);

describe('editor de árvore', () => {
  it('mostra número, página final derivada e recua/desrecua', async () => {
    stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
    renderTree();
    expect((await screen.findByLabelText('Página final do capítulo 2.2')).textContent).toBe('66');
    expect((screen.getByRole('button', { name: 'Recuar 2.1' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Recuar 2.2' }));
    expect(screen.getByLabelText('Título do capítulo 2.1.1')).toBeTruthy();
    expect(screen.getByLabelText('Título do capítulo 2.1.1.1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desrecuar 2.1.1' }));
    expect((screen.getByLabelText('Título do capítulo 2.2') as HTMLInputElement).value).toBe('Frações');
  });

  it('remover subárvore pede confirmação; cancelar mantém tudo', async () => {
    stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderTree();
    await screen.findByLabelText('Título do capítulo 2');
    fireEvent.click(screen.getByRole('button', { name: 'Remover capítulo 2' }));
    expect(confirm).toHaveBeenCalledWith('Remover "Unidade 2" e 3 subcapítulo(s)?');
    expect(screen.getByLabelText('Título do capítulo 2.2.1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover capítulo 2' }));
    expect(screen.queryByLabelText('Título do capítulo 2.1')).toBeNull();
    expect((screen.getByLabelText('Título do capítulo 2') as HTMLInputElement).value).toBe('Unidade 3');
  });

  it('validação por nó bloqueia o salvar', async () => {
    stubFetch({ [`GET ${BASE}`]: { success: true, chapters: TREE } });
    renderTree();
    fireEvent.change(await screen.findByLabelText('Página inicial do capítulo 2.1'), { target: { value: '40' } });
    expect(screen.getByText('Começa antes do capítulo pai.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salvar capítulos' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adiciona subcapítulo e salva a árvore inteira no PUT', async () => {
    stubFetch({
      [`GET ${BASE}`]: { success: true, chapters: TREE },
      [`PUT ${BASE}`]: { success: true, source: 'MANUAL', chapters: TREE, lostLessonLinks: 0 },
    });
    renderTree();
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar subcapítulo em 2.1' }));
    fireEvent.change(screen.getByLabelText('Título do capítulo 2.1.1'), { target: { value: 'Quadrado da soma' } });
    fireEvent.change(screen.getByLabelText('Página inicial do capítulo 2.1.1'), { target: { value: '44' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar capítulos' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(BASE, expect.objectContaining({ method: 'PUT' })));
    const body = JSON.parse((fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')![1]!.body) as string);
    expect(body.chapters[1]).toEqual({
      title: 'Unidade 2', startPage: 43,
      children: [
        { title: 'Produtos notáveis', startPage: 43, children: [{ title: 'Quadrado da soma', startPage: 44 }] },
        { title: 'Frações', startPage: 48, children: [{ title: 'Operações com frações', startPage: 51 }] },
      ],
    });
  });
});
```

(`vi.restoreAllMocks()` no `afterEach` para o spy de `confirm`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx`
Expected: os testes antigos passam; os 4 novos FAIL (`Unable to find a label with the text of: Página final do capítulo 2.2`).

- [ ] **Step 3: Atualizar `use-material-chapters.ts` e reescrever a lista do painel sobre `chapter-tree-edit.ts`**

Ao carregar e em `applyResult`: `setNodes(fromChapterDtos(chapters))`. O componente da linha é recursivo (`ChapterNodeRow` local no mesmo arquivo) e recebe `numbers`, `endPages`, `validation` já calculados no pai com `useMemo`.

- [ ] **Step 4: Rodar testes e gate de tipo**

Run: `npx vitest run src/app/teacher/materials && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher/materials|src/components/teaching"`
Expected: PASS (todos de `MaterialChaptersPanel.test.tsx` e `use-document-inspection.test.ts`); grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/materials/_components/use-material-chapters.ts src/app/teacher/materials/_components/MaterialChaptersPanel.tsx src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx
git commit -m "feat(capitulos): editor de árvore de capítulos no painel do material

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Gate final e verificação com "Matemática Básica"

**Files:** nenhum (só verificação; correções voltam para a task dona do arquivo).

- [ ] **Step 1: Resíduos do rótulo antigo**

Run: `grep -rnE 'Cap\. \$\{[a-zA-Z.]*order\}|formatChapterShortList\(.*order' src --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: sem saída.

- [ ] **Step 2: Gate completo**

Run: `npm run test:ci`
Expected: código 0 (typecheck, lint, `vitest run` e `next build`). Se só o fallback CLASSROOM de `src/app/api/v1/agent/chat/__tests__/route.test.ts` falhar, rodar `npx vitest run src/app/api/v1/agent/chat` até passar e repetir `npm run build`.

- [ ] **Step 3: Árvore limpa**

Run: `git status --short`
Expected: só `package.json`, `package-lock.json` e `.mcp.json`, se já estavam pendentes.

- [ ] **Step 4: Verificação manual (`npm run dev`, banco local com a migration da fase 1, professor dono do plano que usa "Matemática Básica")**

1. `/teacher/materials` → "Matemática Básica" → "Capítulos" → "Extrair de novo". Esperado: origem "Extraído por IA", 5 raízes começando nas páginas 15, 43, 67, 95, 123, e "Unidade 2" com "Frações" entre os filhos. Se a extração não trouxer "Frações", criar com "Adicionar subcapítulo em 2" e salvar.
2. No mesmo painel, recuar e desrecuar um nó, conferir número e página final; cancelar e confirmar a remoção de um nó com filhos; não salvar essas mudanças de teste (fechar e reabrir mostra o salvo).
3. `/teacher/lessons` → uma aula em rascunho → "Capítulos desta aula": expandir "2 Unidade 2", marcar só "2.x Frações" (Unidade 2 fica parcial). "Salvar aula".
4. "Gerar aula com IA". No log do servidor ou com um breakpoint em `generateLessonContent`, conferir que `allowedChapterIds` contém o id de Frações e só os ids dos seus descendentes; no prompt, a linha `Cap. 2.x: Frações — Matemática Básica (...)`; e que todas as citações em "Fontes:" apontam para páginas dentro da faixa de Frações.
   Conferência no banco: `SELECT DISTINCT "chapterId" FROM material_chunks WHERE id = ANY(<ids dos chunks citados>)` só traz Frações ou descendentes.
5. `/teacher/schedules` → cronograma do plano: a coluna "Capítulos" da aula mostra `Cap. 2.x`.
6. Como aluno da turma, abrir o tutor da agenda dessa aula e perguntar algo de frações: a resposta cita só páginas de Frações (o prompt de sistema traz `Esta aula cobre: Cap. 2.x: Frações (Matemática Básica).`).
7. Em `/teacher/schedules`, "Distribuir capítulos" e depois "Gerar unidades": só raízes aparecem nas aulas redistribuídas e nas unidades.

---

## Testes existentes que mudam e onde

| Teste | Situação | Task |
|---|---|---|
| `src/domains/rag/services/__tests__/chapter-repository.test.ts` | mock de `db` ganha `materialChapter.findMany` | 1 |
| `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts` | fixture ganha `number`; deps ganham `listDescendantIds` | 2 |
| `src/domains/agents/prompts/__tests__/lesson-generation-prompt.test.ts` | fixture ganha `number` | 2 |
| `src/domains/agents/services/__tests__/chat-service.test.ts` | `toTutorScope` recebe ids expandidos | 3 |
| `src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts`, `src/domains/agents/prompts/__tests__/chapter-distribution-prompt.test.ts` | fixtures ganham `parentId`, `depth`, `number` | 4 |
| `src/domains/teaching/services/__tests__/plan-units-service.test.ts`, `src/domains/agents/prompts/__tests__/plan-units-prompt.test.ts` | idem | 5 |
| `src/components/teaching/__tests__/chapter-combobox-item.test.ts`, `MeetingsTable.test.tsx`, `PlanUnitsCard.test.tsx` | rótulos com `number` | 6 |
| `src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx` | sai o mock do combobox; entra a árvore | 9 |
| `src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx` | fixture ganha `parentId`, `depth`, `number` | 11 |
| `src/domains/agents/__tests__/tutor-pipeline.test.ts` | só ganha um caso; código inalterado | 3 |

Observação sobre a spec: a seção 8 cita `course-schedule-repository.ts` (linha 70) para o rótulo curto, mas aquela linha é o `select { chapterId }` de `findScheduleForDistribution`, usado só por distribuição e unidades, que precisam apenas dos ids (o mapeamento para a raiz acontece no serviço, Task 5). Os dados da tabela de encontros vêm de `listLessonsBySchedule` (`lesson-plan-repository.ts:4-16`), alterado na Task 1. `course-schedule-repository.ts` não muda.
