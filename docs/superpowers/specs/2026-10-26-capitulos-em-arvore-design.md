# Capítulos em árvore: subníveis por aula e extração genérica de N níveis

Data: 2026-10-26. Status: aprovado em brainstorming, aguardando plano de implementação.

## 1. Contexto e problema

- Hoje `MaterialChapter` (`prisma/schema.prisma`, linhas 416-431) é uma lista plana: `title`, `order`, `startPage`, `endPage`, `source`, com `@@unique([materialId, order])`. `LessonPlanChapter` (linhas 346-355) é o par aula + capítulo. Todo consumidor filtra por `chapterId`.
- Caso real: material "Matemática Básica" (`originalFilename` "mat basica.pdf", 174 páginas, 438 chunks). Os 5 capítulos (Unidade 1 a 5) são `source=MANUAL`, porque nenhuma estratégia automática acertou.
- Características desse PDF:
  - Os marcadores são inúteis (6 entradas de scanner).
  - O sumário impresso ocupa as páginas 9 a 11 do PDF, com 40 linhas no formato "título ....... página". A hierarquia aparece só pelo recuo, sem numeração "1.1".
  - Os títulos de seção no corpo estão em versalete, e o texto extraído fica "C ONJUNTO DOS NÚMEROS NATURAIS".
  - As páginas do sumário têm deslocamento fixo de 2 em relação ao índice do PDF (impressa 19 = PDF 21).
  - A Unidade 5 hoje vai até a página 174 e engloba Considerações finais, Referências e apêndices.
- Necessidade: uma unidade se espalha por várias aulas. O professor precisa escolher a unidade inteira OU só alguns subníveis. O extrator precisa produzir N níveis para qualquer PDF ou livro, numerado ou não, com ou sem marcadores.

## 2. Objetivos e não-objetivos

Objetivos:

- Árvore de profundidade arbitrária em `MaterialChapter`.
- Extração em árvore por três estratégias.
- Editor de árvore manual completo no painel de capítulos do material.
- Seletor em árvore na aula.
- Filtro do RAG, do tutor e da geração restrito aos nós escolhidos e seus descendentes.
- Migração aditiva sem perda de dados.

Não-objetivos (fora desta entrega):

- Distribuição de capítulos no cronograma e unidades do plano de ensino escolhendo subníveis (continuam nas raízes).
- Arrastar e soltar no editor.
- Detecção tipográfica (fonte ou versalete) de títulos.
- Mudar a busca para filtro por página.
- Seeds com capítulos.

## 3. Modelo de dados e migração

- `MaterialChapter` ganha `parentId String?` (FK auto-referente, relation "ChapterTree", `onDelete: Cascade`), `depth Int @default(0)`, as relações `parent` e `children`, e `@@index([parentId])`.
- `order` passa a significar a POSIÇÃO EM PRÉ-ORDEM dentro do material (1..N, percorrendo a árvore de cima para baixo, pais antes dos filhos). `@@unique([materialId, order])` permanece. Ordenar por `order` devolve a árvore em ordem de leitura.
- Invariantes:
  - Raiz tem `parentId=null` e `depth=0`.
  - Filho tem `depth = pai.depth + 1`.
  - `startPage` do filho >= `startPage` do pai.
  - Irmãos têm `startPage` NÃO DECRESCENTE (irmãos na mesma página são permitidos).
  - `startPage` do filho <= `endPage` herdado do pai (filho que começa depois do fim do pai é inválido).
  - Profundidade máxima: 6, contando `depth` a partir de 0 (valores 0 a 6 são válidos, 7 níveis; `depth` 7 é inválido).
  - Máximo de 500 nós por material.
