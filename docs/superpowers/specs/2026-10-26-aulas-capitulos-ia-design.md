# Aulas ancoradas em capítulos com apoio de IA

Data: 2026-10-26. Status: aprovado em brainstorming, aguardando plano de implementação.

## Objetivo

Permitir que cada aula (`LessonPlan`) seja amarrada aos capítulos dos livros da bibliografia do plano de ensino, que a IA distribua esses capítulos pelo cronograma e gere ou refine o conteúdo de cada aula a partir deles, e que o aluno só veja aulas publicadas.

## Contexto e estado atual

- Não existe geração de aula por IA. `syncLessons` cria `LessonPlan` vazios ("Aula N").
- `MaterialChunk.chapter` é sintético ("Página N" em PDF, "Trecho N" em DOCX/TXT). Não há model de capítulo nem leitura do outline do PDF.
- `TeachingPlan.basicBibliography` e `complementaryBiblio` são `String[]` no formato "Título (Autor) [Categoria]", sem id do material. `complementaryBiblio` nunca é preenchida pela UI.
- A busca RAG filtra só por `materialIds` e `categoryIds`. O tutor busca no acervo inteiro.
- A aula vira `Agenda` CLASSROOM visível para a turma assim que é criada, mesmo vazia. Não há publicar.
- `TeachingPlan.unitsContent` nunca é preenchido pela UI, o que trava o gerador de avaliações. Fora do escopo desta spec (ver follow-ups).

## Decisões tomadas

- Resultado da IA na aula: preencher o formulário inteiro na primeira vez e refinar campo a campo depois.
- Origem dos capítulos: automática no upload (outline do PDF, senão IA sobre o sumário), editável na biblioteca, com reprocessamento para livros já enviados.
- Escala do mapeamento: distribuição dos capítulos pelo cronograma inteiro, ajuste por aula com multi-combobox, geração do conteúdo de cada aula depois.
- Visão do aluno: status `DRAFT`/`PUBLISHED` na aula; agenda só após publicar.
- Abordagem: modelo relacional com FKs (não Json).

## Seção 1: modelo de dados e migrations (todas aditivas)

1. **`MaterialChapter`**: `id`, `materialId` (FK `DidacticMaterial`, cascade), `title`, `order` (int), `startPage` (int), `endPage` (int, opcional, derivado do próximo capítulo ou de `totalPages`), `source` (enum `ChapterSource`: `OUTLINE`, `AI`, `MANUAL`). Único por `(materialId, order)`.
2. **`MaterialChunk.chapterId`** opcional, FK `MaterialChapter`, `onDelete: SetNull`. Preenchido por faixa de páginas sempre que os capítulos de um material são criados ou editados. O campo texto `chapter` permanece e passa a receber o título real do capítulo; sem capítulo, mantém "Página N".
3. **`TeachingPlanReference`**: `teachingPlanId`, `materialId`, `kind` (enum `ReferenceKind`: `BASIC`, `COMPLEMENTARY`). Único por par. Os campos texto de bibliografia permanecem para exibição e compatibilidade. Backfill em migration de dados: para cada plano, casa cada linha de texto com um material pelo título, no padrão de `restoreReferences` (`TeachingPlanNewPage.tsx`). O que não casar fica só como texto.
4. **`LessonPlan.status`** (enum `LessonStatus`: `DRAFT`, `PUBLISHED`, default `DRAFT`) e join **`LessonPlanChapter`** (`lessonPlanId`, `chapterId`, único por par, cascade nos dois lados). Backfill: aulas que já têm `Agenda` recebem `PUBLISHED`.

Invariantes:

- Um capítulo pertence a exatamente um livro.
- Uma aula referencia capítulos só de livros ligados ao plano dela (validado no service, não no banco).
- Reprocessar capítulos de um livro apaga e recria os `MaterialChapter` dele. `LessonPlanChapter` existentes são recasados por `order` quando o número de capítulos não muda; se mudar, a UI informa quantas aulas perderam vínculo.
- Rollback: migrations só adicionam colunas e tabelas; o código anterior continua funcionando.

## Seção 2: extração de capítulos na biblioteca

Serviço `chapter-extraction-service` em `src/domains/rag/services/`, chamado por `uploadAndIngest` (`library-service.ts`) após `parseDocumentFile` e antes de gravar os chunks, e pela rota de reprocessamento.

Cascata, para na primeira que der resultado:

