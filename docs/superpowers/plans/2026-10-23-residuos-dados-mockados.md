# Resíduos de Dados Mockados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar os três resíduos de dados inventados que ficaram de fora da varredura de 2026-10-23: a "confiança" numérica constante do inspetor de documentos, o plano semeado com parecer NDE "100% OK" e a ausência de uma coluna explícita de fallback em rascunhos e atas.

**Architecture:** Cada item é independente. (1) O inspetor troca o número inventado por uma proveniência (`source`) que diz de onde vieram os metadados. (2) O seed declara o parecer NDE pendente e o `update` do seed corrige o registro existente. (3) `DraftSubmission` e `PedagogicalMinute` ganham `aiFallback Boolean`, que vira a fonte única de `fallback`/`aiGenerated` nos DTOs; o aluno que pede a própria ata recebe uma nova geração quando a anterior ficou sem parecer.

**Tech Stack:** Next.js (App Router), Prisma + PostgreSQL, Zod, Vitest.

**Spec:** Não há documento separado. Os requisitos são os três itens "O que ficou de fora" do relatório da sessão de 2026-10-23, reproduzidos aqui:
1. `document-inspector` devolve `confidence` fixo (0.95 / 0.8 / 0.7 / 0.5 / 0.3) e autores placeholder ("Autor não identificado", "Autor a especificar"). Deve expor apenas o que é verdadeiro: a origem dos metadados.
2. O plano de ensino semeado (`DEMO_TEACHING_PLAN`) continua com `ndeComplianceStatus = '100% OK - Alinhado DCNs'` no banco local; deve nascer e ser corrigido para "Pendente de Avaliação Colegiado".
3. Rascunhos sinalizam fallback por `feedback === null` e atas por `rawSummary === ''`. Deve existir coluna explícita `aiFallback`, e a ata sem parecer deve poder ser regenerada pelo aluno.

## Global Constraints

- Código, comentários, testes e mensagens de UI em português do Brasil, como o restante do projeto.
- Nunca inventar valor para preencher ausência: campo desconhecido fica `''`, `null` ou flag explícita.
- Serviços de domínio continuam com `deps` injetáveis; testes não tocam banco nem rede.
- Migrações Prisma seguem o padrão `prisma/migrations/YYYYMMDDHHMMSS_<nome>/migration.sql` com SQL explícito.
- Gate por tarefa: `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `npx vitest run` todos limpos antes do commit.
- Commits terminam com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

- Upload de PDF escaneado sem texto (inspeção com `skipOcr`): `source` deve ser `'filename'` e `author` `''`, nunca um placeholder (Task 1, teste "arquivo vazio").
- Resposta da IA com `title` mas `author` vazio: `author` permanece `''` e `source` `'ai'` (Task 1, teste "IA sem autor").
- Rodar o seed duas vezes: o plano existente deve ser atualizado para o status pendente sem duplicar registros (Task 2, teste manual de idempotência).
- Aluno abre a ata gerada em fallback e o provedor voltou: a segunda requisição deve regenerar, e com provedor ainda em fallback deve devolver a ata existente sem gravar nada novo (Task 3, dois testes em `requestMinutes`).
- Histórico de rascunhos anteriores: entradas antigas com `feedback` nulo mas `aiFallback = false` (dados anteriores à migração) devem aparecer como fallback na UI (Task 3, `listDraftsByStudent` deriva `fallback = aiFallback || feedback === null`).

---

### Task 1: Inspetor de documentos expõe proveniência, não confiança inventada

**Files:**
- Modify: `src/domains/rag/document-inspector.ts`
- Modify: `src/app/api/v1/library/documents/inspect/route.ts`
- Modify: `src/app/teacher/materials/_components/use-document-inspection.ts`
- Test: `src/domains/rag/__tests__/document-inspector.test.ts`

**Interfaces:**
- Consumes: `aiProvider.streamChat`, `parseDocumentFile` (já existentes).
- Produces: `ExtractedDocumentMetadata.source: MetadataSource` com `export type MetadataSource = 'ai' | 'catalog-entry' | 'heuristic' | 'filename'`. O campo `confidence` deixa de existir. `aiApplied` continua e equivale a `source === 'ai'`.

- [ ] **Step 1: Trocar as asserções de `confidence` por `source` no teste existente**

Em `document-inspector.test.ts`, substituir:

```ts
expect(result.confidence).toBe(0.95);  // → expect(result.source).toBe('ai');
expect(result.confidence).toBe(0.7);   // → expect(result.source).toBe('heuristic');
expect(result.confidence).toBe(0.3);   // → expect(result.source).toBe('filename');
expect(result.confidence).toBe(0.8);   // → expect(result.source).toBe('catalog-entry');
```

E acrescentar dois testes no mesmo `describe`:

```ts
it('heurística sem autor devolve author vazio, nunca um placeholder', async () => {
  vi.spyOn(aiProvider, 'streamChat').mockImplementation(async function* () {
    throw new Error('offline');
  });
  const buffer = Buffer.from('Introdução à Lógica\n\nCapítulo 1: Proposições e conectivos lógicos.', 'utf-8');
  const result = await new DocumentInspectorService().inspectDocumentHeader(buffer, 'logica.txt');
  expect(result.author).toBe('');
  expect(result.source).toBe('heuristic');
  expect(result.aiApplied).toBe(false);
});

