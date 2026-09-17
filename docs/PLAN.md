# Plano de Orquestração: Tabela de Categorias, AdvancedMultiCombobox e Vínculos N:N

## 1. Visão Geral e Objetivos

Este plano estabelece a arquitetura, modelo relacional e componentes para atender aos requisitos:
1. **Tabela Base para Categorias** (`DocumentCategory`): Normalizar as categorias de acervo bibliográfico/documentos no banco de dados via Prisma, com migração física obrigatória e endpoint dedicado.
2. **Componente `AdvancedMultiCombobox`**: Criar um componente de seleção múltipla mantendo paridade visual e funcional total com o `AdvancedCombobox` (busca em tempo real, título, subtítulo, badge contextual e botão inline "+ Adicionar novo registro..."), com chips/tags visuais removíveis.
3. **Decisão Arquitetural (Separar vs Parametrizar)**: Recomendamos fortemente a **separação em dois componentes especializados (`AdvancedCombobox` e `AdvancedMultiCombobox`)** co-localizados no mesmo módulo, compartilhando tipos e estilos, respeitando SRP, facilitando tipagem e garantindo zero regressão.
4. **Alocação Docente N:N em Disciplinas (`/admin/subjects` e modais)**: Substituir o seletor arcaico de checkboxes pelo `AdvancedMultiCombobox`, permitindo pesquisa de professores por nome/matrícula e cadastro inline de novo docente.
5. **Categorização Múltipla na Ingestão de Documentos (`ReferenceSelectionModal.tsx`)**: Substituir o campo de texto livre de categoria pelo `AdvancedMultiCombobox`, permitindo associar N categorias à obra e criar novas categorias inline via modal adaptativa.

---

## 2. Decisão Arquitetural: Separar vs Parametrizar o Componente

### Recomendação Técnica: Separar em `AdvancedCombobox` e `AdvancedMultiCombobox`

| Critério | Parametrizar no mesmo componente (`multiple?: boolean`) | Separar (`AdvancedCombobox` + `AdvancedMultiCombobox`) *(Recomendado)* |
|---|---|---|
| **Tipagem TypeScript** | Complexa (discriminated union condicional `selectedId` vs `selectedIds`) com alto risco de type cast | 100% tipado e limpo (`selectedId: string \| null` vs `selectedIds: string[]`) |
| **Complexidade e LOC** | Mistura lógica de fechamento automático com retenção de popover e gestão de chips (> 400 LOC) | Cada componente focado em um caso de uso específico (< 250 LOC cada), respeitando o teto de 350 LOC |
| **Risco de Regressão** | Alto (pode quebrar telas existentes como a criação de plano de ensino) | Zero (telas existentes continuam funcionando sem qualquer alteração) |
| **Experiência de Uso (DX)** | Nomes de props ambíguos | Nomes semânticos e autocomplete perfeito no IDE |

Ambos serão exportados a partir de `@/components/ui/advanced-combobox`, compartilhando a interface de itens `ComboboxItem` e as mesmas diretrizes de acessibilidade e design system.

---

## 3. Matriz de Agentes Envolvidos (Mínimo 4 Agentes)

| # | Agente | Foco de Atuação | Entregáveis |
|---|---|---|---|
| 1 | `project-planner` | Quebra de requisitos, arquitetura de componentes e plano | `docs/PLAN.md` e `implementation_plan.md` |
| 2 | `database-architect` | Modelagem `DocumentCategory`, migração física Prisma e seeds | `prisma/schema.prisma`, `prisma/migrations/20260917120000_add_document_category/migration.sql` |
| 3 | `backend-specialist` | Endpoints `/api/v1/library/categories` e suporte a múltiplas categorias no upload | `src/app/api/v1/library/categories/route.ts`, atualização de `/api/v1/library/documents/route.ts` |
| 4 | `frontend-specialist` | Criação do `AdvancedMultiCombobox`, modal `CategoryCreateInlineModal`, atualização de `/admin/subjects` e `ReferenceSelectionModal` | `src/components/ui/advanced-combobox.tsx`, `CategoryCreateInlineModal.tsx`, `ReferenceSelectionModal.tsx`, `AdminSubjectsPage.tsx` |
| 5 | `test-engineer` | Validação de tipos, linter, testes unitários e testes E2E com DevTools | `tsc --noEmit`, ESLint, Vitest e validação do fluxo |