- Regra de `endPage`: `endPage = max(startPage, próximoIrmão.startPage - 1)`. O último filho herda o `endPage` do pai. A última raiz vai até `totalPages`. É a regra atual de `toChapterRows` (`src/domains/rag/chapters.ts`, linhas 196-203), estendida.
- Irmãos que compartilham a página inicial têm faixas sobrepostas nessa página. Na atribuição de chunks (segmentos disjuntos; seção 4), a página compartilhada fica com o último nó em pré-ordem.
- Migração (somente expansão): uma migration adiciona `parentId` nullable, `depth` com default 0, a FK e o índice. As linhas existentes ficam válidas (raiz, `depth` 0) sem backfill. Rollback: dropar colunas, FK e índice. Não há etapa de contração. Os dados de materiais existentes só mudam quando o professor reextrai ou edita.
- `LessonPlanChapter` não muda de forma. Grava os nós explicitamente escolhidos, de qualquer profundidade.
- `MaterialChunk.chapterId` passa a apontar para o NÓ MAIS PROFUNDO cuja faixa cobre `pageNumber`. `MaterialChunk.chapter` (rótulo) recebe o título desse nó. `section` (`prisma/schema.prisma`, linha 439) continua sem uso.

## 4. Tipos e funções puras (`src/domains/rag/chapters.ts`)

```ts
export type ChapterNode = { title: string; startPage: number; children: ChapterNode[] };
export type ChapterRow = {
  title: string;
  order: number;
  depth: number;
  parentOrder: number | null;
  startPage: number;
  endPage: number;
};
```

- `ChapterDraft` plano (linha 4) é substituído por `ChapterNode`. Filhos vazios equivalem ao comportamento atual. `ChunkAssignment` e `ChapterLinks` são mantidos.
- `toChapterRows(tree: ChapterNode[], totalPages): ChapterRow[]` achata a árvore em pré-ordem com a regra de `endPage` da seção 3.
- `isValidChapterTree(tree, totalPages, minRoots = 2)` substitui `isValidChapterSequence` (linha 185). Exige:
  - pelo menos `minRoots` raízes;
  - páginas entre 1 e `totalPages`;
  - páginas em pré-ordem não decrescentes (cobre filho antes do pai e irmão decrescente; irmãos na mesma página são válidos);
  - filho com `startPage` <= `endPage` herdado do pai;
  - `depth` <= 6;
  - no máximo 500 nós.
  - Títulos genéricos (`isGenericOutlineTitle`, existente) são descartados antes da validação.
- `chunkAssignmentsFromRows(rows, totalPages)` substitui `buildChunkAssignments` (linha 205). Gera segmentos DISJUNTOS que cobrem `1..totalPages` em ordem de página. O dono de uma página é o ÚLTIMO nó em pré-ordem cuja faixa (`startPage..endPage`) a cobre; como a faixa de um filho está contida na do pai e vem depois dele, o nó mais profundo prevalece, e irmãos que compartilham a página inicial deixam essa página com o último deles em pré-ordem. Algoritmo: pinta um array `owner[1..totalPages]` iterando as linhas em pré-ordem (cada linha sobrescreve sua faixa) e comprime em runs, fundindo segmentos consecutivos com o mesmo dono. Assim cada chunk é reescrito no máximo uma vez, e um pai só recebe as páginas que não estão em nenhum filho.
  - Preserva o comportamento de `buildChunkAssignments` para páginas fora de qualquer raiz: se a primeira raiz começa depois da página 1, as páginas `1..startPage-1` formam um segmento com `order: null` (limpa `chapterId` e põe o rótulo "Página N"). Sem linhas, o resultado é um único segmento `order: null` cobrindo `1..totalPages`. Como as raízes são contíguas até `totalPages`, não há outro buraco.
