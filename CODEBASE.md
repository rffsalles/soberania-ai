# CODEBASE.md: mapa técnico do Soberania AI

Next.js 15 (App Router) + Prisma 6 + PostgreSQL (pgvector). Este documento descreve onde cada responsabilidade vive e as regras que o código segue. Para visão de produto, veja [docs/PRD.md](docs/PRD.md); para instalação e uso, o [README](README.md).

## Árvore de diretórios

```
src/
  app/                    Páginas (App Router) e rotas de API em app/api/v1
  components/             Componentes React (ai, classroom, layout, agendas, ui)
  domains/                Regra de negócio, um diretório por domínio (abaixo)
  lib/
    api/                  DomainError e apiError (mapeamento de erros para HTTP)
    auth/                 Token JWT, senha, sessão, requireUser, matriz de RBAC
    constants/            routes.ts (ROUTES/API_ROUTES), env.ts, nomes de constantes de domínio
    mcp/                  Servidor MCP local e ferramentas (tools/)
    sandbox/              Execução de Python gated por ENABLE_PYTHON_SANDBOX
    validators/           Schemas Zod de entrada das rotas
    ai-provider.ts        Gateway de inferência (mock, ollama, vllm, groq, together)
    embeddings.ts         Embeddings (hash determinístico no provedor mock; 1024 dims no real)
    db.ts                 Cliente Prisma (só repositórios importam)
  middleware.ts           Autenticação e RBAC na borda
prisma/                   schema.prisma, migrations/, seed.ts, seed-data/
tests/e2e/                Testes contra Postgres real (DATABASE_URL_TEST)
scripts/check-links.mjs   Verificador offline de links internos (npm run check:links)
```

## Domínios (`src/domains/*`)

Cada item: responsabilidade, arquivos principais (em `services/` salvo indicação) e rotas de `/api/v1` atendidas.

### `auth`

- Responsabilidade: Usuários e sessões persistidas e revogáveis (o JWT carrega `sessionId`).
- Arquivos: `services/user-repository`, `services/session-repository`; token, senha e `requireUser` em `lib/auth`.
- Rotas: `auth/login`, `auth/logout`, `auth/me`.

### `academic`

- Responsabilidade: Disciplinas, professores, alocação N:N professor-disciplina e períodos letivos.
- Arquivos: `subject-service`, `academic-period-service`, `subject-repository`, `teacher-subject-repository`, `academic-period-repository`.
- Rotas: `admin/subjects`, `admin/teachers`, `academic-periods`.

### `teaching`

- Responsabilidade: Esteira do professor: plano de ensino, cronograma (geração de encontros), aulas, mídia da aula e sincronização de uma agenda CLASSROOM por aula.
- Arquivos: `teaching-plan-service`, `schedule-service`, `lesson-service`, `agenda-lesson-service`, `teaching-content-service`, `ownership` (`assertOwner`).
- Rotas: `teacher/plans`, `teacher/schedules` (+ `:id/sync`), `teacher/lessons` (+ `:id/media`), `agendas/:id/lesson`.

### `agendas`

- Responsabilidade: Sessões CLASSROOM, STUDY_GROUP, EXAM, OFFICE_HOURS e DRAFT_REVIEW; escopo por papel (aluno por turma, professor por disciplina); janela de horário; grupo de estudos.
- Arquivos: `agenda-service`, `study-group-service`, `agenda-repository`, `agenda-validator`.
- Rotas: `agendas`, `agendas/:id`, `agendas/:id/status`, `agendas/:id/messages`.

### `agents`

- Responsabilidade: Tutora Lucy: pipeline RAG + guardrail anti-cola, prompts por tipo de agenda, gravação de `StudentInteraction` e `InferenceLog`.
- Arquivos: `services/chat-service` (`chatWithTutor`, `startChat`), `tutor-pipeline`, `prompts/`.
- Rotas: `agent/chat`, `agent/chat/stream` (SSE).

### `pedagogy`

- Responsabilidade: Métricas por aluno, atas, mapa de dificuldades, exportação CSV e FAQ dinâmico.
- Arquivos: `minutes-service` (`generateMinute`, `listMinutes`), `reports-service` (`buildHeatmap`), `faq-service`, `minute-metrics`, `interaction-repository`, `minute-repository`.
- Rotas: `pedagogy/minutes`, `pedagogy/reports/heatmap`, `pedagogy/reports/export.csv`, `agendas/:id/faqs`.

### `assessments`

- Responsabilidade: Geração, edição e publicação de provas (publicar cria a agenda EXAM); sala de prova com correção no servidor; rascunhos com feedback por rubrica.
- Arquivos: `assessment-service`, `exam-service`, `assessment-submissions-service`, `draft-service`, `question-schema`.
- Rotas: `teacher/assessments` (+ `generate`, `:id`, `:id/publish`, `:id/submissions`), `exams/:agendaId` (+ `/submit`), `drafts`.

