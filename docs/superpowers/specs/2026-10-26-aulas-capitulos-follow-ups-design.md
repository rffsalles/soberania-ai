# Follow-ups da feature "Aulas ancoradas em capítulos"

Data: 2026-10-26. Status: aprovado em brainstorming, aguardando plano de implementação.
Spec de origem: `docs/superpowers/specs/2026-10-26-aulas-capitulos-ia-design.md` (implementada em `main`, commits f82d187..8545554).

## Objetivo

Fechar as pendências deixadas pela revisão final da feature, sem abrir feature nova: destravar o gerador de avaliações preenchendo `unitsContent`; remover duplicação no código de IA e no editor de aula; não destruir títulos personalizados sem aviso; não falhar a geração de aula quando o livro não tem embeddings; proteger os vínculos de capítulos de aulas de outros professores.

## Decisões tomadas

- Unidades do plano: a IA agrupa a distribuição de capítulos em 3 a 6 unidades, como passo opcional após distribuir, com confirmação; o professor edita na tela do plano (opção A).
- Capítulos da biblioteca: sem dono. Protege-se só o dano real: mudança na contagem de capítulos com vínculos de aulas de outros professores devolve 409 com a lista de aulas afetadas; admin pode forçar (opção A).
- Tudo em `main`, mesmo processo de execução por subagentes.

## Contexto

- `TeachingPlan.unitsContent Json` no formato `[{unitNumber, title, topics[]}]`, lido por `assessment-service.ts` (`selectUnits`), nunca preenchido pela UI. Em avaliações o botão "Gerar com IA" trava com "O plano não possui unidades cadastradas".
- Distribuição de capítulos grava `LessonPlanChapter` e `topicTitle` em aulas DRAFT (`chapter-distribution-service.ts`).
- O laço de streaming (`askModel`/`askRefine`: acumular tokens, detectar `fallback`) está repetido em `plan-generation-service.ts`, `chapter-extraction-service.ts`, `chapter-distribution-service.ts` e `lesson-generation-service.ts`.
- `LessonEditor.tsx` tem ~330 linhas com gerar, status, capítulos e refino juntos.
- `SchedulesPage.tsx` só pede confirmação quando alguma aula já tem capítulos.
- `executeHybridSearch` com `allowedChapterIds` pode devolver zero chunks sem embeddings (ramo lexical com `websearch_to_tsquery` em AND) e a geração responde 422.
- `replaceManualChapters`/`reextractMaterialChapters` recasam vínculos por ordem quando a contagem não muda e perdem todos quando muda (`relinkByOrder`, `lostLessonLinks`).

## Seção 1: unidades do plano a partir da distribuição

- Serviço `plan-units-service.ts` em `src/domains/teaching/services/`, `generateUnitsFromDistribution(scheduleId, user, deps?)`. Entradas ao modelo: disciplina, ementa, objetivos, aulas com `classNumber`, `topicTitle` e capítulos (da distribuição gravada), livros com capítulos. Prompt em `src/domains/agents/prompts/plan-units-prompt.ts`.
- Saída JSON `[{unitNumber, title, topics: string[], chapterIds: string[]}]`, validada: 3 a 6 unidades, `unitNumber` sequencial a partir de 1, todo `chapterId` do plano, toda aula com capítulos coberta por exatamente uma unidade (uma aula pertence à unidade que contém seus capítulos; aula com capítulos em duas unidades é inválida), `topics` não vazio.
- Pré-condições: cronograma do dono (404/403), ao menos uma aula com capítulos (422 `'Distribua os capítulos antes de gerar as unidades.'`). Inválida, fallback ou exceção: 503 com mensagem própria `'IA indisponível no momento. Tente novamente mais tarde ou cadastre as unidades manualmente no plano.'`, nada gravado.
- Persistência: `TeachingPlan.unitsContent` recebe `[{unitNumber, title, topics, chapterIds}]`. O leitor de avaliações continua funcionando porque só usa `unitNumber`, `title`, `topics`.
- Rota `POST /api/v1/teacher/schedules/[id]/generate-units` → `{ success: true, units }`. `requireUser` TEACHER/ADMIN, `assertOwner`, `apiError`.
- UI em `SchedulesPage.tsx`: botão `'Gerar unidades do plano'` ao lado de distribuir, habilitado quando alguma aula tem capítulos; se o plano já tem `unitsContent` não vazio, `window.confirm('O plano já tem unidades. Substituir pelas geradas?')`. Sucesso: `` `${n} unidades geradas no plano.` `` em `role="status"`.
- UI do plano (`src/app/teacher/plans/new/_components/`): novo card `PlanUnitsCard` com lista editável (título, tópicos um por linha, badge com capítulos), salvo pelo `PUT` do plano. `updateTeachingPlanSchema` ganha `unitsContent` opcional validado por zod (`unitNumber` int ≥ 1, `title` 1..200, `topics` array de strings não vazias, `chapterIds` opcional).
- Efeito esperado: `lockReason` de avaliações deixa de mostrar "sem unidades" para planos criados pela interface.

## Seção 2: laço de streaming compartilhado e hooks do editor