---

## 4. Detalhamento da Implementação

### 4.1 Banco de Dados (`database-architect`)
- **Novo Modelo**: `DocumentCategory`
  ```prisma
  model DocumentCategory {
    id          String   @id @default(cuid())
    name        String   @unique
    description String?  @db.Text
    color       String?  @default("teal")
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt

    @@map("document_categories")
  }
  ```
- **Migração Física Obrigatória**:
  - `prisma/migrations/20260917120000_add_document_category/migration.sql`
  - `npx prisma migrate deploy`

### 4.2 Backend & APIs (`backend-specialist`)
- **Nova Rota `/api/v1/library/categories`**:
  - `GET`: Retorna todas as categorias cadastradas no banco, com cruzamento da quantidade de documentos e chunks indexados no RAG. Se a tabela estiver vazia, faz auto-seed das categorias canônicas institucionais ("Engenharia de Software", "Banco de Dados", "Algoritmos", "Inteligência Artificial", "Direito Constitucional", "Gestão & Negócios", "Metodologia Científica").
  - `POST`: Cria nova categoria com validação Zod (`name`, `description`, `color`), tratando unicidade (case-insensitive) e retornando o registro criado.
- **Atualização de `/api/v1/library/documents`**:
  - Aceitar `categories: string[]` (ou `category: string` retrocompatível) no POST de ingestão.

### 4.3 Frontend & Componentes UI (`frontend-specialist`)
1. **`AdvancedMultiCombobox`** em `src/components/ui/advanced-combobox.tsx`:
   - Props:
     - `items: ComboboxItem[]`
     - `selectedIds: string[]`
     - `onSelectionChange: (selectedIds: string[], items: ComboboxItem[]) => void`
     - `addNewLabel?: string`
     - `onAddNewClick?: () => void`
     - `searchPlaceholder?: string`
     - `placeholder?: string`
   - Trigger do botão:
     - Exibe chips com botão "x" de remoção rápida.
     - Quando muitos itens (>3), resume com badge `+N mais`.
   - Dropdown / Popover:
     - Campo de busca instantânea com auto-foco.
     - Lista com checkbox visual selecionável.
     - Não fecha o popover no clique (permite selecionar vários itens sem atrito).
     - Botão "+ Adicionar novo registro..." no rodapé.
2. **Modal Inline de Criação de Categoria (`CategoryCreateInlineModal.tsx`)**:
   - Desenvolvida com `AdaptiveModal` em `src/app/teacher/plans/new/_components/CategoryCreateInlineModal.tsx`.
   - Permite cadastrar nome e descrição da categoria e a seleciona imediatamente no combobox.
3. **Atualização da Biblioteca (`ReferenceSelectionModal.tsx`)**:
   - Na aba "3. Enviar Novo Documento", trocar o `<Input>` pelo `<AdvancedMultiCombobox>`.
   - Integrar com o cadastro rápido via `CategoryCreateInlineModal`.
4. **Atualização da Gestão de Disciplinas (`src/app/admin/subjects/page.tsx`)**:
   - Substituir a lista de checkboxes por `<AdvancedMultiCombobox>` para professores alocados à disciplina.
   - Conectar o botão inline "+ Cadastrar Novo Professor..." à modal já existente `isTeacherModalOpen`.

---

## 5. Plano de Verificação (`test-engineer`)
1. `rtk npx tsc --noEmit` → Zero erros de compilação.
2. `rtk npm run lint` → Zero advertências ESLint.
3. `rtk npm test` → Todas as suítes de testes Vitest aprovadas.
4. `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .` → Validação de segurança.
5. `python .agent/skills/lint-and-validate/scripts/lint_runner.py .` → Validação de conformidade.
6. Verificação no Chrome DevTools:
   - Adicionar novo documento selecionando múltiplas categorias e criando categoria inline.
   - Alocação docente N:N com pesquisa e seleção múltipla na tela de disciplinas.
