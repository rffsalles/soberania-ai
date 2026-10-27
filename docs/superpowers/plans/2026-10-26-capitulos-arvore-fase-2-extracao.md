# Capítulos em árvore — Fase 2: extração genérica de N níveis — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a extração automática de capítulos produzir árvores de N níveis (outline completo, sumário lido pela IA com hierarquia, títulos numerados no texto) e trocar a cascata para OUTLINE → AI → HEADINGS, com o livro "mat basica" como regressão.

**Architecture:** Funções puras novas em `src/domains/rag/chapters.ts` (`outlineToTree`, `headingsToTree`, `alignDraftsToText` sobre árvore, `selectTocPages`, `isTocPage`) trabalham com o `ChapterNode` da fase 1. O prompt de extração pede a árvore com páginas IMPRESSAS e o parse usa um schema zod recursivo; o realinhamento converte as páginas impressas em físicas pelo deslocamento majoritário e recua para a página divisória a raiz cuja página veio do primeiro filho. Irmãos na mesma página são válidos (invariante da fase 1: irmãos com `startPage` não decrescente). O serviço só reordena a cascata dentro de `extractChapterDrafts` (que na fase 1 já devolve `{ source, tree }` e alimenta `saveDrafts`); a ponte `draftsToTree` e os tipos planos saem no fim.

**Tech Stack:** TypeScript, zod 3.24 (`z.lazy`), vitest 3 (`npx vitest run <path>`), tsx para o script único da fixture.

**Spec:** docs/superpowers/specs/2026-10-26-capitulos-em-arvore-design.md (seção 5 inteira e os testes de extração da seção 11)

## Global Constraints

- Trabalho direto em `main`, sem branch, sem worktree, sem PR. `git add` com caminhos explícitos; nunca commitar `package.json`, `package-lock.json`, `.mcp.json`, nem nada de `storage/`.
- Commit pequeno ao fim de cada tarefa verde, mensagem em pt-BR terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Testes nunca chamam modelo real: o modelo é o `streamChat` falso de `depsWith` em `chapter-extraction-service.test.ts` (gerador que emite um `StreamChunk`).
- Prompts do modelo em português, como os demais de `src/domains/agents/prompts/`.
- Gate de tipo por tarefa: `npx tsc --noEmit` sem erros novos nos arquivos tocados.
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar isolado.
- Pré-requisito: fase 1 do mesmo spec já em `main` (tipos `ChapterNode`/`ChapterRow` em árvore, `isValidChapterTree`, `toChapterRows`, `chunkAssignmentsFromRows`, `relinkByTitle`, `numberNodes`, ponte `draftsToTree`, `ChapterDTO` com `parentId`/`depth`/`number`, `replaceChapters` em árvore). Não replanejar nada disso.
- Profundidade máxima 6 e 500 nós são verificados por `isValidChapterTree` (fase 1); as funções desta fase não duplicam esses limites.

## Review Focus

1. **Duas entradas do sumário começam na mesma página física** ("Conjuntos dos números naturais 19" e "Conjuntos dos números inteiros 19"). A invariante da fase 1 permite irmãos com `startPage` igual (não decrescente). Esperado: a árvore da IA é válida e mantém os dois irmãos separados na página 21 (a página fica com o segundo na atribuição de chunks). Teste na regressão (c) da Task 6 e no caso "mat basica" da Task 7.
2. **Página de sumário maior que `CHAPTER_TOC_PAGE_CHARS` (1200)**: a página 10 do "mat basica" tem 1954 caracteres, e o corte perderia a Unidade 4. Esperado: página detectada como sumário vai inteira até 4000 caracteres. Teste em Task 3 (`'página de sumário vai inteira até o limite de sumário'`).
3. **Cabeçalho corrido com o título da unidade em toda página ímpar** ("19Módulo 0 / Unidade 1 – Conjuntos Numéricos") gera acertos falsos de deslocamento −1 e 0 em seções. Esperado: o deslocamento majoritário (+2) vale para todos os nós, inclusive os que acharam outro. Teste em Task 6 (`'maioria dos encontrados impõe o deslocamento a todos'`) e regressão (c).
4. **Raiz "Unidade N" sem página no sumário** recebe da IA a página da primeira seção e cairia 2 páginas depois da divisória "UNIDADE N". Esperado: como a `startPage` da raiz veio do primeiro filho, recua até 3 páginas para a página com o próprio título ou com "UNIDADE N" de mesmo número. Teste em Task 6 (`'raiz "Unidade N" recua para a divisória'`).
5. **Modelo devolve árvore profunda demais (depth 7)**. Esperado: árvore da IA rejeitada, cascata segue para HEADINGS e nada é gravado se HEADINGS também falhar. Teste em Task 7 (`'árvore da IA com depth 7 é rejeitada'`).

---

## Estrutura de arquivos

- `src/domains/rag/chapters.ts` — funções puras de extração em árvore (todas as funções novas desta fase) e remoção das planas no fim.
- `src/domains/rag/constants.ts` — `CHAPTER_TOC_EXTRA_PAGES = 10`, `CHAPTER_TOC_DETECTED_PAGE_CHARS = 4000`.
- `src/domains/agents/prompts/chapter-extraction-prompt.ts` — prompt da árvore com página impressa, limite maior para página de sumário, schema zod recursivo.
- `src/domains/rag/services/chapter-extraction-service.ts` — nova cascata, `askModel` com páginas de sumário extras e `maxTokens` 4000.
- `src/domains/rag/__tests__/fixtures/mat-basica-pages.json` (novo, gerado uma vez) — texto do PDF real reduzido.
- `src/domains/rag/__tests__/fixtures/mat-basica.ts` (novo) — carregador da fixture, outline lixo e árvore do sumário com páginas impressas.
- `src/domains/rag/__tests__/mat-basica-regression.test.ts` (novo) — regressões (a) a (d) contra a fixture.
- Testes existentes atualizados: `src/domains/rag/__tests__/chapters.test.ts`, `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`, `src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts`.

---

### Task 1: Fixture de regressão do "mat basica"

**Files:**
- Create: `src/domains/rag/__tests__/fixtures/mat-basica-pages.json` (gerado)
- Create: `src/domains/rag/__tests__/fixtures/mat-basica.ts`
- Test: `src/domains/rag/__tests__/mat-basica-regression.test.ts`

