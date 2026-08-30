# 🚀 Antigravity Rules & Development Guidelines

Este documento define os padrões arquiteturais, princípios de Clean Code e boas práticas para o desenvolvimento no projeto **Antigravity**. Toda nova implementação deve seguir estas diretrizes para garantir uma base de código escalável, testável e focada no domínio do negócio, alinhada com as convenções do Next.js App Router.

## 🛠 Tech Stack Core
- **Ambiente de Execução:** Node.js 22
- **Framework Fullstack:** Next.js 16 (App Router)
- **Biblioteca de UI:** React 19 + Tailwind CSS + shadcn/ui
- **Linguagem:** TypeScript (Strict Mode)
- **Banco de Dados:** PostgreSQL + Prisma ORM (via Neon serverless)
- **Testes:** Vitest

---

## 1. Arquitetura em Camadas (Domain-Driven Design Seguro)

Adotamos uma organização baseada em **Domain-Driven Design (DDD)** separando estritamente nosso código em camadas principais: Delivery, Domain, Infrastructure e Shared. Essa arquitetura garante alta segurança (isolando lógicas de negócio do roteamento web), escalabilidade e facilidade de manutenção para o Next.js App Router.

### Princípios de Estruturação

1. **Camada de Delivery Fina (`src/app/` e `src/components/`):** 
   - A pasta `/app/` foca **exclusivamente** em roteamento, layouts, páginas (Server/Client Components) e orquestração de chamadas (APIs). Nenhuma lógica de negócio central ou acesso externo direto acontece aqui.
   - Rotas devem importar lógica através das APIs públicas dos domínios (ex: imports de `/domains/users/services`).
   - Usa-se Route Groups para controle de layout (ver `CODEBASE.md` para a lista atualizada, ex: `(admin)`, `(auth)`, `(dashboard)`) e Pastas Privadas `_components` para componentes restritos àquela rota.

2. **Isolamento da Lógica de Domínio (`src/domains/`):**
   - As regras de negócio críticas ficam totalmente fora do `src/app/` para não vazarem. Elas nunca devem depender de frameworks UI de Delivery.
   - Mantém as entidades do domínio, os Domain Services puros (ex: funções de precificação) e as lógicas de Server Actions específicas do domínio.

3. **Abstração de Infraestrutura e Integrações (`src/lib/` e `prisma/`):**
   - O schema do banco é definido em `prisma/schema.prisma` e o Prisma Client é instanciado em **`src/lib/db.ts`**.
   - Código que conversa com o mundo externo fica em **`src/lib/`** (ex: `src/lib/stripe.ts`, `src/lib/inngest/`, `src/lib/pusher.ts` etc.). Ver `CODEBASE.md` para o ecossistema completo.

4. **Recursos Compartilhados (`src/lib`, `src/hooks`, `src/types`, `src/shared`):**
   - Utilitários globais verdadeiros, tipagens da aplicação e conectores genéricos. Siga o layout estabelecido no **`CODEBASE.md`** como a única fonte da verdade para o esqueleto dos diretórios de recurso.
   - Os blocos de UI genéricos (shadcn) pertencem ao root `/components/`.

> 💡 **Nota Importante:** Para entender 100% da árvore de arquivos e dependências de domínio, sempre consulte a fonte da verdade oficial do ecossistema localizada em `CODEBASE.md` na raiz do projeto.

---

## 2. Componentes Visuais

> **Regra:** Para criação de componentes visuais, **sempre dar preferência ao shadcn/ui** em vez de criar componentes do zero.

- Componentes shadcn/ui ficam em `src/components/ui/`
- Estilo configurado: **new-york** (ver `components.json`)
- Icon library: **Lucide React**
- Alias de import: `@/components/ui/*`
- Usar CSS variables para theming (definidas em `globals.css`)

---

## 3. TypeScript — Boas Práticas

### ❌ Proibido / Evitar

