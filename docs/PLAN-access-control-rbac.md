# PLAN-access-control-rbac: Controle de Acesso Seguro e RBAC Soberano com Revogação Ativa de Sessão

> **Status:** Proposto / Planejamento Atualizado  
> **Tipo de Projeto:** WEB (Next.js 15, React 19, Prisma, PostgreSQL, Jose/WebCrypto)  
> **Objetivo:** Implementar controle de acesso integral (RBAC), proteção de rotas via `middleware.ts`, proteção da apresentação `/pitch`, landing page pública em `/` com botão de autenticação institucional, e autenticação soberana por Matrícula/E-mail com sessões ativas revogáveis no PostgreSQL.

---

## 1. Visão Geral e Arquitetura

O sistema **Soberania AI** opera sob diretrizes rigorosas de soberania de dados (LGPD e arquitetura local com zero egress). Para proteger as rotas dos três perfis (`STUDENT`, `TEACHER`, `ADMIN`) e salvaguardar o conteúdo institucional do `/pitch`, implementaremos uma camada de autenticação nativa sem provedores externos.

### Princípios Arquiteturais:
1. **Identificação Acadêmica:** Login prioritário via **Matrícula (`enrollment`)** ou e-mail institucional.
2. **Sessões com Revogação Ativa:** Toda sessão possui registro físico no banco (`Session`), permitindo revogação instantânea em caso de logout ou término de matrícula.
3. **Página Inicial Pública (`/`):** Landing page institucional aberta com apresentação visual da solução e botão claro de autenticação para alunos, professores e gestores.
4. **Proteção Estrita de `/pitch`:** A rota de apresentação do pitch passa a ser **restrita a usuários autenticados** (qualquer perfil validado). Visitantes anônimos são redirecionados para `/login?redirect=/pitch`.
5. **Intercepção Global no `middleware.ts`:** Validação de integridade do token de sessão no Edge Runtime do Next.js (< 1ms) sem sobrecarga no PostgreSQL para cada requisição estática.

---

## 2. Matriz de Permissões e Proteção de Rotas (RBAC)

| Rota / Prefixo | Público? | Papéis Permitidos | Ação se Não Autenticado | Ação se Papel Incorreto |
|---|---|---|---|---|
| `/` (Landing Page) | ✅ Sim | Todos (visitantes e logados) | Permite visualização pública; exibe botão "Entrar" | N/A |
| `/login` | ✅ Sim | Visitantes (redireciona se logado) | Permite acesso ao formulário | Redireciona para o painel do perfil |
| `/pitch` | ❌ Não | `STUDENT`, `TEACHER`, `ADMIN` | Redireciona para `/login?redirect=/pitch` | N/A (qualquer role autenticada) |
| `/(student)/*` (`/dashboard`, `/classroom`, `/exam`, `/study-group`) | ❌ Não | `STUDENT`, `TEACHER`, `ADMIN` | Redireciona para `/login?redirect=...` | 403 Forbidden |
| `/(teacher)/*` (`/materials`, `/reports`) | ❌ Não | `TEACHER`, `ADMIN` | Redireciona para `/login?redirect=...` | 403 Forbidden |
| `/(admin)/*` (`/appliance`) | ❌ Não | `ADMIN` | Redireciona para `/login?redirect=...` | 403 Forbidden |
| `/api/v1/auth/login` | ✅ Sim | Todos | Processa autenticação | N/A |
| `/api/v1/auth/logout`, `/me` | ❌ Não | Qualquer autenticado | 401 Unauthorized | N/A |
| `/api/v1/agent/chat` | ❌ Não | `STUDENT`, `TEACHER`, `ADMIN` | 401 Unauthorized | 403 Forbidden |
| `/api/v1/telemetry/*` | ❌ Não | `TEACHER`, `ADMIN` | 401 Unauthorized | 403 Forbidden |

---