**Interfaces:**
- Consumes (fase 1): `type ChapterNode = { title: string; startPage: number; children: ChapterNode[] }` de `@/domains/rag/chapters`; `OutlineEntry` de `@/domains/rag/types`; `parseDocumentFile(buffer, filename, { skipOcr: true })` de `@/domains/rag/file-parser`.
- Produces (em `fixtures/mat-basica.ts`):
  - `MAT_BASICA_TOTAL_PAGES = 174`
  - `matBasicaPages(): { pageNumber: number; text: string }[]` — `pages[i]` vira `{ pageNumber: i + 1, text }`.
  - `MAT_BASICA_OUTLINE: OutlineEntry[]` — o outline lixo real.
  - `MAT_BASICA_PRINTED_TREE: ChapterNode[]` — o sumário das páginas 9 a 11 com páginas IMPRESSAS, raiz com a página da primeira seção.

- [ ] **Step 1: Gerar a fixture a partir do PDF real (uma vez, local)**

O PDF fica em `storage/materials/1792896097507-mat_basica.pdf` (git-ignorado). Criar o script temporário `mat-basica-fixture.tmp.ts` na raiz do repositório (não commitar):

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDocumentFile } from './src/domains/rag/file-parser';

const TOC_PAGES = [9, 10, 11];
const top3 = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join('\n');

(async () => {
  const buffer = readFileSync('storage/materials/1792896097507-mat_basica.pdf');
  const parsed = await parseDocumentFile(buffer, 'mat basica.pdf', { skipOcr: true });
  const byPage = new Map(parsed.pages.map((p) => [p.pageNumber, p.text]));
  const pages = Array.from({ length: 174 }, (_, i) => {
    const text = byPage.get(i + 1) ?? '';
    return TOC_PAGES.includes(i + 1) ? text : top3(text);
  });
  mkdirSync('src/domains/rag/__tests__/fixtures', { recursive: true });
  writeFileSync('src/domains/rag/__tests__/fixtures/mat-basica-pages.json', JSON.stringify({ totalPages: 174, pages }, null, 1) + '\n');
})();
```

Run: `npx tsx --tsconfig tsconfig.json mat-basica-fixture.tmp.ts && rm mat-basica-fixture.tmp.ts`
Expected: arquivo criado, cerca de 25 KB. As páginas 9, 10 e 11 têm o texto completo (14, 17 e 9 linhas de sumário); as demais têm no máximo 3 linhas.

- [ ] **Step 2: Escrever `fixtures/mat-basica.ts`**

`matBasicaPages` importa o JSON (`resolveJsonModule` já está ligado). Outline lixo (valores reais do PDF):

```ts
export const MAT_BASICA_OUTLINE: OutlineEntry[] = [
  { title: 'Capa_Matematica_Basica_Vol1.pdf', pageNumber: null, depth: 0 },
  { title: 'Página em branco', pageNumber: 2, depth: 0 },
  { title: 'Capa_Matematica_Basica_Vol1.pdf', pageNumber: null, depth: 0 },
  { title: 'Página em branco', pageNumber: 173, depth: 0 },
  { title: 'Página 1', pageNumber: 1, depth: 1 },
  { title: 'Página 1', pageNumber: 174, depth: 1 },
];
```

Árvore do sumário (páginas impressas, transcritas das páginas PDF 9 a 11; `n(title, startPage, children = [])`):

```ts
export const MAT_BASICA_PRINTED_TREE: ChapterNode[] = [
  n('Unidade 1 – Conjuntos Numéricos', 15, [
    n('Conjuntos Numéricos', 15),
    n('Conjuntos numéricos fundamentais', 18, [
      n('Conjuntos dos números naturais', 19), n('Conjuntos dos números inteiros', 19),
      n('Conjuntos dos números racionais', 20), n('Conjuntos dos números irracionais', 21),
      n('Conjuntos dos números reais', 22),
    ]),
    n('Intervalos', 23), n('Conjuntos: vazio, unitário, finito e infinito', 25), n('Operações com conjunto', 27),
  ]),
  n('Unidade 2 – Produtos Notáveis e Frações', 43, [
    n('Produtos notáveis', 43), n('Frações', 48, [n('Operações com frações', 51)]),
  ]),
  n('Unidade 3 – Razões, Proporções e Porcentagem', 67, [
    n('Introdução', 67), n('Razão', 69, [n('Razões especiais', 70)]),
    n('Proporção', 73, [n('Números proporcionais', 75), n('Regra de três simples e regra de três composta', 76)]),
    n('Porcentagem', 81, [n('Taxa percentual', 82)]),
  ]),
  n('Unidade 4 – Potenciação, Radiciação e Racionalização', 95, [
    n('Introdução', 95), n('Potenciação', 97, [n('Tipos de potenciação', 97), n('Propriedades de potenciação', 100)]),
    n('Radiciação', 105), n('Racionalização', 107),
    n('Logaritmo e exponencial', 111, [n('Propriedades', 112), n('Logaritmo natural', 113)]),
  ]),
  n('Unidade 5 – Equações de 1º e 2º Graus, Inequações de 1º Grau', 123, [
    n('Equações do 1º grau com uma variável', 123, [n('Resolução de uma equação', 127)]),
    n('Equações do 2º Grau ou Equações Quadráticas', 133),
    n('Inequações do 1º Grau', 138, [n('Relação de Ordem em', 138), n('Propriedades das desigualdades', 139)]),
  ]),
];
```

- [ ] **Step 3: Escrever o teste de sanidade da fixture**

```ts
describe('fixture mat basica', () => {
  const pages = matBasicaPages();
  it('tem 174 páginas, sumário completo e topo das demais', () => {
    expect(pages).toHaveLength(MAT_BASICA_TOTAL_PAGES);
    expect(pages[8].text).toContain('Conjuntos dos números naturais');
    expect(pages[9].text).toContain('Logaritmo natural');
    expect(pages[20].text.split('\n')).toEqual(['19Módulo 0', 'Unidade 1 – Conjuntos Numéricos', 'C ONJUNTO DOS NÚMEROS NATURAIS']);
    expect(pages[14].text.split('\n')[2]).toBe('UNIDADE 1');
    expect(pages.filter((p) => ![9, 10, 11].includes(p.pageNumber)).every((p) => p.text.split('\n').length <= 3)).toBe(true);
  });
});
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/domains/rag/__tests__/mat-basica-regression.test.ts`
Expected: PASS. Se alguma asserção de texto falhar, a extração local difere da usada neste plano: parar e reportar, sem ajustar os valores esperados.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/__tests__/fixtures/mat-basica-pages.json src/domains/rag/__tests__/fixtures/mat-basica.ts src/domains/rag/__tests__/mat-basica-regression.test.ts
git commit -m "test(capitulos): fixture de regressão do livro mat basica

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Detecção de páginas de sumário (`isTocPage`, `selectTocPages`)

**Files:**
- Modify: `src/domains/rag/chapters.ts:72-91` (constantes de sumário e laço de `headingsToDrafts`)
- Modify: `src/domains/rag/constants.ts`
- Test: `src/domains/rag/__tests__/chapters.test.ts`, `src/domains/rag/__tests__/mat-basica-regression.test.ts`

**Interfaces:**
- Consumes: `matBasicaPages()` (Task 1).
- Produces:
  - `constants.ts`: `export const CHAPTER_TOC_EXTRA_PAGES = 10;` e `export const CHAPTER_TOC_DETECTED_PAGE_CHARS = 4000;` (este último usado na Task 3).
  - `export function isTocPage(text: string): boolean` — true quando >= `TOC_PAGE_MIN_LINES` (3) linhas aparadas casam `TOC_LINE_PATTERN`. `headingsToDrafts` passa a usá-la no lugar da conta inline da linha 91.
  - `export function selectTocPages<T extends { pageNumber: number; text: string }>(pages: T[], windowSize: number, maxExtra: number = CHAPTER_TOC_EXTRA_PAGES): T[]` — as `windowSize` primeiras páginas, mais as páginas seguintes com `isTocPage`, no máximo `maxExtra`, na ordem original.

- [ ] **Step 1: Escrever os testes que falham**

Em `chapters.test.ts`:

```ts
describe('isTocPage', () => {
  it('3 linhas com líder e número é sumário; 2 não', () => {
    expect(isTocPage('Sumário\nA ........ 3\nB . . . . 9\nC …… 12')).toBe(true);
    expect(isTocPage('A ........ 3\nB ........ 9\nTexto')).toBe(false);
  });
});

