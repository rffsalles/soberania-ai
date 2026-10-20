# Plano de Implementação: Soberania AI pronto para produção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover todos os dados simulados, fechar as falhas de segurança e persistir o fluxo admin → professor → aluno → ata no PostgreSQL, com RAG que sobrevive a reinícios.

**Architecture:** Rotas `src/app/api/v1/**` finas (Zod + `requireUser` + service); regras em `src/domains/<dominio>/services/*-service.ts`; acesso ao banco só em `*-repository.ts`; telas buscam tudo por `fetch` em `/api/v1`. Seed substitui mocks; migrações físicas Prisma para cada mudança de schema.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Prisma 6 + PostgreSQL 17 com pgvector, Zod, Vitest, jose, @aws-sdk/client-s3, pdf-parse/mammoth/tesseract.js.

**Spec:** `docs/superpowers/specs/2026-10-20-remocao-mocks-e-producao-design.md`

## Global Constraints

- Nenhum arquivo fora de `**/*-repository.ts`, `prisma/seed.ts` e testes importa `@/lib/db` (regra ESLint `no-restricted-imports`).
- Nenhum componente em `src/app/**` ou `src/components/**` importa de `src/domains/**` ou `src/lib/ai-provider.ts`; dados chegam só por `fetch('/api/v1/...')`. Exceção: tipos (`import type`).
- Toda mudança em `prisma/schema.prisma` vem com pasta em `prisma/migrations/` no mesmo commit.
- Toda rota responde `{ success: boolean, ... }` e erros `{ success: false, error: string, details? }`; códigos 400/401/403/404/409/422/500 conforme §5 do spec.
- Mensagens de UI e erros em pt-BR. Sem magic strings: enums/constantes `as const` em `src/lib/constants/*.ts`.
- Cada tarefa termina com `npm run typecheck && npm run lint && npm test` verdes; tarefas que tocam páginas terminam também com `npm run build`.
- Commits em inglês no padrão `feat|fix|refactor|test|docs|chore: ...`, um por tarefa, terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Dimensão de embedding fixa: 1024. RRF `k = 60`. Lote de embeddings: 32. Sandbox Python: timeout 5 s, 256 MB, saída 8 KB. Polling do grupo: 5 s. Impasse: 5 min. Histórico de chat: 10 mensagens / 4000 caracteres.
- Limiares de retenção: verde > 80, amarelo 50–79, vermelho < 50.

## Review Focus

1. Aluno de outra turma pedindo `GET /api/v1/agendas/:id` de uma agenda alheia deve receber 404, nunca os dados (teste na Task 12).
2. Submissão de prova após `endTime` deve receber 422 e segunda submissão do mesmo aluno 409; a nota nunca vem do cliente (teste na Task 19).
3. JWT ainda válido com sessão revogada no banco deve receber 401 em qualquer rota que use `requireUser` (teste na Task 3).
4. `POST /api/v1/agent/chat` com `agendaId` inexistente, cancelado ou fora da janela deve responder 404/422 sem chamar o provedor de IA nem gravar interação (teste na Task 14).
5. Ingestão quando o endpoint de embeddings falha deve deixar o material `INDEXED_LEXICAL_ONLY` e a busca léxica ainda encontrar o chunk (teste na Task 27).

---

## Fase 1 — Correções bloqueantes e higiene

### Task 1: Build verde (Suspense no login) e gate de CI

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: script `npm run test:ci` = `npm run typecheck && npm run lint && npm test && npm run build`.

- [ ] **Step 1: Reproduzir a falha** — Run: `npx next build`. Expected: erro `useSearchParams() should be wrapped in a suspense boundary at page "/login"`.
- [ ] **Step 2: Envolver `<LoginPage />` em `<React.Suspense fallback={null}>`** em `src/app/(auth)/login/page.tsx`, mesmo padrão de `src/app/teacher/plans/new/page.tsx:8`.
- [ ] **Step 3: Adicionar script `test:ci`** em `package.json`.
- [ ] **Step 4: Verificar** — Run: `npm run test:ci`. Expected: build termina com a tabela de rotas, sem `⨯`.
- [ ] **Step 5: Commit** — `fix: wrap login page in Suspense and add test:ci gate`

### Task 2: RBAC negar por padrão com matriz completa

**Files:**
- Modify: `src/lib/auth/rbac.ts`
- Create: `src/lib/constants/routes.ts`
- Test: `src/lib/auth/__tests__/rbac.test.ts`

**Interfaces:**
- Produces: `ROUTES` (`as const`) com todas as rotas de página; `PROTECTED_ROUTE_ROLES` com a matriz do spec §3.3; `canAccessRoute(pathname, role): boolean` negando prefixos não listados quando o path começa com `/api/` ou com qualquer prefixo de área (`/teacher`, `/admin`, `/appliance`, `/reports`, `/dashboard`, `/classroom`, `/study-group`, `/exam`, `/office-hours`, `/draft-review`, `/pitch`); `getDefaultRouteForRole(TEACHER) === '/teacher/plans'`.

- [ ] **Step 1: Escrever testes** em `rbac.test.ts`:
  - `STUDENT` não acessa `/teacher/plans`, `/admin/subjects`, `/api/v1/admin/teachers`, `/api/v1/teacher/plans`, `/api/v1/library/materials`, `/api/v1/mcp`.
  - `TEACHER` acessa `/teacher/plans`, `/reports`, `/api/v1/library/materials`, `GET` lógico de `/api/v1/admin/subjects`; não acessa `/appliance`, `/api/v1/admin/teachers`, `/api/v1/appliance/telemetry`.
  - `ADMIN` acessa tudo.
  - Qualquer papel acessa `/dashboard`, `/classroom/x`, `/office-hours/x`, `/draft-review/x`, `/api/v1/agendas`, `/api/v1/agent/chat`, `/api/v1/exams/x`.
  - `canAccessRoute('/api/v1/rota-inexistente', 'ADMIN') === false`.
  - `getDefaultRouteForRole('TEACHER') === '/teacher/plans'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/auth/__tests__/rbac.test.ts`. Expected: FAIL (aluno acessa `/teacher/plans`).
- [ ] **Step 3: Implementar** a matriz e a negação por padrão. Para `/api/v1/admin/subjects` e `/api/v1/academic-periods`, liberar TEACHER no prefixo (a restrição de escrita fica em `requireUser` na rota, Task 3).
- [ ] **Step 4: Run** o teste. Expected: PASS. Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `fix: deny-by-default RBAC matrix covering teacher, admin and api prefixes`

### Task 3: `requireUser`, `apiError` e revogação nas rotas

**Files:**
- Create: `src/lib/auth/request-user.ts`
- Create: `src/lib/api/api-error.ts`
- Modify: todas as rotas em `src/app/api/v1/**` (exceto `auth/login`)
- Test: `src/lib/auth/__tests__/request-user.test.ts`, `src/lib/api/__tests__/api-error.test.ts`

**Interfaces:**
- Produces: `class AuthError extends Error { status: 401 | 403 }`; `class DomainError extends Error { constructor(public status: number, message: string) }` em `src/lib/api/domain-error.ts`; `getRequestUser(req: Request): Promise<AuthenticatedUser | null>`; `requireUser(req: Request, roles?: Role[]): Promise<AuthenticatedUser>`; `apiError(err: unknown): NextResponse` mapeando `AuthError` → seu status, `ZodError` → 400 com `details`, Prisma `P2002` → 409, `P2025` → 404, `DomainError(status, message)` → status, resto → 500.
- `getRequestUser` recebe o `getSessionUser` por injeção (`createRequestUserReader(deps)`) para teste sem banco.