| Prática | Motivo | Alternativa |
|---------|--------|------------|
| Usar `any` | Desativa verificação de tipos e reduz segurança | Usar tipos explícitos, `unknown`, ou generics |
| `Record<string, any>` genérico | Perde semântica de domínio | Definir interfaces/types específicos do domínio |
| Arquivos monolíticos (> 350 LOC) | Dificulta manutenção e reutilização | Dividir em módulos menores por funcionalidade |
| Duplicação de código | Inconsistência e manutenção duplicada | Extrair funções/componentes reutilizáveis |
| Funções com múltiplas responsabilidades | Viola SRP (Single Responsibility) | Uma função = uma responsabilidade |
| **Magic strings** (identificadores, chaves, nomes de eventos, IDs, status, etc.) | Impossível refatorar com segurança, erros silenciosos, zero autocomplete | Extrair para `const` tipadas (`as const`) co-localizadas ou centralizadas |

### ✅ Obrigatório

- **`strict: true`** no `tsconfig.json` — sempre manter ativo
- **Inferência de tipos do Prisma** — usar tipos gerados em `@/generated/prisma/client` (ex: `User`, `Workout`) e `Prisma.ModelGetPayload<{}>` para tipos com relações
- **Zod** para validação de dados em runtime (inputs de API, env vars)
- **Path aliases** — usar `@/*` para imports (nunca paths relativos longos)
- **Tipos exportados** ao lado do schema/módulo onde são definidos

---

## 3.1 No Magic Strings — Princípio Geral

> 🔴 **OBRIGATÓRIO:** Nunca usar strings literais hardcoded como identificadores, chaves de configuração, nomes de eventos, status, IDs de funções, ou qualquer valor que represente uma identidade no sistema. Toda string que funciona como "chave" ou "identificador" deve ser extraída para uma constante tipada.

### Razão

Strings hardcoded são invisíveis ao type-checker, impossibilitam refatorações seguras (Find & Replace falha silenciosamente), não oferecem autocomplete e produzem erros que só aparecem em runtime.

### Padrão: Constantes Tipadas `as const`

```ts
// ✅ Correto — constante tipada, autocomplete, refactoring seguro
const ORDER_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;

if (order.status === ORDER_STATUS.COMPLETED) { ... }

// ❌ Proibido — magic string, erro silencioso
if (order.status === 'completed') { ... }
```

### Onde se Aplica

| Contexto | Exemplo ❌ | Exemplo ✅ |
|----------|-----------|----------|
| Status/estados | `'pending'`, `'active'` | `STATUS.PENDING`, `STATUS.ACTIVE` |
| Event names | `'user.created'` | `EVENTS.USER_CREATED` |
| Function IDs | `'process-order'` | `FUNCTIONS.PROCESS_ORDER` |
| Step names (Inngest) | `step.run('load-quote', ...)` | `step.run(STEPS.LOAD_QUOTE, ...)` |
| Cache keys | `'cache:user:123'` | `CACHE_KEYS.user(id)` |
| Route paths | `'/api/users'` | `ROUTES.API.USERS` |
| Roles/permissions | `'admin'`, `'editor'` | `ROLES.ADMIN`, `ROLES.EDITOR` |

### Exceções Aceitas

Strings usadas em contexto **descritivo** (não como identificador) são permitidas:
- Mensagens de log: `log.info('Order processed')`
- Mensagens de erro: `throw new Error('Quote not found')`
- Conteúdo JSX: `<p>Bem-vindo</p>`
- Labels de UI: `description: 'Depósito via PIX'`

### Enforcement

- **ESLint automático:** Regra `swapo/no-hardcoded-step-names` para Inngest `step.run()` / `step.sendEvent()`
- **Code review:** Para todos os demais contextos, magic strings devem ser identificadas e corrigidas durante revisão de código

---

## 3.2 Acesso ao Banco de Dados — Somente via Repository (DDD)

> 🔴 **OBRIGATÓRIO:** Todo acesso ao banco de dados (`import { db } from "@/lib/db"`) é **estritamente proibido** fora de arquivos Repository. Nenhum componente, service, action, API route ou qualquer outro artefato pode importar `db` diretamente. A única exceção são arquivos cujo nome contém `repository` (ex: `user-repository.ts`, `webhook-repository.ts`).

### Regras

| Regra | Descrição |
|-------|-----------|
| **Arquivos `.tsx` nunca acessam DB** | Nenhum componente React (Server ou Client) pode importar `{ db }` de `@/lib/db`. Zero exceções. |
| **Apenas `*-repository.ts` importa `db`** | Somente arquivos com `repository` no nome podem conter `import { db } from "@/lib/db"`. |
| **Um Repository por entidade** | Cada entidade do domínio deve ter seu próprio arquivo repository (ex: `user-repository.ts`, `quote-repository.ts`). |
| **Repository vive no domínio** | O arquivo repository deve ficar no pacote do domínio correspondente: `src/domains/<dominio>/services/<entidade>-repository.ts`. |

