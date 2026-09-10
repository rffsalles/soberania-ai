# Plano de Implementação: Sugestões de Melhoria (Auditoria de Código)

Este plano operacionaliza as melhorias identificadas na auditoria de conformidade técnica e arquitetural do projeto **Soberania AI**.

---

## 1. Escopo das Melhorias

### 1.1 Banco de Dados e Índices Relacionais (`database-architect`)
- **Problema:** As relações `User.classId` e `Agenda.classId` não possuíam índices explícitos `@@index([classId])`, o que acarreta *seq scans* em consultas de turmas e agendas associadas. Adicionalmente, o modelo `ExamSubmission` não possuía o campo `createdAt DateTime @default(now())`, recomendado pelas diretrizes de governança de dados.
- **Ação:**
  - Atualizar `prisma/schema.prisma` com `@@index([classId])` em `User` e `Agenda`.
  - Adicionar `createdAt DateTime @default(now())` em `ExamSubmission`.
  - Gerar migração física em `prisma/migrations/20260910000003_add_class_indexes_and_created_at/migration.sql`.
  - Executar `rtk npx prisma generate` para sincronizar o Prisma Client.

### 1.2 Acessibilidade WCAG e Navegação por Teclado (`frontend-specialist`)
- **Problema:** O layout raiz `src/app/layout.tsx` não continha o link de salto rápido (*skip-to-main-content link*), exigido pelas diretrizes WCAG 2.1 AA (Critério 2.4.1 - Bypass Blocks), nem o container semântico `<main id="main-content">`.
- **Ação:**
  - Inserir link com classes de utilidade acessível `sr-only focus:not-sr-only` e foco destacado no topo de `<body>`.
  - Envolver o corpo da aplicação em `<main id="main-content" className="flex-1 flex flex-col">`.

### 1.3 Verificação e Quality Gate (`test-engineer`)
- **Ação:**
  - Executar `schema_validator.py` e `accessibility_checker.py`.
  - Validar suite completa: `next lint`, `tsc --noEmit`, `vitest run`.
  - Executar checklist mestre: `python .agent/scripts/checklist.py .`.

---

## 2. Matriz de Agentes Envolvidos (Mínimo 3)

| Agente | Domínio | Responsabilidade |
|---|---|---|
| `project-planner` | Governança / Planejamento | Estruturação e divisão de tarefas |
| `database-architect` | Banco de Dados & Prisma | Modelagem, índices e migração SQL física |
| `frontend-specialist` | UI / Acessibilidade | Implementação do skip-link e semântica de layout |
| `test-engineer` | QA / Auditoria | Automação de testes, lint e validação de scripts |
