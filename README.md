# Soberania AI

Plataforma educacional on-premises que usa IA para apoiar o trabalho do professor: tutoria socrática para alunos (Tutora Lucy), acervo didático com RAG híbrido, esteira pedagógica (plano de ensino, cronograma, planos de aula e avaliações) e atas pedagógicas automáticas.

O produto foi concebido como um appliance plug-and-play rodando SLMs locais via vLLM, com 100% de soberania de dados (LGPD). Este repositório contém a aplicação web (Next.js) que compõe o appliance. Veja a visão de produto completa em [docs/PRD.md](docs/PRD.md).

## Stack

| Camada | Tecnologia |
| :-- | :-- |
| Framework | Next.js 15 (App Router) · React 19 · TypeScript (strict) |
| UI | Tailwind CSS v4 · shadcn/ui (new-york) · Radix · Lucide React |
| Banco de dados | PostgreSQL · Prisma ORM 6 |
| Autenticação | JWT (jose, HS256) em cookie httpOnly · sessões persistidas com revogação · RBAC por papel (STUDENT, TEACHER, ADMIN) |
| IA | Gateway multi-provedor compatível com a API OpenAI (`/v1/chat/completions`): mock, ollama, vllm, groq, together |
| Ingestão de documentos | pdf-parse · mammoth (DOCX) · tesseract.js (OCR opcional) |
| Armazenamento de arquivos | Filesystem local ou Cloudflare R2 (S3 SDK) |
| Validação | Zod |
| Testes | Vitest |

## Pré-requisitos

- Node.js 20+ (testado com 22)
- PostgreSQL 15+ acessível (local, Docker ou Neon)
- Opcional: um servidor de inferência local (Ollama ou vLLM) ou chave de API Groq/Together

## Instalação e execução

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
#    Ajuste DATABASE_URL, AUTH_SECRET e, se quiser IA real, AI_PROVIDER/AI_BASE_URL/AI_API_KEY/AI_MODEL

# 3. Banco de dados
npx prisma generate
npx prisma migrate deploy      # ou: npm run prisma:migrate (dev)
npm run db:seed                # dados de demonstração (idempotente)

