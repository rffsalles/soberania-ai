# Capítulos em árvore, fase 1 (modelo, funções puras, persistência e API): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MaterialChapter` vira árvore (`parentId`, `depth`), com funções puras de árvore, gravação nível a nível, `listDescendantIds`, PUT recursivo e seleção normalizada na aula, sem mudar a lógica de extração.

**Architecture:** Migration aditiva sem backfill. `src/domains/rag/chapters.ts` ganha `ChapterNode`/`ChapterRow` em pré-ordem e as funções que as fases 2 e 3 consomem. Os extratores atuais continuam produzindo lista plana (`ChapterDraft[]`) e passam por uma ponte `draftsToTree` (Task 6), que a fase 2 substitui por `outlineToTree`/`headingsToTree`/IA em árvore.

**Tech Stack:** Next.js 15, TypeScript, Prisma 6 + Postgres, zod 3, vitest 3.

**Spec:** docs/superpowers/specs/2026-10-26-capitulos-em-arvore-design.md (seções 3, 4, 6, 7 e 12, mais os testes delas na seção 11). Fora desta fase: seção 5 (extração em árvore, fase 2) e seções 8 e 9 (consumidores e UI, fase 3).

## Global Constraints

- Trabalho direto em `main`, sem branch nem worktree, sem PR. Commit pequeno em `main` ao fim de cada tarefa verde, com `git add` de caminhos explícitos (nunca `package.json`, `package-lock.json`, `.mcp.json`). Mensagens em pt-BR terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nomes e assinaturas exatamente como a spec: `ChapterNode`, `ChapterRow` (com `depth`, `parentOrder`), `toChapterRows(tree, totalPages)`, `isValidChapterTree(tree, totalPages, minRoots = 2)`, `chunkAssignmentsFromRows`, `relinkByTitle(oldChapters, newRows, oldLinks)`, `numberNodes(rows)`, `ChapterDTO` com `parentId`/`depth`/`number`, `listDescendantIds(chapterIds)`. `ChunkAssignment` e `ChapterLinks` não mudam.
- Limites: 500 nós por material, `depth` 0 a 6 (7 níveis; `depth` 7 inválido). Constantes `MAX_CHAPTER_NODES = 500` e `MAX_CHAPTER_DEPTH = 6` em `src/domains/rag/constants.ts`, usadas pelo validador zod e pelas funções puras.
- `order` é a posição em pré-ordem (1..N) no material; `@@unique([materialId, order])` permanece.
- Regra de `endPage`: `max(startPage, próximoIrmão.startPage - 1)`; o último filho herda o `endPage` do pai; a última raiz vai até `totalPages`.
- Irmãos têm `startPage` NÃO DECRESCENTE (iguais permitidos; faixas se sobrepõem na página compartilhada, que fica com o último nó em pré-ordem na atribuição de chunks). Continua inválido: filho com `startPage` menor que o do pai, filho com `startPage` maior que o `endPage` herdado do pai, `depth` > 6, > 500 nós.
- Migration só aditiva, nome `20261026180000_material_chapter_tree`, sem backfill. Linhas existentes ficam raízes (`parentId` nulo, `depth` 0).
- Testes: `npx vitest run <path>` (ou `-t "<nome>"`); suíte inteira `npm test`. Gate por tarefa: `npm run typecheck` sem erros (o `tsconfig` inclui os testes, então fixtures tipadas também precisam compilar).
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar isolado.

## Review Focus

1. **Filho que começa depois do fim herdado do pai** (`[{A,5,[{a,9}]},{B,9}]`: `a` teria `endPage` 8 < `startPage` 9) precisa ser inválido, não gravado com faixa negativa. Teste em Task 3 (`'filho depois do fim do pai é inválido'`).
2. **Reextração que só desloca páginas mantém os vínculos das aulas** (mesmo título, página nova), inclusive com contagem de capítulos diferente. Teste em Task 4 (`'título igual com página diferente re-vincula'`) e Task 6 (`'contagem diferente sem vínculo perdido não bloqueia'`).
3. **409 só por vínculo perdido de outro professor**: perder só vínculos próprios não bloqueia, ganhar capítulos não bloqueia. Teste em Task 6 (`'vínculo perdido de outro professor dá 409'`).
4. **`parentOrder` sem pai criado aborta a transação** em vez de gravar órfão como raiz. Teste em Task 5 (`'parentOrder sem pai aborta antes dos vínculos'`).
5. **Cliente atual (payload plano, sem `children`) e dados antigos (só raízes) continuam funcionando**, e 201 raízes passam a ser aceitas (o `.max(200)` sai). Testes em Task 7 (`'payload plano antigo vira nós sem filhos'`, `'201 raízes passam'`) e Task 2 (`'material plano numera 1, 2, 3'`).

---

## Estrutura de arquivos

- `prisma/schema.prisma` (`MaterialChapter`, linhas 416-432) e `prisma/migrations/20261026180000_material_chapter_tree/migration.sql`.
- `src/domains/rag/constants.ts`: `MAX_CHAPTER_NODES`, `MAX_CHAPTER_DEPTH`.
- `src/domains/rag/chapters.ts`: tipos de árvore e funções puras; perde `isValidChapterSequence`, `buildChunkAssignments`, `relinkByOrder`.
- `src/domains/rag/services/chapter-repository.ts`: `ChapterDTO`, `listChapters`, `replaceChapters` nível a nível, `listDescendantIds`.
- `src/domains/rag/services/chapter-extraction-service.ts`: ponte plano→árvore, `saveDrafts` e `replaceManualChapters` em árvore.
- `src/lib/validators/material-chapters.validator.ts` e `src/app/api/v1/library/materials/[id]/chapters/route.ts`: PUT recursivo.
- `src/domains/teaching/services/teaching-plan-repository.ts` (`listPlanChapters`, linhas 62-86), `plan-chapters-service.ts`: campos de árvore e `normalizeChapterSelection`.
- `src/lib/validators/lesson.validator.ts` (linha 81) e `src/domains/teaching/services/lesson-service.ts` (`updateLesson`, linhas 142-174).

---

### Task 1: Schema e migration da árvore

**Files:**
- Modify: `prisma/schema.prisma:416-432`
- Create: `prisma/migrations/20261026180000_material_chapter_tree/migration.sql` (gerado)

