# Avaliações ancoradas em capítulos do plano — Design

Data: 2026-10-28
Status: aprovado em conversa, aguardando plano de implementação

## Objetivo

Em `/teacher/assessments`, o professor restringe o conteúdo da avaliação selecionando capítulos e subníveis dos livros do plano de ensino, com a mesma árvore usada na aula. A IA gera as questões só a partir desses capítulos. Ao publicar, os alunos da turma fazem a prova pelo fluxo que já existe e recebem nota automática.

Sucesso: no ambiente local, o professor seleciona capítulos, gera, revisa, salva e publica; o aluno abre a prova pela agenda, envia e a nota aparece na tabela de submissões.

## Contexto (o que já existe)

- Editor de prova, geração por IA com RAG, publicação (cria `Agenda` do tipo `EXAM`) e tabela de submissões em `src/app/teacher/assessments/_components/`.
- Prova do aluno em `src/app/(student)/exam/[examId]/` com cronômetro, envio, correção objetiva e registro de integridade (`src/domains/assessments/services/exam-service.ts`).
- A geração atual (`src/domains/assessments/services/assessment-service.ts`, `generateQuestions`) é ancorada em unidades do plano (`unitNumbers`) e a busca híbrida roda sem filtro de capítulo.
- A aula já faz tudo o que a prova precisa: árvore `ChapterTreeSelect` (`src/components/teaching/`), hook `usePlanChapters`, validação `CHAPTER_OUTSIDE_PLAN` + `normalizeChapterSelection` (`src/domains/teaching/services/plan-chapters-service.ts`, `lesson-service.ts`), expansão de descendentes `listDescendantIds` (`src/domains/rag/services/chapter-repository.ts`) e filtro `allowedChapterIds` em `executeHybridSearch`.

## Lacunas que este design fecha

1. Não há onde guardar o escopo de capítulos da prova nem seletor na UI.
2. A geração não recebe capítulos, não restringe a busca e não rotula a origem das questões.
3. O POST de criação não valida o formato das questões; o seed da prova demo tem `id` numérico e sem `rationale`, o que faz a página do aluno devolver 500.

## Fora do escopo

- Tutora da prova com busca restrita aos capítulos da avaliação.
- Lista "Minhas avaliações" e resultado detalhado para o aluno.
- Questões dissertativas corrigidas por rubrica.
- Republicar a mesma prova para outra turma.

## 1. Dados

Nova junção, espelho de `LessonPlanChapter`:

```prisma
model AssessmentChapter {
  assessmentId String
  chapterId    String
  assessment Assessment      @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  chapter    MaterialChapter @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  @@id([assessmentId, chapterId])
  @@map("assessment_chapters")
}
```

- `Assessment` ganha `chapters AssessmentChapter[]`; `MaterialChapter` ganha `assessmentLinks AssessmentChapter[]`.
- Migration via `prisma migrate dev --name assessment_chapters`. Não rodar reset do banco sem pedido explícito do usuário.
- A seleção gravada é normalizada como na aula: só a raiz de cada ramo escolhido (`normalizeChapterSelection`). A expansão para descendentes acontece na leitura, nunca na gravação.
- Seed (`prisma/seed-data/academic.ts`, `DEMO_ASSESSMENT`): ids das questões viram strings (`"q1"`...), cada questão ganha `rationale`; isso faz o seed passar em `questionSchema`.

### Helper compartilhado de escopo

Novo `src/domains/rag/services/chapter-scope.ts`:

- `expandChapterScope(chapterIds: string[], deps?): Promise<string[]>` — chama `listDescendantIds` e devolve escolhidos + descendentes; se a expansão vier vazia, devolve os escolhidos (lista vazia nunca abre o escopo).
- `formatChapterLabel(chapter: { number: string; title: string; book: { title: string; author: string }; startPage: number; endPage: number | null }): string` — gera `Cap. 2.3: Título — Livro (Autor), p. a-b` (sem `-b` quando `endPage` é nulo).
- `lesson-generation-service.ts` (`expandChapterIds`) e `chat-service.ts` (`loadTutorScope`) passam a usar o helper; o comportamento deles não muda. `buildLessonGenerationMessages` usa `formatChapterLabel` para o rótulo que já monta hoje.