### Padrão de Implementação

```ts
// ✅ Correto — Repository centraliza todas as queries da entidade
// src/domains/users/services/user-repository.ts
import { db } from '@/lib/db';

export async function findUserById(userId: string) {
    return db.user.findUnique({ where: { id: userId } });
}

export async function updateUserEmail(userId: string, email: string) {
    return db.user.update({ where: { id: userId }, data: { email } });
}
```

```ts
// ✅ Correto — Service/Action/API chama o repository, nunca o db diretamente
// src/domains/users/services/user-service.ts
import { findUserById } from './user-repository';

export async function getUserProfile(userId: string) {
    const user = await findUserById(userId);
    if (!user) throw new Error('User not found');
    return user;
}
```

```ts
// ❌ PROIBIDO — Acesso direto ao db fora de repository
// src/app/api/v1/users/route.ts
import { db } from '@/lib/db'; // ← ESLint ERROR: swapo/no-direct-db-access

export async function GET() {
    const allUsers = await db.user.findMany(); // PROIBIDO
}
```

### Razão

- **Isolamento de camada:** Mantém a camada de Delivery (app/) e Domain Services livres de dependência direta do ORM.
- **Testabilidade:** Repositories podem ser facilmente mockados nos testes sem precisar mockar o Prisma inteiro.
- **Centralização de queries:** Evita queries duplicadas espalhadas pelo projeto. Toda lógica de acesso a dados fica em um único ponto de manutenção.
- **Rastreabilidade:** Facilita auditoria de segurança — basta revisar os arquivos `*-repository.ts` para saber tudo que toca o banco.

### Enforcement

- **ESLint automático:** Regra `swapo/no-direct-db-access` (nível `error`) — bloqueia qualquer `import { db } from "@/lib/db"` fora de arquivos `*-repository.ts`.
- **Exceções permitidas:** Arquivos de teste (`*.test.ts`, `__tests__/`), arquivos de seed (`prisma/seed.ts`) e Server Actions autorizados.

---

## 3.3 Banco de Dados e Migrações Estritas (Multi-Ambiente)

> 🔴 **OBRIGATÓRIO:** Como o Mentoria Fit opera em múltiplos ambientes (Desenvolvimento, Staging/Test e Produção), é **terminantemente proibido** utilizar `prisma db push` ou efetuar alterações estruturais manualmente diretamente nos bancos de dados de qualquer ambiente.

### Diretrizes de Modificação de Esquema:
1. **Migrations Físicas Obrigatórias:** Toda e qualquer alteração de esquema no arquivo `prisma/schema.prisma` exige a criação de uma migration oficial através do comando `npx prisma migrate dev --name <nome_da_migration>`.
2. **Commit Junto ao Código:** A pasta da nova migration gerada sob `prisma/migrations/` **DEVE** ser commitada no Git sob o mesmo commit/Pull Request que introduz as mudanças correspondentes no código.
3. **Impossibilidade de `db push` em Ambientes Compartilhados:** Ambientes de staging/test e produção utilizam o pipeline automatizado via `npx prisma migrate deploy` durante a fase de build. A ausência dos arquivos físicos de migration no repositório causará falhas severas de runtime devido a tabelas ou colunas inexistentes no banco de dados desses ambientes.

---

## 4. Estilo de Código

| Aspecto | Convenção |
|---------|-----------|
| **Funções** | Arrow functions para módulos, function declarations para exports nomeados |
| **Imports** | Organizados: externos → internos → types |
| **Naming** | camelCase (variáveis/funções), PascalCase (componentes/tipos/interfaces) |
| **Enums DB** | SCREAMING_SNAKE_CASE (ex: `EM_FORMACAO`, `TIER_1`) |
| **Arquivos** | kebab-case (ex: `odds-filter.ts`, `compact-card.tsx`) |
| **Componentes** | PascalCase (ex: `CompactCard.tsx` exporta `CompactCard`) |

---

## 5. Testes Automatizados

A testabilidade é um pilar do projeto. A forma como escrevemos e armazenamos os testes deve seguir a nossa organização por domínio isolado e em camadas separadas.