**Interfaces:**
- Produces (Prisma Client): `MaterialChapter.parentId String?`, `MaterialChapter.depth Int @default(0)`, `parent MaterialChapter? @relation("ChapterTree", fields: [parentId], references: [id], onDelete: Cascade)`, `children MaterialChapter[] @relation("ChapterTree")`, `@@index([parentId])`.

- [ ] **Step 1: Editar `MaterialChapter`** com exatamente os campos acima e rodar `npx prisma validate`. Expected: `The schema at prisma/schema.prisma is valid`.
- [ ] **Step 2: Gerar a migration** com `npx prisma migrate dev --name material_chapter_tree --create-only` e renomear a pasta gerada para `prisma/migrations/20261026180000_material_chapter_tree`. Conferir no SQL: só `ALTER TABLE "material_chapters" ADD COLUMN "parentId" TEXT`, `ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0`, `CREATE INDEX "material_chapters_parentId_idx"` e `ADD CONSTRAINT ... FOREIGN KEY ("parentId") REFERENCES "material_chapters"("id") ON DELETE CASCADE`. Nenhum `DROP`, nenhum `UPDATE`.
- [ ] **Step 3: Aplicar e gerar o cliente**: `npx prisma migrate dev && npx prisma generate`. Expected: migration aplicada, sem drift; `npx prisma migrate status` diz `Database schema is up to date!`.
- [ ] **Step 4: Gate**: `npm run typecheck` sem erros.
- [ ] **Step 5: Commit**: `git add prisma/schema.prisma prisma/migrations/20261026180000_material_chapter_tree && git commit -m "feat(dados): capítulos de material em árvore (parentId, depth)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 2: Tipos de árvore, `toChapterRows` e numeração

**Files:**
- Modify: `src/domains/rag/chapters.ts:4-5` (tipos), `:196-203` (`toChapterRows`)
- Modify: `src/domains/rag/constants.ts`
- Modify: `src/domains/rag/services/chapter-extraction-service.ts:149` (uma linha, via ponte)
- Modify: `src/domains/rag/services/__tests__/chapter-repository.test.ts` (fixtures de `ChapterRow` ganham `depth: 0, parentOrder: null`)
- Test: `src/domains/rag/__tests__/chapters.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // constants.ts
  export const MAX_CHAPTER_NODES = 500;
  export const MAX_CHAPTER_DEPTH = 6;
  // chapters.ts
  export type ChapterNode = { title: string; startPage: number; children: ChapterNode[] };
  export type ChapterRow = { title: string; order: number; depth: number; parentOrder: number | null; startPage: number; endPage: number };
  /** @deprecated Ponte da fase 1: formato plano dos extratores atuais. A fase 2 remove. */
  export type ChapterDraft = { title: string; startPage: number };
  export function draftsToTree(drafts: ChapterDraft[]): ChapterNode[];          // ponte: cada rascunho vira raiz com children: []
  export function toChapterRows(tree: ChapterNode[], totalPages: number): ChapterRow[];
  export function numberNodes(rows: { order: number; parentOrder: number | null }[]): string[];   // alinhado ao índice de rows (pré-ordem)
  export function numberChapters<T extends { id: string; order: number; parentId: string | null }>(chapters: T[]): (T & { number: string })[];
  ```
  `numberChapters` recebe linhas do banco em `order` crescente, converte `parentId` em `parentOrder` (mapa id → order) e delega a `numberNodes`. É o que o repositório (Task 5) e `listPlanChapters` (Task 8) usam para derivar `number`.

- [ ] **Step 1: Escrever os testes que falham** (substitui o teste atual de `toChapterRows`)
  ```ts
  const tree3: ChapterNode[] = [
    { title: 'A', startPage: 3, children: [
      { title: 'A1', startPage: 3, children: [{ title: 'A1a', startPage: 4, children: [] }] },
      { title: 'A2', startPage: 7, children: [] },
    ] },
    { title: 'B', startPage: 10, children: [] },
  ];
  it('toChapterRows achata 3 níveis em pré-ordem com endPage herdado', () =>
    expect(toChapterRows(tree3, 15)).toEqual([
      { title: 'A', order: 1, depth: 0, parentOrder: null, startPage: 3, endPage: 9 },
      { title: 'A1', order: 2, depth: 1, parentOrder: 1, startPage: 3, endPage: 6 },
      { title: 'A1a', order: 3, depth: 2, parentOrder: 2, startPage: 4, endPage: 6 },
      { title: 'A2', order: 4, depth: 1, parentOrder: 1, startPage: 7, endPage: 9 },
      { title: 'B', order: 5, depth: 0, parentOrder: null, startPage: 10, endPage: 15 },
    ]));
  it('irmãos na mesma página: endPage do anterior fica no próprio startPage', () =>
    expect(toChapterRows([
      { title: 'R', startPage: 20, children: [
        { title: 'a', startPage: 21, children: [] },
        { title: 'b', startPage: 21, children: [] },
      ] },
      { title: 'S', startPage: 30, children: [] },
    ], 40).map((r) => [r.title, r.startPage, r.endPage])).toEqual([['R', 20, 29], ['a', 21, 21], ['b', 21, 29], ['S', 30, 40]]));
  it('numberNodes numera pelo índice entre irmãos', () =>
    expect(numberNodes(toChapterRows(tree3, 15))).toEqual(['1', '1.1', '1.1.1', '1.2', '2']));
  it('material plano numera 1, 2, 3', () =>
    expect(numberChapters([
      { id: 'x', order: 1, parentId: null }, { id: 'y', order: 2, parentId: null }, { id: 'z', order: 3, parentId: null },
    ]).map((c) => c.number)).toEqual(['1', '2', '3']));
  it('numberChapters resolve parentId', () =>
    expect(numberChapters([
      { id: 'u', order: 1, parentId: null }, { id: 'f', order: 2, parentId: 'u' }, { id: 'g', order: 3, parentId: 'u' },
    ]).map((c) => c.number)).toEqual(['1', '1.1', '1.2']));
  it('draftsToTree põe children vazio', () =>
    expect(draftsToTree([{ title: 'a', startPage: 2 }])).toEqual([{ title: 'a', startPage: 2, children: [] }]));
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/rag/__tests__/chapters.test.ts`. Expected: FAIL (`numberNodes`/`draftsToTree` não exportados, `toChapterRows` sem `depth`).
- [ ] **Step 3: Implementar** os tipos, constantes e as quatro funções em `chapters.ts`. `toChapterRows` percorre recursivamente com `(nodes, depth, parentOrder, parentEnd)`, onde `parentEnd` das raízes é `totalPages`; `endPage` de um nó que não é o último irmão = `Math.max(startPage, próximoIrmão.startPage - 1)`. Ajustar a chamada em `chapter-extraction-service.ts:149` para `toChapterRows(draftsToTree(drafts), totalPages)` e os testes antigos de `buildChunkAssignments` que montam linhas com `toChapterRows([...])` para passar por `draftsToTree`.
- [ ] **Step 4: Rodar e ver passar**: `npx vitest run src/domains/rag` e `npm run typecheck`. Expected: PASS, sem erros de tipo.
- [ ] **Step 5: Commit**: `git add src/domains/rag/chapters.ts src/domains/rag/constants.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/__tests__/chapters.test.ts src/domains/rag/services/__tests__/chapter-repository.test.ts && git commit -m "feat(capitulos): tipos de árvore, achatamento em pré-ordem e numeração" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 3: `isValidChapterTree` e erro por nó