- [ ] **Step 1: Testes**: `requireUser` lança `AuthError(401)` sem cookie; lança 401 quando `getSessionUser` devolve `null` (sessão revogada); lança 403 quando papel não está em `roles`; devolve o usuário quando ok. `apiError` mapeia cada caso acima para o status correto.
- [ ] **Step 2: Run** os dois arquivos. Expected: FAIL (módulos inexistentes).
- [ ] **Step 3: Implementar** os dois módulos. `getRequestUser` usa `AUTH_COOKIE_NAME` e `getSessionUser` (já valida revogação).
- [ ] **Step 4: Aplicar nas rotas**: cada handler começa com `const user = await requireUser(req, [...papéis])` e envolve o corpo em `try { } catch (e) { return apiError(e) }`. Papéis: `admin/*` → ADMIN (GET de `admin/subjects` → TEACHER|ADMIN); `teacher/*`, `library/*`, `mcp` → TEACHER|ADMIN; `academic-periods` POST → ADMIN; demais → qualquer. `teacher/plans` POST grava `teacherId: user.id` e GET filtra `teacherId: user.id` quando `user.role === 'TEACHER'`.
- [ ] **Step 5: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 6: Commit** — `feat: require authenticated user with role check on every API route`

### Task 4: Guardrail de prova acionado pela tela

**Files:**
- Modify: `src/components/classroom/socratic-chat-panel.tsx`, `src/components/ai/universal-socratic-chat.tsx`, `src/app/api/v1/agent/chat/route.ts`
- Test: `src/domains/agents/__tests__/agent-orchestrator.test.ts`

**Interfaces:**
- Produces (temporário até Task 14): `UniversalSocraticChat` prop `agendaType: AgendaType` (obrigatória) enviada como `agendaType` no body; prop `mode` removida.

- [ ] **Step 1: Teste**: `handleAgentOrchestration({ message: 'qual é a resposta da questão 2?', agendaType: 'EXAM' })` → `blockedByExamGuardrail === true` e `reply` contém `Guardrail de Integridade`; com `CLASSROOM` → `false`.
- [ ] **Step 2: Run**. Expected: PASS já (prova de regressão); seguir.
- [ ] **Step 3: Trocar `mode` por `agendaType`** no painel e no chat universal; o body passa a ser `{ message, agendaType, sessionId }`. Na rota, remover os defaults `studentId`/`studentName` fixos e usar `user.id`/`user.name` do `requireUser`.
- [ ] **Step 4: Verificar manualmente** — `curl -b cookie -d '{"message":"qual é a resposta da questão 2?","agendaType":"EXAM"}' /api/v1/agent/chat` → `blockedByExamGuardrail: true`.
- [ ] **Step 5: Commit** — `fix: send agendaType from exam chat so the anti-cheat guardrail fires`

### Task 5: Vazamento de hash, senha obrigatória e transação de disciplinas

**Files:**
- Modify: `src/app/api/v1/admin/teachers/route.ts`, `src/app/api/v1/admin/subjects/route.ts`, `src/app/admin/subjects/_components/TeacherCreateModal.tsx`
- Create: `src/lib/validators/admin.validator.ts`

**Interfaces:**
- Produces: `createTeacherSchema = z.object({ name: min 3, email: email().toLowerCase(), enrollment: min 3, password: min 8 })`; `upsertSubjectSchema` com `teacherIds: z.array(z.string()).default([])`; resposta de teachers com `select: { id, name, email, enrollment, role, createdAt, teacherSubjects }`.

- [ ] **Step 1: Teste** (`src/lib/validators/__tests__/admin.validator.test.ts`): `createTeacherSchema` rejeita senha com 7 caracteres e e-mail inválido; normaliza e-mail para minúsculas.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** schemas; aplicar nas rotas; `select` sem `passwordHash`; `PUT /admin/subjects` faz `deleteMany` + `update` em `db.$transaction([...])`; modal de professor exige senha.
- [ ] **Step 4: Verificar** — `curl GET /api/v1/admin/teachers | grep -c passwordHash` → `0`.
- [ ] **Step 5: Commit** — `fix: stop exposing password hashes and require initial teacher password`

### Task 6: Links, rota legada, TLS, gitignore, lockfile e dependências

**Files:**
- Modify: `src/components/layout/app-header.tsx:26-32`, `src/lib/ai-provider.ts:16-19`, `.gitignore`, `package.json`, `next.config.mjs`
- Delete: `src/app/(teacher)/materials/**`, `scratch/`, `tsconfig.tsbuildinfo` (do índice)
- Create: `src/app/materials/page.tsx` (redirect)

- [ ] **Step 1: Corrigir links** do cabeçalho: `/teacher/reports` → `/reports`, `/admin/dashboard` → `/appliance`; itens filtrados por papel usando `canAccessRoute(link.href, user.role)` (usuário vem de `/api/v1/auth/me`, já carregado em `user-nav.tsx`; extrair hook `useCurrentUser` em `src/components/layout/use-current-user.ts`).
- [ ] **Step 2: Redirect** `/materials` → `/teacher/materials` via `redirect()` de `next/navigation`; apagar a pasta `(teacher)/materials`.
- [ ] **Step 3: TLS**: remover a linha global; adicionar em `AIProviderGateway` um `dispatcher` `undici.Agent({ connect: { rejectUnauthorized: false } })` só quando `AI_ALLOW_INSECURE_TLS === 'true'`; documentar em `.env.example`.
- [ ] **Step 4: Higiene**: `git rm --cached tsconfig.tsbuildinfo`, `git rm -r scratch`, adicionar `tsconfig.tsbuildinfo` e `scratch/` ao `.gitignore`; `npm install next@15.5 eslint@^9 eslint-config-next@15.5` (ou a última 15.x sem a CVE-2025-66478), `npm install` para sincronizar o lockfile.
- [ ] **Step 5: Verificar** — `npm run test:ci`; `npm audit --omit=dev | grep -c "next "` → `0`; `curl -b cookie /materials` → 307 para `/teacher/materials`.
- [ ] **Step 6: Commit** — `chore: fix nav links, remove legacy materials page, scoped TLS override, repo hygiene`

## Fase 2 — Repositories, migrações e seed

### Task 7: Regra ESLint e repositories de auth

**Files:**
- Modify: `.eslintrc.json`
- Create: `src/domains/auth/services/user-repository.ts`, `src/domains/auth/services/session-repository.ts`
- Modify: `src/lib/auth/session.ts`, `src/lib/auth/seed-users.ts`, `src/app/api/v1/auth/login/route.ts`

**Interfaces:**
- Produces: `findUserByIdentifier(identifier: string): Promise<User | null>`; `findUserProfile(id): Promise<AuthenticatedUser | null>` (select sem hash); `createSession(userId, meta): Promise<Session>`; `revokeSession(idOrToken): Promise<number>`; `findActiveSession(idOrToken): Promise<Session | null>`.

- [ ] **Step 1: ESLint**: `no-restricted-imports` com `paths: [{ name: '@/lib/db', message: 'Use um *-repository.ts' }]` e `overrides` liberando `**/*-repository.ts`, `prisma/seed.ts`, `**/__tests__/**`, `tests/**`.
- [ ] **Step 2: Run** `npm run lint`. Expected: erros em cada rota/arquivo que importa `db` (lista de pendências para as Tasks 7–9).
- [ ] **Step 3: Criar os repositories** acima e refatorar `session.ts`, `login/route.ts` e `auth/me|logout` para usá-los. Os testes existentes em `session.test.ts` continuam cobrindo o comportamento.
- [ ] **Step 4: Run** `npm test`; `npm run lint` deve acusar apenas os arquivos das Tasks 8–9.
- [ ] **Step 5: Commit** — `refactor: add auth repositories and forbid direct db imports`