- `relinkByTitle(oldChapters, newRows, oldLinks)` substitui `relinkByOrder` (linhas 213-224). Casa o capítulo antigo com o novo por (título normalizado sem acentos, caixa, pontuação e espaços múltiplos; `startPage`). Para os que sobrarem, casa por título normalizado único. Por fim (renomeação), um antigo restante casa com o novo livre de mesma `startPage` e mesmo `depth` quando esse par (`startPage`, `depth`) é único entre os novos livres e entre os antigos restantes. Em `saveDrafts`, `normalizeRelinks(relinks, rows)` remove o vínculo de uma aula a um nó quando um ancestral dele (via `parentOrder`) também ficou vinculado à mesma aula. Vínculos sem par são perdidos e contados em `lostLessonLinks`. `relinkByTitle` é calculado em `saveDrafts` ANTES de montar o `beforeWrite` (como `relinkByOrder` é hoje). A regra de conflito 409 (`LINKS_CONFLICT_MESSAGE`) dispara quando `lostLessonLinks > 0` e algum vínculo perdido pertence a aula de outro professor. Deixa de disparar pela mudança na contagem de capítulos (hoje `drafts.length !== oldLinks.length`, service linha 150). Com `force` (admin), não dispara.
- `numberNodes(rows)` calcula `number: string` por nó a partir do índice entre irmãos. Raízes: "1", "2". Filhos: "2.1", "2.3.1". Não é persistido. É derivado na leitura e usado em rótulos.

## 5. Extração genérica de N níveis (`src/domains/rag/services/chapter-extraction-service.ts`)

A cascata está em `extractChapterDrafts` (linhas 98-137). A primeira estratégia cujo resultado passa em `isValidChapterTree` vence. NOVA ORDEM: OUTLINE, AI alinhada, HEADINGS, AI crua, nenhum (detalhes em 5.2). Hoje a ordem é OUTLINE, HEADINGS, AI.

Justificativa: HEADINGS só enxerga raízes. Quando há sumário, a IA entrega a árvore. Custo: a IA passa a rodar em uploads de PDF sem marcadores antes de HEADINGS. Custo aceito.

### 5.1 OUTLINE

`outlineToTree` substitui `outlineToDrafts` (`chapters.ts`, linhas 58-70). Monta a árvore completa a partir de `OutlineEntry[]` (`title`, `pageNumber`, `depth`; `src/domains/rag/types.ts`, linhas 89-93). `readPdfNavigation` (`src/domains/rag/file-parser.ts`, linha 162) já devolve todos os níveis em pré-ordem.

- Nó sem página herda a página do primeiro descendente com página. Sem nenhum, a subárvore é descartada.
- Títulos genéricos são descartados, e os filhos são promovidos ao nível do nó removido.
- Regra de raiz única mantida: se houver uma única raiz válida com >= `MIN_NESTED_OUTLINE_CHAPTERS` (3) filhos válidos, os filhos viram raízes.

### 5.2 AI sobre o sumário

Função `askModel` (linhas 74-95) e prompt em `src/domains/agents/prompts/chapter-extraction-prompt.ts`.

