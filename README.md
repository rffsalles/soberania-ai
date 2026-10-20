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
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=soberania_db postgres:17
```

### Usuários de demonstração

Criados por `npm run db:seed` (ver [prisma/seed-data/users.ts](prisma/seed-data/users.ts)); o login não cria mais usuários.

| Papel | Matrícula | E-mail | Senha | Rota inicial |
| :-- | :-- | :-- | :-- | :-- |
| ADMIN | ADM001 | admin@soberania.edu.br | admin123 | /appliance |
| TEACHER | PROF001 | professor@soberania.edu.br | prof123 | /materials |
| STUDENT | 202601001 | aluno@soberania.edu.br | aluno123 | /dashboard |

A tela de login possui atalhos que preenchem essas credenciais.

## Scripts

| Comando | Descrição |
| :-- | :-- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm test` / `npm run test:watch` | Testes unitários (Vitest) |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Cria/aplica migrações em desenvolvimento |
| `npm run clean` | Remove a pasta `.next` |

## Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example). As principais:

| Variável | Descrição |
| :-- | :-- |
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma |
| `AUTH_SECRET` / `JWT_SECRET` | Segredo de assinatura dos JWTs (mínimo 32 caracteres) |
| `AI_PROVIDER` | `mock` (padrão, respostas socráticas determinísticas offline), `ollama`, `vllm`, `groq` ou `together` |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Endpoint, chave e modelo do provedor de inferência |
| `MAX_UPLOAD_SIZE_MB`, `ALLOWED_DOCUMENT_EXTENSIONS` | Limites de upload do acervo (padrão 25 MB; pdf, docx, txt, md) |
| `ENABLE_OCR` | Aplica OCR (tesseract.js, por+eng) em PDFs escaneados |
| `STORAGE_PROVIDER`, `MATERIALS_STORAGE_DIR` | `local` (padrão, grava em `./storage/materials`) ou `r2` |
| `R2_*` | Credenciais e bucket do Cloudflare R2 quando `STORAGE_PROVIDER=r2` |

## Estrutura do projeto

```
src/
  app/
    (auth)/login            Tela de login
    (student)/              Painel do aluno, sala de aula interativa, grupo de estudos, sala de prova
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
    agendas/                Sessões (multi-agendas) e validação de janela de horário
    agents/                 Orquestrador da Tutora Lucy, prompts por agenda e guardrail anti-cola
    pedagogy/               Geração de atas pedagógicas e mapa de dificuldades
    rag/                    Busca híbrida (RRF), chunking/ingestão, parser de arquivos, OCR, inspeção de metadados
    storage/                Serviço de armazenamento (local / R2)
  lib/
    ai-provider.ts          Gateway de inferência multi-provedor com streaming e telemetria
    auth/                   Tokens, sessões, senhas e RBAC
    mcp/                    Servidor MCP local e ferramentas
    validators/             Schemas Zod
  middleware.ts             Autenticação, RBAC e injeção de headers de contexto
prisma/
  schema.prisma             Modelo de dados
  migrations/               Migrações SQL
docs/                       PRD, planos de engenharia, design system e regras de código
```

## Rotas de API (`/api/v1`)

Todas as rotas, exceto `POST /auth/login`, exigem o cookie de sessão.

| Grupo | Rotas |
| :-- | :-- |
| Autenticação | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Tutora Lucy | `POST /agent/chat` (mensagem + `agendaType`: CLASSROOM, STUDY_GROUP, EXAM, DRAFT_REVIEW, OFFICE_HOURS) |
| MCP | `GET /mcp` (lista ferramentas) · `POST /mcp` (`toolName`, `args`) |
| Atas | `GET /pedagogy/minutes?agendaId=` · `POST /pedagogy/minutes` |
| Administração | `GET/POST/PUT /admin/subjects` · `GET/POST /admin/teachers` · `GET/POST /academic-periods` |
| Esteira pedagógica | `GET/POST /teacher/plans` · `GET/PUT /teacher/plans/:id` · `POST /teacher/plans/generate` · `GET/POST /teacher/schedules` · `GET/POST /teacher/lessons` · `GET/POST /teacher/assessments` |
| Acervo | `GET/POST /library/categories` · `GET/POST /library/documents` · `POST /library/documents/inspect` · `POST /library/documents/upload` (multipart) · `GET /library/materials` · `DELETE /library/materials/:id` · `GET /library/materials/:id/download` |

Ferramentas MCP disponíveis: `search_didactic_material`, `get_lesson_faqs`, `register_student_interaction`, `generate_class_minutes`, `ingest_didactic_material`.

## Fluxo principal

1. O administrador cadastra disciplinas, professores e períodos letivos em `/admin/subjects`.
2. O professor sobe materiais em `/teacher/materials`. O arquivo é validado (extensão, tamanho, magic bytes), armazenado, convertido em texto (com OCR opcional), dividido em chunks e indexado no RAG híbrido.
3. O professor monta o plano de ensino em `/teacher/plans/new`, com sugestão de ementa/objetivos gerada a partir das referências do acervo, e segue para cronograma, planos de aula e avaliações.
4. O aluno acessa as agendas em `/dashboard`: aula interativa com vídeo e pausas socráticas, grupo de estudos mediado por `@lucy`, sala de prova com cronômetro e guardrail anti-cola, plantão de dúvidas.
5. Cada resposta da Tutora Lucy passa por busca RAG e cita a fonte no formato `[Livro · Capítulo, pág. N]`. Ao final das sessões são geradas atas pedagógicas para o professor em `/reports`.

## Testes

```bash
npm test
```

Cobrem validação de agendas, guardrail de prova, geração de atas, busca híbrida, ingestão/chunking, parser e validação de arquivos, inspeção de metadados, serviço de armazenamento, gateway de IA, sessões e servidor MCP.

## Estado atual e limitações conhecidas

- **Modo demonstração por padrão.** Com `AI_PROVIDER=mock` a Tutora Lucy responde com textos socráticos determinísticos. Para inferência real, configure um provedor.
- **Dados de agendas, atas, relatórios e telemetria são mocks em memória.** As tabelas correspondentes existem no Prisma, mas ainda não são alimentadas pelas telas.
- **O índice RAG é em memória.** Os chunks dos uploads são gravados no banco, mas o índice de busca é reconstruído apenas com o corpus embutido a cada reinício; busca vetorial com pgvector/embeddings ainda não foi implementada.
- A ferramenta `mcp_math_python_sandbox` prevista no PRD ainda não existe.

## Documentação adicional

- [docs/PRD.md](docs/PRD.md): requisitos de produto, personas e critérios de aceite
- [docs/PLAN-pedagogical-pipeline.md](docs/PLAN-pedagogical-pipeline.md): esteira pedagógica
- [docs/PLAN-document-ingestion-ocr.md](docs/PLAN-document-ingestion-ocr.md) e [docs/PLAN-document-metadata-ai-extraction.md](docs/PLAN-document-metadata-ai-extraction.md): ingestão de documentos
- [docs/UX_UI_DESIGN_SYSTEM.md](docs/UX_UI_DESIGN_SYSTEM.md): design system
- [docs/rules/](docs/rules/): regras de clean code, formulários, tabelas e padrões de projeto