## 2. API e geração

### Listagem, criação e edição

- `GET /api/v1/teacher/assessments?planId=` devolve `chapterIds: string[]` em cada item (`AssessmentItem` em `src/components/assessments/use-assessments.ts`).
- `POST /api/v1/teacher/assessments` e `PUT /api/v1/teacher/assessments/[id]` aceitam `chapterIds?: string[]`:
  - dedup; cada id deve pertencer aos livros do plano (`planChapterIds`), senão 400 `CHAPTER_OUTSIDE_PLAN`;
  - normaliza com `normalizeChapterSelection`;
  - grava na junção em transação (`deleteMany` + `createMany`), no mesmo padrão de `replaceLessonChapters`.
- `POST` passa a validar `questions` com `z.array(questionSchema)` e `rubrics` com `z.array(rubricSchema)`, como o `PUT` já faz (hoje aceita qualquer JSON).
- `PUT` em prova com `status = PUBLISHED` devolve 409 `ASSESSMENT_PUBLISHED` no serviço (`updateAssessment`), não só escondido na UI.

### Geração

Validador (`src/lib/validators/assessment.validator.ts`):

```ts
generateAssessmentSchema = z.object({
  teachingPlanId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).min(1),
  questionCount: z.number().int().min(1).max(20),
  type: z.enum([...]) // como hoje
})
```

`unitNumbers` é removido do validador, do tipo `GenerateInput` e do serviço. A geração é sem estado: não exige salvar a prova antes, porque o professor gera antes de existir o rascunho.

Fluxo de `generateQuestions(user, input, deps)`:

1. Carrega o plano com referências e checa o dono (`assertOwner`).
2. Valida `chapterIds` contra `planChapterIds`; fora do plano dá 400 `CHAPTER_OUTSIDE_PLAN`. Normaliza.
3. Carrega os capítulos escolhidos com número hierárquico (`chapterNumbersFor`) e livro, para os rótulos.
4. Para cada capítulo escolhido: `expandChapterScope([id])` e `executeHybridSearch({ query: título do capítulo, allowedChapterIds: expandidos, topK: 4 })`. As buscas rodam em paralelo. Deduplica os trechos por `chunk.id`.
5. Se nenhum trecho vier, `sampleChunksByChapter(todosExpandidos, 4, 12)`. Se ainda vazio, 422 `NO_INDEXED_CHAPTER_CONTENT`.
6. Monta o prompt com `buildAssessmentMessages` (ver abaixo) e chama o modelo via `createLoggedStreamChat(deps, 'EXAM')` + `collectStream`, temperatura 0.4, `maxTokens = assessmentMaxTokens(questionCount)`.
7. Parse com `parseAssessmentText`. Para cada questão, se `chapterId` não estiver na seleção normalizada, o campo é descartado (fica `undefined`); a geração não falha por isso.
8. Se o parse falhar ou a contagem não bater, usa `buildFallbackQuestions` como hoje e devolve `fallback: true`. `fallbackReason === 'rate_limit'` vira 429; outro fallback do provedor continua sendo sinalizado em `fallback`.

Orçamento de tokens, no padrão de `distributionMaxTokens`:

```ts
const assessmentMaxTokens = (n: number) => Math.min(8000, 800 + 250 * n)
```

Prompt (`src/domains/agents/prompts/assessment-prompt.ts`):

- O system prompt continua pedindo APENAS JSON com `questions[]` e `rubrics[]`, e passa a exigir `chapterId` em cada questão, escolhido entre os ids listados, com as questões distribuídas entre os capítulos.
- A mensagem do usuário lista disciplina, "Capítulos da avaliação" com `formatChapterLabel` e o `id` de cada um, e "Trechos de apoio" com `formatCitation(chunk)` seguido do texto.
- `AssessmentUnit` e qualquer referência a unidades saem do prompt.

Schema da questão (`src/domains/assessments/question-schema.ts`): `questionSchema` ganha `chapterId: z.string().optional()`. Opcional para não invalidar provas já gravadas. `PublicQuestion` continua omitindo só `correctKey` e `rationale`; `chapterId` passa para o aluno sem expor gabarito.