it('IA que devolve título sem autor mantém author vazio e source ai', async () => {
  mockAiJson({ title: 'Cálculo I', author: '', categories: [], summary: 'x' });
  const result = await documentInspectorService.inspectDocumentHeader(
    Buffer.from('Cálculo I\nUniversidade\nSumário\n1. Limites', 'utf-8'),
    'calculo.txt'
  );
  expect(result.author).toBe('');
  expect(result.source).toBe('ai');
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npx vitest run src/domains/rag/__tests__/document-inspector.test.ts`
Expected: FAIL com `expected undefined to be 'ai'` (campo `source` inexistente) e `expected 'Autor a especificar' to be ''`.

- [ ] **Step 3: Implementar `source` e remover placeholders em `document-inspector.ts`**

- Adicionar `export type MetadataSource = 'ai' | 'catalog-entry' | 'heuristic' | 'filename';`.
- Em `ExtractedDocumentMetadata`: remover `confidence: number`; adicionar `/** De onde vieram título/autor: IA, ficha catalográfica, heurística de linhas ou só o nome do arquivo. */ source: MetadataSource;`.
- `fromAi`: `author: data.author.trim()` (sem `|| 'Autor não identificado'`), `source: 'ai'`.
- `heuristicExtraction`: ramo da ficha catalográfica → `source: 'catalog-entry'`; ramo final → `author: extractedAuthor`, `source: 'heuristic'`.
- `getFallbackMetadata`: `source: 'filename'`.
- Remover todas as linhas `confidence: ...`.

- [ ] **Step 4: Propagar na rota e no hook**

- `inspect/route.ts`: no objeto `metadata` da resposta, trocar `confidence: metadata.confidence` por `source: metadata.source`.
- `use-document-inspection.ts`: em `DocumentInspection`, adicionar `source: 'ai' | 'catalog-entry' | 'heuristic' | 'filename'`; em `setInspection`, `source: ['ai','catalog-entry','heuristic','filename'].includes(m.source) ? m.source : 'filename'`. Nenhuma tela precisa mudar: `MaterialUploadModal` e `ReferenceUploadTab` já distinguem por `aiApplied`.

- [ ] **Step 5: Rodar testes, typecheck e lint**

Run: `npx vitest run src/domains/rag/__tests__/document-inspector.test.ts && npx tsc --noEmit -p tsconfig.json && npm run lint`
Expected: todos os testes PASS; typecheck sem erros (se `confidence` sobrar em algum consumidor o `tsc` aponta); lint limpo.

- [ ] **Step 6: Commit**

```bash
git add src/domains/rag/document-inspector.ts src/app/api/v1/library/documents/inspect/route.ts src/app/teacher/materials/_components/use-document-inspection.ts src/domains/rag/__tests__/document-inspector.test.ts
git commit -m "fix(rag): inspetor expõe a origem dos metadados em vez de confiança inventada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Seed declara o parecer NDE pendente e corrige o plano existente

**Files:**
- Modify: `prisma/seed-data/academic.ts` (objeto `DEMO_TEACHING_PLAN`)
- Verify: `prisma/seed.ts:151-156` (já faz `update` com `planData` quando o plano existe; não precisa mudar)

**Interfaces:**
- Consumes: `DEFAULT_NDE_COMPLIANCE_STATUS` de `src/lib/constants/teaching.ts` (valor `'Pendente de Avaliação Colegiado'`).
- Produces: `DEMO_TEACHING_PLAN.ndeComplianceStatus` definido explicitamente.

- [ ] **Step 1: Registrar o estado atual do banco local**

Run: `npx prisma db execute --stdin <<< "SELECT \"ndeComplianceStatus\" FROM teaching_plans;"` (ou `psql` equivalente)
Expected: uma linha com `100% OK - Alinhado DCNs`.

- [ ] **Step 2: Adicionar o campo ao seed**

Em `prisma/seed-data/academic.ts`, importar `DEFAULT_NDE_COMPLIANCE_STATUS` de `@/lib/constants/teaching` (o arquivo já importa `PLAN_STATUS` do mesmo módulo) e adicionar a `DEMO_TEACHING_PLAN`, logo após `practiceHours: 20,`:

```ts
  // Explícito: nenhum plano de demonstração nasce "alinhado às DCNs" sem parecer humano.
  ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
```

- [ ] **Step 3: Rodar o seed e confirmar a correção**

Run: `npm run db:seed` e em seguida a consulta do Step 1.
Expected: seed termina sem erro; a consulta devolve `Pendente de Avaliação Colegiado` e continua havendo exatamente uma linha (o `findFirst` + `update` do seed não duplica).

- [ ] **Step 4: Rodar o seed uma segunda vez (idempotência)**

Run: `npm run db:seed` e a consulta.
Expected: mesma única linha, mesmo status.

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

```bash
git add prisma/seed-data/academic.ts
git commit -m "fix(seed): plano de demonstração nasce com parecer NDE pendente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Coluna `aiFallback` em rascunhos e atas, com regeneração da ata pelo aluno

**Files:**
- Modify: `prisma/schema.prisma` (modelos `DraftSubmission` e `PedagogicalMinute`)
- Create: `prisma/migrations/20261023150000_ai_fallback_flags/migration.sql`
- Modify: `src/domains/assessments/services/draft-repository.ts`
- Modify: `src/domains/assessments/services/draft-service.ts`
- Modify: `src/domains/pedagogy/services/minute-repository.ts` (apenas tipos; `MinuteInput` já deriva do Prisma)
- Modify: `src/domains/pedagogy/services/minutes-service.ts`
- Modify: `src/app/(student)/draft-review/[agendaId]/_components/DraftReviewPage.tsx`
- Test: `src/domains/assessments/services/__tests__/draft-service.test.ts`
- Test: `src/domains/pedagogy/services/__tests__/minutes-service.test.ts`

**Interfaces:**
- Consumes: `DraftResult.fallback`, `MinuteDTO.aiGenerated`, `requestMinutes` (já existentes).
- Produces:
  - Prisma: `DraftSubmission.aiFallback Boolean @default(false)` e `PedagogicalMinute.aiFallback Boolean @default(false)`.
  - `draft-repository.createDraft` aceita `aiFallback: boolean`; `listDraftsByStudent` devolve `{ id, feedback, rubricScores, createdAt, fallback: boolean }` com `fallback = aiFallback || feedback === null`.
  - `minutes-service.toDTO`: `aiGenerated = !r.aiFallback`.
  - `minutes-service.requestMinutes` (ramo aluno): regenera quando `existing.aiFallback === true`; devolve a existente quando a nova geração também cair em fallback.

- [ ] **Step 1: Escrever os testes que falham (rascunhos)**

Em `draft-service.test.ts`, no teste "registra o rascunho sem feedback nem notas quando o JSON é inválido", acrescentar:

```ts
expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ aiFallback: true }));
```

No teste "usa a rubrica padrão de 3 critérios…", acrescentar:

```ts
expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ aiFallback: false }));
```

- [ ] **Step 2: Escrever os testes que falham (atas)**

Em `minutes-service.test.ts`, importar `type MinuteRecord` de `'../minute-repository'`; no `makeDeps`, estender `opts` com `existing?: Partial<MinuteRecord>` e fazer `listMinutesRepo` devolver `[existingRecord]` quando informado (o record precisa de `aiFallback`, `student.name`, `agenda.class.name`, `agenda.subjectRef`; os demais campos podem vir de um objeto base com `createdAt: NOW`). Acrescentar em `describe('requestMinutes')` (criar o describe se não existir):

```ts
it('aluno com ata anterior em fallback recebe nova geração quando a IA responde', async () => {
  const { deps, upsertMinute } = makeDeps({
    existing: { id: 'old', aiFallback: true, rawSummary: '', actionableAdvice: '' },
    interactions: [interaction()],
    ai: '{"rawSummary":"Novo resumo","actionableAdvice":"Novo conselho"}',
    fallback: false,
  });
  const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
  expect(res.kind).toBe('minute');
  expect(upsertMinute).toHaveBeenCalledWith(expect.objectContaining({ aiFallback: false, rawSummary: 'Novo resumo' }));
});

