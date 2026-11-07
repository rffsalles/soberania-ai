# Soberania AI

**Português** | [English](README.md)

Plataforma educacional com tutora socrática por IA, RAG (geração aumentada por recuperação) sobre os livros da própria escola, planejamento de aulas e avaliações por capítulo.

## Por que existe

Escolas que adotam chatbots em nuvem enfrentam três problemas: dados de alunos saem da instituição (LGPD), a cobrança por token torna o orçamento imprevisível e assistentes genéricos entregam a resposta pronta, o que facilita a cola.
O Soberania AI foi projetado para rodar com modelos abertos hospedados localmente (vLLM ou Ollama), sem tráfego de inferência para fora da rede da escola. O mesmo código também roda com provedores em nuvem (Groq, Together) por meio de um único gateway compatível com a API da OpenAI.
A tutora foi feita para guiar o aluno, não para responder por ele. Ela cita o material oficial do curso e se recusa a dar respostas durante provas.

## Status

- Projeto solo, em desenvolvimento ativo em 2026.
- Ainda sem piloto em produção e sem clientes. Roda localmente em modo demonstração, com dados de seed.
- A visão de produto (appliance on-premises, personas, KPIs) está em [docs/PRD.md](docs/PRD.md). Nem todo item do PRD está implementado.

## Arquitetura

```mermaid
flowchart LR
  subgraph Next["App Next.js 15 (App Router)"]
    UI["UI React 19<br/>aluno · professor · admin"]
    API["Rotas /api/v1"]
    MW["middleware<br/>sessão JWT + RBAC"]
  end
  subgraph Domains["src/domains"]
    D1["academic · agendas · auth"]
    D2["teaching · assessments · pedagogy"]
    D3["agents (pipeline da tutora, prompts, guardrails)"]
    D4["rag (ingestão, capítulos, busca híbrida)"]
    D5["storage · telemetry"]
  end
  DB[("PostgreSQL + pgvector<br/>Prisma ORM")]
  GW["Gateway de LLM<br/>compatível com OpenAI /v1"]
  P1["vLLM / Ollama<br/>(local)"]
  P2["Groq / Together<br/>(nuvem)"]
  P3["mock<br/>(offline, determinístico)"]

  UI --> MW --> API --> Domains
  Domains --> DB
  D3 --> GW
  D4 --> GW
  GW --> P1 & P2 & P3
```

```mermaid
flowchart LR
  A["Upload<br/>PDF · DOCX · TXT · MD"] --> B["Validação<br/>extensão, tamanho, magic bytes"]
  B --> C["Extração de texto<br/>pdf-parse · mammoth · OCR (tesseract.js)"]
  C --> D["Árvore de capítulos<br/>outline do PDF → IA + realinhamento → títulos → manual"]
  D --> E["Chunks<br/>~450 caracteres, 60 de sobreposição, respeita frases,<br/>ligados a um nó de capítulo"]
  E --> F["Embeddings<br/>1024 dimensões (ex.: bge-m3)"]
  F --> G["Busca híbrida em SQL<br/>pgvector HNSW + texto completo em português,<br/>fusão por RRF, restrita à subárvore do capítulo"]
  G --> H["Prompt da tutora<br/>blocos [FONTE: Livro · Capítulo, pág. N]"]
  H --> I["Resposta em streaming com citação"]
```

### Decisões de projeto

**Domínios em vez de camadas.** A regra de negócio fica em `src/domains/<domínio>` (services, repositórios, funções puras). As rotas são finas: validam a entrada com Zod, conferem o papel e chamam um service. A maioria dos services recebe as dependências por argumento (`deps`), então é testada sem banco.

**Um único gateway compatível com OpenAI.** `src/lib/ai-provider.ts` fala `/v1/chat/completions` com streaming. Trocar um vLLM local pelo Groq é mudar `AI_PROVIDER`, `AI_BASE_URL` e `AI_MODEL`, não o código. O gateway registra tempo até o primeiro token, tokens por segundo e uso de tokens por chamada (`InferenceLog`). Em HTTP 429 ele repete uma vez se a espera sugerida pelo provedor for curta; depois cai num stream determinístico e informa o motivo.