## 3. UI do professor

`AssessmentEditor.tsx`:

- O card de unidades é substituído por `ChapterTreeSelect` com `id="assessment-chapters"`, `label="Capítulos desta avaliação"`, `books` de `usePlanChapters(planId)`, `selectedIds={chapterIds}`, `onSelectionChange={setChapterIds}`. Estado inicial vem de `assessment.chapterIds`.
- `lockReason` do botão "Gerar com IA": sem capítulos selecionados ("Selecione ao menos um capítulo"), árvore ainda carregando, ou fora da faixa de questões.
- Geração envia `{ teachingPlanId, chapterIds, questionCount, type }`.
- Cada questão mostra, acima do enunciado, o rótulo do capítulo de origem (resolvido de `chapterId` pelos `books` carregados); questão sem `chapterId` não mostra nada.
- `fallback: true` mostra um `Alert` visível: "Questões geradas sem IA (modo offline). Revise antes de publicar." no lugar da badge atual.
- Salvar envia `chapterIds` junto com o resto do rascunho. `validateAssessmentDraft` não passa a exigir capítulos: prova manual sem capítulo continua válida.
- `AssessmentsPage`, `PublishDialog` e `SubmissionsTable` não mudam.

Lado do aluno (`ExamPage.tsx`, `exam-service.ts`): sem mudança funcional. Verificar que uma prova gerada por capítulo abre, aceita envio e calcula nota.

## 4. Erros

| Situação | Código | Status |
|---|---|---|
| Capítulo fora dos livros do plano (POST, PUT, generate) | `CHAPTER_OUTSIDE_PLAN` | 400 |
| Nenhum trecho indexado nos capítulos escolhidos | `NO_INDEXED_CHAPTER_CONTENT` | 422 |
| Editar prova publicada | `ASSESSMENT_PUBLISHED` | 409 |
| Questões/rubricas inválidas no POST | validação zod | 400 |
| Limite de taxa do provedor na geração | como na aula | 429 |

## 5. Testes

Serviço (`assessment-service.test.ts`):

- geração passa `allowedChapterIds` expandidos para a busca, uma busca por capítulo escolhido;
- capítulo fora do plano dá 400;
- busca vazia cai em `sampleByChapter`; amostra vazia dá 422;
- `chapterId` fora da seleção é descartado, questão mantida;
- fallback do provedor devolve `fallback: true`; `rate_limit` dá 429;
- `createAssessment` rejeita questão inválida (id numérico, sem rationale, 3 alternativas);
- `updateAssessment` em PUBLISHED dá 409; grava `chapterIds` normalizados.

Helper (`chapter-scope.test.ts`): expansão, lista vazia volta aos escolhidos, rótulo com e sem `endPage`.

Validador (`assessment.validator.test.ts`): `chapterIds` obrigatório com mínimo 1; `unitNumbers` não é mais aceito.

Prompt (`assessment-prompt.test.ts`): mensagem lista capítulos com id e rótulo; parser aceita `chapterId` e tolera ausência.

UI (`AssessmentEditor.test.tsx`): árvore renderiza com os livros do plano; botão trava sem capítulos; payload de geração leva `chapterIds`; aviso de modo offline aparece; rótulo do capítulo aparece na questão.

Aluno (`exam-service.test.ts`): caso com questão que tem `chapterId` passa pela projeção pública sem `correctKey`.

Regressão: `lesson-generation-service.test.ts` e `chat-service.test.ts` continuam verdes após trocar para o helper.

## 6. Checklist manual (fim da implementação)

1. `npx prisma migrate dev` aplicado; `npm run typecheck` e `npx vitest run` verdes.
2. Em `/teacher/assessments`, escolher um plano com livro indexado, criar prova, selecionar um capítulo com subníveis, gerar 5 questões; cada questão mostra o capítulo de origem.
3. Editar uma alternativa, salvar, reabrir: capítulos e questões persistem.
4. Publicar para a turma com início agora (`NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=true` se precisar).
5. Como aluno da turma, abrir a prova pela agenda, responder, enviar; a nota aparece em Submissões.
6. Com `AI_PROVIDER=mock`, gerar de novo: o aviso de modo offline aparece.