- Entrada: as primeiras `CHAPTER_TOC_PAGES` (15, `src/domains/rag/constants.ts`) páginas, como hoje, MAIS o primeiro bloco contíguo de páginas de sumário detectado fora dessa janela (para na primeira página que não é sumário depois do bloco). Página de sumário é a que tem >= 3 linhas casando `TOC_LINE_PATTERN` (`chapters.ts`) ou cuja primeira linha não vazia é o título "Sumário", "Índice", "Conteúdo", "Contents" ou "Table of Contents"; página logo após uma de sumário também conta se tiver >= 3 linhas terminadas em número de página, mesmo sem pontos. Limite de 10 páginas extras (`CHAPTER_TOC_EXTRA_PAGES`). Se o texto das páginas selecionadas somar < 200 caracteres, a IA não é chamada.
- Página detectada como sumário vai inteira ao prompt até 4000 caracteres (`CHAPTER_TOC_DETECTED_PAGE_CHARS`); as demais seguem cortadas em `CHAPTER_TOC_PAGE_CHARS` (1200).
- O prompt pede `{"chapters":[{"title","startPage","children":[...]}]}` com a página IMPRESSA como aparece no sumário. A profundidade é inferida por recuo, numeração ("2.3") ou tipografia. Cabeçalhos corridos e entradas de apresentação ou prefácio como raízes são ignorados.
- `parseChapterExtraction` (prompt, linha 41) passa a usar um schema zod recursivo (`z.lazy`), com `children` opcional ou `null` virando `[]`. Resposta truncada (JSON inválido) é reparada: corta no último nó fechado e anexa os fechamentos pendentes; sem nenhum nó completo, null. `EXTRACTION_MAX_TOKENS` (service, linha 72) sobe de 1200 para 4000 (`EXTRACTION_MAX_TOKENS = 4000`).
- Realinhamento: `alignDraftsToText` (`chapters.ts`, linhas 147-183) passa a operar sobre a árvore achatada em pré-ordem.
  - Calcula o deslocamento de cada nó procurando as palavras do título no topo (3 linhas) das páginas `startPage-1` a `startPage+6`.
  - A normalização remove acentos e caixa. O conjunto de palavras do topo da página é a UNIÃO das palavras do texto normal e do texto com o versalete colapsado (letra isolada juntada à palavra seguinte), para casar "C ONJUNTO" com "Conjunto" sem quebrar "LOGARITMO E EXPONENCIAL". O título é normalizado só do jeito normal.
  - Se >= 50% dos nós com deslocamento encontrado concordam e a maioria tem apoio mínimo (>= 2 nós concordando, ou árvore com até 3 nós), todos herdam esse deslocamento. Sem isso, cada nó achado usa o próprio deslocamento e os demais ficam.
  - `alignTreeToText` devolve a árvore e as contagens `found` (nós com deslocamento encontrado) e `total`; `alignDraftsToText` é o wrapper que devolve só a árvore.
  - Recuo da raiz para a página divisória: raiz cuja `startPage` veio do primeiro filho (sumário sem página para a unidade; na resposta da IA, `startPage` igual à do primeiro filho) recua até 3 páginas (`HEADING_TITLE_LOOKAHEAD`) se encontrar o próprio título (normalizado) ou "UNIDADE/CAPÍTULO N" (palavra-chave e número de `HEADING_PATTERN`) no topo de uma página anterior, sem passar da página do nó anterior em pré-ordem.
  - Falha mantém as páginas originais (comportamento do commit ab508d2).
- Rótulos de página: `applyPageLabels` converte a página impressa em física pelos rótulos do PDF (`PdfNavigation.pageLabels`) quando eles são informativos (algum diferente de i + 1), procurando em pré-ordem o primeiro rótulo igual a partir da página do nó anterior; sem rótulo correspondente, o nó mantém a página.
- Raiz única: `promoteSingleRoot` (a mesma regra do OUTLINE) é aplicada à resposta da IA antes de tudo.
- Cascata da IA: a árvore promovida, convertida por rótulos e realinhada vence se for válida E tiver confirmação (`found >= 1` ou conversão por rótulos). Sem confirmação, roda HEADINGS; só se HEADINGS não der árvore válida entra a árvore da IA promovida com as páginas como vieram ("IA crua"). Motivo: deslocamento impresso→físico maior que a janela (+6) deixaria páginas impressas gravadas onde HEADINGS acerta.
- Não há mesclagem entre estratégias nesta entrega.

### 5.3 HEADINGS

`headingsToTree` substitui `headingsToDrafts` (`chapters.ts`, linhas 83-115).

- Raízes como hoje: `Unidade|Capítulo|Cap.|Parte|Módulo N` nas 3 primeiras linhas, sequencial a partir de 1, ignorando páginas de sumário e adotando o título da página divisória.
- Novo: títulos numerados nas 3 primeiras linhas, com a regex abaixo, viram nós internos.