**Files:**
- Modify: `src/domains/rag/chapters.ts` (adição; `isValidChapterSequence` sai na Task 6)
- Test: `src/domains/rag/__tests__/chapters.test.ts`

**Interfaces:**
- Consumes: `toChapterRows`, `numberNodes`, `MAX_CHAPTER_NODES`, `MAX_CHAPTER_DEPTH` (Task 2).
- Produces:
  ```ts
  export type ChapterTreeError = { number: string | null; message: string };
  export function findChapterTreeError(tree: ChapterNode[], totalPages: number, minRoots = 2): ChapterTreeError | null;
  export function isValidChapterTree(tree: ChapterNode[], totalPages: number, minRoots = 2): boolean; // findChapterTreeError(...) === null
  ```
  `findChapterTreeError` existe para o 400 com o `number` do nó ofensor (spec, seção 10) e para a validação por nó do editor (fase 3). Ordem das checagens e mensagens exatas (`n` = `number` do nó em pré-ordem):
  1. Mais de `MAX_CHAPTER_NODES` nós: `{ number: null, message: 'O material admite no máximo 500 capítulos.' }`
  2. Por nó, em pré-ordem: `depth > 6`: `Capítulo ${n}: a árvore admite no máximo 7 níveis.`; página não inteira ou fora de `[1, totalPages]`: `Capítulo ${n}: a página inicial deve estar entre 1 e ${totalPages}.`; página menor que a do nó anterior em pré-ordem (cobre filho antes do pai e irmão decrescente; irmão na mesma página é válido): `Capítulo ${n}: a página inicial (${p}) não pode ser anterior à do item anterior (${prev}).`; `startPage > endPage` na linha de `toChapterRows` (filho depois do fim herdado do pai): `Capítulo ${n}: começa depois do fim do capítulo pai.`
  3. Raízes `< minRoots`: `{ number: null, message: \`São necessários pelo menos ${minRoots} capítulos de primeiro nível.\` }`
  Títulos não são validados aqui: o descarte de títulos genéricos fica nos produtores (`outlineToDrafts` hoje; `outlineToTree` na fase 2).

