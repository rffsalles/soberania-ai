# Design: Soberania AI pronto para produção (remoção de mocks, segurança e persistência)

> **Data:** 2026-10-20
> **Status:** Aguardando revisão
> **Base:** auditoria executada em 2026-10-20 (tsc/lint/43 testes passam; `next build` falha; API e links verificados contra Postgres 17 real)

## 1. Objetivo

Transformar o protótipo atual em um sistema funcional de ponta a ponta para o professor e o aluno, sem dados simulados nas telas, com controle de acesso correto, dados persistidos no PostgreSQL e RAG que sobrevive a reinícios. O produto continua sendo o descrito em `docs/PRD.md`; este documento não altera o escopo de produto, apenas faz o que já existe funcionar de verdade.

**Sucesso significa:**
- `npm run build`, `npm run lint`, `npm run typecheck` e `npm test` passam.
- Nenhuma tela lê de `getMock*`, arrays constantes de dados de negócio ou `setTimeout` simulando trabalho.
- Todo link de navegação leva a uma rota existente e permitida para o papel do usuário.
- Aluno não acessa nem altera recursos de professor/administrador; professor não acessa recursos de administrador.
- Fluxo completo persistido: admin cadastra disciplina e professor → professor sobe material, cria plano, cronograma, aulas e prova → agendas aparecem para a turma → aluno interage, faz prova → interações, submissões e atas ficam no banco → professor vê relatórios reais.

## 2. Diagnóstico resumido (o que existe hoje)

| Área | Situação atual | Evidência |
| :-- | :-- | :-- |
| Build | Falha: `/login` usa `useSearchParams` sem `Suspense` | `next build` → erro de prerender |
| RBAC | Só `/appliance`, `/materials`, `/reports` protegidos por papel; `canAccessRoute` libera o resto. Aluno cria planos e apaga materiais; professor lista/cria professores | `curl` com cookie de aluno: `DELETE /api/v1/library/materials/:id` → 200 |
| Guardrail de prova | UI envia `mode: ASSESSMENT_EXAM`; API só lê `agendaType` → nunca bloqueia pela tela | payload da tela com "qual é a resposta da questão 2?" → `blockedByExamGuardrail: false` |
| Vazamento | `GET/POST /api/v1/admin/teachers` retornam `passwordHash` | resposta JSON |
| Navegação | Cabeçalho aponta para `/teacher/reports` e `/admin/dashboard` (404); rotas reais `/reports` e `/appliance`. Plantão de dúvidas abre a tela de aula com vídeo | crawl de links renderizados |
| Agendas | `MOCK_SESSIONS` em `agenda-service.ts`; tabelas `Agenda`/`Class` nunca escritas | grep `db.agenda` → nenhum uso |
| Atas e relatórios | `generateClassMinute` com números heurísticos fixos, `getMockMinutesFeed`, `getTeacherStruggleHeatmap` estáticos; tabela `PedagogicalMinute` nunca escrita | dashboard, reports, modal de ata, `/api/v1/pedagogy/minutes` |
| Interações | `register_student_interaction` grava em array em memória; chat não registra nada | `interaction-tool.ts` |
| Prova | Questões em constante `EXAM_QUESTIONS`; "Submeter" só muda estado local; `ExamSubmission` nunca escrita | `ExamPage.tsx` |
| Grupo de estudos | Mensagens de colegas fixas; chama o orquestrador de IA dentro do navegador | `StudyGroupPage.tsx` importa `processAgentInteraction` |
| Aula interativa | Checkpoints fixos, FAQ fixa, vídeo fixo do mock | `interactive-video-player.tsx`, `dynamic-faq-accordion.tsx` |
| Esteira do professor | `/teacher/schedules` e `/teacher/assessments` são telas estáticas; `/teacher/lessons` tem formulário com valores fixos e upload que só loga URL falsa; `/materials` (rota inicial do professor) é a versão legada em memória | leitura das páginas |
| RAG | Índice só em memória; chunks gravados em `material_chunks` nunca recarregados; upload sumiu da busca após recompilação | teste com upload + busca |
| Telemetria | `getApplianceTelemetry()` retorna constantes | `vllm-client.ts` |
| Identidade | Rotas ignoram o usuário autenticado (`teacherId: 'PROF001'`, `studentId: 'student-lucas'`) | rotas de planos e chat |
| Regras do repositório | `docs/rules/CLEAN_CODE.md` exige acesso ao banco só em `*-repository.ts`; hoje todas as rotas importam `db` | grep |
| Higiene | `tsconfig.tsbuildinfo`, `scratch/` versionados; `package-lock.json` fora de sincronia; Next 15.2.0 com CVE; `NODE_TLS_REJECT_UNAUTHORIZED=0` global | `git ls-files`, `npm install` |