```ts
const NUMBERED_HEADING = /^\s*(\d+(?:\.\d+)+)\s+(\p{L}.{2,})$/u;
```

- O texto deve começar por letra ("2.5 + 3.2 = 7.7" não é seção) e segmento após o primeiro com exatamente 3 dígitos é separador de milhar ("1.500 alunos") e é rejeitado.
- No realinhamento (5.2), as palavras-chave de `HEADING_PATTERN` não contam como palavras do título; título que casa `HEADING_PATTERN` exige também o seu número como palavra no topo da página.

- Profundidade = quantidade de pontos do número.
- O primeiro número deve ser igual ao número da raiz corrente.
- As páginas devem ser não decrescentes em pré-ordem (irmãos na mesma página são aceitos).
- Nó cujo pai intermediário não existe (ex.: "2.3.1" sem "2.3") é ignorado.
- Sem títulos numerados, o resultado é plano como hoje.

### 5.4 Resultado

`ChapterSaveResult` mantém `{ source, chapters: ChapterDTO[], lostLessonLinks }`. `ChapterDTO` (`chapter-repository.ts`, linha 5) ganha `parentId: string | null`, `depth: number` e `number: string`. `saveDrafts` (service, linha 139) passa a receber `ChapterNode[]` e a usar `relinkByTitle`.

## 6. Persistência (`src/domains/rag/services/chapter-repository.ts`)

- `replaceChapters` (linhas 95-128): na mesma transação, faz `deleteMany` e depois a inserção NÍVEL A NÍVEL com `createManyAndReturn`.
  - Primeiro, todas as linhas com `depth=0`.
  - Depois `depth=1`, resolvendo `parentId` pelo `parentOrder` e o id do nível anterior.
  - Assim sucessivamente até a profundidade máxima.
  - Não há nova dependência para gerar ids.
  - Em seguida, recria `lessonPlanChapter` pelos `relinks` (order para novo id) e aplica um UPDATE de chunks por segmento disjunto (seção 4).
- `listChapters` devolve em `order` crescente, com `parentId`, `depth` e `number` derivado.
- Nova `listDescendantIds(chapterIds: string[]): Promise<string[]>` com CTE recursiva. Retorna os próprios ids mais todos os descendentes.

```sql
WITH RECURSIVE t AS (
  SELECT id FROM material_chapters WHERE id = ANY($1::text[])
  UNION
  SELECT c.id FROM material_chapters c JOIN t ON c."parentId" = t.id
) SELECT id FROM t
```

- `listChapterLinks` e `listChapterLinkDetails` (linhas 20-86) continuam, usados pelo religamento.

## 7. API e validação

- PUT `/api/v1/library/materials/[id]/chapters` (`src/app/api/v1/library/materials/[id]/chapters/route.ts`; validador `src/lib/validators/material-chapters.validator.ts`): o payload passa a ser recursivo, `{ chapters: ChapterNodeInput[] }`.
  - `ChapterNodeInput = { title: string (1..200), startPage: int >= 1, children?: ChapterNodeInput[] }`.
  - Limites: 500 nós no total e profundidade 6.
  - O payload plano antigo continua válido (`children` ausente).
  - O limite atual de `.max(200)` na lista de raízes é substituído pelo limite de 500 nós no total.
  - `replaceManualChapters` (service, linhas 214-226) valida com `isValidChapterTree(tree, totalPages, 0)`. Lista vazia continua válida e zera os capítulos do material (comportamento atual). Com `minRoots=0`, as demais invariantes valem para qualquer árvore não vazia.