- [ ] **Step 1: Escrever os testes que falham** (helpers locais no topo do arquivo, reusados nas Tasks 4 a 6: `node(title, startPage, ...children)` monta `ChapterNode`; `chain(levels)` monta `levels` nós aninhados, todos na página 1, com título `L{k}`)
  ```ts
  const node = (title: string, startPage: number, ...children: ChapterNode[]): ChapterNode => ({ title, startPage, children });
  const chain = (levels: number): ChapterNode =>
    Array.from({ length: levels - 1 }).reduce<ChapterNode>((child, _, i) => node(`L${levels - 2 - i}`, 1, child), node(`L${levels - 1}`, 1));
  it('árvore de 3 níveis é válida', () => expect(isValidChapterTree(tree3, 15)).toBe(true));
  it('filho antes do pai é inválido', () =>
    expect(findChapterTreeError([node('A', 5, node('a', 3)), node('B', 10)], 20, 0)).toEqual({
      number: '1.1', message: 'Capítulo 1.1: a página inicial (3) não pode ser anterior à do item anterior (5).' }));
  it('irmão decrescente é inválido, igual é válido', () => {
    expect(isValidChapterTree([node('A', 5), node('B', 4)], 20)).toBe(false);
    expect(findChapterTreeError([node('A', 2, node('a', 4), node('b', 3)), node('B', 10)], 20)?.number).toBe('1.2');
    expect(isValidChapterTree([node('A', 5), node('B', 5)], 20)).toBe(true);
    expect(isValidChapterTree([node('A', 2, node('a', 4), node('b', 4)), node('B', 10)], 20)).toBe(true);
  });
  it('filho na página do irmão seguinte do pai é inválido (endPage do pai limitado)', () =>
    // A.endPage = max(5, 6 - 1) = 5; a começa em 6 > 5
    expect(findChapterTreeError([node('A', 5, node('a', 6)), node('B', 6)], 20)?.message).toBe('Capítulo 1.1: começa depois do fim do capítulo pai.'));
  it('filho depois do fim do pai é inválido', () =>
    expect(findChapterTreeError([node('A', 5, node('a', 9)), node('B', 9)], 20)).toEqual({
      number: '1.1', message: 'Capítulo 1.1: começa depois do fim do capítulo pai.' }));
  it('depth 7 é inválido e depth 6 é válido', () => {
    expect(isValidChapterTree([chain(8), node('B', 10)], 20)).toBe(false);   // 8 níveis: depth 0..7
    expect(isValidChapterTree([chain(7), node('B', 10)], 20)).toBe(true);    // 7 níveis: depth 0..6
  });
  it('501 nós é inválido e 500 é válido', () => {
    const roots = (n: number) => Array.from({ length: n }, (_, i) => node(`C${i + 1}`, i + 1));
    expect(findChapterTreeError(roots(501), 600)).toEqual({ number: null, message: 'O material admite no máximo 500 capítulos.' });
    expect(isValidChapterTree(roots(500), 600)).toBe(true);
  });
  it('raiz única depende de minRoots', () => {
    expect(isValidChapterTree([node('A', 1)], 20, 2)).toBe(false);
    expect(isValidChapterTree([node('A', 1)], 20, 1)).toBe(true);
    expect(isValidChapterTree([node('A', 1)], 20, 0)).toBe(true);
    expect(isValidChapterTree([], 20, 0)).toBe(true);
  });
  it('página fora do intervalo ou não inteira é inválida', () => {
    expect(isValidChapterTree([node('A', 0), node('B', 5)], 20)).toBe(false);
    expect(isValidChapterTree([node('A', 1), node('B', 21)], 20)).toBe(false);
    expect(isValidChapterTree([node('A', 1), node('B', 2.5)], 20)).toBe(false);
  });
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/rag/__tests__/chapters.test.ts -t "inválid|válid"`. Expected: FAIL, funções não exportadas.
- [ ] **Step 3: Implementar** `findChapterTreeError` e `isValidChapterTree` em `chapters.ts` com as regras e mensagens acima. Contar os nós antes de achatar (curto-circuito em 501).
- [ ] **Step 4: Rodar e ver passar**: mesmo comando, depois `npx vitest run src/domains/rag/__tests__/chapters.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/domains/rag/chapters.ts src/domains/rag/__tests__/chapters.test.ts && git commit -m "feat(capitulos): validação de árvore com erro por nó" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 4: `chunkAssignmentsFromRows` e `relinkByTitle`

**Files:**
- Modify: `src/domains/rag/chapters.ts` (adição; `buildChunkAssignments` e `relinkByOrder` saem na Task 6)
- Test: `src/domains/rag/__tests__/chapters.test.ts`

**Interfaces:**
- Consumes: `ChapterRow`, `toChapterRows` (Task 2); `ChunkAssignment`, `ChapterLinks` (inalterados).
- Produces:
  ```ts
  export function chunkAssignmentsFromRows(rows: ChapterRow[], totalPages: number): ChunkAssignment[];
  export type RelinkResult = { relinks: { order: number; lessonPlanId: string }[]; lostLessonLinks: number; lostLessonPlanIds: string[] };
  export function relinkByTitle(
    oldChapters: { order: number; title: string; startPage: number }[],
    newRows: ChapterRow[],
    oldLinks: ChapterLinks[],
  ): RelinkResult;
  ```
  Faixas de irmãos na mesma página se sobrepõem nela; como os UPDATEs seguem a pré-ordem, a página fica com o último nó. `chunkAssignmentsFromRows` recebe `totalPages` porque o caso sem linhas cobre `1..totalPages` (a spec escreve só `rows`, mas o mesmo texto exige esse trecho). Saída: primeiro o trecho `{ order: null, title: null, fromPage: 1, toPage: rows[0].startPage - 1 }` quando a primeira raiz começa depois da página 1; depois uma faixa por linha (`startPage..endPage`) em pré-ordem. Sem linhas: `[{ order: null, title: null, fromPage: 1, toPage: totalPages }]`.
  `lostLessonLinks` = `lostLessonPlanIds.length` (aulas distintas com pelo menos um vínculo perdido). `lostLessonPlanIds` é o campo extra que a guarda de 409 (Task 6) usa. Algoritmo de `relinkByTitle`:
  ```text
  norm(t) = t.normalize('NFD') sem diacríticos, minúsculo, espaços múltiplos → 1, trim
  passo 1: para cada antigo (em order), o primeiro novo ainda livre com norm(title) igual E startPage igual → par
  passo 2: para cada antigo restante, se norm(title) aparece exatamente 1 vez entre os novos livres
           E exatamente 1 vez entre os antigos restantes → par
  relinks = para cada par, cada lessonPlanId de oldLinks[antigo.order] → { order: novo.order, lessonPlanId }
  perdidos = lessonPlanIds de antigos sem par (distintos, ordem de aparição)
  ```

- [ ] **Step 1: Escrever os testes que falham** (substituem os de `buildChunkAssignments` e `relinkByOrder`)
  ```ts
  const rows = toChapterRows([node('U1', 5, node('1.1', 5), node('1.2', 8)), node('U2', 12)], 20);
  it('nó mais profundo vence: faixas em pré-ordem após o trecho nulo', () =>
    expect(chunkAssignmentsFromRows(rows, 20)).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 4 },
      { order: 1, title: 'U1', fromPage: 5, toPage: 11 },
      { order: 2, title: '1.1', fromPage: 5, toPage: 7 },
      { order: 3, title: '1.2', fromPage: 8, toPage: 11 },
      { order: 4, title: 'U2', fromPage: 12, toPage: 20 },
    ]));
  it('dois irmãos na página 21: a página fica com o segundo (último em pré-ordem)', () => {
    const shared = toChapterRows([node('R', 20, node('a', 21), node('b', 21)), node('S', 30)], 40);
    const result = chunkAssignmentsFromRows(shared, 40);
    expect(result).toEqual([
      { order: null, title: null, fromPage: 1, toPage: 19 },
      { order: 1, title: 'R', fromPage: 20, toPage: 29 },
      { order: 2, title: 'a', fromPage: 21, toPage: 21 },
      { order: 3, title: 'b', fromPage: 21, toPage: 29 },
      { order: 4, title: 'S', fromPage: 30, toPage: 40 },
    ]);
    expect(result.filter((a) => a.fromPage <= 21 && 21 <= a.toPage).at(-1)?.title).toBe('b'); // último UPDATE vence
  });
  it('sem linhas: um trecho nulo do documento inteiro', () =>
    expect(chunkAssignmentsFromRows([], 20)).toEqual([{ order: null, title: null, fromPage: 1, toPage: 20 }]));
  it('título igual com página diferente re-vincula', () =>
    expect(relinkByTitle([{ order: 1, title: 'Conjuntos', startPage: 15 }],
      toChapterRows([node('Intro', 1), node('Conjuntos', 17)], 30), [{ order: 1, lessonPlanIds: ['l1'] }]))
      .toEqual({ relinks: [{ order: 2, lessonPlanId: 'l1' }], lostLessonLinks: 0, lostLessonPlanIds: [] }));
  it('normaliza acentos, caixa e espaços', () =>
    expect(relinkByTitle([{ order: 1, title: 'Frações  e Decimais', startPage: 3 }],
      toChapterRows([node('fracoes e decimais', 3)], 9), [{ order: 1, lessonPlanIds: ['l1'] }]).relinks)
      .toEqual([{ order: 1, lessonPlanId: 'l1' }]));
  it('título duplicado só casa com a mesma página', () => {
    const old = [{ order: 1, title: 'Exercícios', startPage: 10 }, { order: 2, title: 'Exercícios', startPage: 20 }];
    const links = [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l2'] }];
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 10)), node('B', 15, node('Exercícios', 20))], 30), links).lostLessonLinks).toBe(0);
    expect(relinkByTitle(old, toChapterRows([node('A', 1, node('Exercícios', 12)), node('B', 15, node('Exercícios', 22))], 30), links))
      .toMatchObject({ relinks: [], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] });
  });
  it('título que some perde o vínculo e conta aulas distintas', () =>
    expect(relinkByTitle(
      [{ order: 1, title: 'A', startPage: 1 }, { order: 2, title: 'B', startPage: 5 }],
      toChapterRows([node('A', 1), node('C', 5)], 9),
      [{ order: 1, lessonPlanIds: ['l1'] }, { order: 2, lessonPlanIds: ['l1', 'l2'] }],
    )).toEqual({ relinks: [{ order: 1, lessonPlanId: 'l1' }], lostLessonLinks: 2, lostLessonPlanIds: ['l1', 'l2'] }));
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/rag/__tests__/chapters.test.ts -t "vence|página 21|sem linhas|re-vincula|normaliza|duplicado|some"`. Expected: FAIL, funções não exportadas.
- [ ] **Step 3: Implementar** as duas funções em `chapters.ts` conforme as regras acima.
- [ ] **Step 4: Rodar e ver passar**: `npx vitest run src/domains/rag/__tests__/chapters.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/domains/rag/chapters.ts src/domains/rag/__tests__/chapters.test.ts && git commit -m "feat(capitulos): faixas de chunks em pré-ordem e re-vínculo por título" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 5: Repositório: DTO de árvore, gravação nível a nível e descendentes