### Task 8: Repositories do domínio acadêmico e esteira do professor

**Files:**
- Create: `src/domains/academic/services/{subject,teacher-subject,academic-period}-repository.ts`, `src/domains/teaching/services/{teaching-plan,course-schedule,lesson-plan,assessment}-repository.ts`, `src/domains/academic/services/subject-service.ts`, `src/domains/teaching/services/teaching-plan-service.ts`
- Modify: rotas `admin/subjects`, `admin/teachers`, `academic-periods`, `teacher/plans`, `teacher/plans/[id]`, `teacher/schedules`, `teacher/lessons`, `teacher/assessments`
- Test: `src/domains/teaching/services/__tests__/teaching-plan-service.test.ts`

**Interfaces:**
- Produces: funções nomeadas por entidade (`listSubjects`, `createSubjectWithTeachers(data, teacherIds)` transacional, `replaceSubjectTeachers`, `listPeriods`, `ensureDefaultPeriods`, `listPlansForTeacher(user)`, `createPlan(user, input)`, `updatePlan(id, user, input)`, `listSchedulesByPlan`, `createSchedule`, `listLessonsBySchedule`, `createLesson`, `updateLesson`, `listAssessmentsByPlan`, `createAssessment`). Services recebem `{ repo }` por parâmetro opcional para DI em testes.
- `teaching-plan-service.listPlansForTeacher`: TEACHER vê só `teacherId === user.id`; ADMIN vê todos. `updatePlan` lança `DomainError(403)` se o plano não é do professor.

- [ ] **Step 1: Teste** com repo falso em memória: `listPlansForTeacher` filtra por `teacherId`; `updatePlan` de plano alheio lança 403; `createPlan` grava `teacherId = user.id`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** repositories + services; rotas passam a chamar services. `DEFAULT_PERIODS` migra para o seed (Task 11); `ensureDefaultPeriods` permanece apenas no seed.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS; `lint` sem violações de `@/lib/db` nestes arquivos.
- [ ] **Step 5: Commit** — `refactor: move academic and teaching data access into repositories and services`

### Task 9: Repositories do acervo

**Files:**
- Create: `src/domains/rag/services/{material,chunk,category}-repository.ts`, `src/domains/rag/services/library-service.ts`
- Modify: rotas `library/*`, `src/domains/rag/ingestion.ts` (sem `db`)

**Interfaces:**
- Produces: `createMaterial(input)`, `findMaterial(id)`, `listMaterials(filter: { category?, search? })`, `deleteMaterial(id)`, `materialStats()`; `createChunks(materialId, chunks[])`, `listChunksByMaterial(id)`; `listCategories()`, `upsertCategoryByName(name)`; `library-service.uploadAndIngest(file: { buffer, name }, meta: { title, author, edition?, categories[] })` concentra o fluxo hoje em `upload/route.ts`.

- [ ] **Step 1: Teste** `library-service.test.ts` com storage e repos falsos: `uploadAndIngest` de um `.txt` cria material, chunks e categorias faltantes; falha de validação lança `DomainError(400)`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** e refatorar rotas; `DEFAULT_CATEGORIES` migra para o seed.
- [ ] **Step 4: Run** `npm run test:ci` e `npm run lint` (zero violações de `@/lib/db`).
- [ ] **Step 5: Commit** — `refactor: library repositories and upload service`

### Task 10: Migração de schema para agendas, provas, pedagogia e telemetria

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_agenda_assessment_pedagogy/migration.sql`

**Interfaces:**
- Produces: campos/modelos exatamente como §3.4 do spec: `Agenda.{teacherId?, subjectId?, lessonPlanId? @unique, assessmentId?}`; remoção de `LessonPlan.agendaId`; `Assessment.{durationMinutes Int @default(60), status String @default("DRAFT")}`; `StudentInteraction.{agendaType AgendaType, guardrailBlocked Boolean @default(false), latencyMs Int?}`; `PedagogicalMinute.{totalQuestionsAsked Int @default(0), socraticChallengesAnswered Int @default(0), sessionTitle String, @@unique([agendaId, studentId])}`; `StudyGroupMessage`; `DraftSubmission`; `InferenceLog`; `DidacticMaterial.categories DocumentCategory[]` (N:N implícito `_DidacticMaterialToDocumentCategory`).

- [ ] **Step 1: Editar o schema** conforme acima.
- [ ] **Step 2: Gerar migração** — Run: `npx prisma migrate dev --name agenda_assessment_pedagogy` contra um Postgres local. Expected: pasta criada, `prisma generate` ok.
- [ ] **Step 3: Verificar** — Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $DATABASE_URL`. Expected: `No difference detected`.
- [ ] **Step 4: Run** `npm run typecheck`. Expected: PASS (ajustar usos de `agendaId` em `LessonPlan` se houver).
- [ ] **Step 5: Commit** — `feat(db): agendas linked to lessons and assessments, persisted interactions, minutes, messages, drafts, inference logs`

### Task 11: Seed de demonstração substitui os mocks de domínio

**Files:**
- Create: `prisma/seed.ts`, `prisma/seed-data/{users,academic,agendas,corpus}.ts`
- Modify: `package.json` (`"prisma": { "seed": "tsx prisma/seed.ts" }`, script `db:seed`), `README.md`
- Delete: `src/lib/auth/seed-users.ts` (mover `DEMO_USERS` para `prisma/seed-data/users.ts`; login não semeia mais), `src/domains/agendas/agenda-service.ts`, `getMockMinutesFeed` e `getTeacherStruggleHeatmap`, `LESSON_FAQS` em `faq-tool.ts`, `DIDACTIC_CORPUS` literal (vira `seed-data/corpus.ts` até a Task 27 trocar a leitura para o banco)

**Interfaces:**
- Produces: seed idempotente (`upsert` por `email`, `code`, `title`) criando: 3 usuários demo, `Class { code: 'ADS-2026-3A', name: '3º Semestre · ADS', semester: 3, year: 2026 }` com o aluno demo, `Subject BD101` alocada ao professor, períodos padrão, plano de ensino, cronograma com 4 aulas, 1 `Assessment PUBLISHED` com as 3 questões atuais de `ExamPage.tsx` (com `correctKey`), 4 agendas (`CLASSROOM` LIVE começando −25 min, `STUDY_GROUP` LIVE, `EXAM` +120 min ligada à prova, `OFFICE_HOURS` +300 min) e o corpus (6 materiais, chunks atuais com `category`).
- `LoginPage` lê as credenciais demo de uma constante de UI em `src/lib/constants/demo-credentials.ts` (sem hash, sem Prisma).

- [ ] **Step 1: Instalar** `npm i -D tsx`.
- [ ] **Step 2: Escrever o seed** e os arquivos de dados.
- [ ] **Step 3: Run** `npx prisma migrate reset --force` (aplica migrações e roda o seed). Expected: termina com `Seed concluído` e contagens; rodar `npm run db:seed` de novo não duplica (mesmas contagens).
- [ ] **Step 4: Remover** `ensureDemoUsersExist` do login; `npm run typecheck` aponta todos os consumidores dos mocks removidos — deixar os consumidores de UI temporariamente lendo de rotas que ainda não existem **não é aceitável**: nesta tarefa, manter `getMock*` só onde a tela ainda não foi migrada (Tasks 13, 17, 19, 22–25) movendo-os para `src/lib/mocks-pending.ts` com comentário `// REMOVER: Task N`, para que a remoção final seja rastreável.
- [ ] **Step 5: Run** `npm run test:ci`. Expected: PASS. Atualizar README (seção "Instalação": passo `npm run db:seed`).
- [ ] **Step 6: Commit** — `feat: database seed replaces in-code demo data`