- GET do mesmo recurso e GET `/api/v1/teacher/plans/[id]/chapters` (`src/app/api/v1/teacher/plans/[id]/chapters/route.ts`, que chama `listPlanChapters` em `src/domains/teaching/services/plan-chapters-service.ts` e `teaching-plan-repository.ts`, linhas 62-86) devolvem lista plana em pré-ordem com `parentId`, `depth` e `number`. Os clientes montam a árvore.
- POST `.../chapters/extract` sem mudança de contrato.
- `lessonInputSchema.chapterIds` (`src/lib/validators/lesson.validator.ts`, linha 81) sobe de `.max(50)` para `.max(200)`.
- `updateLesson` e `createLesson` (`src/domains/teaching/services/lesson-service.ts`, linhas 146-173): `allowed` continua sendo todos os ids do plano, agora em qualquer profundidade. Antes de gravar, NORMALIZA a seleção: remove todo id que tenha um ancestral também selecionado. A operação é idempotente. `replaceLessonChapters` (`lesson-plan-repository.ts`, linhas 58-63) fica inalterado.

## 8. Consumidores

- Geração e refino de aula (`src/domains/teaching/services/lesson-generation-service.ts`, linhas 76-87 e 147-157):
  - `allowedChapterIds = listDescendantIds(lesson.chapters.map(c => c.chapter.id))`.
  - `sampleChunksByChapter` (`src/domains/rag/services/chunk-repository.ts`, linha 88) recebe o conjunto expandido.
  - Prompt (`src/domains/agents/prompts/lesson-generation-prompt.ts`, linhas 44-47 e 141-142): uma linha por nó escolhido, com `number` hierárquico ("2.3") no lugar de `order`. O resto do formato atual não muda. Geração:

```text
Cap. {number}: {title} — {material} ({author}), p. {start} a {end}
```

  Refino (sem páginas, como hoje):

```text
Cap. {number}: {title} — {material} ({author})
```

- Tutor do aluno (`src/domains/agents/services/chat-service.ts`, linhas 60-69 `toTutorScope`; `src/domains/agents/tutor-pipeline.ts`, linhas 83-90 `scopeLine`):
  - A expansão por `listDescendantIds` acontece em `findTutorScope` (chat-service.ts, linha 77, assíncrona), antes de chamar `toTutorScope`. `toTutorScope` segue pura e recebe os ids já expandidos.
  - `findTutorScope` mantém duas listas: os nós ESCOLHIDOS (para `chapterLabels`) e os ids expandidos (para `allowedChapterIds`).
  - `chapterLabels` usa o formato `Cap. {number}: {title} ({material})` com os nós escolhidos, não os expandidos. A `scopeLine` "Esta aula cobre:" apenas junta esses rótulos.
  - O fallback para `allowedMaterialIds` quando a aula não tem capítulos permanece.
- Distribuição no cronograma (`src/domains/teaching/services/chapter-distribution-service.ts`; prompt `chapter-distribution-prompt.ts`) e unidades do plano (`plan-units-service.ts`, linhas 68-84; `plan-units-prompt.ts`, linhas 90-123, `isValidPlanUnits` e `countLessonGroups`): recebem e gravam SOMENTE raízes (`depth=0`).
  - Ao ler aulas que já têm seções, mapeiam cada id para a raiz do seu ramo antes de validar "cada capítulo em exatamente 1 unidade" e antes de agrupar.
  - O serviço carrega os capítulos do plano (já disponíveis via `listPlanChapters`) e resolve a raiz subindo por `parentId` em memória.
- Tabela de encontros (`src/app/teacher/schedules/_components/MeetingsTable.tsx`, linha 35, `formatChapterShortList`) e `src/domains/teaching/services/course-schedule-repository.ts` (linha 70): o rótulo curto usa `number` em vez de `order` ("Cap. 2.3").
- `src/components/teaching/chapter-combobox-item.ts` (`planChaptersToComboboxItems`): o título do item vira `{number} {title}` com recuo por `depth`. O badge `p. start a end` é mantido. Esse arquivo fica só como formatação. O seletor novo está descrito na seção 9.
- Provas e FAQ: sem mudança. Usam o rótulo `chunk.chapter`, que agora é o título do nó mais profundo.

## 9. UI