1. **Outline do PDF.** Lê os bookmarks pelo pdf.js que `pdf-parse` já usa. Com ao menos 2 entradas de primeiro nível com destino de página, vira capítulos `source: OUTLINE`.
2. **Sumário por IA.** Texto das primeiras 12 páginas (mesma janela de `document-inspector.ts`). Pede `{title, startPage}` em JSON. Prompt em `src/domains/agents/prompts/chapter-extraction-prompt.ts`, zod tolerante, `loggedStreamChat`. Rejeita com menos de 2 capítulos, páginas fora do intervalo ou fora de ordem. `source: AI`.
3. **Nenhum capítulo.** O livro fica sem capítulos, sem erro. A tela indica "Sem capítulos" com botão para extrair de novo ou cadastrar à mão.

Após gravar, `endPage` é derivado do próximo capítulo e os chunks recebem `chapterId` e o título real em `chapter` por faixa de página.

Deslocamento de páginas: o sumário usa páginas impressas e o PDF conta páginas físicas. A IA recebe o texto com marcador de página física e o número impresso visível quando o parser o encontra, e devolve a página física. Se falhar, o professor corrige na tela.

Rotas e tela:

- `POST /api/v1/library/materials/[id]/chapters/extract` dispara a cascata. Mesma permissão de `reindex`.
- `GET` e `PUT /api/v1/library/materials/[id]/chapters` listam e substituem a lista inteira (título, ordem, página inicial), `source: MANUAL`. Zod: páginas em ordem crescente, dentro de `totalPages`.
- Na biblioteca, cada material ganha painel "Capítulos" com lista editável, botão "Extrair de novo", badge da origem e aviso de aulas que perderam vínculo quando o número de capítulos muda.

Testes: cascata com PDF com outline, PDF sem outline com mock de IA, PDF sem nada; recálculo de `chapterId` dos chunks por faixa; rota `PUT` com validação.

## Seção 3: bibliografia do plano ligada aos materiais

- `TeachingPlanNewPage.tsx` já tem os materiais selecionados com id. Ao salvar, envia também `references: [{materialId, kind}]`. Validator aceita o campo opcional; service grava em `TeachingPlanReference`, substituindo o conjunto anterior no update.
- `complementaryBiblio` passa a ser preenchida pela mesma tela, com uma segunda aba no modal de seleção para marcar o material como complementar.
- `restoreReferences` lê primeiro `TeachingPlanReference` e só cai no casamento por título para planos antigos.
- `GET /api/v1/teacher/plans/[id]/chapters` devolve os capítulos de todos os materiais do plano agrupados por livro, no formato do multi-combobox. Helper `chapterToComboboxItem` em `src/components/teaching/`: título "Cap. N: Título", subtítulo "Livro (Autor)", badge "p. X a Y".

## Seção 4: distribuição de capítulos pelo cronograma

- Botão "Distribuir capítulos com IA" em `SchedulesPage.tsx`, ao lado de "Sincronizar", com `lockReason` no padrão de `PlanHeaderControls.tsx`: exige aulas sincronizadas e ao menos um livro do plano com capítulos.
- `POST /api/v1/teacher/schedules/[id]/distribute-chapters`. Serviço `chapter-distribution-service` em `src/domains/teaching/services/`. Entradas ao modelo: disciplina, ementa, objetivos, lista de aulas (número, data, duração), capítulos por livro (título, páginas). Saída JSON `[{classNumber, topicTitle, chapterIds}]`, validada: todo `classNumber` do cronograma aparece uma vez, todo `chapterId` existe no plano. Capítulos podem repetir em aulas consecutivas; cobertura completa e ordem são pedidas no prompt, não validadas.
- Persistência: substitui `LessonPlanChapter` de cada aula e atualiza `topicTitle` só nas aulas em `DRAFT`. Aulas `PUBLISHED` não são tocadas; a resposta informa quantas foram puladas.
- Sem IA real: 503 com `AI_UNAVAILABLE_MESSAGE`, sem fallback inventado. Confirmação na UI antes de rodar quando já existe aula com capítulos.
- `MeetingsTable.tsx` ganha coluna com os capítulos de cada aula em formato curto ("Cap. 3, 4").

Testes: service com mock de IA (resposta válida, aula faltando, capítulo inexistente, aulas publicadas puladas); rota com gating.

## Seção 5: geração e refino da aula por IA

`LessonEditor.tsx`, acima dos campos:

- Multi-combobox "Capítulos desta aula" (`AdvancedMultiCombobox`) com itens de `GET /plans/[id]/chapters`. Salva via `PUT /lessons/[id]`, que aceita `chapterIds` na whitelist de `updateLesson` e em `lessonInputSchema`, validando que pertencem a livros do plano.
- Botão "Gerar aula com IA" com `lockReason`: exige ao menos um capítulo selecionado e salvo. Com conteúdo existente, pede confirmação porque substitui o formulário.
- Em cada campo de texto (objetivo, metodologia, exercício, e cada etapa do roteiro) um botão "Refinar" abre input de instrução e substitui o campo com a resposta. O professor vê antes e depois e pode desfazer uma vez.

Backend, `lesson-generation-service` em `src/domains/teaching/services/`, padrão dos geradores existentes (deps injetáveis, `loggedStreamChat`, prompt em `src/domains/agents/prompts/`, JSON extraído e validado com zod):

- `POST /api/v1/teacher/lessons/[id]/generate`. Recupera chunks com `executeHybridSearch` filtrado por `chapterIds` (novo filtro em `chunkFilters` do `chunk-repository`), três consultas: título da aula, objetivo do plano, "exemplos e exercícios de {título}". Contexto: disciplina, ementa, número da aula sobre o total, duração em minutos, capítulos com livro e páginas, chunks com citação. Saída JSON: `dailyObjective`, `methodology`, `resourcesNeeded`, `fixationExercise`, `timeScript` no formato de `timeScriptSchema`, soma dos tempos igual à duração com tolerância de 10%. Devolve `citations` no formato dos outros geradores. Não grava: o cliente preenche o formulário e o professor salva.
- `POST /api/v1/teacher/lessons/[id]/refine` com `{field, stepIndex?, instruction, current}`. Contexto reduzido, dois chunks, devolve só o texto do campo. Temperatura 0.4.
- Sem chunks: 422 "Os capítulos selecionados não têm conteúdo indexado". Sem IA real: 503.

## Seção 6: publicação e visão do aluno

- Botões "Publicar" e "Despublicar" no cabeçalho do editor. `PUT /api/v1/teacher/lessons/[id]/status`. Publicar exige título diferente do padrão "Aula N", objetivo preenchido e ao menos uma etapa no roteiro; `lockReason` diz o que falta.
- `syncAgendaForLesson` só cria ou atualiza a agenda quando `status` é `PUBLISHED`. Despublicar marca a agenda `CANCELLED`; republicar volta ao status derivado do relógio. Aulas `DRAFT` sem agenda não aparecem para o aluno.
- Tutor: `tutor-pipeline.ts` recebe `allowedChapterIds` da agenda via `lessonPlan` quando existirem. Sem capítulos na aula, cai nos materiais do plano (`TeachingPlanReference`); sem plano, fica como hoje. Uma linha no system prompt diz quais capítulos a aula cobre.
- `LessonsPage.tsx` mostra badge `Rascunho` ou `Publicada` em cada aula.

Testes: service de geração com mock de IA (saída válida, soma de tempos fora da tolerância, sem chunks); `syncAgendaForLesson` respeitando status; filtro por capítulo no `tutor-pipeline`; componente do editor para gating de "Gerar" e "Publicar".

## Tratamento de erros (comum a todos os serviços de IA)

- Provider mock ou resposta inválida: 503 `AI_UNAVAILABLE_MESSAGE`. Nunca inventar conteúdo pedagógico.
- Sem fonte RAG: 422 com mensagem específica.
- Toda chamada passa por `loggedStreamChat` para `InferenceLog`.
- Rotas com `requireUser([TEACHER, ADMIN])`, `assertOwner` do plano, `apiError`.

## Fora do escopo (follow-ups)

- Preencher `TeachingPlan.unitsContent` a partir da distribuição de capítulos, para destravar o gerador de avaliações.
- Matrícula por oferta (hoje o vínculo aluno-turma é `User.classId`).
- Streaming de IA no cliente; os geradores seguem request/response com spinner.
- Lista de aulas por disciplina no menu do aluno.

## Ordem sugerida de implementação

1. Seção 1 (migrations e backfills).
2. Seção 2 (extração de capítulos e tela da biblioteca).
3. Seção 3 (referências do plano e rota de capítulos do plano).
4. Seção 6 parcial: `status` e `syncAgendaForLesson` (destrava testar sem expor aulas vazias).
5. Seção 4 (distribuição pelo cronograma).
6. Seção 5 (geração e refino).
7. Seção 6 restante (tutor escopado e badges).