Fora de escopo deste design (continuam como estão): página `/pitch` (conteúdo de marketing estático por natureza), reconhecimento facial, TTS/STT, cluster multi-nó.

## 3. Arquitetura alvo

### 3.1 Camadas

Segue `docs/rules/CLEAN_CODE.md`:

- `src/app/api/**`: rotas finas. Validam entrada com Zod, obtêm o usuário autenticado, chamam um service de domínio, devolvem JSON. Nunca importam `@/lib/db`.
- `src/domains/<dominio>/services/*-service.ts`: regras de negócio. Recebem o usuário/papel e chamam repositories.
- `src/domains/<dominio>/services/*-repository.ts`: único lugar que importa `@/lib/db`. Um por entidade.
- `src/app/**` (páginas, `_components`): só busca dados via `fetch` das rotas `/api/v1`. Nenhum import de `src/domains/**` que toque banco, IA ou corpus.

Enforcement: regra ESLint `no-restricted-imports` para `@/lib/db` com override liberando `**/*-repository.ts`, `prisma/seed.ts` e testes.

### 3.2 Contexto de autenticação nas rotas

Novo helper `src/lib/auth/request-user.ts`:

```ts
getRequestUser(req): Promise<AuthenticatedUser | null>   // lê cookie, valida JWT e revogação no banco
requireUser(req, roles?: Role[]): Promise<AuthenticatedUser> // lança AuthError(401/403)
```

Toda rota usa `requireUser`. O middleware continua fazendo a primeira barreira (JWT + papel por prefixo); a rota faz a segunda (revogação + papel + propriedade do recurso).

### 3.3 RBAC

`src/lib/auth/rbac.ts` passa a listar explicitamente todos os prefixos e **negar por padrão** rotas autenticadas não listadas:

| Prefixo | Papéis |
| :-- | :-- |
| `/dashboard`, `/classroom`, `/study-group`, `/exam`, `/office-hours`, `/draft-review` | STUDENT, TEACHER, ADMIN |
| `/teacher`, `/reports` | TEACHER, ADMIN |
| `/admin`, `/appliance` | ADMIN |
| `/pitch` | todos autenticados |
| `/api/v1/agent`, `/api/v1/agendas`, `/api/v1/pedagogy`, `/api/v1/exams`, `/api/v1/auth/me`, `/api/v1/auth/logout` | todos autenticados |
| `/api/v1/teacher`, `/api/v1/library`, `/api/v1/mcp` | TEACHER, ADMIN |
| `/api/v1/admin`, `/api/v1/academic-periods` (escrita), `/api/v1/appliance` | ADMIN |

`GET /api/v1/academic-periods` e `GET /api/v1/admin/subjects` (leitura) ficam liberados para TEACHER porque o editor de plano os usa.

Rotas de leitura de aluno filtram por `classId` do usuário; rotas de professor filtram por disciplinas alocadas (`TeacherSubject`), exceto ADMIN.

A rota inicial de TEACHER passa a ser `/teacher/plans`. `/materials` (legado) vira redirect para `/teacher/materials`; a pasta `src/app/(teacher)/materials` é removida.

### 3.4 Modelo de dados (alterações no Prisma, com migrações físicas)