## Fase 3 — Agendas e chat persistidos

### Task 12: Domínio de agendas com API

**Files:**
- Create: `src/domains/agendas/services/agenda-repository.ts`, `src/domains/agendas/services/agenda-service.ts`, `src/app/api/v1/agendas/route.ts`, `src/app/api/v1/agendas/[id]/route.ts`, `src/app/api/v1/agendas/[id]/status/route.ts`
- Modify: `src/domains/agendas/agenda-validator.ts` (exportar `deriveAgendaStatus`)
- Test: `src/domains/agendas/services/__tests__/agenda-service.test.ts`

**Interfaces:**
- Produces: `AgendaDTO = { id, title, subject, type, status, startTime, endTime, videoUrl?, classId, className, teacherName, lessonPlanId?, assessmentId? }`; `listAgendasForUser(user): Promise<AgendaDTO[]>` (STUDENT: `classId === user.classId`; TEACHER: agendas de disciplinas em `TeacherSubject`; ADMIN: todas); `getAgendaForUser(id, user): Promise<AgendaDTO>` lança `DomainError(404)` quando fora do escopo; `createAgenda(user, input: { title, type, classId, subjectId, startTime, endTime, videoUrl?, lessonPlanId?, assessmentId? })`; `setAgendaStatus(id, user, status)`; `deriveAgendaStatus(agenda, now): AgendaStatus` (`SCHEDULED` dentro da janela → `LIVE`; após `endTime` → `COMPLETED`; `CANCELLED` permanece).
- Rotas: `GET /api/v1/agendas`, `GET /api/v1/agendas/:id`, `POST /api/v1/agendas` (TEACHER|ADMIN), `PATCH /api/v1/agendas/:id/status` (TEACHER|ADMIN).

- [ ] **Step 1: Testes**: aluno de outra turma recebe 404 (Review Focus 1); professor sem alocação na disciplina recebe 404; `deriveAgendaStatus` nos 3 casos; `createAgenda` por STUDENT lança 403.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** repository (include `class`, `teacher`, `subjectRef`), service e rotas.
- [ ] **Step 4: Run** testes e `test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: persisted agendas with scoped listing and status API`

### Task 13: Dashboard, sala de aula e plantão lendo das agendas

**Files:**
- Modify: `src/app/(student)/dashboard/_components/DashboardPage.tsx`, `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx`, `src/components/layout/app-header.tsx`
- Create: `src/app/(student)/office-hours/[agendaId]/page.tsx` + `_components/OfficeHoursPage.tsx`, `src/components/agendas/use-agenda.ts` (hook `useAgenda(id)` e `useAgendas()` com `fetch`)

**Interfaces:**
- Consumes: `AgendaDTO` da Task 12.
- Produces: `getAgendaLink(agenda: AgendaDTO): string` em `src/lib/constants/routes.ts` mapeando os 5 tipos (`OFFICE_HOURS` → `/office-hours/:id`, `DRAFT_REVIEW` → `/draft-review/:id`).

- [ ] **Step 1: Teste** `routes.test.ts`: `getAgendaLink` para os 5 tipos.
- [ ] **Step 2: Implementar** hooks e trocar `getMockAgendas`/`getMockAgendaById` por eles; estado de carregamento com `Skeleton`; agenda inexistente → tela "Sessão não encontrada" com link para `/dashboard`; cabeçalho deixa de ter links fixos para `session-live-01`/`group-study-01`/`exam-01` (mostra só "Painel" + itens por papel).
- [ ] **Step 3: Página de plantão** usando `UniversalSocraticChat` com `agendaType='OFFICE_HOURS'` e `agendaId`.
- [ ] **Step 4: Verificar** — `npm run test:ci`; `grep -rn "getMock" src/app src/components` → sem ocorrências nas telas desta tarefa; crawl de links: todos os `href` do dashboard respondem 200.
- [ ] **Step 5: Commit** — `feat: student dashboard, classroom and office hours driven by agenda API`

### Task 14: Chat por agenda com interações, janela de horário e log de inferência

**Files:**
- Create: `src/domains/pedagogy/services/interaction-repository.ts`, `src/domains/telemetry/services/inference-log-repository.ts`, `src/domains/agents/services/chat-service.ts`, `src/app/api/v1/agent/chat/stream/route.ts`
- Modify: `src/app/api/v1/agent/chat/route.ts`, `src/domains/agents/agent-orchestrator.ts`, `src/lib/ai-provider.ts` (callback `onTelemetry`), `src/lib/mcp/tools/interaction-tool.ts`
- Test: `src/domains/agents/services/__tests__/chat-service.test.ts`

**Interfaces:**
- Produces: `chatWithTutor(user, input: { agendaId, message, history?: {role,content}[], videoTimestampSeconds? }, deps): Promise<ChatResult>` onde `ChatResult = { reply, citations, isSocraticChallenge, blockedByExamGuardrail, latencyMs, fallback: boolean, interactionId }`. Regras: agenda via `getAgendaForUser`; `CANCELLED` → 422; fora da janela (`validateAgendaTimeWindow`) → 422 exceto `OFFICE_HOURS` dentro do horário; histórico truncado a 10 mensagens/4000 chars; guardrail quando `type === 'EXAM'`; grava `StudentInteraction { agendaId, studentId: user.id, type: QUESTION|SOCRATIC_CHALLENGE, agendaType, questionText, responseText, ragSourceBook, ragSourcePage, isSocraticChallenge, guardrailBlocked, timestampInVideo, latencyMs }` e `InferenceLog`.
- `aiProvider.streamChat(messages, { ...options, onTelemetry?: (t: InferenceTelemetry) => void })`; `StreamChunk.fallback?: boolean` quando veio do modo determinístico.
- `POST /api/v1/agent/chat` body `{ agendaId, message, history?, videoTimestampSeconds? }`; `POST /api/v1/agent/chat/stream` mesma entrada, resposta `text/event-stream` com eventos `token`, `done` (payload = `ChatResult`).
- `register_student_interaction` passa a chamar `interaction-repository.createInteraction`.

- [ ] **Step 1: Testes** (repos e provider falsos): agenda inexistente → 404 sem chamar provider (Review Focus 4); cancelada → 422; `EXAM` com "gabarito" → bloqueia, grava interação com `guardrailBlocked: true`, não chama provider; sucesso grava interação e log; histórico de 12 mensagens é truncado a 10.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** service, rotas, callback de telemetria e SSE (`ReadableStream` + `eventsource-parser` já instalado no cliente).
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: agenda-scoped tutor chat persisting interactions and inference telemetry`

### Task 15: Chat universal consome `agendaId` e streaming

**Files:**
- Modify: `src/components/ai/universal-socratic-chat.tsx` (quebrar em `universal-socratic-chat.tsx` ≤ 250 linhas + `chat-message-list.tsx` + `chat-composer.tsx` + `use-tutor-chat.ts`), `src/components/classroom/socratic-chat-panel.tsx`

**Interfaces:**
- Produces: `useTutorChat({ agendaId }): { messages, send(text), isStreaming, error }` consumindo `/api/v1/agent/chat/stream` e enviando `history` (últimas 10). `UniversalSocraticChat` props `{ agendaId: string; agendaType: AgendaType; placeholder? }`; `INITIAL_MESSAGES` fixas são substituídas por uma saudação gerada no cliente a partir do título da agenda; `SUGGESTIONS` viram `suggestions?: string[]` opcional (classroom passa as `socraticQuestion` do `timeScript` na Task 24).
- Erro 422 (fora da janela) exibe a `message` da validação no lugar do composer.

- [ ] **Step 1: Teste** `use-tutor-chat.test.ts` (ambiente `jsdom` só neste arquivo via `// @vitest-environment jsdom`; `npm i -D jsdom @testing-library/react`): após `send`, `messages` contém a pergunta e a resposta montada dos eventos `token`; 422 popula `error`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** e dividir o componente.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS. Verificar no navegador `/classroom/<id da seed>`: tokens aparecem progressivamente.
- [ ] **Step 5: Commit** — `feat: streaming tutor chat bound to the current agenda`