### `rag`

- Responsabilidade: Acervo, ingestão de PDF/DOCX/TXT/MD (OCR opcional), chunking, embeddings e busca híbrida.
- Arquivos: `library-service`, `hybrid-search`, `chunk-repository`, `material-repository`, `category-repository`, `ingestion`, `file-parser`, `ocr-service`, `document-inspector`.
- Rotas: `library/categories`, `library/documents` (+ `inspect`, `upload`), `library/materials` (+ `:id`, `:id/download`, `:id/reindex`).

### `storage`

- Responsabilidade: Arquivos em filesystem local ou Cloudflare R2, com leitura por faixa (Range).
- Arquivos: `storage-service`.
- Rotas: Sem rotas próprias; usado por `rag` e `teaching`.

### `telemetry`

- Responsabilidade: Status do appliance a partir de `InferenceLog` reais, saúde do provedor de IA e GPU (`nvidia-smi`).
- Arquivos: `telemetry-service`, `inference-log-repository`.
- Rotas: `appliance/telemetry`.

O servidor MCP (`GET/POST /mcp`) fica em `lib/mcp` e delega aos services de `rag`, `pedagogy` e `agents`. Ferramentas: `search_didactic_material`, `get_lesson_faqs`, `register_student_interaction`, `generate_class_minutes`, `ingest_didactic_material` e `mcp_math_python_sandbox` (desabilitada por padrão).

## Regras de arquitetura

**Repositório.** Somente arquivos `*-repository.ts` importam `@/lib/db` (ESLint `no-restricted-imports`; exceções: `prisma/seed.ts`, `__tests__/**` e `tests/**`). Services recebem dependências por um parâmetro `deps` com valor padrão apontando para o repositório real, o que permite testes unitários sem banco.

**Erros.** Services lançam `DomainError(status, mensagem)` (`lib/api/domain-error.ts`); autenticação lança `AuthError`. Toda rota envolve o corpo em `try/catch` e responde com `apiError(error)` (`lib/api/api-error.ts`), que mapeia `AuthError`, `ZodError` (400), `DomainError`, erros Prisma conhecidos (P2002 = 409, P2025 = 404, P2003 = 400) e devolve 500 genérico para o resto. Rotas não montam respostas de erro à mão.

**Rotas e autenticação.** Uma rota de API autentica com `requireUser(req, [roles])` (`lib/auth/request-user.ts`), valida a entrada com Zod (`lib/validators`) e chama o service. O cookie de sessão é `httpOnly`; recebe `Secure` em produção ou quando `FORCE_SECURE_COOKIE=true` (`shouldUseSecureCookie` em `lib/auth/token.ts`).

**RBAC.** A matriz em `lib/auth/rbac.ts` é deny-by-default: a rota mais específica listada em `PROTECTED_ROUTE_ROLES` decide; caminhos sob os prefixos de área (`/api/`, `/teacher`, `/admin`, `/appliance`, `/reports`, `/dashboard`, `/classroom`, `/study-group`, `/exam`, `/office-hours`, `/draft-review`, `/pitch`) que não estão listados são negados. Os caminhos vêm de `lib/constants/routes.ts` (`ROUTES`, `API_ROUTES`); não escreva strings de rota soltas nas regras. O middleware aplica a matriz na borda e o `requireUser` repete a checagem de papel na rota. Escopo de dados (turma do aluno, professor dono do plano) é verificado nos services.

**UI.** Componentes e páginas só fazem `fetch` em `/api/v1/**`. De `src/domains/**` a UI importa apenas tipos e alguns helpers puros (`agenda-validator`, `teaching/media-type`, `teaching/schedule-generator`; `getAgendaLink` vive em `lib/constants/routes.ts`). Nenhum componente importa repositório ou service.

**Constantes.** Literais de domínio (status, tipos, limites) ficam em `lib/constants/*`; nomes de variáveis de ambiente em `lib/constants/env.ts`.

## Fluxo de uma requisição

1. `middleware.ts` lê o cookie, valida o JWT (`verifyAuthToken`) e consulta `canAccessRoute`; sem sessão redireciona páginas para `/login` e responde 401 em APIs; sem permissão redireciona páginas ao painel do papel e responde 403 em APIs.
2. A rota (`app/api/v1/**/route.ts`) chama `requireUser(req, roles)`, valida o corpo com Zod e delega a um service.
3. O service aplica regras (escopo, janela de horário, propriedade do plano) e chama repositórios por `deps`.
4. Erros sobem como `DomainError`/`AuthError`/`ZodError` e a rota responde com `apiError`.
5. Chat da Tutora Lucy: `startChat` valida agenda, escopo e janela antes de qualquer streaming; `runChat` consulta o RAG, transmite tokens, grava a interação e o `InferenceLog` (falha no log não derruba a resposta).