## 3. Modelo de Dados (`prisma/schema.prisma`)

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  enrollment   String?  @unique
  passwordHash String
  role         Role     @default(STUDENT)
  avatarUrl    String?
  classId      String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  class        Class?                @relation(fields: [classId], references: [id])
  sessions     Session[]
  minutes      PedagogicalMinute[]
  interactions StudentInteraction[]
  submissions  ExamSubmission[]

  @@map("users")
}

model Session {
  id           String    @id @default(cuid())
  userId       String
  sessionToken String    @unique
  expiresAt    DateTime
  revokedAt    DateTime?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionToken])
  @@map("sessions")
}
```

> 🔴 **Regra de Migração Física Obrigatória:** Conforme `.agents/AGENTS.md`, toda e qualquer edição no schema exige a geração imediata da pasta e arquivo de migração em `prisma/migrations/`.

---

## 4. Detalhamento dos Módulos e Tarefas

### Tarefa 1: Banco de Dados e Migração Física do Prisma
- **Agente:** `database-architect` | **Skill:** `database-design`
- **Ação:**
  - Atualizar `prisma/schema.prisma` com `passwordHash` em `User` e modelo `Session`.
  - Executar `npx prisma migrate dev --name add_auth_sessions` para gerar migração física.
  - Criar seed / helper para provisionar usuários com senhas hash seguras:
    - Admin: `ADM001` / `admin@soberania.edu.br` (Senha: `admin123`)
    - Professor: `PROF001` / `professor@soberania.edu.br` (Senha: `prof123`)
    - Aluno: `202601001` / `aluno@soberania.edu.br` (Senha: `aluno123`)
- **INPUT:** `prisma/schema.prisma`
- **OUTPUT:** `prisma/migrations/*_add_auth_sessions/migration.sql`
- **VERIFY:** `npm run typecheck` e `prisma generate` executados com sucesso.

### Tarefa 2: Módulo Criptográfico e de Sessões Soberanas (`src/lib/auth/`)
- **Agente:** `backend-specialist` | **Skill:** `clean-code`
- **Ação:**
  - Instalar dependência leve `jose` (Edge-compatible) e `bcryptjs`.
  - Implementar `password.ts`: `hashPassword(plain)` e `verifyPassword(plain, hash)`.
  - Implementar `session.ts`:
    - `createSession(userId, reqMetadata)`: cria registro em `Session` no banco e gera JWT assinado com `AUTH_SECRET`.
    - `verifySessionToken(token)`: verifica assinatura criptográfica no Edge Runtime.
    - `revokeSession(sessionToken)`: marca `revokedAt = new Date()` no banco.
    - `getCurrentSession()`: busca a sessão ativa e confere revogação no DB.
- **INPUT:** Credenciais e tokens
- **OUTPUT:** `src/lib/auth/session.ts`, `src/lib/auth/password.ts`, `src/lib/auth/rbac.ts`
- **VERIFY:** Testes unitários com Vitest em `src/lib/auth/__tests__/session.test.ts`.

### Tarefa 3: Endpoints de Autenticação (`/api/v1/auth/*`)
- **Agente:** `backend-specialist` | **Skill:** `api-patterns`
- **Ação:**
  - `POST /api/v1/auth/login`: Validação com Zod (`loginSchema`: `identifier`, `password`), busca por `enrollment` ou `email`, checagem de hash, criação da sessão no banco e injeção do cookie `soberania_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`).
  - `POST /api/v1/auth/logout`: Revoga sessão no banco e limpa o cookie.
  - `GET /api/v1/auth/me`: Retorna `id`, `name`, `email`, `role`, `enrollment`.
- **INPUT:** Chamadas HTTP
- **OUTPUT:** Rotas em `src/app/api/v1/auth/`
- **VERIFY:** Testes de requisição com credenciais válidas e inválidas.

### Tarefa 4: Interceptor Global `src/middleware.ts`
- **Agente:** `security-auditor` | **Skill:** `vulnerability-scanner`
- **Ação:**
  - Definir rotas públicas estritas: `/` (Landing Page), `/login`, `/api/v1/auth/login` e arquivos estáticos.
  - **Proteger `/pitch`**: se não autenticado, redireciona para `/login?redirect=/pitch`.
  - Interceptar requisições privadas:
    - Extrair cookie `soberania_session`.
    - Validar JWT via `jose.jwtVerify`.
    - Bloquear ou redirecionar caso token inexista ou esteja expirado.
    - Aplicar checagem estrita de papel (RBAC):
      - `/appliance` -> apenas `ADMIN`.
      - `/materials`, `/reports` -> `TEACHER` ou `ADMIN`.
      - `/dashboard`, `/classroom`, `/exam`, `/study-group`, `/pitch` -> qualquer usuário autenticado.
    - Redirecionar usuário logado que tente acessar `/login` para sua tela inicial correspondente.
- **INPUT:** NextRequest
- **OUTPUT:** `src/middleware.ts`
- **VERIFY:** Navegação automática e testes de rota protegida gerando redirecionamento correto.

### Tarefa 5: Landing Page Pública em `/` e Interface de Login (`/login`)
- **Agente:** `frontend-specialist` | **Skill:** `frontend-design`
- **Ação:**
  - **Refatorar `src/app/page.tsx`:** Substituir o spinner de redirecionamento por uma **Landing Page Institucional** completa:
    - Apresentação da plataforma Soberania AI (Inteligência Artificial Soberana para Educação Brasileira).
    - Botão primário destacado: **"Acessar Plataforma" / "Entrar com Matrícula"** direcionando para `/login`.
    - Botão secundário: **"Ver Apresentação Executiva"** direcionando para `/pitch` (que exigirá login prévio).
    - Destaques de Soberania de Dados, Zero Egress e LGPD.
  - **Criar `src/app/(auth)/login/page.tsx` e `LoginPage.tsx`:**
    - Campos de Matrícula/E-mail e Senha.
    - Feedback de erro inline (conforme `FORM_VALIDATION.md`).
    - Botões de atalho/demo ("Entrar como Aluno", "Entrar como Professor", "Entrar como Administrador") para facilitar testes e avaliações.
    - Indicador de conformidade soberana: *"Autenticação Local Segura — Sem tráfego internacional de credenciais"*.
  - **Integrar `UserNav.tsx` no Header do Pitch e Telas Internas:**
    - Identificação do usuário logado, badge do papel (`Aluno`, `Professor`, `Admin`) e botão de Logout com revogação da sessão.
- **INPUT:** Formulário de login e landing page
- **OUTPUT:** `src/app/page.tsx`, `src/app/(auth)/login/page.tsx`, `UserNav.tsx`
- **VERIFY:** `ux_audit.py`, `accessibility_checker.py`, `npm run lint`.

---

## 5. Fase X: Checklist de Verificação e Integridade

- [ ] `prisma/schema.prisma` atualizado com migração física commitada em `prisma/migrations/`
- [ ] `npm run lint` passando com 0 erros/avisos
- [ ] `npm run typecheck` passando com 0 erros
- [ ] `npm test` passando com novos testes de login, sessões e RBAC
- [ ] `security_scan.py` executado sem vazamento de senhas ou segredos
- [ ] Teste de isolamento de rotas:
  - Visitante anônimo acessando `/` -> Acesso permitido (Landing Page com botão de login)
  - Visitante anônimo acessando `/pitch` -> Redirecionado para `/login?redirect=/pitch`
  - Aluno logado acessando `/pitch` -> Acesso permitido
  - Aluno tentando acessar `/appliance` -> Redirecionado ou 403
  - Aluno tentando acessar `/materials` -> Redirecionado ou 403
  - Usuário não autenticado tentando acessar `/dashboard` -> Redirecionado para `/login`
  - Logout revoga a sessão no banco e impede reutilização de tokens antigos