- **Framework:** Vitest
- **Padrão:** AAA (Arrange → Act → Assert)
- **Localização:** Co-localizados com o arquivo testado (por exemplo, `services.spec.ts` ficará dentro do diretório correspondente como `domains/<dominio>/services/`).
- **Cobertura:** `@vitest/coverage-v8`
- **Comandos:** `npm test` (run), `npm run test:watch` (watch mode)
- **Foco no Comportamento (Behavior):** Teste efeitos colaterais e retornos. Evite testar detalhes de implementação interna.
- **Mocks e Stubs:** Como usamos Injeção de Dependência (DI), passe implementações falsas ou in-memory repositories nos parâmetros. Evite mockar módulos inteiros usando a biblioteca agressivamente.
- **Testes de Integração / E2E:** Testes de ponta a ponta que abrangem fluxos completos do sistema devem ficar isolados em `tests/e2e/`.

---

## 6. Princípios Fundamentais de Engenharia

### Clean Code e S.O.L.I.D.

* **Nomes Descritivos:** Variáveis, funções e classes devem revelar sua intenção no contexto do domínio (ex: `processSubscriptionPayment` ao invés de `updateData`).
* **Princípio da Responsabilidade Única (SRP):** Cada arquivo ou função deve ter apenas um motivo para mudar. Extraia comportamentos se necessário.
* **Injeção de Dependência (DI):** Evite instanciar objetos globais diretamente na regra de negócio. Facilite o mock passando dependências como parâmetros para suas funções e serviços.

---

## 7. Ecossistema React 19 & Next.js 16

* **Server Components por Padrão:** Tire máximo proveito dos Server Components. Eles reduzem bundle, melhoram SEO e a performance geral limitando muito do processamento ao servidor.
* **Uso Cirúrgico do `"use client"`:** Habilite o Client Side Rendering restritamente nas "folhas" da árvore de componentes, apenas quando precisar de interatividade na DOM (effects ou state hooks).
* **Server Actions Seguras:** Utilize Server Actions apenas após validá-las do lado de roteamento de entrega (`src/app/`). Declare as lógicas dessas Server Actions dento de seus próprios domains, agnósticas ao cliente (ex: `domains/<dominio>/actions/`).

---

## 8. Segurança e Variáveis de Ambiente (.env)

### Mass Assignment e Over-fetching (CRÍTICO)
> 🔴 **MANDATORY:** Mutações e consultas em `src/app/api/` devem validar **estritamente** dados recebidos e enviados.
* **Entradas (Payloads):** NUNCA confie enviar payloads cegos do usuário diretamente pro Banco/Services. Utilize parsers (como o Zod) e exija chaves precisas. Campos excedentes (`isAdmin`, tokens injetados maliciosamente) não esperados devem ser filtrados/ignorados nas validações.
* **Saídas (Data Leaks):** Ao devolver dados ao cliente, selecione pontualmente colunas necessárias da consulta ao banco. Bloqueie o uso preguiçoso de `SELECT *` e o retorno engessado do objeto inteiro do repositório para a View. NUNCA devolva hashs de senhas, UUIDs privados e tokens pela API.

### Environment Management
* **NUNCA commitar:** O arquivo `.env` fica sempre no `.gitignore`. Mantenha apenas o `.env.example` atualizado para o onboarding da equipe.
* **Fail Fast na Inicialização:** Valide todas as variáveis de ambiente na inicialização usando TypeScript e Zod. Se uma chave crítica faltar, a aplicação nem deve iniciar.
* **Segurança na Borda:** Apenas as variáveis prefixadas com `NEXT_PUBLIC_` ficam acessíveis ao navegador. Chaves de servidor não podem vazar de forma alguma.

---

## 9. Lint & Build

A qualidade do código é garantida automatizando inspeções estáticas antes da compilação:

- `npm run lint` — ESLint com autocorretor de sintaxe.
- `npm run build` — Verifica tipagem completa (`tsc --noEmit`), executa o ESLint, depois faz o Next.js build.
- `npm run dev` — Executa type-check, lint e, se ok, sobe o Next.js dev server.

> O pipeline de `build` e `dev` executa type-check e lint **antes** de compilar, garantindo qualidade contínua e evitando que regressões quebrem o workflow da equipe.