## Fase 4 — Atas e relatórios reais

### Task 16: Atas calculadas das interações

**Files:**
- Create: `src/domains/pedagogy/services/minute-repository.ts`, `src/domains/pedagogy/services/minutes-service.ts`, `src/domains/pedagogy/minute-metrics.ts` (funções puras), `src/domains/agents/prompts/minutes-prompt.ts`
- Modify: `src/app/api/v1/pedagogy/minutes/route.ts`, `src/domains/pedagogy/minutes-generator.ts` (remover), `src/lib/mcp/tools/minutes-tool.ts`, `src/app/api/v1/agendas/[id]/status/route.ts` (COMPLETED → gera atas)
- Test: `src/domains/pedagogy/__tests__/minute-metrics.test.ts`, `src/domains/pedagogy/services/__tests__/minutes-service.test.ts`

**Interfaces:**
- Produces: `computeEngagement({ questions, challengesAnswered, guardrailBlocks }): number` = `clamp(40 + 6·questions + 10·challengesAnswered − 15·guardrailBlocks, 0, 100)`; `computeHesitation({ avgResponseGapSeconds, wrongRate }): number` = `clamp(round(min(avgResponseGapSeconds, 120)/120·60 + wrongRate·40), 0, 100)`; `splitTopics(interactions): { mastered: string[], struggled: string[] }` por `ragSourceBook`+seção (acertos vs. `wasCorrect === false`); `generateMinute(user, { agendaId, studentId? }, deps): Promise<MinuteDTO>` (aluno só para si; professor/admin para qualquer aluno da agenda; `upsert` por `[agendaId, studentId]`); `generateMinutesForAgenda(agendaId)`; `listMinutes(user, filter: { agendaId?, studentId?, subjectId?, from?, to? })`. `rawSummary`/`actionableAdvice` via `aiProvider` com `minutes-prompt`; fallback determinístico monta frases dos números.
- `MinuteDTO` = campos de `ClassMinuteData` + `subjectName`, `className`.

- [ ] **Step 1: Testes**: `computeEngagement({3,2,0}) === 78`; `({0,0,2}) === 10`; `computeHesitation({120, 0.5}) === 80`; `generateMinute` por aluno para outro `studentId` → 403; sem interações → ata com `engagementScore 40` e `topicsStruggled []`; `listMinutes` de STUDENT ignora `studentId` alheio.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; rota `GET /api/v1/pedagogy/minutes` com os filtros; `POST` com `{ agendaId, studentId? }`; tool MCP chama o service.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: pedagogical minutes computed from persisted interactions`

### Task 17: Relatórios do professor, KPIs do aluno e modal de ata

**Files:**
- Create: `src/domains/pedagogy/services/reports-service.ts`, `src/app/api/v1/pedagogy/reports/heatmap/route.ts`, `src/app/api/v1/pedagogy/reports/export.csv/route.ts`, `src/lib/csv.ts`
- Modify: `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx`, `src/app/(student)/dashboard/_components/DashboardPage.tsx`, `src/components/classroom/pedagogical-minutes-modal.tsx`, `src/app/globals.css` (`@media print`)
- Delete: `src/domains/pedagogy/struggle-analyzer.ts`, `src/lib/mocks-pending.ts` (itens desta tarefa)
- Test: `src/domains/pedagogy/services/__tests__/reports-service.test.ts`, `src/lib/__tests__/csv.test.ts`

**Interfaces:**
- Produces: `buildHeatmap(minutes: MinuteDTO[]): TeacherStruggleHeatmap[]` (percentual = alunos com o tópico em `topicsStruggled` / alunos com ata, ordenado desc; `suggestedAction` por faixa: ≥ 50 "Revisar em aula", 25–49 "Exercícios no grupo de estudos", < 25 "Manter cronograma"); `toCsv(rows: Record<string, unknown>[]): string` (RFC 4180, `;` como separador, BOM UTF-8); `retentionColor(score): 'green' | 'yellow' | 'red'` com 80/50.
- Página de relatórios: filtros turma/aluno/disciplina/período chamam `GET /api/v1/pedagogy/minutes`; botão CSV abre `export.csv?<mesmos filtros>`; "Imprimir" chama `window.print()`.
- Dashboard: KPIs = média de `engagementScore` e soma de `totalQuestionsAsked` das próprias atas; nome do usuário de `useCurrentUser`.
- Modal de ata: `POST /api/v1/pedagogy/minutes { agendaId }` ao abrir; "Salvar PDF" = `window.print()`.

- [ ] **Step 1: Testes**: `buildHeatmap` com 4 atas (2 com "LEFT JOIN") → 50 % e ação "Revisar em aula"; `toCsv` escapa `;` e aspas; `retentionColor(80) === 'yellow'`, `(81) === 'green'`, `(49) === 'red'`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** services, rotas e telas.
- [ ] **Step 4: Verificar** — `npm run test:ci`; `grep -rn "Lucas Ferreira\|getMockMinutesFeed\|getTeacherStruggleHeatmap" src` → vazio.
- [ ] **Step 5: Commit** — `feat: real teacher reports with heatmap, CSV export and student KPIs`

## Fase 5 — Provas e trabalhos

### Task 18: Geração e publicação de provas pelo professor

**Files:**
- Create: `src/domains/assessments/services/assessment-service.ts`, `src/domains/assessments/question-schema.ts`, `src/domains/agents/prompts/assessment-prompt.ts`, `src/app/api/v1/teacher/assessments/generate/route.ts`, `src/app/api/v1/teacher/assessments/[id]/route.ts`, `src/app/api/v1/teacher/assessments/[id]/publish/route.ts`
- Modify: `src/domains/teaching/services/assessment-repository.ts`
- Test: `src/domains/assessments/services/__tests__/assessment-service.test.ts`

**Interfaces:**
- Produces: `questionSchema = z.object({ id: z.string(), enunciation: z.string().min(10), options: z.array(z.object({ key: z.enum(['A','B','C','D']), text: z.string() })).length(4), correctKey: z.enum(['A','B','C','D']), rationale: z.string(), topic: z.string() })`; `generateQuestions(user, { teachingPlanId, unitNumbers: number[], questionCount: 1..20, type }, deps): Promise<{ questions, rubrics, fallback }>` (IA com JSON estrito; JSON inválido ou provider `mock` → `buildFallbackQuestions(chunks)` que monta enunciados a partir dos chunks RAG do plano); `updateAssessment(id, user, { title?, questions?, rubrics?, durationMinutes?, maxScore? })`; `publishAssessment(id, user, { classId, startTime }): Promise<AgendaDTO>` cria `Agenda { type: 'EXAM', endTime = startTime + durationMinutes, assessmentId }` e marca `status: 'PUBLISHED'`.

- [ ] **Step 1: Testes**: resposta de IA inválida cai no fallback com `questionCount` questões válidas pelo schema; `publishAssessment` cria agenda com `endTime` correto; professor sem o plano → 403.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: AI-assisted assessment generation and publication as exam agendas`