```prisma
model Agenda {
  // existentes +
  teacherId     String?
  subjectId     String?
  lessonPlanId  String?  @unique   // substitui LessonPlan.agendaId (relação invertida)
  assessmentId  String?            // agenda EXAM aponta para a prova
  teacher       User?       @relation("TeacherAgendas", ...)
  subjectRef    Subject?    @relation(...)
  assessment    Assessment? @relation(...)
}

model Assessment {
  // existentes +
  durationMinutes Int @default(60)
  status          String @default("DRAFT") // DRAFT | PUBLISHED
  agendas         Agenda[]
}

model StudentInteraction {
  // existentes +
  agendaType       AgendaType
  guardrailBlocked Boolean @default(false)
  latencyMs        Int?
}

model PedagogicalMinute {
  // existentes +
  totalQuestionsAsked        Int @default(0)
  socraticChallengesAnswered Int @default(0)
  sessionTitle               String
  @@unique([agendaId, studentId])
}

model StudyGroupMessage {
  id        String @id @default(cuid())
  agendaId  String
  authorId  String?   // null = Tutora Lucy
  content   String @db.Text
  isAi      Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([agendaId])
}

model DraftSubmission {              // US-04 trabalhos/redações
  id, agendaId, studentId, content @db.Text, feedback @db.Text?, rubricScores Json?, createdAt
}

model InferenceLog {                 // telemetria real
  id, provider, model, ttftMs, totalLatencyMs, tokensPerSecond, promptTokens, completionTokens,
  externalTrafficBytes, agendaType?, createdAt
  @@index([createdAt])
}

model MaterialChunk {
  // existentes +
  embedding  Unsupported("vector(1024)")?
  // tsvector gerado em SQL na migração: content_tsv (GENERATED ALWAYS AS to_tsvector('portuguese', content)) + índice GIN
}
model DidacticMaterial { categories DocumentCategory[] }  // N:N explícito substitui `subject` com vírgulas
```

Migração habilita `CREATE EXTENSION IF NOT EXISTS vector` (imagem `pgvector/pgvector` já é a usada). Dimensão 1024 fixa (`multilingual-e5-large`/`bge-m3`); configurável só em build via `EMBEDDING_DIMENSIONS` documentada como exigindo nova migração.

`LessonPlan.timeScript` passa a ter formato tipado `{ timeSeconds, timeRange, activity, description, socraticQuestion? }` e alimenta os checkpoints do player.

### 3.5 Seed

`prisma/seed.ts` (executado por `npm run db:seed` e documentado no README) cria: usuários demo, turma `3º Semestre ADS`, disciplina `BD101` alocada ao professor, período 2026.1, plano de ensino, cronograma com 4 aulas, 1 prova publicada, 4 agendas (aula ao vivo, grupo de estudos, prova agendada, plantão) e o corpus didático atual (livros/artigos/DCN) como `DidacticMaterial` + `MaterialChunk`. O conteúdo hoje em `hybrid-search.ts`, `agenda-service.ts`, `minutes-generator.ts`, `struggle-analyzer.ts`, `faq-tool.ts`, `ExamPage.tsx`, `schedules/page.tsx` e `interactive-video-player.tsx` migra para o seed e é apagado do código. `ensureDemoUsersExist` sai do login.

### 3.6 Domínio `agendas`

- `agenda-repository.ts`, `agenda-service.ts` (`listForUser`, `getForUser`, `createFromLesson`, `createExam`, `setStatus`).
- Status derivado do horário quando `SCHEDULED`/`LIVE`: `isLive = now ∈ [startTime, endTime]`; `validateAgendaTimeWindow` permanece puro e passa a ser usado também no servidor (`POST /api/v1/agent/chat` recusa fora da janela, exceto OFFICE_HOURS, que respeita só o horário cadastrado).
- API: `GET /api/v1/agendas` (aluno: da sua turma; professor: das suas disciplinas), `GET /api/v1/agendas/:id`, `POST /api/v1/agendas` (professor), `PATCH /api/v1/agendas/:id/status`.
- Dashboard e todas as telas de sessão leem daqui. Links do dashboard: CLASSROOM → `/classroom/:id`, STUDY_GROUP → `/study-group/:id`, EXAM → `/exam/:id`, OFFICE_HOURS → `/office-hours/:id`, DRAFT_REVIEW → `/draft-review/:id`.

### 3.7 Domínio `agents` (Tutora Lucy)

- `POST /api/v1/agent/chat` aceita `{ agendaId, message, history? }`. Deriva `agendaType`, aluno e janela de horário da agenda; `mode` deixa de existir. Guardrail roda para `EXAM`.
- Após responder, grava `StudentInteraction` (pergunta, resposta, citação, `guardrailBlocked`, `timestampInVideo`, `latencyMs`) e `InferenceLog` via repositories.
- `streamAgentInteraction` exposto em `POST /api/v1/agent/chat/stream` (SSE) para o chat universal mostrar tokens; o endpoint JSON permanece para testes e MCP.
- `processAgentInteraction` deixa de ser importado por componentes cliente.
- Histórico: o cliente envia as últimas 10 mensagens; o servidor limita a 4k caracteres.
- `NODE_TLS_REJECT_UNAUTHORIZED=0` sai do gateway; quem precisar usa `AI_ALLOW_INSECURE_TLS=true` que configura um `Agent` só para o `fetch` do provedor (`undici`), nunca o processo inteiro.