---

## 10. Padronização de Git e Commits

Utilize o padrão **Conventional Commits** para o histórico da base:
- `feat:` (nova funcionalidade)
- `fix:` (correção de bug)
- `refactor:` (refatoração sem mudança de comportamento)
- `docs:` (documentação)
- `test:` (adição/alteração de testes)
- `chore:` (configuração, deps, CI)
- `style:` (formatação, CSS)

---

## 11. Sincronização da Base de Conhecimento da IA (RAG)

> 🔴 **OBRIGATÓRIO:** Toda vez que um novo fluxo, integração de terceiros (Stripe, WhatsApp, HeyGen), regra de negócio ou fluxo de tela for implementado ou alterado, a base de conhecimento estática em `docs/kb/` **DEVE** ser atualizada em sincronia com o código. Isso garante que os assistentes de IA integrados na plataforma tenham acesso a informações 100% corretas e atualizadas.

### 🛡️ Regra Estrita de Segurança e Escopo dos Arquivos em `docs/kb/`
> ⚠️ **PROIBIÇÃO ABSOLUTA DE DADOS TÉCNICOS / SENSÍVEIS:** A pasta `docs/kb/` é destinada **exclusivamente ao suporte e orientação dos usuários finais (Alunos, Treinadores e Admins)** através do `/chat`.
> 
> ❌ **É TERMINANTEMENTE PROIBIDO incluir em `docs/kb/`:**
> - Schemas do Prisma (`model ... { ... }`), definições de SQL ou migrações.
> - Nomes de tabelas de banco, nomes de colunas ou chaves de banco (`calendar_connections`, `access_token`, `refresh_token`).
> - Detalhes de infraestrutura interna, portas, topologia de servidores e chaves/variáveis de ambiente sensíveis (`.env`, `RESEND_API_KEY`, etc.).
> - Endpoints internos ou payloads brutos de backend desnecessários para o usuário final.
> - Mecanismos e rotas de bypass de testes internos (`/api/test/*`, `format=json`).
>
> ✅ **O que DEVE constar em `docs/kb/`:**
> - Passo a passo de telas, botões e navegação (onde clicar, o que preencher).
> - Regras de negócio e políticas funcionais (prazos de vencimento, carência, limites de planos, como funciona o split).
> - Guias de uso e configuração do ponto de vista do usuário.
> - Respostas para dúvidas comuns (FAQ) e soluções de problemas operacionais (Troubleshooting).
>
> 📁 **Onde documentar arquitetura e detalhes de engenharia:** Informações técnicas de backend, schemas de banco e topologia devem ser colocadas em `docs/architecture/` ou `docs/rules/`, **NUNCA** dentro de `docs/kb/`.