it('aluno com ata anterior em fallback e IA ainda indisponível recebe a ata existente sem regravar', async () => {
  const { deps, upsertMinute } = makeDeps({
    existing: { id: 'old', aiFallback: true, rawSummary: '', actionableAdvice: '' },
    interactions: [interaction()],
    fallback: true,
  });
  const res = await requestMinutes(student, { agendaId: 'ag1' }, deps);
  expect(res.kind === 'minute' && res.minute.id).toBe('old');
  expect(upsertMinute).not.toHaveBeenCalled();
});

it('aluno com ata válida não dispara nova geração', async () => {
  const { deps, upsertMinute } = makeDeps({ existing: { id: 'ok', aiFallback: false, rawSummary: 'r', actionableAdvice: 'a' } });
  await requestMinutes(student, { agendaId: 'ag1' }, deps);
  expect(upsertMinute).not.toHaveBeenCalled();
});
```

E nos testes já existentes de `generateMinute`: o caso "grava a ata sem parecer (aiGenerated false)…" passa a esperar `upsertMinute` chamado com `expect.objectContaining({ aiFallback: true })`; o caso "calcula métricas e usa o texto da IA…" com `aiFallback: false`.

- [ ] **Step 3: Rodar os dois arquivos de teste e confirmar a falha**

Run: `npx vitest run src/domains/assessments/services/__tests__/draft-service.test.ts src/domains/pedagogy/services/__tests__/minutes-service.test.ts`
Expected: FAIL por `aiFallback` ausente nos argumentos de `createDraft`/`upsertMinute` e pelo ramo de regeneração inexistente.

- [ ] **Step 4: Schema e migração**

Em `prisma/schema.prisma`:
- `DraftSubmission`: após `rubricScores Json?`, adicionar `aiFallback   Boolean  @default(false) // true = IA indisponível; feedback e notas nulos`.
- `PedagogicalMinute`: após `sessionTitle`, adicionar `aiFallback                 Boolean  @default(false) // true = métricas reais, parecer textual não redigido pela IA`.