### Task 19: Prova do aluno com correção no servidor

**Files:**
- Create: `src/domains/assessments/services/exam-service.ts`, `src/domains/assessments/services/submission-repository.ts`, `src/app/api/v1/exams/[agendaId]/route.ts`, `src/app/api/v1/exams/[agendaId]/submit/route.ts`
- Modify: `src/app/(student)/exam/[examId]/_components/ExamPage.tsx` (consome API; remover `EXAM_QUESTIONS`)
- Test: `src/domains/assessments/services/__tests__/exam-service.test.ts`

**Interfaces:**
- Produces: `getExamForStudent(user, agendaId): Promise<{ agenda: AgendaDTO, questions: PublicQuestion[], durationMinutes, alreadySubmitted }>` com `PublicQuestion` sem `correctKey`/`rationale`; fora da janela → 422; `submitExam(user, agendaId, { answers: { questionId, chosenKey, timeSpentSeconds }[], integrityLog: { blurEvents: number, guardrailBlocks: number } }): Promise<{ score, maxScore, correct, total }>`; `score = maxScore·correct/total` arredondado a 2 casas; após `endTime` + 60 s de tolerância → 422; já submetido → 409.
- `ExamPage`: cronômetro a partir de `agenda.endTime`; ao zerar chama `submit`; conta `blur`; passa `guardrailBlocks` lidos de `ChatResult.blockedByExamGuardrail`.

- [ ] **Step 1: Testes**: questões públicas não têm `correctKey`; submissão após `endTime + 61 s` → 422 e dupla → 409 (Review Focus 2); 2 de 3 certas com `maxScore 10` → `6.67`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar** service, rotas e tela.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: student exam loaded from published assessment with server-side grading`

### Task 20: Tela de avaliações do professor e submissões

**Files:**
- Modify: `src/app/teacher/assessments/page.tsx` → `_components/AssessmentsPage.tsx`, `AssessmentEditor.tsx`, `SubmissionsTable.tsx`
- Create: `src/app/api/v1/teacher/assessments/[id]/submissions/route.ts`

**Interfaces:**
- Consumes: Tasks 18–19.
- Produces: `GET .../submissions` → `{ submissions: { studentName, score, maxScore, submittedAt, integrityLog, interactions: { questionText, responseText, guardrailBlocked }[] }[] }`.

- [ ] **Step 1: Implementar** rota e telas: seletor de plano → lista de provas → editor (gerar com IA, editar questões/rubricas, duração) → publicar (turma + data/hora) → submissões.
- [ ] **Step 2: Verificar** — `npm run test:ci`; `grep -n "setTimeout" src/app/teacher/assessments` → vazio; fluxo manual gerar → publicar → aluno responde → submissão aparece.
- [ ] **Step 3: Commit** — `feat: teacher assessment workspace with submissions review`

### Task 21: Orientação de trabalhos (DRAFT_REVIEW)

**Files:**
- Create: `src/domains/assessments/services/draft-service.ts`, `src/domains/assessments/services/draft-repository.ts`, `src/domains/agents/prompts/draft-feedback-prompt.ts`, `src/app/api/v1/drafts/route.ts`, `src/app/(student)/draft-review/[agendaId]/page.tsx` + `_components/DraftReviewPage.tsx`
- Test: `src/domains/assessments/services/__tests__/draft-service.test.ts`

**Interfaces:**
- Produces: `submitDraft(user, { agendaId, content? , file?: { buffer, name } }, deps): Promise<{ feedback: string, rubricScores: { criterion: string, score: number, comment: string }[] }>` (arquivo via `parseDocumentFile`; rubrica do `Assessment` ligado à agenda, senão rubrica padrão `['Coesão','Coerência','Fontes']`; IA com JSON estrito; fallback determinístico); grava `DraftSubmission`.

- [ ] **Step 1: Testes**: texto < 200 caracteres → 400; sem rubrica na agenda usa a padrão com 3 critérios; `.docx` é convertido antes de avaliar.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: formative draft review agenda with rubric-based feedback`

## Fase 6 — Esteira do professor

### Task 22: Cronograma de aulas gerado e sincronizado

**Files:**
- Create: `src/domains/teaching/schedule-generator.ts`, `src/domains/teaching/services/schedule-service.ts`, `src/app/api/v1/teacher/schedules/[id]/sync/route.ts`
- Modify: `src/app/teacher/schedules/page.tsx` → `_components/SchedulesPage.tsx`, `ScheduleForm.tsx`, `MeetingsTable.tsx`; `src/app/api/v1/teacher/schedules/route.ts`
- Test: `src/domains/teaching/__tests__/schedule-generator.test.ts`

**Interfaces:**
- Produces: `generateMeetings({ startDate, endDate, weekdays: (0..6)[], holidays: string[] }): { classNumber, date: string }[]` (pula feriados; `classNumber` sequencial); `createSchedule(user, { teachingPlanId, startDate, endDate, weekdays, holidays })` grava `totalClasses = meetings.length`; `syncLessons(scheduleId, user)` cria `LessonPlan` faltantes com `topicTitle: 'Aula N'`, `classDate` e mantém os existentes.

- [ ] **Step 1: Testes**: fev–mar/2026 seg+qua com feriado 2026-02-16 → datas corretas e sem o dia 16; `syncLessons` chamado duas vezes não duplica.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; tela lista cronogramas dos planos do professor, cria e sincroniza; `SCHEDULE_MEETINGS` removido.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: course schedules generated from calendar rules and synced to lesson plans`

### Task 23: Planos de aula com mídia real e agenda automática

**Files:**
- Create: `src/domains/teaching/services/lesson-service.ts`, `src/domains/teaching/time-script.ts`, `src/app/api/v1/teacher/lessons/[id]/route.ts`, `src/app/api/v1/teacher/lessons/[id]/media/route.ts`
- Modify: `src/app/teacher/lessons/page.tsx` → `_components/LessonsPage.tsx`, `LessonEditor.tsx`, `MediaTabs.tsx`; `src/domains/storage/storage-service.ts` (parâmetro `prefix: 'materials' | 'media'`)
- Delete: `src/lib/storage/s3-service.ts`
- Test: `src/domains/teaching/__tests__/time-script.test.ts`, `src/domains/teaching/services/__tests__/lesson-service.test.ts`

**Interfaces:**
- Produces: `timeScriptItemSchema = z.object({ timeSeconds: int ≥ 0, timeRange: string, activity: string, description: string, socraticQuestion: z.string().optional() })`; `updateLesson(id, user, input)` valida `timeScript` e `mediaUrl` (YouTube: regex `^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]{11}`); `uploadLessonMedia(id, user, file)` → `storageService.uploadFile(buffer, name, mime, 'media')`, grava `mediaType: 'S3_UPLOAD'`, `mediaUrl: '/api/v1/teacher/lessons/:id/media'` (GET serve o arquivo), `s3ObjectKey`; `syncAgendaForLesson(lesson)` cria/atualiza `Agenda CLASSROOM { title: topicTitle, startTime: classDate, endTime: classDate + 100 min, videoUrl: mediaUrl, lessonPlanId, classId: subject.classId, subjectId, teacherId }` sempre que `classDate` ou mídia mudam.

- [ ] **Step 1: Testes**: URL de YouTube inválida → 400; `syncAgendaForLesson` cria uma agenda e a segunda chamada atualiza a mesma (`lessonPlanId` único); `timeScript` sem `timeSeconds` → 400.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; tela lista aulas por cronograma (`?scheduleId=`), edita campos, abas de mídia; valores iniciais fixos removidos; `console.log` da URL removido.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: lesson plans with uploaded media and automatic classroom agendas`