**Chunking por capítulo.** Professores planejam aulas e provas por capítulo do livro, então a busca precisa respeitar capítulos. Cada PDF ganha uma árvore de capítulos (`MaterialChapter`, `parentId` autorreferente, N níveis). A extração tenta primeiro o outline do PDF, depois um LLM lendo o sumário (realinhado ao texto real e aos rótulos de página), depois a detecção de títulos e, por fim, a edição manual. Cada chunk aponta para um nó de capítulo. Uma aula ou avaliação ligada a capítulos restringe a busca àquela subárvore (`src/domains/rag/services/chapter-scope.ts`).

**Citações.** O pipeline da tutora (`src/domains/agents/tutor-pipeline.ts`) roda a busca híbrida e injeta cada chunk recuperado como `[FONTE: Livro · Capítulo, pág. N]` no prompt de sistema. O prompt exige que o modelo cite nesse formato, e a API devolve à interface a citação principal junto com a resposta.

**Sem resposta pronta em sala de aula.** Cada tipo de sessão tem seu prompt de sistema: sala de aula (perguntas socráticas, sem resposta direta), grupo de estudos, plantão de dúvidas, revisão de rascunho (feedback por rubrica, nunca reescreve o texto do aluno) e prova. Na prova, um guardrail determinístico verifica a mensagem atual e todo turno do aluno no histórico antes de qualquer busca ou chamada ao modelo, e devolve uma recusa fixa. Regras de estilo compartilhadas (`TUTOR_STYLE_RULES`) mantêm as respostas curtas e em texto puro. À parte, um pequeno juiz LLM avalia a resposta do aluno a um desafio socrático; o resultado alimenta as atas pedagógicas enviadas ao professor.

## Stack

| Camada | Tecnologia |
| :-- | :-- |
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui, Radix, Lucide |
| Dados | PostgreSQL com pgvector, Prisma ORM 6, migrações SQL |
| Autenticação | JWT (jose, HS256) em cookie httpOnly, sessões no servidor com revogação, acesso por papel (STUDENT, TEACHER, ADMIN) |
| IA | Gateway compatível com OpenAI: mock, Ollama, vLLM, Groq, Together; streaming SSE |
| RAG | pgvector HNSW + texto completo do Postgres (GIN), Reciprocal Rank Fusion em SQL |
| Ingestão | pdf-parse, mammoth (DOCX), tesseract.js (OCR opcional) |
| Armazenamento | Sistema de arquivos local ou Cloudflare R2 (S3 SDK) |
| Ferramentas | Servidor MCP local com ferramentas de busca, FAQ, registro de interações, atas e ingestão |
| Validação / testes | Zod, Vitest, Testing Library |

## Práticas de engenharia

Números medidos no `main` atual:

- Cerca de 48.000 linhas de TypeScript/TSX em `src/`.
- 160 arquivos de teste, 1.300 testes passando (Vitest). Testes ponta a ponta contra um Postgres real ficam em `tests/e2e/` e só rodam com `DATABASE_URL_TEST` definida.
- `"strict": true` no TypeScript. `npm run test:ci` roda typecheck, lint, testes e build de produção.
- 23 migrações SQL em `prisma/migrations/`, incluindo as colunas de pgvector e texto completo.
- Fluxo spec → plano → teste primeiro: specs de design em [docs/superpowers/specs/](docs/superpowers/specs/) e planos de implementação passo a passo em [docs/superpowers/plans/](docs/superpowers/plans/).
- RBAC é uma matriz de prefixos com negação por padrão, aplicada no middleware (`src/lib/auth/rbac.ts`), além de checagens de propriedade nos services (um professor não sobrescreve vínculos de capítulo usados nas aulas de outro professor sem a intervenção de um admin).

Testes de exemplo:

- `src/domains/rag/__tests__/chapters.test.ts`: montagem da árvore de capítulos, alinhamento de páginas, revinculação.
- `src/domains/rag/__tests__/livro-sintetico-regression.test.ts`: regressão sobre um fixture sintético de 174 páginas que reproduz a estrutura de um livro escaneado (sumário, unidades, capítulos) cujo outline é inútil.
- `src/domains/rag/__tests__/hybrid-search.test.ts` e `tests/e2e/hybrid-search.test.ts`: fusão RRF, unitário e contra Postgres.
- `src/domains/agents/__tests__/exam-guardrails.test.ts` e `tutor-pipeline.test.ts`: o guardrail bloqueia antes da busca e da chamada ao modelo.
- `src/lib/auth/__tests__/rbac.test.ts`: matriz de papéis.
- `tests/e2e/full-flow.test.ts`: admin → professor (upload, plano, aula, prova) → aluno (chat, envio) → atas e relatórios.