### 3.8 Domínio `pedagogy` (interações, atas, relatórios)

- `interaction-repository.ts`, `minute-repository.ts`, `minutes-service.ts`, `reports-service.ts`.
- Ata por aluno é **calculada** a partir das interações da agenda: `engagementScore = clamp(40 + 6·perguntas + 10·desafiosRespondidos − 15·bloqueiosGuardrail, 0, 100)`; `hesitationIndex` a partir do tempo médio entre pergunta e resposta e da taxa de `wasCorrect=false`; `topicsMastered/Struggled` pelas seções RAG citadas (acertos vs. erros). `rawSummary` e `actionableAdvice` gerados pelo `aiProvider` com prompt próprio e fallback determinístico (mock) a partir dos números.
- Gatilhos: `POST /api/v1/pedagogy/minutes` `{ agendaId, studentId? }` (aluno gera a própria; professor gera para a turma inteira); `PATCH /api/v1/agendas/:id/status` → `COMPLETED` gera atas para todos os alunos com interação.
- `GET /api/v1/pedagogy/minutes?agendaId&studentId&subjectId&from&to` com filtro por papel.
- Relatórios: `GET /api/v1/pedagogy/reports/heatmap?subjectId&classId&from&to` agrega `topicsStruggled` (percentual = alunos com o tópico / alunos com ata) e sugere ação por template; `GET .../export.csv` devolve CSV das atas filtradas. Botão "Imprimir" usa `window.print()` com CSS de impressão. Indicadores de retenção seguem o PRD (verde > 80, amarelo 50-79, vermelho < 50).
- Dashboard do aluno: KPIs calculados das próprias atas (média de engajamento, total de dúvidas).

### 3.9 Domínio `assessments` (provas)

- Professor: `POST /api/v1/teacher/assessments/generate` `{ teachingPlanId, unitNumbers[], questionCount, type }` → `aiProvider` com instrução de JSON estrito `{ questions: [{ id, enunciation, options[{key,text}], correctKey, rationale, topic }], rubrics }`; validação Zod; fallback determinístico que monta questões a partir dos chunks RAG do plano quando o provedor é `mock` ou o JSON é inválido. `PUT /api/v1/teacher/assessments/:id` edita; `POST .../publish` cria a agenda EXAM (`startTime`, `endTime`, `classId`).
- Aluno: `GET /api/v1/exams/:agendaId` devolve questões **sem** `correctKey`/`rationale` e só dentro da janela; `POST /api/v1/exams/:agendaId/submit` `{ answers[{questionId, chosenKey, timeSpentSeconds}], integrityLog }` calcula `score` no servidor, grava `ExamSubmission` (único por aluno/agenda) e devolve o resultado; `GET /api/v1/teacher/assessments/:id/submissions` lista para o professor com o raciocínio (interações da agenda) por aluno.
- `ExamPage` carrega da API, mantém cronômetro (a partir de `endTime` do servidor), envia automaticamente ao zerar, registra eventos de `blur` e bloqueios do guardrail no `integrityLog`.

### 3.10 Esteira do professor (Etapas 2 a 4)

- `/teacher/schedules`: lista cronogramas dos planos do professor; formulário cria cronograma (`startDate`, `endDate`, dias da semana, feriados) e o serviço `generateMeetings` gera as datas; "Sincronizar calendário" cria/atualiza os `LessonPlan` esqueleto por encontro. Função pura testada.
- `/teacher/lessons?scheduleId=`: lista e edita planos de aula; `timeScript` editável; mídia: aba YouTube (URL validada) e aba Upload (envia o arquivo por `POST /api/v1/teacher/lessons/:id/media` multipart → `storageService`, que ganha `MEDIA_STORAGE_DIR`/mesmo R2). `s3-service.ts` com URL falsa é removido. Salvar aula com data cria/atualiza a `Agenda` CLASSROOM correspondente (título, `videoUrl`, janela de horário = `classDate` + duração padrão da disciplina).
- `/teacher/assessments`: lista provas do plano, gera com IA, edita questões, publica (cria agenda), vê submissões.
- `/teacher/plans`: `teacherId` passa a ser o usuário autenticado; professor só vê os seus planos (ADMIN vê todos).
- Sala de aula do aluno: `videoUrl` e checkpoints (`timeScript`) vêm do `LessonPlan` da agenda; FAQ dinâmica = perguntas mais frequentes da agenda (agrupadas por similaridade léxica simples sobre `StudentInteraction`), servida por `GET /api/v1/agendas/:id/faqs` e pela tool MCP `get_lesson_faqs`.
- Grupo de estudos: mensagens em `StudyGroupMessage`; `GET/POST /api/v1/agendas/:id/messages`; polling a cada 5 s (sem WebSocket no MVP); `@lucy`/`@tutora`/`@luci` chama o chat da agenda no servidor e grava a resposta como mensagem `isAi`; impasse de 5 min = sem mensagens novas por 5 min com a sessão ativa → o servidor, ao receber o próximo `GET`, injeta uma intervenção da tutora (uma por impasse).
- Plantão de dúvidas `/office-hours/:id`: chat universal com `agendaType OFFICE_HOURS`, sem vídeo.
- Trabalhos `/draft-review/:id` (US-04): aluno cola o texto (ou `.txt/.md/.docx` reaproveitando `parseDocumentFile`), `POST /api/v1/drafts` gera parecer com rubrica do `Assessment` tipo `GROUP_WORK`/`CASE_STUDY` vinculado à agenda e grava `DraftSubmission`.