# 4. Servidor de desenvolvimento
npm run dev                    # http://localhost:3000
```

Subir um Postgres descartável com Docker:

```bash
docker run -d --name soberania-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=soberania_db pgvector/pgvector:pg17
```

### Usuários de demonstração

Criados por `npm run db:seed` a partir de [src/lib/constants/demo-credentials.ts](src/lib/constants/demo-credentials.ts); o login não cria usuários.

| Papel | Matrícula | E-mail | Senha | Rota inicial |
| :-- | :-- | :-- | :-- | :-- |
| ADMIN | ADM001 | admin@soberania.edu.br | admin123 | /appliance |
| TEACHER | PROF001 | professor@soberania.edu.br | prof123 | /materials |
| STUDENT | 202601001 | aluno@soberania.edu.br | aluno123 | /dashboard |

Com `NEXT_PUBLIC_DEMO_MODE=true` a tela de login exibe atalhos que preenchem essas credenciais; fora do modo demonstração os atalhos não são renderizados.

### Primeiro acesso em produção

Não rode o seed de demonstração em produção. Defina um `AUTH_SECRET` forte (32+ caracteres; `openssl rand -base64 48`) — com `NODE_ENV=production` o servidor recusa um segredo ausente, curto ou igual ao padrão de desenvolvimento — e crie o primeiro administrador:

```bash
npm run admin:create -- --email admin@instituicao.edu.br --name "Nome do Administrador" --password "senha-forte"
# opcional: --enrollment ADM001 (padrão: o próprio e-mail)
```

O script grava o usuário com o mesmo hash de senha do login e recusa e-mail ou matrícula já cadastrados. A partir daí o administrador entra pela tela de login e cadastra professores e disciplinas.

### Seed

`npm run db:seed` (`prisma/seed.ts` + `prisma/seed-data/*`) é idempotente e cria: os 3 usuários acima, a turma ADS-2026-3A, a disciplina BD101 (Banco de Dados I) com plano de ensino, cronograma e 4 aulas, 1 avaliação publicada, 5 agendas (aula ao vivo, grupo de estudos, prova, plantão de dúvidas e revisão de rascunho), as categorias do acervo e 5 materiais (9 chunks) já indexados com embeddings. Rodar o seed de novo não duplica registros.

## Scripts

| Comando | Descrição |
| :-- | :-- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm test` / `npm run test:watch` | Testes unitários (Vitest) |
| `npm run test:ci` | typecheck + lint + testes + build (gate de integração) |
| `npm run check:links` | Confere, sem navegador, que todo link interno aponta para uma página/rota existente |
| `npm run db:seed` | Carrega os dados de demonstração (idempotente) |
| `npm run admin:create -- --email … --name … --password …` | Cria um ADMIN (primeiro acesso em produção) |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Cria/aplica migrações em desenvolvimento |
| `npm run clean` | Remove a pasta `.next` |

## Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example). As principais:

| Variável | Descrição |
| :-- | :-- |
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma |
| `AUTH_SECRET` / `JWT_SECRET` | Segredo de assinatura dos JWTs; em produção é obrigatório, com 32+ caracteres e diferente do padrão de desenvolvimento |
| `NEXT_PUBLIC_DEMO_MODE` | `true` exibe os atalhos de login de demonstração (padrão: desligado; nunca em produção) |
| `NEXT_PUBLIC_INSTITUTION_TIMEZONE` | Fuso IANA em que horários de aula são digitados e exibidos (padrão: `America/Sao_Paulo`; lido no build) |
| `AI_PROVIDER` | `mock` (padrão, respostas socráticas determinísticas offline), `ollama`, `vllm`, `groq` ou `together` |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Endpoint, chave e modelo do provedor de inferência |
| `MAX_UPLOAD_SIZE_MB`, `ALLOWED_DOCUMENT_EXTENSIONS` | Limites de upload do acervo (padrão 25 MB; pdf, docx, txt, md) |
| `ENABLE_OCR` | Aplica OCR (tesseract.js, por+eng) em PDFs escaneados |
| `AI_EMBEDDING_MODEL` | Modelo de embeddings do RAG; precisa gerar **1024 dimensões** (ex.: `bge-m3`). Ignorado no provedor `mock` |
| `AI_ALLOW_INSECURE_TLS` | Aceita certificado autoassinado apenas nas chamadas ao provedor de IA (nunca em produção) |
| `STORAGE_PROVIDER`, `MATERIALS_STORAGE_DIR`, `MEDIA_STORAGE_DIR` | `local` (padrão, `./storage/materials` e `./storage/media`) ou `r2` |
| `R2_*` | Credenciais e bucket do Cloudflare R2 quando `STORAGE_PROVIDER=r2` |
| `ENABLE_PYTHON_SANDBOX` | `true` habilita a ferramenta MCP `mcp_math_python_sandbox` (desligada por padrão; veja limitações) |
| `FORCE_SECURE_COOKIE` | `true` força o atributo `Secure` no cookie de sessão fora de `NODE_ENV=production` (ex.: proxy TLS) |
| `DATABASE_URL_TEST` | Banco descartável dos testes e2e (`tests/e2e`); sem ela eles são ignorados |

## Estrutura do projeto

```
src/
  app/
    (auth)/login            Tela de login
    (student)/              Painel do aluno, sala de aula, grupo de estudos, sala de prova, plantão (/office-hours), revisão de rascunho (/draft-review)
    (teacher)/              Acervo RAG (/materials) e relatórios/atas (/reports)
    (admin)/appliance       Telemetria do appliance
    teacher/                Esteira pedagógica: plans, plans/new, schedules, lessons, assessments, materials
    admin/subjects          Gestão de disciplinas e alocação de professores
    pitch/                  Apresentação institucional
    api/v1/                 Rotas de API (ver abaixo)
  components/
    ai/                     Chat socrático universal
    classroom/              Player interativo, FAQ dinâmico, painel de chat, modal de ata
    layout/                 Cabeçalho, navegação do usuário, badge de telemetria
    ui/                     Componentes shadcn/ui e comboboxes avançados
  domains/                  Regras de negócio por domínio (DDD)
    auth/ academic/         Usuários e sessões · disciplinas, professores e períodos
    teaching/               Plano de ensino, cronograma, aulas (com mídia) e sincronização de agendas
    agendas/                Sessões (multi-agendas), grupo de estudos e validação de janela de horário
    agents/                 Orquestrador da Tutora Lucy, prompts por agenda e guardrail anti-cola
    pedagogy/               Atas pedagógicas, mapa de dificuldades, FAQ e exportação CSV
    assessments/            Provas (geração, publicação, correção) e rascunhos
    rag/                    Busca híbrida pgvector + texto completo (RRF), ingestão, parser, OCR
    storage/                Serviço de armazenamento (local / R2)
    telemetry/              Status do appliance a partir de InferenceLog reais
  lib/
    ai-provider.ts          Gateway de inferência multi-provedor com streaming e telemetria
    auth/                   Tokens, sessões, senhas e RBAC
    mcp/                    Servidor MCP local e ferramentas
    validators/             Schemas Zod
  middleware.ts             Autenticação, RBAC e injeção de headers de contexto
prisma/
  schema.prisma             Modelo de dados
  migrations/               Migrações SQL
tests/e2e/                Testes contra Postgres real
scripts/                  Utilitários (check-links)
CODEBASE.md               Mapa técnico e regras de arquitetura
docs/                       PRD, planos de engenharia, design system e regras de código
```

## Rotas de API (`/api/v1`)

Todas as rotas, exceto `POST /auth/login`, exigem o cookie de sessão e passam pela matriz de RBAC (negação por padrão). Detalhes por domínio em [CODEBASE.md](CODEBASE.md).

| Grupo | Rotas |
| :-- | :-- |
| Autenticação | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Agendas | `GET/POST /agendas` · `GET /agendas/:id` · `PATCH /agendas/:id/status` (`COMPLETED` gera as atas) · `GET /agendas/:id/lesson` · `GET /agendas/:id/faqs` · `GET/POST /agendas/:id/messages` (grupo de estudos) |
| Tutora Lucy | `POST /agent/chat` · `POST /agent/chat/stream` (SSE) |
| Provas e rascunhos | `GET /exams/:agendaId` · `POST /exams/:agendaId/submit` · `GET/POST /drafts` (rascunhos do aluno com feedback por rubrica) |
| Atas e relatórios | `GET/POST /pedagogy/minutes` · `GET /pedagogy/reports/heatmap` · `GET /pedagogy/reports/export.csv` |
| Appliance | `GET /appliance/telemetry` (TEACHER e ADMIN; a página `/appliance` é só ADMIN) |
| MCP | `GET /mcp` (lista ferramentas) · `POST /mcp` (`toolName`, `args`) |
| Administração | `GET/POST/PUT /admin/subjects` · `GET/POST /admin/teachers` · `GET/POST /academic-periods` |
| Esteira pedagógica | `GET/POST /teacher/plans` · `GET/PUT /teacher/plans/:id` · `POST /teacher/plans/generate` · `GET/POST /teacher/schedules` · `POST /teacher/schedules/:id/sync` · `GET/POST /teacher/lessons` · `PUT /teacher/lessons/:id` · `GET/POST /teacher/lessons/:id/media` · `GET/POST /teacher/assessments` · `PUT /teacher/assessments/:id` · `POST /teacher/assessments/generate` · `POST /teacher/assessments/:id/publish` · `GET /teacher/assessments/:id/submissions` |
| Acervo | `GET/POST /library/categories` · `GET/POST /library/documents` · `POST /library/documents/inspect` · `POST /library/documents/upload` (multipart) · `GET /library/materials` · `DELETE /library/materials/:id` · `GET /library/materials/:id/download` · `POST /library/materials/:id/reindex` |

Ferramentas MCP: `search_didactic_material`, `get_lesson_faqs`, `register_student_interaction`, `generate_class_minutes`, `ingest_didactic_material` e `mcp_math_python_sandbox` (somente com `ENABLE_PYTHON_SANDBOX=true`).

## Fluxo principal

1. O administrador cadastra disciplinas, professores e períodos letivos em `/admin/subjects`.
2. O professor sobe materiais em `/teacher/materials`. O arquivo é validado (extensão, tamanho, magic bytes), armazenado, convertido em texto (com OCR opcional), dividido em chunks e indexado no RAG híbrido.
3. O professor monta o plano de ensino em `/teacher/plans/new`, com sugestão de ementa/objetivos gerada a partir das referências do acervo, e segue para cronograma, planos de aula e avaliações.
4. O aluno acessa as agendas em `/dashboard`: aula interativa com vídeo e pausas socráticas, grupo de estudos mediado por `@lucy`, sala de prova com cronômetro e guardrail anti-cola, plantão de dúvidas.
5. Cada resposta da Tutora Lucy passa por busca RAG e cita a fonte no formato `[Livro · Capítulo, pág. N]`. Ao final das sessões são geradas atas pedagógicas para o professor em `/reports`.

## Banco de dados e migrações

O RAG usa a extensão `vector` do PostgreSQL (use uma imagem com pgvector, por exemplo `pgvector/pgvector:pg17`). A migração `20261020130000_pgvector_fulltext` cria a coluna `embedding vector(1024)`, a coluna gerada `content_tsv` e os índices HNSW e GIN. Como o Prisma modela essas colunas como `Unsupported`, **`prisma migrate dev` propõe removê-las: descarte esse diff**. Para novas migrações, gere o SQL com `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`, revise, salve em uma pasta `prisma/migrations/<timestamp>_<nome>/migration.sql` e aplique com `prisma migrate deploy`.

## Testes

```bash
npm test                 # unitários (Vitest); os e2e são ignorados sem DATABASE_URL_TEST
npm run test:ci          # typecheck + lint + testes + build

# e2e contra um Postgres descartável (migrações e seed aplicados)
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5433/soberania_db?schema=public" \
  npx vitest run tests/e2e
```

Os unitários cobrem agendas, guardrail de prova, atas, busca híbrida, ingestão, parser, armazenamento, gateway de IA, sessões, RBAC, MCP e sandbox. Os e2e (`tests/e2e`) validam a busca pgvector + tsvector e o fluxo completo no nível de service: administrador cria professor e disciplina; professor sobe um `.txt`, cria plano, cronograma, aula (gera a agenda) e prova publicada; aluno conversa na agenda (interação e `InferenceLog` gravados) e submete a prova (nota calculada no servidor); a agenda concluída gera a ata; `listMinutes` e `buildHeatmap` leem os dados de volta.

## Estado atual e limitações conhecidas

Não restam dados simulados no código: agendas, interações, atas, relatórios, provas, planos, acervo e telemetria vêm do PostgreSQL.

- **`AI_PROVIDER=mock` é um provedor determinístico offline para desenvolvimento**: gera embeddings por hash e respostas socráticas de contingência. Serve para rodar sem GPU; a qualidade pedagógica real exige um provedor (Ollama, vLLM, Groq ou Together).
- **Embeddings do RAG exigem um modelo de 1024 dimensões** (`bge-m3` em Ollama/vLLM). Modelos de outra dimensão (ex.: `nomic-embed-text`, 768) são rejeitados. Sem provedor de embeddings, os documentos ficam indexados apenas por texto completo.
- **O sandbox Python vem desligado** (`ENABLE_PYTHON_SANDBOX=false`). Ele executa código gerado por LLM no servidor; os limites de tempo e saída do processo não substituem isolamento em nível de SO (contêiner, usuário sem privilégios, sem rede). Habilite apenas no appliance com esse isolamento.
- O limite de memória do sandbox usa `ulimit -v`, indisponível no macOS: lá a execução informa `memoryLimited: false`.
- A telemetria de GPU/VRAM depende de `nvidia-smi`; sem GPU NVIDIA o campo aparece como indisponível.
- **Turmas e alunos são provisionados por seed ou direto no banco.** O admin escolhe a turma de uma disciplina entre as existentes, mas não há cadastro de turmas, alunos ou matrículas na interface nesta versão.
- **A busca do RAG filtra por categoria, não por disciplina.** O parâmetro de disciplina é ignorado e a Tutora Lucy consulta todo o acervo da instituição.
- **Bibliotecas anteriores a esta versão precisam de reindexação manual.** Chunks sem embedding só ganham vetores por `POST /api/v1/library/materials/:id/reindex`, material a material. O modelo que gerou cada embedding não é registrado, então trocar `AI_PROVIDER=mock` por um modelo real exige reindexar todo o acervo para não misturar vetores.
- **As respostas da prova ficam só na memória do navegador até o envio.** Recarregar a página durante a prova perde as alternativas marcadas.
- **Conversas de professores e administradores nas agendas são gravadas como interações.** Elas aparecem no FAQ da turma e geram falhas (sem turma) na geração das atas da agenda.

## Documentação adicional

- [CODEBASE.md](CODEBASE.md): mapa de domínios, regras de arquitetura, migrações e testes
- [docs/PRD.md](docs/PRD.md): requisitos de produto, personas e critérios de aceite
- [docs/PLAN-pedagogical-pipeline.md](docs/PLAN-pedagogical-pipeline.md): esteira pedagógica
- [docs/PLAN-document-ingestion-ocr.md](docs/PLAN-document-ingestion-ocr.md) e [docs/PLAN-document-metadata-ai-extraction.md](docs/PLAN-document-metadata-ai-extraction.md): ingestão de documentos
- [docs/UX_UI_DESIGN_SYSTEM.md](docs/UX_UI_DESIGN_SYSTEM.md): design system
- [docs/rules/](docs/rules/): regras de clean code, formulários, tabelas e padrões de projeto