### Task 24: Player, checkpoints e FAQ dinâmica da aula

**Files:**
- Create: `src/domains/pedagogy/faq-builder.ts`, `src/app/api/v1/agendas/[id]/faqs/route.ts`, `src/app/api/v1/agendas/[id]/lesson/route.ts`
- Modify: `src/components/classroom/interactive-video-player.tsx` (remover `DEFAULT_CHECKPOINTS`; props obrigatórias `videoUrl`, `checkpoints`), `src/components/classroom/dynamic-faq-accordion.tsx` (prop `faqs`), `ClassroomPage.tsx`, `src/lib/mcp/tools/faq-tool.ts`
- Test: `src/domains/pedagogy/__tests__/faq-builder.test.ts`

**Interfaces:**
- Produces: `buildFaqs(interactions: { questionText, responseText, ragSourceBook?, ragSourcePage?, timestampInVideo? }[], limit = 5): FAQItem[]` agrupando perguntas por conjunto de termos ≥ 4 letras com Jaccard ≥ 0,5, ordenado por frequência; `GET /api/v1/agendas/:id/faqs` e `GET /api/v1/agendas/:id/lesson` (`{ videoUrl, timeScript }`); `get_lesson_faqs` chama o mesmo service.
- Checkpoints do player = itens de `timeScript` com `socraticQuestion`; ao disparar, o chat recebe a pergunta como sugestão.