describe('selectTocPages', () => {
  const page = (pageNumber: number, text: string) => ({ pageNumber, text });
  const toc = 'Sumário\nA ........ 3\nB ........ 9\nC ........ 12';
  it('sem sumário fora da janela devolve só a janela', () => {
    const pages = Array.from({ length: 20 }, (_, i) => page(i + 1, `Texto ${i + 1}`));
    expect(selectTocPages(pages, 15).map((p) => p.pageNumber)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
  it('acrescenta no máximo 10 páginas de sumário depois da janela', () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(i + 1, i + 1 >= 30 && i + 1 <= 41 ? toc : `Texto ${i + 1}`));
    expect(selectTocPages(pages, 5).map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });
});
```

Em `mat-basica-regression.test.ts`, regressão (d):

```ts
it('(d) páginas 9-11 entram como sumário mesmo com janela de 8 páginas', () => {
  expect(selectTocPages(matBasicaPages(), 8).map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts`
Expected: FAIL com `isTocPage is not a function` / `selectTocPages is not a function`.

- [ ] **Step 3: Implementar `isTocPage`, `selectTocPages` e as constantes; trocar a linha 91 de `headingsToDrafts` por `if (isTocPage(page.text)) continue;`**

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2. Expected: PASS, incluindo os testes antigos de `headingsToDrafts`.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/chapters.ts src/domains/rag/constants.ts src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts
git commit -m "feat(capitulos): detecção de páginas de sumário fora da janela inicial

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Prompt da árvore e parse zod recursivo

**Files:**
- Modify: `src/domains/agents/prompts/chapter-extraction-prompt.ts` (arquivo inteiro, 51 linhas)
- Test: `src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts`

**Interfaces:**
- Consumes: `ChapterNode` (fase 1), `isTocPage` (Task 2), `CHAPTER_TOC_PAGE_CHARS`, `CHAPTER_TOC_DETECTED_PAGE_CHARS` (Task 2).
- Produces:
  - `buildChapterExtractionMessages(input: { pages: TocPage[]; totalPages: number }): AIMessage[]` — assinatura igual. Corte por página: `isTocPage(p.text) ? CHAPTER_TOC_DETECTED_PAGE_CHARS : CHAPTER_TOC_PAGE_CHARS`. Marcadores de página iguais aos atuais.
  - `parseChapterExtraction(raw: string): ChapterNode[] | null` — schema recursivo com `z.lazy`: `title: z.string().trim().min(1)`, `startPage: z.coerce.number().int()`, `children: z.array(node).optional().default([])`. Tipar o schema como `z.ZodType<ChapterNode, z.ZodTypeDef, unknown>`.
  - Texto exato de `CHAPTER_EXTRACTION_SYSTEM_PROMPT`:

```text
Você analisa as primeiras páginas de um livro em PDF e extrai a árvore de capítulos a partir do sumário.
Cada página é marcada com a página física (posição no arquivo PDF) e, quando houver, a página impressa (numeração do livro).
Informe em startPage a página IMPRESSA exatamente como aparece no sumário; não converta para a página física.
Monte a hierarquia: o nível de cada entrada vem do recuo, da numeração ("2", "2.3", "2.3.1") ou da tipografia (caixa alta, negrito). Subentradas ficam em "children" da entrada acima delas, em qualquer profundidade.
Quando uma entrada de nível superior (por exemplo "Unidade 1 – ...") não tiver página no sumário, use a página da sua primeira subentrada.
Ignore cabeçalhos e rodapés corridos e não use como raiz entradas de apresentação, prefácio ou do próprio sumário.
Não invente capítulos: liste apenas o que consta no sumário, na ordem em que aparece.
Responda APENAS com um objeto JSON no formato:
{"chapters":[{"title":"título","startPage":N,"children":[{"title":"subtítulo","startPage":N,"children":[]}]}]}
```

  - A frase final da mensagem do usuário passa a ser: `Extraia a árvore de capítulos do sumário com a página impressa de início de cada entrada.`

- [ ] **Step 1: Atualizar e escrever os testes que falham**

Trocar a asserção `expect(sys.content).toContain('página física')` por `expect(sys.content).toContain('startPage a página IMPRESSA')` e `expect(sys.content).toContain('"children"')`. No primeiro teste de parse, o esperado vira `[{ title: 'Cap 1', startPage: 12, children: [] }]`. Novos:

```ts
it('página de sumário vai inteira até o limite de sumário', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `Tópico ${i + 1} ${'.'.repeat(30)} ${i + 1}`);
  const text = `Sumário\n${lines.join('\n')}`;
  expect(text.length).toBeGreaterThan(CHAPTER_TOC_PAGE_CHARS);
  expect(text.length).toBeLessThan(CHAPTER_TOC_DETECTED_PAGE_CHARS);
  const [, user] = buildChapterExtractionMessages({ pages: [{ pageNumber: 10, text }], totalPages: 174 });
  expect(user.content).toContain('Tópico 60');
});

it('parse recursivo com 3 níveis', () => {
  const raw = JSON.stringify({ chapters: [
    { title: 'Unidade 1', startPage: 15, children: [
      { title: 'Conjuntos numéricos fundamentais', startPage: '18', children: [{ title: 'Conjuntos dos números naturais', startPage: 19 }] },
    ] },
    { title: 'Unidade 2', startPage: 43 },
  ] });
  expect(parseChapterExtraction(raw)).toEqual([
    { title: 'Unidade 1', startPage: 15, children: [
      { title: 'Conjuntos numéricos fundamentais', startPage: 18, children: [{ title: 'Conjuntos dos números naturais', startPage: 19, children: [] }] },
    ] },
    { title: 'Unidade 2', startPage: 43, children: [] },
  ]);
});

it('children ausente vira [] e filho inválido invalida tudo', () => {
  expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3},{"title":"B","startPage":9}]}')).toEqual([
    { title: 'A', startPage: 3, children: [] },
    { title: 'B', startPage: 9, children: [] },
  ]);
  expect(parseChapterExtraction('{"chapters":[{"title":"A","startPage":3,"children":[{"title":" ","startPage":4}]}]}')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts`
Expected: FAIL (prompt antigo, `children` ausente no resultado, página de sumário cortada em 1200).

- [ ] **Step 3: Implementar o prompt, o corte por tipo de página e o schema recursivo**

- [ ] **Step 4: Rodar o teste do prompt e o do serviço**

Run: `npx vitest run src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`
Expected: PASS (o serviço ainda aceita o resultado, porque `ChapterNode[]` é atribuível a `ChapterDraft[]`).

- [ ] **Step 5: Commit**

```bash
git add src/domains/agents/prompts/chapter-extraction-prompt.ts src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts
git commit -m "feat(capitulos): IA devolve árvore do sumário com página impressa

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `outlineToTree`

**Files:**
- Modify: `src/domains/rag/chapters.ts` (novo bloco depois de `outlineToDrafts`, linhas 54-70)
- Test: `src/domains/rag/__tests__/chapters.test.ts` (substituir os três `describe` de `outlineToDrafts`), `src/domains/rag/__tests__/mat-basica-regression.test.ts`

**Interfaces:**
- Consumes: `ChapterNode`, `isValidChapterTree(tree: ChapterNode[], totalPages: number, minRoots: number): boolean` (fase 1); `isGenericOutlineTitle`, `MIN_NESTED_OUTLINE_CHAPTERS` (existentes); `MAT_BASICA_OUTLINE` (Task 1).
- Produces: `export function outlineToTree(entries: OutlineEntry[]): ChapterNode[]` — nunca null; lista vazia quando nada sobra. A validade é decidida por `isValidChapterTree` na cascata.

- [ ] **Step 1: Escrever os testes que falham** (`e = (title, pageNumber, depth) => ({ title, pageNumber, depth })`, `n = (title, startPage, children = []) => ({ title, startPage, children })`)

```ts
describe('outlineToTree', () => {
  it('3 níveis em pré-ordem viram árvore', () =>
    expect(outlineToTree([e('Cap 1', 5, 0), e('1.1', 6, 1), e('1.1.1', 7, 2), e('1.2', 10, 1), e('Cap 2', 40, 0)])).toEqual([
      n('Cap 1', 5, [n('1.1', 6, [n('1.1.1', 7)]), n('1.2', 10)]),
      n('Cap 2', 40),
    ]));
  it('nó sem página herda a do primeiro descendente; subárvore sem página some', () =>
    expect(outlineToTree([e('Parte I', null, 0), e('Cap 1', 5, 1), e('Cap 2', 9, 1), e('Parte II', 20, 0), e('Vazio', null, 0), e('Sem página', null, 1)])).toEqual([
      n('Parte I', 5, [n('Cap 1', 5), n('Cap 2', 9)]),
      n('Parte II', 20),
    ]));
  it('título genérico sai e os filhos sobem para o nível dele', () =>
    expect(outlineToTree([e('Capa.pdf', 1, 0), e('C1', 3, 1), e('C2', 20, 1), e('Página em branco', 30, 0), e('C3', 40, 0), e('S3.1', 41, 1)])).toEqual([
      n('C1', 3), n('C2', 20), n('C3', 40, [n('S3.1', 41)]),
    ]));
  it('raiz única com 3+ filhos: os filhos viram raízes, com seus netos', () =>
    expect(outlineToTree([e('Livro', 1, 0), e('C1', 3, 1), e('C2', 20, 1), e('C3', 40, 1), e('S', 41, 2)])).toEqual([
      n('C1', 3), n('C2', 20), n('C3', 40, [n('S', 41)]),
    ]));
  it('raiz única com 2 filhos fica como está e é inválida com minRoots 2', () => {
    const tree = outlineToTree([e('Livro', 1, 0), e('C1', 3, 1), e('C2', 20, 1)]);
    expect(tree).toEqual([n('Livro', 1, [n('C1', 3), n('C2', 20)])]);
    expect(isValidChapterTree(tree, 300, 2)).toBe(false);
  });
  it('irmão decrescente sai com a subárvore; filho antes do pai sai; irmão na mesma página fica', () =>
    expect(outlineToTree([e('A', 5, 0), e('A.1', 4, 1), e('A.2', 6, 1), e('A.3', 6, 1), e('Volta', 3, 0), e('V.1', 4, 1), e('B', 9, 0)])).toEqual([
      n('A', 5, [n('A.2', 6), n('A.3', 6)]),
      n('B', 9),
    ]));
});
```

Em `mat-basica-regression.test.ts`, regressão (a):

```ts
it('(a) outline lixo do mat basica não gera árvore válida', () => {
  const tree = outlineToTree(MAT_BASICA_OUTLINE);
  expect(tree).toEqual([]);
  expect(isValidChapterTree(tree, MAT_BASICA_TOTAL_PAGES, 2)).toBe(false);
});
```

Apagar os `describe` antigos `outlineToDrafts`, `outlineToDrafts (níveis e qualidade)` e `outlineToDrafts (segundo nível sem promover seções)`, mantendo o `describe('isGenericOutlineTitle')`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts`
Expected: FAIL com `outlineToTree is not a function`.

- [ ] **Step 3: Implementar `outlineToTree`**

Algoritmo (o que os testes não determinam sozinhos):

```ts
// 1) Árvore crua com pilha por depth (entradas já em pré-ordem). Salto de nível (0 → 2) pendura no topo da pilha.
type Raw = { title: string; page: number | null; children: Raw[] };
const roots: Raw[] = [];
const stack: { depth: number; node: Raw }[] = [];
for (const entry of entries) {
  const node: Raw = { title: entry.title.trim(), page: entry.pageNumber, children: [] };
  while (stack.length > 0 && stack[stack.length - 1].depth >= entry.depth) stack.pop();
  (stack.length > 0 ? stack[stack.length - 1].node.children : roots).push(node);
  stack.push({ depth: entry.depth, node });
}
// 2) clean(nodes, parentPage): limpa os filhos primeiro.
//    - título genérico: os filhos já limpos entram no lugar dele (promoção);
//    - sem página: herda kids[0].startPage; sem kids, descarta;
//    - depois, na lista resultante do nível: descarta (com subárvore) quem tem startPage < irmão anterior
//      ou < parentPage (startPage igual ao do irmão anterior é mantido).
// 3) Se o resultado tiver exatamente 1 raiz com >= MIN_NESTED_OUTLINE_CHAPTERS filhos, devolve os filhos.
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/chapters.ts src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts
git commit -m "feat(capitulos): outline do PDF vira árvore completa

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `headingsToTree` com títulos numerados

**Files:**
- Modify: `src/domains/rag/chapters.ts:72-115`
- Test: `src/domains/rag/__tests__/chapters.test.ts` (migrar o `describe('headingsToDrafts')`), `src/domains/rag/__tests__/mat-basica-regression.test.ts`

**Interfaces:**
- Consumes: `ChapterNode` (fase 1), `isTocPage` (Task 2), `HEADING_PATTERN`, `HEADING_SCAN_LINES`, `HEADING_TITLE_LOOKAHEAD`, `TOC_LINE_PATTERN` (existentes); `matBasicaPages()` (Task 1).
- Produces: `export function headingsToTree(pages: { pageNumber: number; text: string }[]): ChapterNode[] | null` — null com menos de `MIN_EXTRACTED_CHAPTERS` raízes. Constante nova `const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)+)\s+(\S.{2,})$/;` (valor do spec).

- [ ] **Step 1: Migrar e escrever os testes que falham**

Renomear `describe('headingsToDrafts')` para `describe('headingsToTree')`, trocar as chamadas e acrescentar `children: []` a cada nó esperado. Os casos que esperam `null` continuam com `null`. Novos:

```ts
it('títulos numerados viram filhos com profundidade pela quantidade de pontos', () =>
  expect(headingsToTree([
    page(5, 'Capítulo 1 – Redes'), page(6, '1.1 Modelos de camadas'), page(8, 'Texto\n1.2 Endereçamento IP'),
    page(9, '1.2.1 Sub-redes'), page(20, 'Capítulo 2 – Transporte'), page(22, '2.1 Protocolo TCP'),
  ])).toEqual([
    { title: 'Capítulo 1 – Redes', startPage: 5, children: [
      { title: '1.1 Modelos de camadas', startPage: 6, children: [] },
      { title: '1.2 Endereçamento IP', startPage: 8, children: [{ title: '1.2.1 Sub-redes', startPage: 9, children: [] }] },
    ] },
    { title: 'Capítulo 2 – Transporte', startPage: 20, children: [{ title: '2.1 Protocolo TCP', startPage: 22, children: [] }] },
  ]));

it('numerado de outra raiz, sem pai intermediário ou antes da 1ª raiz é ignorado', () =>
  expect(headingsToTree([
    page(3, '1.1 Antes da raiz'), page(5, 'Capítulo 1 – A'), page(6, '2.3 Fora da raiz'),
    page(7, '1.2.1 Sem pai'), page(9, '1.1 Certo'), page(20, 'Capítulo 2 – B'),
  ])).toEqual([
    { title: 'Capítulo 1 – A', startPage: 5, children: [{ title: '1.1 Certo', startPage: 9, children: [] }] },
    { title: 'Capítulo 2 – B', startPage: 20, children: [] },
  ]));

it('numerado repetido (cabeçalho corrido) fica na primeira ocorrência', () =>
  expect(headingsToTree([page(5, 'Capítulo 1 – A'), page(8, '1.1 Seção'), page(9, '1.1 Seção'), page(20, 'Capítulo 2 – B')])?.[0].children).toEqual([
    { title: '1.1 Seção', startPage: 8, children: [] },
  ]));
```

Em `mat-basica-regression.test.ts`, regressão (b), com o valor real verificado no texto do PDF (HEADINGS acha as 5 unidades nas páginas divisórias, sem subníveis, porque o livro não tem numeração "1.1"):

```ts
it('(b) HEADINGS no mat basica acha só as 5 raízes, sem filhos', () => {
  expect(headingsToTree(matBasicaPages())).toEqual([
    { title: 'Unidade 1 – Conjuntos Numéricos', startPage: 15, children: [] },
    { title: 'Unidade 2 – Produtos Notáveis e Frações', startPage: 43, children: [] },
    { title: 'Unidade 3 – Razões, Proporções e Porcentagem', startPage: 67, children: [] },
    { title: 'Unidade 4 – Potenciação, Radiciação e Racionalização', startPage: 95, children: [] },
    { title: 'Unidade 5 – Equações de 1º e 2º Graus, Inequações de 1º Grau', startPage: 123, children: [] },
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts`
Expected: FAIL com `headingsToTree is not a function`.

- [ ] **Step 3: Implementar `headingsToTree`**

As raízes seguem exatamente a lógica de `headingsToDrafts`, que fica intacta até a Task 8. Ela já cobre sequência a partir de 1, página divisória, sumário ignorado e `break` após casar `HEADING_PATTERN`. Para a linha que não casa `HEADING_PATTERN` nem `TOC_LINE_PATTERN`, o ramo numerado é:

```ts
// byNumber: Map<string, ChapterNode> zerado a cada raiz nova; lastPage = página do último nó aceito (raiz ou numerado).
const m = NUMBERED_HEADING.exec(line);
if (m && roots.length > 0) {
  const parts = m[1].split('.');
  const parentKey = parts.slice(0, -1).join('.');
  const parent = parts.length === 2 ? currentRoot : byNumber.get(parentKey);
  const siblings = parent?.children ?? [];
  // page >= lastPage já garante irmãos não decrescentes (mesma página é aceita).
  if (Number(parts[0]) === roots.length && parent && !byNumber.has(m[1]) && page.pageNumber >= lastPage) {
    const node = { title: line, startPage: page.pageNumber, children: [] };
    siblings.push(node); byNumber.set(m[1], node); lastPage = page.pageNumber;
  }
  // linha numerada não interrompe a varredura das 3 linhas
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/chapters.ts src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts
git commit -m "feat(capitulos): títulos numerados no texto viram subníveis

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Realinhamento em árvore e divisória de unidade

**Files:**
- Modify: `src/domains/rag/chapters.ts:117-183` (`normalizedWords`, `pageTopWords`, `alignDraftsToText`)
- Modify: `src/domains/rag/services/chapter-extraction-service.ts:78` (só o tipo de retorno de `askModel` para `Promise<ChapterNode[] | null>`, para o typecheck seguir verde)
- Test: `src/domains/rag/__tests__/chapters.test.ts` (reescrever `describe('alignDraftsToText')`), `src/domains/rag/__tests__/mat-basica-regression.test.ts`

**Interfaces:**
- Consumes: `ChapterNode`, `isValidChapterTree` (fase 1); `HEADING_PATTERN`, `HEADING_TITLE_LOOKAHEAD` (existentes); `matBasicaPages()`, `MAT_BASICA_PRINTED_TREE`, `MAT_BASICA_TOTAL_PAGES` (Task 1).
- Produces:
  - `export function alignDraftsToText(tree: ChapterNode[], pages: { pageNumber: number; text: string }[]): ChapterNode[]` — mesmo nome (o spec e o `vi.mock` do teste do serviço o usam), agora sobre a árvore em pré-ordem. Não muta a entrada. Irmãos que começam na mesma página continuam separados (a invariante da fase 1 aceita `startPage` igual entre irmãos).

Regras do realinhamento (constantes atuais mantidas: janela `startPage-1..startPage+6`, palavras com >= 4 letras, 60% das palavras):
  1. **Normalização do topo da página:** as 3 primeiras linhas não vazias. O conjunto de palavras é a UNIÃO das palavras do texto normal e do texto com versalete colapsado. Com a união, "C ONJUNTO" casa com "conjunto" e "LOGARITMO E EXPONENCIAL" continua casando "exponencial" (só o colapso viraria "eexponencial"). O título é normalizado só do jeito normal.

```ts
const stripAccents = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Versalete extraído vira "c onjunto": junta letra isolada à palavra seguinte. */
const collapseSmallCaps = (t: string) => stripAccents(t).replace(/\b([a-z]) (?=[a-z]{2,})/g, '$1');
```

  2. **Maioria:** cada nó (pré-ordem) recebe o deslocamento da primeira página da janela que casa, ou nenhum. Se o deslocamento mais frequente (no empate, o primeiro em pré-ordem) reúne >= 50% dos nós COM deslocamento encontrado, TODOS os nós somam esse deslocamento. Sem maioria, quem achou usa o próprio deslocamento e os demais ficam como estão.
  3. **Fora de [1, pages.length]:** o nó sai com a subárvore.
  4. **Recuo da raiz para a página divisória:** vale para a raiz cuja `startPage` veio do primeiro filho (sumário sem página para a unidade; na árvore de entrada, `startPage` da raiz igual à do primeiro filho). Depois do deslocamento, procurar das páginas `startPage-1` até `startPage-HEADING_TITLE_LOOKAHEAD` (3), sem passar da página do nó anterior em pré-ordem (exclusive), uma página cujo topo (3 primeiras linhas) traga o próprio título da raiz (mesmo critério de palavras da regra 1) ou, se o título casar `HEADING_PATTERN` (palavra-chave `m[1]`, número `m[2]`), uma linha que case inteira `new RegExp('^' + escape(m[1]) + '\\s+' + m[2] + '$', 'i')` (espaços colapsados; "UNIDADE/CAPÍTULO N"). A primeira encontrada (da mais próxima para a mais distante) vira o `startPage` da raiz. Conferido no PDF real: as páginas `startPage-1` das 5 unidades (16, 44, 68, 96, 124) só têm "Bacharelado em Administração Pública / Matemática Básica" ou estão vazias, e a divisória "UNIDADE N" está em 15, 43, 67, 95, 123.

- [ ] **Step 1: Reescrever e escrever os testes que falham**

Os testes atuais de `alignDraftsToText` passam a usar nós `{ title, startPage, children: [] }`. Os casos `'realinha páginas impressas (+2)'`, `'draft sem título encontrado herda o deslocamento majoritário'` e `'ignora acentos e pontuação ao comparar'` continuam com os mesmos números. O caso `'deslocamento herdado fora de [1, total]'` passa a ter um filho `{ title: 'x', startPage: 300 }` sob o nó 299 e espera os dois removidos. Apagar `'sem maioria de realinhados, mantém os não encontrados como estão'` (pela regra nova, 1 achado de 1 já é maioria). Novos:

```ts
const node = (title: string, startPage: number, children: ChapterNode[] = []) => ({ title, startPage, children });
const blank = (total: number) => Array.from({ length: total }, (_, i) => page(i + 1, `Texto qualquer ${i + 1}`));

it.each([
  ['Intervalos', 21, '23Módulo 0\nUnidade 1 – Conjuntos Numéricos\nI NTERVALOS', 23],
  ['Logaritmo e exponencial', 11, '111Módulo 0\nUnidade 4\nLOGARITMO E EXPONENCIAL', 13],
])('versalete espaçado e letra isolada: "%s" acha o topo com deslocamento 2', (title, printed, top, expected) => {
  const pages = blank(60);
  pages[expected - 1] = page(expected, top);
  expect(alignDraftsToText([node(title, printed)], pages)[0].startPage).toBe(expected);
});

it('maioria dos encontrados impõe o deslocamento a todos, filhos inclusive', () => {
  const pages = blank(60);
  pages[4] = page(5, 'Fundamentos de Redes');
  pages[10] = page(11, 'Protocolos de Camada');
  pages[13] = page(14, 'Camada de Aplicação');
  const tree = [node('Fundamentos de Redes', 3, [node('Título ausente', 4)]), node('Protocolos de Camada', 9), node('Camada de Aplicação', 14)];
  expect(alignDraftsToText(tree, pages)).toEqual([
    node('Fundamentos de Redes', 5, [node('Título ausente', 6)]), node('Protocolos de Camada', 11), node('Camada de Aplicação', 16),
  ]);
  expect(tree[0].startPage).toBe(3);
});

it('sem maioria cada nó encontrado usa o próprio deslocamento', () => {
  const pages = blank(60);
  pages[4] = page(5, 'Fundamentos de Redes');
  pages[8] = page(9, 'Protocolos de Camada');
  pages[13] = page(14, 'Segurança de Sistemas');
  const tree = [node('Fundamentos de Redes', 3), node('Protocolos de Camada', 9), node('Segurança de Sistemas', 15), node('Título ausente', 18)];
  expect(alignDraftsToText(tree, pages).map((n) => n.startPage)).toEqual([5, 9, 14, 18]);
});

it('raiz "Unidade N" recua para a divisória "UNIDADE N"', () => {
  const pages = blank(60);
  pages[14] = page(15, '13Módulo 0\nApresentação\nUNIDADE 1');
  pages[16] = page(17, '15Módulo 0\nUnidade 1 – Conjuntos Numéricos\nCONJUNTOS NUMÉRICOS');
  pages[42] = page(43, 'UNIDADE 2');
  pages[44] = page(45, 'Unidade 2 – Frações');
  const tree = [
    node('Unidade 1 – Conjuntos Numéricos', 15, [node('Conjuntos Numéricos', 15)]),
    node('Unidade 2 – Frações', 43, [node('Frações', 43)]),
  ];
  expect(alignDraftsToText(tree, pages)).toEqual([
    node('Unidade 1 – Conjuntos Numéricos', 15, [node('Conjuntos Numéricos', 17)]),
    node('Unidade 2 – Frações', 43, [node('Frações', 45)]),
  ]);
});

it('divisória com outro número não puxa a raiz', () => {
  const pages = blank(60);
  pages[42] = page(43, 'UNIDADE 3');
  pages[44] = page(45, 'Unidade 2 – Frações');
  expect(alignDraftsToText([node('Unidade 2 – Frações', 43, [node('Frações', 43)])], pages)[0].startPage).toBe(45);
});

it('raiz com página própria no sumário (diferente do primeiro filho) não recua', () => {
  const pages = blank(60);
  pages[42] = page(43, 'UNIDADE 2');
  pages[44] = page(45, 'Unidade 2 – Frações');
  expect(alignDraftsToText([node('Unidade 2 – Frações', 43, [node('Frações', 44)])], pages)[0].startPage).toBe(45);
});
```

Em `mat-basica-regression.test.ts`, regressão (c):

```ts
it('(c) sumário impresso realinhado cai nas páginas físicas do livro', () => {
  const aligned = alignDraftsToText(MAT_BASICA_PRINTED_TREE, matBasicaPages());
  expect(aligned.map((r) => r.startPage)).toEqual([15, 43, 67, 95, 123]);
  const fundamentais = aligned[0].children[1];
  expect(fundamentais).toMatchObject({ title: 'Conjuntos numéricos fundamentais', startPage: 20 });
  expect(fundamentais.children.map((c) => c.startPage)).toEqual([21, 21, 22, 23, 24]);
  expect(aligned[2].children[3].children[0]).toMatchObject({ title: 'Taxa percentual', startPage: 84 });
  expect(isValidChapterTree(aligned, MAT_BASICA_TOTAL_PAGES, 2)).toBe(true); // naturais e inteiros na 21: irmãos iguais são válidos
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts`
Expected: FAIL (versalete sem casar, sem divisória).

- [ ] **Step 3: Implementar** as regras 1 a 4 em `alignDraftsToText` e o tipo de retorno de `askModel`. Achatar a árvore em pré-ordem com caminho e reconstruí-la. Não mutar a entrada.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts && npx tsc --noEmit`
Expected: PASS e typecheck sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/chapters.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/__tests__/chapters.test.ts src/domains/rag/__tests__/mat-basica-regression.test.ts
git commit -m "feat(capitulos): realinhamento em árvore com versalete e divisória

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Cascata OUTLINE → AI → HEADINGS no serviço

**Files:**
- Modify: `src/domains/rag/services/chapter-extraction-service.ts:71-137` (constantes, `askModel`, `extractChapterDrafts`); `extractAndSaveChapters` já chama `saveDrafts(materialId, found.tree, ...)` desde a fase 1 (Task 6) e não muda
- Test: `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`

**Interfaces:**
- Consumes (fase 1): `isValidChapterTree(tree, totalPages, minRoots)`; `saveDrafts(materialId: string, tree: ChapterNode[], totalPages: number, source: ChapterSource, deps, opts?)`, chamado por `extractAndSaveChapters` com `found.tree` (fase 1, Task 6; a ponte `draftsToTree` fica dentro de `extractChapterDrafts`); `replaceChapters(materialId, rows: ChapterRow[], source, relinks, assignments, beforeWrite?)` com `ChapterRow = { title; order; depth; parentOrder: number | null; startPage; endPage }`; `ChapterSaveResult = { source, chapters: ChapterDTO[], lostLessonLinks }`, com `ChapterDTO` trazendo `parentId`, `depth` e `number` (spec 5.4, entregue na fase 1, sem mudança aqui). Desta fase: `outlineToTree` (Task 4), `headingsToTree` (Task 5), `alignDraftsToText` (Task 6), `selectTocPages` (Task 2), `parseChapterExtraction` (Task 3); fixture (Task 1).
- Produces:
  - `extractChapterDrafts(input: ExtractionInput, deps?): Promise<{ source: ChapterSource; tree: ChapterNode[] } | null>`. Ordem: (1) `outlineToTree(nav.outline)` válido com minRoots 2 dá `OUTLINE`. (2) `askModel`, depois `alignDraftsToText` em try/catch, mantendo a mensagem atual de aviso e as páginas da IA se lançar; se válido, `AI`. (3) `headingsToTree` em try/catch; se não for null e for válido, `HEADINGS`. (4) null.
  - `askModel` usa `selectTocPages(input.pages, CHAPTER_TOC_PAGES)` dentro do `try`.
  - `EXTRACTION_MAX_TOKENS = 4000`.
  - O corpo da cascata deixa de chamar `draftsToTree` (ponte da fase 1); `extractAndSaveChapters` não muda.

- [ ] **Step 1: Atualizar e escrever os testes que falham**

Ajustes nos testes existentes:
- `'PDF sem outline usa a IA nas 15 primeiras páginas e grava AI'`: `maxTokens: 4000`.
- Substituir `'outline lixo + "Unidade N" no texto grava HEADINGS sem chamar a IA'` por dois casos com as mesmas páginas `withHeadings`:
  - `'IA sem resposta válida cai para HEADINGS'`: `depsWith({ outline: <lixo>, ai: 'lixo' })` com `source` `'HEADINGS'`, `streamChat` chamado 1 vez e as mesmas linhas esperadas de hoje (`startPage` 3/8/14, `endPage` 7/13/20).
  - `'IA válida vence HEADINGS'`: `ai: aiJson([{ title: 'A', startPage: 3 }, { title: 'B', startPage: 9 }])` com `source` `'AI'`.
- Substituir `'exceção na heurística de títulos cai para a IA sem lançar'` por `'exceção ao ler o texto não derruba a cascata'`: página 1 com `get text() { throw new Error('boom'); }` (sempre lança) e `ai: 'lixo'`. Esperado: `source` null, `replaceChapters` não chamado, `console.warn` chamado.

Novos:

```ts
it('árvore da IA com depth 7 é rejeitada', async () => {
  let deep: object = { title: 'Fundo', startPage: 10 };
  for (let p = 9; p >= 3; p--) deep = { title: `N${p}`, startPage: p, children: [deep] };
  const r = await extractAndSaveChapters('m1', { buffer, pages, totalPages: 20 },
    depsWith({ ai: JSON.stringify({ chapters: [deep, { title: 'Outra', startPage: 15 }] }) }));
  expect(r.source).toBeNull();
  expect(replaceChapters).not.toHaveBeenCalled();
});

it('mat basica: sumário das páginas 9-11 vira árvore com páginas físicas', async () => {
  const fixturePages = matBasicaPages();
  const r = await extractAndSaveChapters('m1', { buffer, pages: fixturePages, totalPages: MAT_BASICA_TOTAL_PAGES },
    depsWith({ outline: MAT_BASICA_OUTLINE, ai: JSON.stringify({ chapters: MAT_BASICA_PRINTED_TREE }) }));
  expect(r.source).toBe('AI');
  const prompt = streamChat.mock.calls[0][0].map((m: { content: string }) => m.content).join('\n');
  expect(prompt).toContain('Página física 11');
  expect(prompt).toContain('Logaritmo natural');
  expect(streamChat.mock.calls[0][1]).toEqual({ temperature: 0.1, maxTokens: 4000 });
  const rows: ChapterRow[] = replaceChapters.mock.calls[0][1];
  expect(rows.filter((x) => x.depth === 0).map((x) => x.startPage)).toEqual([15, 43, 67, 95, 123]);
  expect(rows.filter((x) => x.depth === 0).at(-1)?.endPage).toBe(174);
  const fundamentais = rows.find((x) => x.title === 'Conjuntos numéricos fundamentais')!;
  expect(fundamentais.startPage).toBe(20);
  expect(rows.filter((x) => x.parentOrder === fundamentais.order).map((x) => [x.title, x.startPage])).toEqual([
    ['Conjuntos dos números naturais', 21],
    ['Conjuntos dos números inteiros', 21],
    ['Conjuntos dos números racionais', 22],
    ['Conjuntos dos números irracionais', 23],
    ['Conjuntos dos números reais', 24],
  ]);
  expect(r.chapters).toEqual(await replaceChapters.mock.results[0].value);
});
```

(`ChapterRow` vem de `@/domains/rag/chapters`; `matBasicaPages`, `MAT_BASICA_OUTLINE`, `MAT_BASICA_PRINTED_TREE`, `MAT_BASICA_TOTAL_PAGES` vêm de `@/domains/rag/__tests__/fixtures/mat-basica`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`
Expected: FAIL (ordem antiga dá HEADINGS antes da IA, `maxTokens` 1200, a ponte achata os filhos).

- [ ] **Step 3: Implementar a cascata, `askModel` com `selectTocPages`, `EXTRACTION_MAX_TOKENS = 4000`, sem a ponte `draftsToTree`.** Atualizar o comentário da cascata para "outline do PDF, IA sobre o sumário, títulos no texto, nada".

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/domains/rag/services/__tests__/chapter-extraction-service.test.ts src/domains/rag/__tests__ && npx tsc --noEmit`
Expected: PASS e typecheck sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/services/chapter-extraction-service.ts src/domains/rag/services/__tests__/chapter-extraction-service.test.ts
git commit -m "feat(capitulos): cascata OUTLINE, IA e HEADINGS entregando árvore

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Remover os tipos e funções planos e verificar tudo

**Files:**
- Modify: `src/domains/rag/chapters.ts` (remover `ChapterDraft`, `draftsAtDepth`, `childrenByRoot`, `outlineToDrafts`, `headingsToDrafts`, `draftsToTree`; `isValidChapterSequence` já saiu na fase 1, Task 6, e fica no grep só como conferência)
- Modify: imports remanescentes em `src/domains/rag/services/chapter-extraction-service.ts`, `src/domains/agents/prompts/chapter-extraction-prompt.ts` e testes

**Interfaces:**
- Consumes: tudo das Tasks 2 a 7.
- Produces: nenhuma API nova. `chapters.ts` exporta só a superfície em árvore.

- [ ] **Step 1: Listar os usos**

Run: `grep -rn "ChapterDraft\b\|outlineToDrafts\|headingsToDrafts\|isValidChapterSequence\|draftsToTree" src`
Expected: só as definições em `chapters.ts` e restos de import. Se aparecer outro consumidor (ex.: validador ou rota da fase 1), migrá-lo para `ChapterNode`/`isValidChapterTree` nesta tarefa. Se a migração não for de 1 a 3 linhas, manter o símbolo e anotar no relatório.

- [ ] **Step 2: Remover as definições e os imports mortos**

- [ ] **Step 3: Verificar que nada sobrou**

Run: `grep -rn "ChapterDraft\b\|outlineToDrafts\|headingsToDrafts\|isValidChapterSequence\|draftsToTree" src`
Expected: nenhuma linha.

- [ ] **Step 4: Verificação completa**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todos verdes (se a única falha for o teste instável do CLASSROOM, rodar `npx vitest run src/app/api/v1/agent/chat/__tests__/route.test.ts` isolado e confirmar PASS).

- [ ] **Step 5: Commit**

```bash
git add src/domains/rag/chapters.ts src/domains/rag/services/chapter-extraction-service.ts src/domains/agents/prompts/chapter-extraction-prompt.ts src/domains/rag/__tests__/chapters.test.ts
git commit -m "refactor(capitulos): remove rascunhos planos da extração

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Verificação manual fora do plano (spec 11): reextrair o material "Matemática Básica" em banco local e conferir 5 unidades com subníveis. Gasta uma chamada real ao modelo; fazer só com o usuário.