## Início rápido

Requisitos: Node.js 20+ e Docker (para o Postgres com pgvector).

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e, para IA real, as variáveis AI_*

docker run -d --name soberania-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=soberania_db pgvector/pgvector:pg17

npx prisma generate
npx prisma migrate deploy
npm run db:seed               # dados de demonstração (idempotente)
npm run dev                   # http://localhost:3000
```

Alternativa: `docker compose up --build` sobe Postgres e a aplicação juntos (veja `docker-compose.yml`).

### Usuários de demonstração

Criados pelo seed. Defina `NEXT_PUBLIC_DEMO_MODE=true` para exibir atalhos de login com um clique. Nunca habilite em produção.

| Papel | E-mail | Senha |
| :-- | :-- | :-- |
| ADMIN | `admin@soberania.edu.br` | admin123 |
| TEACHER | `professor@soberania.edu.br` | prof123 |
| STUDENT | `aluno@soberania.edu.br` | aluno123 |

Num ambiente real, não rode o seed, defina um `AUTH_SECRET` forte (o servidor recusa segredos fracos em produção) e crie o primeiro administrador:

```bash
npm run admin:create -- --email admin@escola.edu.br --name "Nome do Admin" --password "senha-forte"
```

### Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example). As essenciais:

| Variável | Função |
| :-- | :-- |
| `DATABASE_URL` | Conexão com o Postgres (pgvector obrigatório) |
| `AUTH_SECRET` | Segredo de assinatura do JWT, 32+ caracteres em produção |
| `NEXT_PUBLIC_DEMO_MODE` | Exibe os atalhos de login de demonstração |
| `AI_PROVIDER` | `mock` (padrão, offline), `ollama`, `vllm`, `groq` ou `together` |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Endpoint de inferência, chave e modelo de chat |
| `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_BASE_URL` | Modelo de embeddings (precisa gerar 1024 dimensões, ex.: `bge-m3`); vazio significa só busca léxica |
| `ENABLE_OCR` | OCR para PDFs escaneados |
| `STORAGE_PROVIDER` | `local` ou `r2` |

**Nota sobre o Groq.** Modelo de chat recomendado: `openai/gpt-oss-120b`, com `AI_BASE_URL=https://api.groq.com/openai/v1`. Alguns modelos do plano gratuito têm limite baixo de tokens por minuto e devolvem 429 em prompts longos da tutora. O Groq não tem endpoint de embeddings: aponte `AI_EMBEDDING_BASE_URL` para um Ollama rodando `bge-m3` ou deixe os embeddings desligados.

## Roadmap

- Vincular materiais do acervo a disciplinas, para a tutora buscar só nos livros do curso.
- Persistir as respostas da prova durante a prova, não só no envio.
- Registrar qual modelo gerou cada vetor e reindexar automaticamente quando ele mudar.
- Fazer um primeiro piloto com uma escola real em hardware local (vLLM).

## Limitações conhecidas

- O comportamento socrático da tutora é imposto por prompt, não por código. Só o guardrail de prova é determinístico, e ele usa palavras-chave, então pedidos de cola parafraseados podem chegar ao modelo.
- A busca do RAG filtra por categoria, material e capítulo, mas ainda não por disciplina: o parâmetro de disciplina é ignorado.
- Quando o provedor falha, o chat cai num stream determinístico offline. A geração de aulas e de avaliações devolve 429 em limite de uso, mas a geração de unidades do plano e a distribuição de capítulos informam limite de uso como 503.
- As respostas da prova ficam só na memória do navegador até o envio; recarregar a página as perde.
- A extração de capítulos é só para PDF. DOCX e TXT recebem citações sintéticas "Trecho N".
- Dois testes são instáveis conhecidos: `src/app/api/v1/agent/chat/__tests__/route.test.ts` (caso de fallback da sala de aula) e `MaterialChaptersPanel.test.tsx` (caso de remoção de subárvore).
- O sandbox Python opcional (ferramenta MCP) vem desligado e não tem isolamento em nível de sistema operacional.

## Autor

Ricardo Salles, Florianópolis, Brasil.
[linkedin.com/in/rffsalles](https://linkedin.com/in/rffsalles) · [github.com/rffsalles](https://github.com/rffsalles)

## Licença

Todos os direitos reservados. Código disponível para avaliação.