- `src/domains/agents/collect-stream.ts`: `collectStream(streamChat: StreamChatFn, messages: AIMessage[], options: { temperature; maxTokens }): Promise<{ text: string; fallback: boolean }>`. Acumula `token`, marca `fallback` se algum chunk vier com `fallback: true`. Substitui os laços de `plan-generation-service`, `chapter-extraction-service`, `chapter-distribution-service`, `lesson-generation-service` (geração e refino) e é usado pelo novo `plan-units-service`. Comportamento idêntico; os testes existentes de cada serviço continuam verdes sem alteração de asserts.
- `LessonEditor.tsx` extrai dois hooks na mesma pasta: `useLessonGeneration({ lessonId, savedChapterIds, selectionKey, hasContent, applyGenerated })` devolvendo `{ generate, generating, citations, lockReason }`; `useLessonStatus({ lesson, dirty, onSaved })` devolvendo `{ changeStatus, changing, publishLock }`. Sem mudança de comportamento ou de textos; os testes atuais de `LessonEditor.test.tsx` são a rede de segurança e não mudam.

## Seção 3: confirmação na distribuição

- Em `SchedulesPage.tsx`, a condição do `window.confirm` passa a ser: alguma aula DRAFT tem `chapters.length > 0` **ou** `topicTitle.trim() !== `Aula ${classNumber}``. Texto novo: `'Algumas aulas em rascunho já têm capítulos ou título personalizado. Substituir?'`.
- `ScheduleLesson` precisa expor `topicTitle` (hoje expõe `id`, `classNumber`, `status`, `chapters`); conferir o include de `listLessonsBySchedule`.
- Teste: aula DRAFT sem capítulos e com título personalizado → confirm aparece; cancelar não chama a API.

## Seção 4: fallback da busca da geração

- `chunk-repository.ts`: `sampleChunksByChapter(chapterIds: string[], perChapter: number, max: number): Promise<DidacticChunk[]>`, primeiros chunks de cada capítulo por `pageNumber`, limitado a `perChapter` por capítulo e `max` no total.
- `lesson-generation-service.ts` (geração e refino): se as buscas filtradas devolverem zero chunks, chamar `deps.sampleByChapter(chapterIds, 4, 12)` antes do 422. Só então 422 `NO_INDEXED_CHAPTER_CONTENT` se ainda vazio. Citações seguem `formatCitation`. `LessonGenerationDeps` ganha `sampleByChapter`.
- Testes: busca vazia + amostra não vazia → gera com as citações da amostra; busca vazia + amostra vazia → 422; busca não vazia → amostra não é chamada.

## Seção 5: proteção dos vínculos de capítulos

- `replaceManualChapters(materialId, drafts, { user, force? })` e `reextractMaterialChapters(materialId, { user, force? })`: quando `rows.length !== old.length` e `listChapterLinks` contém aulas cujo plano pertence a outro professor (`teachingPlan.teacherId !== user.id`), lançar `DomainError(409, 'Alterar o número de capítulos desfaz vínculos de aulas de outros professores.')` com `details: [{ disciplina, turma, classNumber, topicTitle, professor }]`, nada gravado. `force: true` só é aceito quando `user.role === ADMIN`; professor com `force` recebe 403. Mesma contagem nunca bloqueia (recasamento por ordem). Vínculos só do próprio professor não bloqueiam, mas continuam reportados em `lostLessonLinks`.
- `listChapterLinks` passa a devolver, por vínculo, `teacherId` e os rótulos necessários (ou um método novo `listChapterLinkDetails`).
- Rotas `PUT /library/materials/[id]/chapters` e `POST .../chapters/extract` aceitam `?force=1` e repassam o usuário; 409 vai com `details` no corpo.
- `MaterialChaptersPanel.tsx`: ao receber 409, mostra a lista das aulas afetadas em `role="alert"` e, se o usuário for ADMIN, botão `'Forçar mesmo assim'` que repete a chamada com `force=1`. Professor vê só a lista.
- Testes: contagem diferente com vínculo de outro professor → 409 e `replaceChapters` não chamado; mesma contagem → grava; `force` com ADMIN → grava; `force` com TEACHER → 403; painel mostra a lista e o botão só para admin.

## Tratamento de erros

- IA: 503 com mensagem por contexto, nunca inventar conteúdo; sem fonte: 422. Toda chamada via `collectStream` sobre `deps.streamChat` (`loggedStreamChat` por padrão).
- Rotas: `requireUser`, `assertOwner`, `apiError`.

## Fora do escopo

- Dono dos materiais; streaming no cliente; matrícula por oferta; reescrever o leitor de unidades do gerador de avaliações.

## Ordem sugerida de implementação

1. Seção 2 (`collectStream`) primeiro, porque as seções 1 e 4 o usam.
2. Seção 4 (fallback da busca).
3. Seção 3 (confirmação).
4. Seção 5 (proteção dos vínculos).
5. Seção 1 (unidades: serviço, rota, UI do cronograma, card do plano).
6. Hooks do editor (restante da Seção 2).
7. Verificação final: tsc, lint, vitest completo.