## Como adicionar uma funcionalidade

- Nova tabela ou coluna: altere `schema.prisma` e crie a migração conforme a seção de migrações.
- Nova consulta: função em `*-repository.ts` do domínio; nunca importe `@/lib/db` em outro arquivo.
- Regra de negócio: função de service com `deps` injetável e teste em `__tests__` com `deps` falsas.
- Nova rota: constante em `API_ROUTES` (se for um novo prefixo), entrada na matriz de `rbac.ts` com os papéis permitidos e teste em `lib/auth/__tests__/rbac.test.ts`.
- Nova página: constante em `ROUTES`, entrada na matriz de RBAC e `npm run check:links` para garantir que nenhum link ficou sem destino.
- Nova variável de ambiente: nome em `lib/constants/env.ts`, exemplo comentado em `.env.example` e linha na tabela do README.

## Convenções de código

- Texto de interface, mensagens de erro e documentação em português do Brasil; identificadores em inglês.
- Sem números mágicos: limites, durações e fatores viram constantes nomeadas no topo do arquivo ou em `lib/constants`.
- TypeScript estrito; evite `any`. Entrada externa (corpo de rota, JSON do banco, resposta da IA) é validada com Zod antes de ser usada.
- Respostas da IA sempre têm contingência determinística (fallback) para que o fluxo não quebre sem provedor.
- Comentários explicam o porquê, não o quê. Regras detalhadas em [docs/rules/](docs/rules/).

## Variáveis de ambiente

Referência completa em [.env.example](.env.example). Lidas pelo código: `DATABASE_URL`, `AUTH_SECRET`/`JWT_SECRET`, `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_ALLOW_INSECURE_TLS`, `STORAGE_PROVIDER`, `MATERIALS_STORAGE_DIR`, `MEDIA_STORAGE_DIR`, `R2_*`, `MAX_UPLOAD_SIZE_MB`, `ALLOWED_DOCUMENT_EXTENSIONS`, `ENABLE_OCR`, `ENABLE_PYTHON_SANDBOX`, `FORCE_SECURE_COOKIE`, `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_INSTITUTION_TIMEZONE`. `DATABASE_URL_TEST` só é usada pelos testes e2e.

## Banco de dados e migrações

- Seed idempotente: `npm run db:seed` (`prisma/seed.ts` + `prisma/seed-data/*`) cria os usuários de demonstração (`lib/constants/demo-credentials.ts`), a turma ADS-2026-3A, a disciplina BD101, plano de ensino, cronograma, 4 aulas, 1 avaliação publicada, 5 agendas e 5 materiais (9 chunks) com embeddings.
- A migração `20261020130000_pgvector_fulltext` cria a extensão `vector`, a coluna `embedding vector(1024)` com índice HNSW, a coluna `content_tsv` (tsvector gerado) e o índice GIN. O Prisma modela essas colunas como `Unsupported`, então **`prisma migrate dev` propõe removê-las: descarte esse diff**.
- Fluxo para nova migração: edite `schema.prisma`; gere o SQL com `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`; revise e remova qualquer `DROP` dos objetos acima; salve em `prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql` (pasta com nome escolhido à mão); aplique com `prisma migrate deploy`.
- Busca híbrida (`rag/services/chunk-repository`): vetorial (pgvector, cosseno) + texto completo (`tsvector`, config `portuguese`) combinados por RRF. Sem provedor de embeddings o chunk é indexado só lexicalmente (status `INDEXED_LEXICAL_ONLY`) e `POST /library/materials/:id/reindex` refaz os embeddings.

## Testes

- Unitários: `src/**/__tests__/*.test.ts` (Vitest, ambiente node, alias `@` para `src`). Services são testados com `deps` falsas; repositórios não são mockados em testes de rota/serviço.
- E2E: `tests/e2e/*.test.ts` rodam contra Postgres real e usam `describe.skipIf(!process.env.DATABASE_URL_TEST)`. Cada teste define `process.env.DATABASE_URL` em `beforeAll`, importa os módulos dinamicamente, usa sufixos únicos e remove o que criou em `afterAll`. `hybrid-search` cobre a busca pgvector + tsvector; `full-flow` percorre os services de ponta a ponta (professor, disciplina, material, plano, cronograma, aula/agenda, prova, chat, submissão, ata, mapa de calor); disciplina e cronograma passam pelos schemas Zod das rotas, a aula usa o horário local do cronograma e o `wasCorrect` vem do juiz com um `streamChat` falso injetado.
- Comandos: `npm test` (e2e são ignorados sem a variável); `DATABASE_URL_TEST=... npx vitest run tests/e2e`; `npm run test:ci` = typecheck + lint + testes + build; `npm run check:links` confere offline que todo link interno aponta para uma `page.tsx`/`route.ts` existente.