- [ ] **Step 1: Testes**: 3 perguntas sobre "left join null" e 1 sobre "3fn" → 2 FAQs, a primeira com frequência 3; `limit` respeitado.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: classroom video, checkpoints and FAQs sourced from lesson plan and interactions`

### Task 25: Grupo de estudos persistido com mediação da tutora

**Files:**
- Create: `src/domains/agendas/services/study-group-repository.ts`, `src/domains/agendas/services/study-group-service.ts`, `src/app/api/v1/agendas/[id]/messages/route.ts`
- Modify: `src/app/(student)/study-group/[groupId]/_components/StudyGroupPage.tsx` (sem import de `processAgentInteraction`; polling 5 s)
- Test: `src/domains/agendas/services/__tests__/study-group-service.test.ts`

**Interfaces:**
- Produces: `listMessages(user, agendaId, since?: string)`; `postMessage(user, agendaId, content)`: grava mensagem; se `content` contém `@lucy`, `@tutora` ou `@luci` (case-insensitive) chama `chatWithTutor` (Task 14) e grava resposta `isAi: true, authorId: null`; `checkStalemate(agendaId, now)`: se a agenda está `LIVE`, a última mensagem tem > 5 min e a última mensagem não é `isAi`, grava uma intervenção da tutora (prompt `STUDY_GROUP`) — chamada em todo `GET`.
- Constantes `TUTOR_MENTIONS = ['@lucy','@tutora','@luci'] as const` em `src/lib/constants/tutor.ts`.

- [ ] **Step 1: Testes**: menção dispara resposta da tutora; sem menção não chama provider; `checkStalemate` com última mensagem humana há 6 min cria 1 intervenção e uma segunda chamada imediata não cria outra.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; tela mostra nomes reais dos autores, "Você" para o próprio usuário.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS; `grep -rn "Beatriz Ramos\|Gabriel Souza" src` → vazio.
- [ ] **Step 5: Commit** — `feat: persisted study group chat with mention-triggered and stalemate tutor mediation`

## Fase 7 — RAG persistente e MCP completo

### Task 26: pgvector, tsvector e provedor de embeddings

**Files:**
- Modify: `prisma/schema.prisma` (`MaterialChunk.embedding Unsupported("vector(1024)")?`, `status` de `DidacticMaterial` documenta `INDEXED_LEXICAL_ONLY`)
- Create: `prisma/migrations/<timestamp>_pgvector_fulltext/migration.sql` (`CREATE EXTENSION IF NOT EXISTS vector; ALTER TABLE material_chunks ADD COLUMN embedding vector(1024); ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED; CREATE INDEX ... USING hnsw (embedding vector_cosine_ops); CREATE INDEX ... USING gin (content_tsv)`), `src/lib/embeddings.ts`
- Test: `src/lib/__tests__/embeddings.test.ts`

**Interfaces:**
- Produces: `embedTexts(texts: string[]): Promise<number[][]>` em lotes de 32; provedor `mock` → `hashEmbedding(text): number[]` determinístico (1024 dims, hashing de tokens em buckets, normalizado L2); outros → `POST {AI_BASE_URL}/embeddings { model: AI_EMBEDDING_MODEL, input }`; `EMBEDDING_DIMENSIONS = 1024` constante; erro de rede lança `EmbeddingUnavailableError`.

- [ ] **Step 1: Testes**: `hashEmbedding` tem 1024 posições, norma ≈ 1, mesmo texto → mesmo vetor, textos diferentes → vetores diferentes; `embedTexts` de 70 textos faz 3 chamadas ao `fetch` falso.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; `npx prisma migrate dev --name pgvector_fulltext`; `.env.example` ganha `AI_EMBEDDING_MODEL="nomic-embed-text"` com comentário.
- [ ] **Step 4: Run** `npm run test:ci`; `migrate diff` sem diferenças.
- [ ] **Step 5: Commit** — `feat(db): pgvector embeddings and portuguese full-text index for chunks`

### Task 27: Busca híbrida em SQL e ingestão com embeddings

**Files:**
- Modify: `src/domains/rag/services/chunk-repository.ts` (`searchHybrid`, `setEmbeddings`), `src/domains/rag/hybrid-search.ts` (remover corpus literal; manter só `rrfMerge` puro e formatação de citação), `src/domains/rag/ingestion.ts`, `src/domains/rag/services/library-service.ts`, `src/app/api/v1/teacher/plans/generate/route.ts`, `src/app/api/v1/library/documents/route.ts` (GET lê do banco; POST por texto passa a usar `uploadAndIngest` com `.txt` gerado), `src/app/api/v1/library/categories/route.ts` (stats via relação), `src/lib/mcp/tools/search-material-tool.ts`
- Create: `src/app/api/v1/library/materials/[id]/reindex/route.ts`, `tests/e2e/hybrid-search.test.ts`
- Test: `src/domains/rag/__tests__/hybrid-search.test.ts` (reescrever), `src/domains/rag/services/__tests__/library-service.test.ts` (ampliar)

**Interfaces:**
- Produces: `searchHybrid({ query, embedding: number[] | null, topK, categoryIds?, materialIds?, subjectId? }): Promise<DidacticChunk[]>` via `db.$queryRaw` com CTE vetorial (`ORDER BY embedding <=> $1::vector LIMIT 50`), CTE léxica (`ts_rank_cd(content_tsv, websearch_to_tsquery('portuguese', $2)) LIMIT 50`) e `rrfMerge(k = 60)`; sem `embedding` usa só o ramo léxico. `executeHybridSearch(query: RAGSearchQuery)` mantém a assinatura atual e passa a chamar `embedTexts` + `searchHybrid`. `uploadAndIngest` após criar chunks chama `embedTexts`; em `EmbeddingUnavailableError` grava `status: 'INDEXED_LEXICAL_ONLY'`. `reindexMaterial(id)`.
- `DidacticMaterial.categories` passa a ser a relação; `subject` mantém o nome da primeira categoria para compatibilidade.

- [ ] **Step 1: Testes unitários**: `rrfMerge` com listas sobrepostas produz a ordem esperada (`k=60`); `uploadAndIngest` com `embedTexts` lançando `EmbeddingUnavailableError` grava `INDEXED_LEXICAL_ONLY` (Review Focus 5).
- [ ] **Step 2: Teste de integração** `tests/e2e/hybrid-search.test.ts` (`describe.skipIf(!process.env.DATABASE_URL_TEST)`): semeia 2 chunks, busca "terceira forma normal" retorna o chunk certo em primeiro; busca sem embedding (null) também encontra.
- [ ] **Step 3: Run**. Expected: FAIL.
- [ ] **Step 4: Implementar**; remover `getAllCorpusChunks`, `addChunksToCorpus`, `seed-data/corpus.ts` passa a ser ingerido pelo seed via `uploadAndIngest`.
- [ ] **Step 5: Run** `npm run test:ci` e `DATABASE_URL_TEST=... npx vitest run tests/e2e`. Expected: PASS. Verificar: reiniciar o servidor e buscar um material subido antes → ainda aparece.
- [ ] **Step 6: Commit** — `feat: database-backed hybrid RAG with pgvector and full-text RRF`

### Task 28: MCP sobre services, Zod por tool e sandbox Python

**Files:**
- Modify: `src/lib/mcp/mcp-server.ts` (tools com `schema: ZodSchema`), `src/lib/mcp/tools/*.ts`, `src/app/api/v1/mcp/route.ts`
- Create: `src/lib/mcp/tools/python-sandbox-tool.ts`, `src/lib/sandbox/python-sandbox.ts`
- Test: `src/lib/mcp/__tests__/mcp-server.test.ts` (ampliar), `src/lib/sandbox/__tests__/python-sandbox.test.ts`

**Interfaces:**
- Produces: `MCPTool<I> = { name, description, schema: z.ZodType<I>, execute(input: I, ctx: { user }) }`; `executeTool(name, args, ctx)` valida com `schema.safeParse` → `DomainError(400)`; `runPython(code: string): Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>` usando `spawn('python3', ['-I','-S','-c', code], { cwd: tmpdir vazio, stdio: ['ignore','pipe','pipe'], timeout: 5000 })`, prefixado por `ulimit -v 262144` via `sh -c` quando `process.platform !== 'win32'`, saída truncada a 8192 bytes; habilitado só com `ENABLE_PYTHON_SANDBOX === 'true'`, senão `DomainError(503, 'Sandbox Python desabilitado')`.

- [ ] **Step 1: Testes**: args inválidos → 400; `runPython('print(2**10)')` → `stdout '1024\n'` (`skipIf` sem `python3`); `while True: pass` → `timedOut: true` em ≤ 6 s; desabilitado → 503.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**; `register_student_interaction`, `get_lesson_faqs`, `generate_class_minutes`, `ingest_didactic_material` chamam os services das Tasks 14, 16, 24, 27.
- [ ] **Step 4: Run** `npm run test:ci`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: validated MCP tools backed by services and gated python sandbox`

## Fase 8 — Telemetria real e documentação

### Task 29: Telemetria do appliance a partir dos logs de inferência

**Files:**
- Create: `src/domains/telemetry/services/telemetry-service.ts`, `src/app/api/v1/appliance/telemetry/route.ts`, `src/lib/gpu-stats.ts`
- Modify: `src/app/(admin)/appliance/_components/ApplianceTelemetryPage.tsx`, `src/components/layout/telemetry-badge.tsx`, `src/lib/vllm-client.ts` (remover `getApplianceTelemetry`)
- Test: `src/domains/telemetry/services/__tests__/telemetry-service.test.ts`

**Interfaces:**
- Produces: `getApplianceStatus(deps): Promise<{ provider, model, baseUrl, healthy: boolean, windows: { last15m: Stats, last24h: Stats }, gpu: { usedGb, totalGb } | null }>` com `Stats = { calls, avgTtftMs, avgTokensPerSecond, avgLatencyMs, externalTrafficBytes, fallbackCount }`; `checkProviderHealth(baseUrl, apiKey)` = `GET {baseUrl}/models` com `AbortSignal.timeout(2000)`; `readGpuStats()` executa `nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits` e devolve `null` quando o binário não existe.
- Página: cada card mostra "indisponível" quando o valor é `null`; badge do cabeçalho aparece só para TEACHER/ADMIN com `avgTtftMs` de 15 min.

- [ ] **Step 1: Testes**: médias calculadas de 3 logs falsos; `healthy: false` quando o `fetch` falso rejeita; `readGpuStats` → `null` quando o `exec` falso falha.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implementar**.
- [ ] **Step 4: Run** `npm run test:ci`; `grep -rn "18.2\|LoRA-TutoraLucy" src` → vazio.
- [ ] **Step 5: Commit** — `feat: appliance telemetry from real inference logs and provider health`

### Task 30: Documentação, CODEBASE.md e verificação final

**Files:**
- Create: `CODEBASE.md`
- Modify: `README.md`, `docs/PLAN-document-ingestion-ocr.md` e `docs/PLAN-document-metadata-ai-extraction.md` (status → Concluído), `docs/PLAN-pedagogical-pipeline.md` (observação sobre mídia via storage), `.env.example` (todas as variáveis novas: `AI_EMBEDDING_MODEL`, `AI_ALLOW_INSECURE_TLS`, `ENABLE_PYTHON_SANDBOX`, `MEDIA_STORAGE_DIR`, `FORCE_SECURE_COOKIE`, `DATABASE_URL_TEST`)

- [ ] **Step 1: Escrever `CODEBASE.md`** com a árvore de domínios (`auth`, `academic`, `teaching`, `agendas`, `agents`, `pedagogy`, `assessments`, `rag`, `storage`, `telemetry`) e a regra repository.
- [ ] **Step 2: Atualizar README**: seed, novas rotas (`/agendas`, `/exams`, `/drafts`, `/pedagogy/reports`, `/appliance/telemetry`, `/agent/chat/stream`), novas páginas (`/office-hours`, `/draft-review`), seção "Estado atual" reescrita (sem mocks; sandbox desabilitado por padrão; embeddings exigem provedor).
- [ ] **Step 3: Teste de fluxo completo** `tests/e2e/full-flow.test.ts` (`describe.skipIf(!process.env.DATABASE_URL_TEST)`): chamando os services em sequência: admin cria professor e disciplina → professor sobe `.txt`, cria plano, cronograma, aula (gera agenda) e prova publicada → aluno conversa na agenda (1 interação gravada), submete prova (score calculado) → agenda `COMPLETED` gera ata → `listMinutes` do professor devolve 1 ata e `buildHeatmap` devolve os tópicos. Run: `DATABASE_URL_TEST=... npx vitest run tests/e2e`. Expected: PASS.
- [ ] **Step 4: Verificação final** — Run: `npm run test:ci`; `grep -rnE "getMock|MOCK_|mocks-pending|setTimeout\(\(\) => \{\s*set" src` → vazio; crawl: todo `href` renderizado em cada página responde 200 ou 307 para a rota do papel; fluxo manual completo da seção 1 do spec.
- [ ] **Step 5: Commit** — `docs: codebase map, env reference and README for the production-ready system`