**Files:**
- Modify: `src/domains/rag/services/chapter-repository.ts:5-18`, `:95-128`, e nova função ao fim
- Test: `src/domains/rag/services/__tests__/chapter-repository.test.ts`

**Interfaces:**
- Consumes: `ChapterRow`, `numberChapters` (Task 2).
- Produces:
  ```ts
  export type ChapterDTO = { id: string; order: number; title: string; startPage: number; endPage: number | null;
    source: ChapterSource; parentId: string | null; depth: number; number: string };
  export function listChapters(materialId: string): Promise<ChapterDTO[]>;          // order crescente, number derivado
  export function replaceChapters(materialId, rows: ChapterRow[], source, relinks, assignments, beforeWrite?): Promise<ChapterDTO[]>; // assinatura atual
  export async function listDescendantIds(chapterIds: string[]): Promise<string[]>;
  ```
  `chapterSelect` ganha `parentId` e `depth`; `listChapters` e o retorno de `replaceChapters` passam por `numberChapters`. Inserção em `replaceChapters`, depois do `deleteMany`:
  ```text
  idByOrder = Map<order, id>
  para d de 0 até max(rows.depth):
    nível = rows com depth === d (se vazio, continue)
    data = nível.map(r => ({ materialId, title, order, startPage, endPage, source, depth: d,
                             parentId: d === 0 ? null : idByOrder.get(r.parentOrder) }))
    se algum parentId de d > 0 for undefined → throw new Error(`Capítulo ${r.order} sem pai gravado (parentOrder ${r.parentOrder}).`)
    createManyAndReturn({ data, select: { id, order } }) → preenche idByOrder
  ```
  Vínculos (`relinks`) e UPDATEs de chunks seguem como hoje, usando `idByOrder` de todos os níveis, na ordem de `assignments` (trecho nulo primeiro, depois pré-ordem). `listDescendantIds([])` devolve `[]` sem tocar o banco; com ids usa `db.$queryRaw<{ id: string }[]>` com a CTE da spec, seção 6 (`WHERE id = ANY(${chapterIds}::text[])`, junção por `c."parentId" = t.id`).