Criar `prisma/migrations/20261023150000_ai_fallback_flags/migration.sql`:

```sql
-- Sinaliza explicitamente avaliações geradas sem IA real (antes inferido por campos nulos/vazios).
ALTER TABLE "draft_submissions" ADD COLUMN "aiFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedagogical_minutes" ADD COLUMN "aiFallback" BOOLEAN NOT NULL DEFAULT false;

-- Dados anteriores à coluna: o que não tem parecer/feedback foi gerado sem IA.
UPDATE "draft_submissions" SET "aiFallback" = true WHERE "feedback" IS NULL;
UPDATE "pedagogical_minutes" SET "aiFallback" = true WHERE btrim("rawSummary") = '';
```

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migração aplicada; client regenerado.

- [ ] **Step 5: Rascunhos usam a coluna**

- `draft-repository.ts`: `DraftCreateInput` passa a incluir `aiFallback: boolean` (já vem do tipo Prisma após o generate; só garantir que `createDraft` repassa). `listDraftsByStudent`: incluir `aiFallback: true` no `select` e mapear o resultado para `{ id, feedback, rubricScores, createdAt, fallback: r.aiFallback || r.feedback === null }`.
- `draft-service.ts`: no `createDraft`, adicionar `aiFallback: evaluation.fallback`. O tipo `DraftDeps.createDraft` ganha `aiFallback: boolean` no parâmetro.
- `DraftReviewPage.tsx`: `DraftEntry` ganha `fallback: boolean`; `FeedbackView` recebe `fallback` e mostra `AI_UNAVAILABLE` quando `fallback` for true (substitui a inferência `!feedback && !rubricScores`). O `latest` recebe `fallback: body.fallback === true`.

