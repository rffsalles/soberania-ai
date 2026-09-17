# Plano de Implementação: Filtragem Estrita de Citações RAG por Referências Selecionadas e Categoria da Disciplina

Resolução do bug onde citações de "Banco de Dados" surgiam na geração de Plano de Ensino para a disciplina "Matemática", garantindo alinhamento estrito com o **PRD** (RAG Grounding On-Premises, precisão e soberania) e com o **UX_UI_DESIGN_SYSTEM** (Cards com estética Glassmorphism, feedback claro e sem ruído visual).

---

## Contexto & Problema Diagnóstico

Atualmente, na rota `POST /api/v1/teacher/plans/generate`, a função `executeHybridSearch` realiza buscas no `DIDACTIC_CORPUS` sem filtrar os chunks por categoria ou por referências selecionadas pelo usuário. Como resultado, ao buscar por termos genéricos como `"Matemática fundamentos conceitos"`, a busca por similaridade léxica/vetorial atribui pontuações de fallback para chunks de categorias técnicas não relacionadas (como `Banco de Dados` -Navathe & Elmasri), resultando na exibição de citações de Banco de Dados em planos de aula de Matemática.

---

## Escopo das Alterações

### 1. `src/domains/rag/types.ts`
- Expandir a interface `RAGSearchQuery` para suportar:
  - `subjectName?: string`
  - `categories?: string[]`
  - `allowedMaterialIds?: string[]`
  - `minRelevanceScore?: number`

### 2. `src/domains/rag/hybrid-search.ts`
- Atualizar a função `executeHybridSearch`:
  - Filtrar o `DIDACTIC_CORPUS` antes do cálculo de pontuação RRF/BM25/Vetorial:
    - Se `allowedMaterialIds` for passado, restringir busca apenas aos materiais cujos IDs correspondem.
    - Se `subjectName` ou `categories` forem informados, filtrar chunks cuja `category` seja compatível com a matéria ou pertença às categorias transversais/pedagógicas (`Metodologias Ativas & Pedagogia`, `Diretrizes Curriculares Nacionais (DCN / MEC)`).
    - Descartar chunks de categorias não relacionadas (ex: `Banco de Dados` quando a matéria é `Matemática`).

### 3. `src/app/api/v1/teacher/plans/generate/route.ts`
- Atualizar o handler `POST`:
  - Repassar `subjectName` e as referências selecionadas em `body.selectedReferences` para o RAG.
  - Se houver `selectedReferences`, ancorar as citações RAG no acervo selecionado.
  - Se `selectedReferences` estiver vazio, filtrar a busca RAG pela categoria correspondente a `subjectName`.

### 4. `src/app/teacher/plans/new/_components/PlanTelemetryCard.tsx`
- Garantir a renderização limpa das citações filtradas com componentes da UI de acordo com o `UX_UI_DESIGN_SYSTEM`.

---

## Plano de Verificação

1. **Testes Unitários:** Executar `npm test` para validar que a busca por `subjectName: 'Matemática'` exclui a categoria `'Banco de Dados'`.
2. **Teste Manual:** Testar via UI (`/teacher/plans/new`) digitando "Matemática" e gerando o plano para confirmar a ausência de citações de Banco de Dados.