- [ ] **Step 1: Escrever os testes que falham.** Copiar para este arquivo os helpers `node` e a fixture `tree3` (Task 2) e definir `const rows = toChapterRows([node('U1', 5, node('1.1', 5), node('1.2', 8)), node('U2', 12)], 20)`. O mock de `db` ganha `materialChapter: { findMany: dbFindMany }` e `$queryRaw: queryRaw`. No mock do `tx`, `createManyAndReturn` passa a `vi.fn(async ({ data }) => data.map((d) => ({ id: \`id${d.order}\`, order: d.order })))`, `findMany` devolve linhas com `parentId`/`depth`, e `db` ganha `$queryRaw: vi.fn()`. As fixtures existentes usam `toChapterRows`.
  ```ts
  it('insere nível a nível resolvendo parentId pelo parentOrder', async () => {
    await replaceChapters('m1', toChapterRows(tree3, 15), 'MANUAL' as never, [{ order: 3, lessonPlanId: 'l1' }], []);
    const levels = tx.materialChapter.createManyAndReturn.mock.calls.map(([a]) => a.data.map((d) => [d.order, d.depth, d.parentId]));
    expect(levels).toEqual([[[1, 0, null], [5, 0, null]], [[2, 1, 'id1'], [4, 1, 'id1']], [[3, 2, 'id2']]]);
    expect(tx.lessonPlanChapter.createMany).toHaveBeenCalledWith({ data: [{ lessonPlanId: 'l1', chapterId: 'id3' }], skipDuplicates: true });
  });
  it('parentOrder sem pai aborta antes dos vínculos', async () => {
    const orphan = [{ title: 'x', order: 1, depth: 1, parentOrder: 9, startPage: 1, endPage: 5 }];
    await expect(replaceChapters('m1', orphan, 'MANUAL' as never, [{ order: 1, lessonPlanId: 'l1' }], [])).rejects.toThrow('sem pai gravado');
    expect(tx.lessonPlanChapter.createMany).not.toHaveBeenCalled();
  });
  it('aplica o trecho nulo antes das faixas dos nós', async () => {
    await replaceChapters('m1', rows, 'MANUAL' as never, [], chunkAssignmentsFromRows(rows, 20));
    expect(tx.$executeRaw.mock.calls.map((c) => c[1])).toEqual([null, 'id1', 'id2', 'id3', 'id4']); // 1º valor interpolado = chapterId
  });
  it('listChapters deriva number', async () => {
    dbFindMany.mockResolvedValue([
      { id: 'u', order: 1, title: 'U1', startPage: 1, endPage: 9, source: 'MANUAL', parentId: null, depth: 0 },
      { id: 'f', order: 2, title: 'Frações', startPage: 2, endPage: 9, source: 'MANUAL', parentId: 'u', depth: 1 },
    ]);
    expect((await listChapters('m1')).map((c) => c.number)).toEqual(['1', '1.1']);
  });
  it('listDescendantIds vazio não consulta o banco', async () => {
    expect(await listDescendantIds([])).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('listDescendantIds usa CTE recursiva', async () => {
    queryRaw.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    expect(await listDescendantIds(['c1'])).toEqual(['c1', 'c2']);
    const sql = (queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('"parentId"');
  });
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/rag/services/__tests__/chapter-repository.test.ts`. Expected: FAIL (uma única chamada de `createManyAndReturn`, `listDescendantIds` não exportado).
- [ ] **Step 3: Implementar** conforme as Interfaces. Os testes antigos (`timeout de 60 s`, `beforeWrite` antes do `deleteMany`, `beforeWrite` que lança) continuam valendo.
- [ ] **Step 4: Rodar e ver passar**: mesmo comando e `npm run typecheck`. Expected: PASS, sem erros.
- [ ] **Step 5: Commit**: `git add src/domains/rag/services/chapter-repository.ts src/domains/rag/services/__tests__/chapter-repository.test.ts && git commit -m "feat(capitulos): gravação nível a nível e descendentes por CTE" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 6: Serviço em árvore (ponte para os extratores planos)

**Files:**
- Modify: `src/domains/rag/services/chapter-extraction-service.ts:9-18` (imports), `:97-170` (`extractChapterDrafts`, `saveDrafts`), `:182` (`extractAndSaveChapters`), `:214-226` (`replaceManualChapters`)
- Modify: `src/domains/rag/chapters.ts` (remove `isValidChapterSequence`, `buildChunkAssignments`, `relinkByOrder`)
- Test: `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`

**Interfaces:**
- Consumes: `draftsToTree`, `toChapterRows` (Task 2); `isValidChapterTree`, `findChapterTreeError` (Task 3); `chunkAssignmentsFromRows`, `relinkByTitle` (Task 4); `ChapterDTO`, `replaceChapters` (Task 5).
- Produces:
  ```ts
  export async function extractChapterDrafts(input, deps?): Promise<{ source: ChapterSource; tree: ChapterNode[] } | null>;
  export async function replaceManualChapters(materialId: string, tree: ChapterNode[], opts: ChapterWriteOptions, deps?): Promise<ChapterSaveResult>;
  // ChapterSaveResult = { source; chapters: ChapterDTO[]; lostLessonLinks } (forma inalterada)
  ```
  PONTE (a fase 2 substitui): a cascata e a lógica de extração não mudam (ordem OUTLINE, HEADINGS, AI; `outlineToDrafts`, `headingsToDrafts`, `askModel`, `alignDraftsToText` intactos). Cada resultado plano passa por `draftsToTree` e é validado com `isValidChapterTree(tree, input.totalPages, 2)`. Marcar o bloco com o comentário `// Ponte da fase 1: extratores planos → árvore sem filhos. Fase 2 troca por extração em árvore.`
  `saveDrafts(materialId, tree, totalPages, source, deps, opts)`: lê `oldChapters = deps.repo.listChapters` e `oldLinks = deps.repo.listChapterLinks`; `rows = toChapterRows`; `relinkByTitle(oldChapters, rows, oldLinks)` ANTES de montar `beforeWrite`; `assignments = chunkAssignmentsFromRows(rows, totalPages)`. `beforeWrite` existe quando `opts && !opts.force && lostLessonPlanIds.length > 0` e lança o 409 atual (`LINKS_CONFLICT_MESSAGE`, mesmos `details`) só para detalhes com `lostLessonPlanIds.includes(d.lessonPlanId) && d.teacherId !== opts.user.id`. A condição `drafts.length !== oldLinks.length` (linha 152) sai.
  `replaceManualChapters`: `const error = findChapterTreeError(tree, material.totalPages, 0); if (error) throw new DomainError(400, error.message);`.
  `extractAndSaveChapters` (linha 182) passa a chamar `saveDrafts(materialId, found.tree, input.totalPages, found.source, deps, opts)`; a ponte `draftsToTree` fica dentro de `extractChapterDrafts`, então a fase 2 só troca o corpo da cascata.

- [ ] **Step 1: Atualizar e escrever os testes que falham**
  - `listChapters` passa a ser lido em toda gravação: no `beforeEach`, `listChapters.mockResolvedValue([])`; nos testes de vínculo, devolve os capítulos antigos com `title` e `startPage`.
  - Helpers no topo: `node` (Task 3) e `const tree = (pairs: [string, number][]) => pairs.map(([t, p]) => node(t, p));`. Payloads manuais passam a ser `ChapterNode[]`.
  - `'páginas decrescentes dão 400 com a mensagem exata'`: `[A 9, B 3]` → `message: 'Capítulo 2: a página inicial (3) não pode ser anterior à do item anterior (9).'`.
  - Substituir `'mesma contagem re-vincula por ordem...'` por `'reextração re-vincula por título e informa aulas sem par'`: antigos `A(2)` com `['l1']` e `B(5)` com `['l1','l2']`; outline `A(2), B(6), C(8)` → `lostLessonLinks` 0 e `replaceChapters.mock.calls[0][3]` igual a `[{order:1,lessonPlanId:'l1'},{order:2,lessonPlanId:'l1'},{order:2,lessonPlanId:'l2'}]`; outline `A(2), X(6)` → `lostLessonLinks` 2.
  - Guarda de vínculos (antigos `A(2)` com `['l1']` próprio, `B(5)` com `['l9']` de `t2`):
  ```ts
  it('vínculo perdido de outro professor dá 409', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    await expect(replaceManualChapters('m1', tree([['A', 2], ['C', 8]]), { user: teacher }, depsWith()))
      .rejects.toMatchObject({ status: 409, message: LINKS_CONFLICT_MESSAGE });
  });
  it('contagem diferente sem vínculo perdido não bloqueia', async () => {
    listChapterLinkDetails.mockResolvedValue([foreign]);
    const r = await replaceManualChapters('m1', tree([['A', 2], ['B', 5], ['C', 8]]), { user: teacher }, depsWith());
    expect(listChapterLinkDetails).not.toHaveBeenCalled();
    expect(r.lostLessonLinks).toBe(0);
  });
  it('perder só vínculo próprio não bloqueia', async () => {
    listChapterLinkDetails.mockResolvedValue([{ ...foreign, lessonPlanId: 'l1', teacherId: 't1' }]);
    const r = await replaceManualChapters('m1', tree([['X', 2], ['B', 5]]), { user: teacher }, depsWith());
    expect(r.lostLessonLinks).toBe(1);
  });
  it('árvore manual com filhos grava linhas com parentOrder', async () => {
    await replaceManualChapters('m1', [node('U1', 2, node('Frações', 3)), node('U2', 9)], { user: teacher }, depsWith());
    expect(replaceChapters.mock.calls[0][1].map((r) => [r.order, r.parentOrder])).toEqual([[1, null], [2, 1], [3, null]]);
  });
  ```
  Os testes `force` (TEACHER 403, ADMIN grava) e de reextração com 409 passam a perder `B` (outline sem `B`) para provocar o conflito.
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`. Expected: FAIL (mensagem antiga, relink por ordem, 409 por contagem).
- [ ] **Step 3: Implementar** conforme as Interfaces e remover de `chapters.ts` as três funções planas e seus imports. `ChapterDraft` (deprecated), `outlineToDrafts`, `headingsToDrafts`, `alignDraftsToText` e `parseChapterExtraction` ficam como estão.
- [ ] **Step 4: Ajustar a rota e rodar**: a rota ainda valida payload plano, então em `route.ts:32` passar `parsed.data.chapters.map((c) => ({ ...c, children: [] }))` (a Task 7 remove). Rodar `npx vitest run src/domains/rag src/domains/agents/prompts "src/app/api/v1/library/materials/[id]/chapters"` e `npm run typecheck`. Expected: PASS, sem erros (o teste de rota `'PUT válido delega...'` passa a esperar `children: []`).
- [ ] **Step 5: Commit**: `git add src/domains/rag/chapters.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts "src/app/api/v1/library/materials/[id]/chapters/route.ts" "src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts" && git commit -m "feat(capitulos): gravação em árvore, re-vínculo por título e 409 por vínculo perdido" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 7: PUT recursivo de capítulos