### 9.1 Painel de capítulos do material

Arquivo: `src/app/teacher/materials/_components/MaterialChaptersPanel.tsx`. Editor de árvore sem arrastar e soltar. Cada nó mostra:

- `number`;
- campo de título;
- campo de página inicial;
- página final derivada (somente leitura);
- ações: adicionar irmão abaixo, adicionar filho, remover, mover para cima ou para baixo entre irmãos, recuar e desrecuar.

Detalhes das ações:

- Remover apaga o nó com a subárvore e pede confirmação se houver descendentes.
- Recuar faz o nó virar filho do irmão anterior.
- Desrecuar faz o nó virar irmão do pai, logo após ele.

Demais regras:

- A validação no cliente usa as mesmas invariantes da seção 3, com mensagem por nó.
- Salvar envia a árvore inteira ao PUT.
- O botão de reextração é mantido, com o aviso de vínculos perdidos (`lostLessonLinks`) e o erro 409 como hoje.
- A origem (`source`) é exibida como hoje.

### 9.2 Seletor na aula

Em `src/app/teacher/lessons/_components/LessonEditor.tsx` (linhas 178-184), o `AdvancedMultiCombobox` de "Capítulos desta aula" é substituído por um componente novo, `ChapterTreeSelect`, em `src/components/teaching/`.

Características:

- Árvore com caixas de seleção e expandir/recolher por nó.
- Agrupada por material (BASIC antes de COMPLEMENTARY, como hoje).
- Busca por texto que filtra mantendo os ancestrais visíveis.

Regras de seleção:

- Marcar um nó marca visualmente todos os descendentes e os remove da seleção enviada. Fica só o ancestral.
- Desmarcar um descendente de um nó marcado substitui o ancestral pelos demais irmãos e descendentes necessários para manter a cobertura.
- O estado "parcial" (traço) aparece quando só parte dos filhos está marcada.
- O valor emitido para `chapterIds` é a seleção normalizada (sem ancestral e descendente juntos).
- `savedChapterIds`, `savedKey` e o bloqueio de geração com seleção não salva (`use-lesson-generation.ts`, `UNSAVED_CHAPTERS` e `NO_LESSON_CHAPTERS`) continuam iguais.

Acessibilidade: `role="tree"` e `treeitem`, `aria-expanded`, `aria-checked` com `mixed`, navegação por setas.

### 9.3 Visão do aluno

A linha "Esta aula cobre" do tutor passa a mostrar `number` e título dos nós escolhidos, no formato `Cap. {number}: {title} ({material})` da seção 8. Sem outra mudança.

## 10. Tratamento de erros

- Extração: estratégia inválida é descartada e a próxima roda. Se nenhuma for válida, os capítulos existentes são mantidos (como hoje). Erro do modelo não derruba o upload.
- PUT manual: 400 com a invariante violada e o `number` do nó ofensor. O 409 de conflito de vínculos é mantido.
- Aula: 400 `CHAPTER_OUTSIDE_PLAN` (`lesson-service.ts`, linha 31) para id fora do plano, em qualquer profundidade.
- `listDescendantIds` com lista vazia devolve lista vazia sem consultar o banco.

## 11. Testes

Atualizar os testes existentes e criar os casos abaixo, por área.

Extração e funções puras:

- `src/domains/rag/__tests__/chapters.test.ts`
  - `toChapterRows` com 3 níveis e regra de `endPage`, incluindo o clamp `max(startPage, próximoIrmão.startPage - 1)` para irmãos na mesma página.
  - `isValidChapterTree`: filho antes do pai, irmão decrescente (inválido) e irmão na mesma página (válido), filho depois do fim do pai, `depth` 7, 501 nós, 1 raiz com `minRoots=2` (inválido) e com `minRoots=0` ou 1 (válido).
  - `chunkAssignmentsFromRows` com segmentos disjuntos (o nó mais profundo vence), com dois irmãos na mesma página (a página fica com o segundo), com pai que tem páginas próprias antes do primeiro filho e com o segmento `order: null` antes da primeira raiz.
  - `relinkByTitle`: título igual com página diferente, título duplicado, pontuação, renomeação na mesma página e nível, perda e conflito; `normalizeRelinks` com aula em pai e filho.
  - `outlineToTree`: nó sem página, raiz única, títulos genéricos.
  - `headingsToTree`: "2.3" sem "2", profundidade por pontos, resultado plano.
  - `alignDraftsToText` com versalete espaçado e deslocamento 2.