- [ ] **Step 6: Atas usam a coluna e regeneram quando pendentes**

- `minutes-service.ts`:
  - `toDTO`: `aiGenerated: !r.aiFallback`.
  - `generateMinute`: no `upsertMinute`, adicionar `aiFallback: text === null`.
  - `generateMinute` ganha um quarto parâmetro `options: { keepExistingOnFallback?: boolean } = {}`. Assinatura exportada: `generateMinute(user: AgendaActor, input: { agendaId: string; studentId?: string }, deps: MinutesDeps = defaultDeps, options: { keepExistingOnFallback?: boolean } = {}): Promise<MinuteDTO>`. Quando `options.keepExistingOnFallback` é true e `writeMinuteText` devolveu `null`, buscar a ata existente com `deps.listMinutes({ agendaId: agenda.id, studentId })`; se houver, devolver `toDTO(existing)` **sem** chamar `upsertMinute` (é isso que o segundo teste do Step 2 exige). Nos demais casos o fluxo atual continua.
  - `requestMinutes`, ramo aluno: após `const [existing] = ...`, substituir `if (existing) return ...` por:

```ts
if (existing && !existing.aiFallback) return { kind: 'minute', minute: toDTO(existing) };
// Sem ata, ou ata anterior sem parecer: tenta de novo; se a IA seguir indisponível, mantém a anterior.
const minute = await generateMinute(user, { agendaId: input.agendaId }, deps, { keepExistingOnFallback: true });
return { kind: 'minute', minute };
```

- [ ] **Step 7: Rodar testes, typecheck, lint e suíte completa**

Run: `npx vitest run src/domains/assessments/services/__tests__/draft-service.test.ts src/domains/pedagogy/services/__tests__/minutes-service.test.ts && npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run`
Expected: tudo PASS; `reports-service.test.ts` e `minutes-service.test.ts` compilam (o `MinuteRecord` fake nos testes precisa de `aiFallback`).

- [ ] **Step 8: Verificação ao vivo**

Com o dev server e `AI_PROVIDER=groq`:
1. Login como `PROF001`, gerar atas de uma agenda (`POST /api/v1/pedagogy/minutes`), conferir `aiGenerated: true` na resposta.
2. Trocar temporariamente `AI_PROVIDER=mock`, reiniciar, enviar um rascunho como aluno: resposta com `fallback: true`; `GET /api/v1/drafts?agendaId=...` lista a entrada com `fallback: true`.
3. Restaurar `AI_PROVIDER=groq`.

Expected: comportamentos acima; nenhum erro 500 no log do servidor.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261023150000_ai_fallback_flags src/domains/assessments src/domains/pedagogy "src/app/(student)/draft-review"
git commit -m "feat(pedagogia): coluna aiFallback em rascunhos e atas; aluno regenera ata sem parecer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fora do escopo deste plano

- Expor `source` do inspetor na UI de upload: as telas já diferenciam IA de heurística por `aiApplied`; mostrar "ficha catalográfica" vs "heurística" é refinamento visual sem requisito.
- Cronjob ou botão administrativo para regenerar em lote atas com `aiFallback = true`: o professor já tem "Gerar (ou regenerar) as atas de todos os alunos" na agenda.