**Files:**
- Modify: `src/lib/validators/material-chapters.validator.ts:1-12`
- Modify: `src/app/api/v1/library/materials/[id]/chapters/route.ts:19-37`
- Test: `src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `ChapterNode` (Task 2), `MAX_CHAPTER_NODES`, `MAX_CHAPTER_DEPTH` (Task 2), `replaceManualChapters(materialId, tree, opts)` (Task 6).
- Produces:
  ```ts
  export type ChapterNodeInput = { title: string; startPage: number; children?: ChapterNodeInput[] };
  export const materialChaptersSchema: z.ZodType<{ chapters: ChapterNode[] }, z.ZodTypeDef, { chapters: ChapterNodeInput[] }>;
  ```
  Nó: `title` `z.string().trim().min(1).max(200)`, `startPage` `z.number().int().min(1)`, `children` `z.array(z.lazy(...)).default([])` (saída sempre com `children`). Sem `.max(200)` na lista de raízes. `superRefine` no objeto raiz: total de nós `> MAX_CHAPTER_NODES` ou algum `depth > MAX_CHAPTER_DEPTH` → issue. Qualquer falha de parse mantém o 400 atual com `'Capítulos inválidos: informe título e página inicial de cada capítulo.'`.

- [ ] **Step 1: Escrever os testes que falham** (ajustar o teste `'PUT válido delega...'` para esperar `[{ title: 'Cap 1', startPage: 3, children: [] }]`)
  ```ts
  it('payload recursivo chega ao service com filhos', async () => {
    mocks.replaceManualChapters.mockResolvedValue({ source: 'MANUAL', chapters: [], lostLessonLinks: 0 });
    const res = await PUT(put({ chapters: [{ title: 'U1', startPage: 2, children: [{ title: 'Frações', startPage: 3 }] }] }), props);
    expect(res.status).toBe(200);
    expect(mocks.replaceManualChapters).toHaveBeenCalledWith('m1',
      [{ title: 'U1', startPage: 2, children: [{ title: 'Frações', startPage: 3, children: [] }] }], { user: teacher, force: false });
  });
  it('payload plano antigo vira nós sem filhos', /* [{title:'A',startPage:1},{title:'B',startPage:5}] → children: [] em ambos */);
  it('201 raízes passam', /* Array.from({length:201}) → status 200 */);
  it('501 nós dá 400 sem chamar o service', /* 1 raiz com 500 filhos → 400, replaceManualChapters não chamado */);
  it('8 níveis (depth 7) dá 400 e 7 níveis passa', /* nó aninhado 8x → 400; 7x → 200 */);
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run "src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts"`. Expected: FAIL (`children` ausente, 201 raízes rejeitadas, 501 nós aceitos).
- [ ] **Step 3: Implementar** o schema e passar `parsed.data.chapters` direto a `replaceManualChapters` (remover o `.map` de ponte da Task 6).
- [ ] **Step 4: Rodar e ver passar**: mesmo comando e `npm run typecheck`. Expected: PASS, sem erros.
- [ ] **Step 5: Commit**: `git add src/lib/validators/material-chapters.validator.ts "src/app/api/v1/library/materials/[id]/chapters/route.ts" "src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts" && git commit -m "feat(capitulos): PUT de capítulos aceita árvore com limites de 500 nós e 7 níveis" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 8: Capítulos do plano com campos de árvore e normalização de seleção