- `src/domains/rag/services/__tests__/chapter-extraction-service.test.ts`: nova ordem da cascata. Inclui o caso de regressão com fixture do sumário de "mat basica" (texto das páginas 9 a 11). Esperado: 5 raízes com páginas PDF 15, 43, 67, 95, 123 após o realinhamento, e pelo menos "Conjuntos numéricos fundamentais" com os filhos naturais, inteiros, racionais, irracionais e reais.
- `src/domains/agents/prompts/__tests__/chapter-extraction-prompt.test.ts`: parse zod recursivo.

Persistência e API:

- `src/domains/rag/services/__tests__/chapter-repository.test.ts`: inserção nível a nível preservando `parentId`; CTE de descendentes.
- `src/app/api/v1/library/materials/[id]/chapters/__tests__/route.test.ts`: payload recursivo, limites, payload plano antigo.

Consumidores:

- `src/domains/teaching/services/__tests__/lesson-service.test.ts`: normalização da seleção (ancestral + descendente resulta só no ancestral).
- `src/domains/teaching/services/__tests__/lesson-generation-service.test.ts`: expansão no filtro do RAG.
- `src/domains/teaching/services/__tests__/plan-chapters-service.test.ts`: campos `parentId`, `depth`, `number`.
- `src/domains/teaching/services/__tests__/chapter-distribution-service.test.ts` e `plan-units-service.test.ts`: mapeamento de seção para raiz.
- `src/domains/agents/services/__tests__/chat-service.test.ts` e `src/domains/agents/__tests__/tutor-pipeline.test.ts`: expansão no escopo do tutor e linha "Esta aula cobre".
- `src/components/teaching/__tests__/chapter-combobox-item.test.ts`: título com `number` e recuo.
- `src/app/teacher/schedules/_components/__tests__/MeetingsTable.test.tsx`: rótulo "Cap. 2.3".

UI:

- `src/app/teacher/lessons/_components/__tests__/LessonEditor.test.tsx` e testes novos de `ChapterTreeSelect`: marcar pai, desmarcar filho, estado parcial, busca com ancestrais.
- `src/app/teacher/materials/_components/__tests__/MaterialChaptersPanel.test.tsx`: recuar e desrecuar, remover subárvore, validação por nó.

Verificação final:

- `npm test` (`vitest run`).
- `npm run typecheck` (`tsc --noEmit`).
- `npx prisma migrate dev` em banco local.
- Reextração do material "Matemática Básica".
- Vínculo de uma aula a "Unidade 2 > Frações" e geração de aula restrita a esse trecho.

## 12. Compatibilidade e rollout

- Somente expansão, sem backfill. Materiais existentes seguem planos até a reextração ou edição.
- Aulas existentes com `chapterIds` de raízes continuam válidas e com o mesmo comportamento. A expansão de uma raiz sem filhos é ela mesma.
- Clientes que leem `order` para rótulo passam a usar `number`. Não há cliente externo.
- Rollback: reverter a migration (drop de colunas, FK e índice) e o código. Dropar a coluna `parentId` NÃO apaga linhas. Os nós internos viram raízes, com a informação de `depth` perdida. Essa é uma consequência conhecida do rollback. Os vínculos de aulas a nós internos permanecem, apontando para linhas que agora são raízes.