### Diretrizes de Atualização:
1. **Lógicas de Negócio e Funcionalidades:** Ao alterar regras ou fluxos do sistema (ex: Stripe Connect, WhatsApp, Clones de IA), atualize os arquivos markdown correspondentes em `docs/kb/trainer/` ou `docs/kb/student/` ou `docs/kb/common/` com os detalhes funcionais atualizados e FAQ correspondente.
2. **Novas Funcionalidades / Módulos:** Ao criar uma funcionalidade inédita, crie um arquivo `.md` correspondente na pasta correta sob `docs/kb/` e adicione o mapeamento por palavra-chave e RegEx no resolvedor [kb-router.ts](file:///c:/projects/mentoria-fit/src/lib/kb-router.ts).
3. **Novas Telas / Rotas (Page-Aware Help):** Toda nova rota (`page.tsx`) ou refatoração profunda de tela exige a criação de um arquivo markdown correspondente em `docs/kb/common/screens/[nome-da-tela].md`, conforme as regras estritas de IDs consistentes descritas em `TSX_SCREEN_RULES.md`.

---

## 12. Padronização de Custos e Faturamento de APIs (Financial Control)

> 🔴 **OBRIGATÓRIO:** Toda nova integração de terceiros ou API externa que gere cobrança baseada em uso (ex: OpenAI, ElevenLabs, HeyGen, e-mails, SMS, WhatsApp, storage) **DEVE** implementar obrigatoriamente a interface de monitoramento financeiro. Isso garante que o Super Admin Dashboard (`/admin/financials`) consiga consolidar despesas e faturamento de forma automatizada e em tempo real.

### Diretrizes de Implementação:
1. **Interface Provedora de Custo (`BillableAPIProvider`):**
   Cada serviço billable deve expor um método de infraestrutura ou serviço para coletar os dados de consumo em BRL/USD do mês corrente.
   ```ts
   export interface APICostMetrics {
     costBRL: number;      // Valor final do custo convertido e formatado em BRL
     usageCount: number;   // Volume de uso registrado no mês (ex: tokens, emails, min)
     limitCount?: number;  // Limite contratado se for plano fixo
     unitLabel: string;    // Unidade de medida (ex: "tokens", "caracteres", "minutos", "instâncias")
     status: "active" | "warning" | "exhausted";
   }
   ```
2. **Registro Centralizado no FinancialService:**
   O método coletor deve ser registrado em `FinancialService.getAPICosts()` para que o somatório de despesas operacionais da plataforma seja atualizado automaticamente no dashboard principal.
3. **Registro Fino de Logs de Consumo (`api_usage_logs`):**
   Mutações de API de alto custo (ex: renderização de vídeos no Creatomate/HeyGen, clonagem de voz, chamadas massivas de IA) **DEVEM** registrar um log estruturado em banco de dados (`ApiUsageLog`) contendo `serviceName`, `tokensOrUnits`, `estimatedCostBRL` e o `tenantId`/`userId` causador do custo. Isso garante o controle de margem por professor e detecção de abusos/anomalias.
4. **Tratamento de Moedas:**
   Conversões de USD para BRL devem utilizar a utility `CurrencyMath` para evitar erros de ponto flutuante no banco e respeitar a cotação média definida na configuração operacional.

---

## 13. Sistema de Versionamento do Onboarding (Guias e Tutoriais)

> 🔴 **OBRIGATÓRIO:** Toda vez que você adicionar, alterar ou remover passos de um tutorial de onboarding (`Driver.js`) ou modal de lançamento de versão (`SkillUpModal`), você **DEVE** incrementar a versão do tour correspondente no frontmatter do arquivo markdown da tela (dentro de `docs/kb/common/screens/`).

### Diretrizes de Versionamento:
1. **Incremento de Versão:** A alteração de passos ou lógica de um tour sem o incremento da versão impede que os usuários antigos (que já concluíram o tour na versão anterior) recebam a atualização. O incremento força a reexibição do tour para todos os usuários.
2. **Formato no Banco de Dados:** O status de conclusão é salvo na tabela `UserTourStatus` com a chave no formato `{pageKey}:v{version}` (ex: `trainer-dashboard:v2`).
3. **Resets e Limpezas:** Toda limpeza/reset de status de conclusão deve utilizar busca por prefixo (`startsWith(pageKey)`) para limpar todas as versões históricas daquela tela para o usuário.
4. **Referência:** Consulte o guia detalhado em [onboarding.md](file:///e:/projects/mentoria-fit/docs/kb/common/onboarding.md) para saber mais sobre o funcionamento técnico do sistema.

---

## 14. Central de Notificações e Mensageria Unificada (MANDATÓRIO)

> 🔴 **Regra de Ouro da Central de Notificações (OBRIGATÓRIO):** É expressamente PROIBIDO realizar qualquer disparo de notificação externo (seja por WhatsApp/Z-API, E-mail/Resend ou Push/FCM) de forma isolada, avulsa ou desvinculada.
>
> ### Diretrizes Estritas:
> 1. **Ponto Único de Entrada:** TODA notificação gerada pelo sistema (cobranças, vencimentos, renovações, novos treinos, mensagens, avisos) DEVE ser roteada pela **Central de Notificações** via Inngest (`notification/send` -> `sendNotification`) ou serviço de domínio de notificações (`@/domains/notifications`).
> 2. **Persistência Obrigatória no App:** Toda notificação deve criar o registro correspondente no banco (`db.notification` / modelo `Notification`), garantindo que o usuário sempre veja o histórico completo e interativo ao abrir o sino de notificações no aplicativo (`/student` ou `/trainer`), além de receber pelos canais externos vinculados (WhatsApp / E-mail / Push).
> 3. **Rastreabilidade e Idempotência:** Disparos de cobrança, renovação ou avisos críticos devem registrar metadata e timestamps para auditoria e prevenção de mensagens duplicadas.