**Files:**
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts:62-86`
- Modify: `src/domains/teaching/services/plan-chapters-service.ts:6`, e nova função ao fim
- Test: `src/domains/teaching/services/__tests__/plan-chapters-service.test.ts`

**Interfaces:**
- Consumes: `numberChapters` (Task 2).
- Produces:
  ```ts
  export type PlanChapter = { id: string; order: number; title: string; startPage: number; endPage: number | null;
    parentId: string | null; depth: number; number: string };
  /** Remove todo id com ancestral também selecionado; dedup; preserva a ordem de entrada; idempotente. */
  export function normalizeChapterSelection(ids: string[], books: PlanChapterBook[]): string[];
  ```
  `listPlanChapters` (repositório) seleciona também `parentId` e `depth` e aplica `numberChapters` aos capítulos de cada material. GET `/api/v1/teacher/plans/[id]/chapters` não muda de código: devolve lista plana em pré-ordem por livro com os campos novos. `normalizeChapterSelection` sobe por `parentId` num mapa id → capítulo montado a partir de `books`; id desconhecido é mantido (a checagem `CHAPTER_OUTSIDE_PLAN` vem antes, Task 9).

- [ ] **Step 1: Escrever os testes que falham** (fixtures existentes ganham `parentId: null, depth: 0, number`)
  ```ts
  const tree: PlanChapterBook[] = [{ materialId: 'm1', title: 'Livro', author: 'A', kind: 'BASIC', chapters: [
    { id: 'u1', order: 1, title: 'U1', startPage: 1, endPage: 9, parentId: null, depth: 0, number: '1' },
    { id: 'f', order: 2, title: 'Frações', startPage: 2, endPage: 5, parentId: 'u1', depth: 1, number: '1.1' },
    { id: 'f1', order: 3, title: 'Soma', startPage: 3, endPage: 5, parentId: 'f', depth: 2, number: '1.1.1' },
    { id: 'u2', order: 4, title: 'U2', startPage: 10, endPage: 20, parentId: null, depth: 0, number: '2' },
  ] }];
  it('ancestral e descendente viram só o ancestral', () => {
    expect(normalizeChapterSelection(['f1', 'u1', 'u2'], tree)).toEqual(['u1', 'u2']);
    expect(normalizeChapterSelection(['f', 'f1', 'f'], tree)).toEqual(['f']);
  });
  it('normalização é idempotente', () => {
    const once = normalizeChapterSelection(['f1', 'f', 'u2'], tree);
    expect(normalizeChapterSelection(once, tree)).toEqual(once);
  });
  it('planChapterIds inclui nós de qualquer profundidade', () =>
    expect(planChapterIds(tree)).toEqual(new Set(['u1', 'f', 'f1', 'u2'])));
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/domains/teaching/services/__tests__/plan-chapters-service.test.ts`. Expected: FAIL, `normalizeChapterSelection` não exportado.
- [ ] **Step 3: Implementar** o tipo, a função e a seleção/numeração no repositório.
- [ ] **Step 4: Rodar e ver passar**: mesmo comando e `npm run typecheck`. Expected: PASS, sem erros (consumidores de `PlanChapter` só ganham campos).
- [ ] **Step 5: Commit**: `git add src/domains/teaching/services/teaching-plan-repository.ts src/domains/teaching/services/plan-chapters-service.ts src/domains/teaching/services/__tests__/plan-chapters-service.test.ts && git commit -m "feat(plano): capítulos do plano com parentId, depth, number e seleção normalizada" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 9: Aula aceita nós de qualquer profundidade e grava a seleção normalizada

**Files:**
- Modify: `src/lib/validators/lesson.validator.ts:81`
- Modify: `src/domains/teaching/services/lesson-service.ts:142-151`
- Test: `src/lib/validators/__tests__/lesson.validator.test.ts` (novo), `src/domains/teaching/services/__tests__/lesson-service.test.ts`

**Interfaces:**
- Consumes: `normalizeChapterSelection`, `planChapterIds` (Task 8).
- Produces: `lessonInputSchema.chapterIds` = `z.array(z.string().min(1)).max(200).optional()`. Em `updateLesson`: `allowed` = todos os ids do plano (qualquer profundidade); id fora → `DomainError(400, CHAPTER_OUTSIDE_PLAN)`; depois `chapterIds = normalizeChapterSelection(chapterIds, books)` antes de `replaceLessonChapters` (inalterado). `createLesson` (`src/domains/teaching/services/teaching-content-service.ts:63`) hoje não persiste `chapterIds`; não há o que normalizar e esta fase não muda isso.

- [ ] **Step 1: Escrever os testes que falham.** Em `lesson-service.test.ts`, o mock de `listPlanChapters` em `makeDeps` ganha `{ id: 'ch1a', order: 3, title: 'C1a', parentId: 'ch1' }` e `parentId: null` em `ch1`/`ch2`.
  ```ts
  // lesson.validator.test.ts
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
  it('chapterIds aceita 200 e rejeita 201', () => {
    expect(lessonInputSchema.safeParse({ chapterIds: ids(200) }).success).toBe(true);
    expect(lessonInputSchema.safeParse({ chapterIds: ids(201) }).success).toBe(false);
  });
  // lesson-service.test.ts
  it('ancestral e descendente gravam só o ancestral', async () => {
    const { deps, calls } = makeDeps();
    await updateLesson('own', teacher, { chapterIds: ['ch1a', 'ch1', 'ch2'] }, deps);
    expect(calls.replaceLessonChapters).toEqual([{ lessonPlanId: 'own', chapterIds: ['ch1', 'ch2'] }]);
  });
  it('nó interno sozinho é aceito', async () => {
    const { deps, calls } = makeDeps();
    await updateLesson('own', teacher, { chapterIds: ['ch1a'] }, deps);
    expect(calls.replaceLessonChapters).toEqual([{ lessonPlanId: 'own', chapterIds: ['ch1a'] }]);
  });
  ```
- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run src/lib/validators/__tests__/lesson.validator.test.ts src/domains/teaching/services/__tests__/lesson-service.test.ts`. Expected: FAIL (200 ids rejeitados pelo `.max(50)` atual; `['ch1a','ch1','ch2']` gravado sem normalizar).
- [ ] **Step 3: Implementar** `.max(200)` e a normalização em `updateLesson` (reusar o `books` já carregado para `allowed`).
- [ ] **Step 4: Rodar e ver passar**: mesmo comando e `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**: `git add src/lib/validators/lesson.validator.ts src/lib/validators/__tests__/lesson.validator.test.ts src/domains/teaching/services/lesson-service.ts src/domains/teaching/services/__tests__/lesson-service.test.ts && git commit -m "feat(aulas): capítulos de qualquer nível com seleção normalizada e até 200 ids" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`

---

### Task 10: Verificação final da fase 1

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte e tipos**: `npm test`, `npm run typecheck`, `npm run lint`. Expected: tudo verde (exceto o instável conhecido, que passa isolado).
- [ ] **Step 2: Banco**: `npx prisma migrate status`. Expected: `Database schema is up to date!`. Conferir com `npx tsx -e` usando `PrismaClient` que `materialChapter.count({ where: { parentId: { not: null } } })` é 0 e `materialChapter.count({ where: { depth: { gt: 0 } } })` é 0 (sem backfill, dados antigos seguem raízes).
- [ ] **Step 3: Descendentes em banco real**: `npx tsx -e` chamando `listDescendantIds([<id de um capítulo existente>])`. Expected: devolve só esse id (raiz sem filhos é ela mesma, spec seção 12).
- [ ] **Step 4: Nada a commitar**: `git status` limpo. Se algum ajuste foi necessário, commit próprio com mensagem `fix(capitulos): ...`.