### 3.11 Domínio `rag` persistente e híbrido de verdade

- `material-repository.ts`, `chunk-repository.ts`. `DIDACTIC_CORPUS` em memória é removido; `getAllCorpusChunks` deixa de existir.
- `EmbeddingProvider` em `src/lib/embeddings.ts`: usa `POST {AI_BASE_URL}/embeddings` (OpenAI-compatível; Ollama e vLLM suportam) com `AI_EMBEDDING_MODEL`; provedor `mock` gera vetor determinístico por hashing de tokens (1024 dims, normalizado) para testes e demo offline.
- Ingestão: após criar chunks, calcula embeddings em lotes de 32 e grava com `UPDATE ... SET embedding = $1::vector`.
- Busca: SQL único com dois CTEs (vetorial `ORDER BY embedding <=> $q LIMIT 50` e léxico `ts_rank_cd(content_tsv, websearch_to_tsquery('portuguese', $q)) LIMIT 50`) combinados por RRF (`k = 60`), filtros por categoria/material/disciplina, `topK`. Citação `[Título · Capítulo, pág. N]` mantida.
- `search_didactic_material`, `plans/generate`, orquestrador e inspeção usam o service. Reindexação: `POST /api/v1/library/materials/:id/reindex`.
- Categorias viram relação N:N (`DidacticMaterial.categories`); filtros por categoria usam a relação, não `contains`.

### 3.12 MCP

- Tools passam a ler/escrever via services (`register_student_interaction` → banco; `get_lesson_faqs` → FAQ real; `generate_class_minutes` → `minutes-service`).
- Nova tool `mcp_math_python_sandbox` (US-08): executa `python3 -I -S -c` em subprocesso com `timeout 5 s`, `ulimit -v 256MB`, sem rede (`unshare -n` quando disponível, senão documentado), stdin fechado, diretório de trabalho temporário vazio, saída limitada a 8 KB. Habilitada só com `ENABLE_PYTHON_SANDBOX=true`; desligada retorna erro explícito. Risco documentado no README.
- `POST /api/v1/mcp` restrito a TEACHER/ADMIN e com Zod por tool.

### 3.13 Telemetria do appliance

- `InferenceLog` alimentado pelo gateway a cada chamada (via callback injetado, sem o gateway importar `db`).
- `GET /api/v1/appliance/telemetry` (ADMIN): provedor configurado, saúde (`GET {AI_BASE_URL}/models` com timeout 2 s), médias dos últimos 15 min e 24 h (TTFT, tokens/s, latência), contagem de chamadas, bytes externos (0 para ollama/vllm), GPU via `nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader` quando o binário existir (senão `null`). Página mostra "indisponível" em vez de valores inventados. `getApplianceTelemetry()` e `telemetry-badge` fixos são removidos; o badge do cabeçalho consome a mesma rota (TEACHER/ADMIN) ou some para aluno.

### 3.14 Segurança e higiene

- `admin/teachers`: `select` explícito sem `passwordHash`; senha inicial obrigatória no cadastro (não há mais `'prof123'` padrão); `email` normalizado para minúsculas.
- `admin/subjects` PUT: `deleteMany` + `update` dentro de `db.$transaction`.
- Cookie `secure` quando `NODE_ENV=production` ou `FORCE_SECURE_COOKIE=true`.
- `.gitignore` ganha `tsconfig.tsbuildinfo` e `scratch/`; ambos saem do índice. `package-lock.json` regenerado. Next atualizado para a versão 15.x corrigida da CVE-2025-66478 e ESLint para versão suportada; build verificado.
- Docs: `PLAN-document-ingestion-ocr.md` e `PLAN-document-metadata-ai-extraction.md` marcados como concluídos; `CODEBASE.md` criado na raiz (exigido pelas regras) com a árvore de domínios.

## 4. Fluxo de dados ponta a ponta (alvo)

```
Admin ─ POST /admin/teachers, /admin/subjects ──────────────► users, subjects, teacher_subjects
Prof  ─ POST /library/documents/upload ─► storage + didactic_materials + material_chunks(+embedding, tsv)
Prof  ─ POST /teacher/plans ─► teaching_plans ─► /teacher/schedules ─► course_schedules + lesson_plans
Prof  ─ PUT  /teacher/lessons/:id (data+mídia) ─► lesson_plans + agendas(CLASSROOM)
Prof  ─ POST /teacher/assessments/generate → /publish ─► assessments + agendas(EXAM)
Aluno ─ GET  /agendas ─► dashboard ─► /classroom|/study-group|/exam|/office-hours|/draft-review
Aluno ─ POST /agent/chat {agendaId} ─► guardrail → RAG (SQL híbrido) → aiProvider ─► student_interactions + inference_logs
Aluno ─ POST /exams/:id/submit ─► exam_submissions (score no servidor)
Fim   ─ PATCH /agendas/:id/status COMPLETED ─► pedagogical_minutes (por aluno)
Prof  ─ GET  /pedagogy/minutes, /reports/heatmap, /export.csv ─► telas de relatório
Admin ─ GET  /appliance/telemetry ─► inference_logs + saúde do provedor
```

## 5. Tratamento de erros

- Rotas devolvem `{ success: false, error, details? }` com 400 (Zod), 401, 403, 404, 409 (duplicidade), 422 (fora da janela de horário), 500. Um helper `apiError(err)` mapeia `AuthError`, `ZodError`, `Prisma.PrismaClientKnownRequestError` (P2002 → 409, P2025 → 404).
- Falha do provedor de IA: chat devolve resposta de fallback determinística **marcada** (`fallback: true`) e registra no `InferenceLog`; telas exibem aviso discreto "resposta offline".
- Falha de embeddings na ingestão: material fica `status: INDEXED_LEXICAL_ONLY` e a busca usa só o ramo léxico; `reindex` tenta de novo.
- Sandbox Python: timeout/limite → erro controlado, nunca derruba o processo.

## 6. Testes

- Unitários (Vitest, DI com repositories falsos em memória): services de agendas (janela, status derivado), minutes (fórmulas), assessments (score, remoção de gabarito), schedules (`generateMeetings` com feriados), RAG (RRF sobre resultados fornecidos, embedding mock determinístico), guardrail via `agendaId`→`EXAM`, RBAC (`canAccessRoute` nega por padrão, matriz completa), CSV export, FAQ agrupamento.
- Integração (`tests/e2e/`, roda só com `DATABASE_URL_TEST`): migração + seed, fluxo admin→professor→aluno→ata via rotas HTTP com `next start` ou handlers importados; busca híbrida SQL com pgvector.
- Build: `npm run build` incluído no `npm test:ci` para impedir regressão do Suspense.

## 7. Entrega em fases (ordem de implementação)

1. **Correções bloqueantes e higiene** (build, RBAC negar por padrão, `requireUser`, guardrail por agenda, vazamento de hash, links, TLS, gitignore, lockfile, dependências). Sistema fica seguro antes de crescer.
2. **Repositories e seed** (regra 3.2, `prisma/seed.ts`, migrações do §3.4, remoção dos mocks de domínio).
3. **Agendas e chat persistidos** (§3.6, §3.7, dashboard, aula, plantão, interações, telemetria).
4. **Atas e relatórios reais** (§3.8).
5. **Provas e trabalhos** (§3.9, draft review).
6. **Esteira do professor** (§3.10: cronograma, aulas com mídia, grupo de estudos).
7. **RAG persistente com pgvector** (§3.11, §3.12 inclusive sandbox).
8. **Telemetria real e documentação** (§3.13, README/CODEBASE.md).

Cada fase termina com `typecheck`, `lint`, `test` e `build` verdes.
