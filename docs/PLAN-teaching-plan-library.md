# Plano de Implementação: Seleção Dinâmica de Disciplina, Período Letivo & Biblioteca de Referências com Reutilização do RAG Existente

> **Task Slug:** `teaching-plan-library`  
> **Orquestração Multi-Agente:** `orchestrator`, `explorer-agent`, `backend-specialist`, `project-planner`  
> **Data:** 17 de Setembro de 2026  
> **Status:** Atualizado com Arquitetura RAG Integrada / Pronto para Aprovação

---

## 1. Descoberta & Reutilização da Infraestrutura de RAG Existente

Pesquisa completa realizada no codebase identificou que o ecossistema de **RAG Híbrido** e **Ingestão Documental** já se encontra 100% projetado e modularizado no domínio `src/domains/rag/`:

| Módulo Existente | Arquivo | Responsabilidade a ser Reutilizada |
|---|---|---|
| **Serviço de Ingestão** | [`src/domains/rag/ingestion.ts`](file:///c:/projects/soberania-ai/src/domains/rag/ingestion.ts) | `documentIngestionService.ingestMaterial(...)`: Executa parsing estruturado, chunking semântico com overlap (450 chars, 60 overlap preservando fronteiras de frases) e registro em lote. |
| **Busca Híbrida RRF** | [`src/domains/rag/hybrid-search.ts`](file:///c:/projects/soberania-ai/src/domains/rag/hybrid-search.ts) | `executeHybridSearch(...)`: Combina pontuação léxica (BM25 token match) e vetorial (FastEmbed Cosine approximation) via Reciprocal Rank Fusion (k=60). Gera citações oficiais `[Título · Cap. X, pág. Y]`. |
| **Corpus Didático** | `DIDACTIC_CORPUS` em `hybrid-search.ts` | Base de chunks oficiais já indexados (Navathe & Elmasri, Cormen, Artigos RBIE 2024, IEEE TLT 2025). Suporta inserção dinâmica via `addChunksToCorpus()`. |
| **Tipos de Domínio** | [`src/domains/rag/types.ts`](file:///c:/projects/soberania-ai/src/domains/rag/types.ts) | Tipagens consolidadas: `DidacticChunk`, `MaterialIngestionInput`, `RawDocumentPage`, `RAGSearchResult`. |
| **MCP Tools** | [`src/lib/mcp/tools/`](file:///c:/projects/soberania-ai/src/lib/mcp/tools/) | `ingestDidacticMaterialTool` e `searchDidacticMaterialTool` prontos para agentes inteligentes e pipelines autônomos. |
| **Orquestrador de IA** | [`src/domains/agents/agent-orchestrator.ts`](file:///c:/projects/soberania-ai/src/domains/agents/agent-orchestrator.ts) | Padrão consolidado de injeção de contexto RAG enriquecido (`MATERIAL DIDÁTICO RELEVANTE (RAG HÍBRIDO): \n ${ragContext}`). |

---

## 2. Como a Biblioteca de Documentos Usará o RAG Existente

A nova funcionalidade **NÃO criará silos isolados**. Em vez disso, a Biblioteca de Documentos será uma **camada de governança e interface visual sobre o `src/domains/rag/`**:

```
[ Interface do Professor (/teacher/plans/new) ]
          │
          ├── 1. Seleciona Disciplina Alocada + Período (Semestral / Anual / Flexível)
          │
          ├── 2. Modal Tríplice de Referências Bibliográficas:
          │       │
          │       ├── [Aba 1: Categorias] ──> Lê categorias do DIDACTIC_CORPUS agrupadas por `subject`
          │       │                          (ex: "Bancos de Dados", "Engenharia de Software", "DCNs")
          │       │
          │       ├── [Aba 2: Documentos] ──> Seleção granular das obras do DIDACTIC_CORPUS
          │       │                          (Navathe, Cormen, Artigos IEEE, etc.)
          │       │
          │       └── [Aba 3: Novo Upload] ─> Envia PDF/Texto ──> Chama documentIngestionService.ingestMaterial()
          │                                                       (Gera chunks com overlap e indexa no RAG em tempo real)
          │
          ├── 3. Botão "IA Socrática: Gerar Plano com base no Acervo"
          │       │
          │       └── Executa `executeHybridSearch({ query, subject })` sobre os materiais vinculados
          │           e enriquece o System Prompt da Tutora Lucy / vLLM:
          │           • Ementa Oficial aderente aos livros vinculados
          │           • Objetivos de Bloom N1-N6 citando as seções reais
          │           • Metodologia Dialética Socrática
          │
          └── 4. Persiste no Banco via POST /api/v1/teacher/plans
```

---

## 3. Plano de Tarefas Detalhado (Task Breakdown)

### Fase 1: API de Exposição & Ingestão da Biblioteca (`/api/v1/library/documents`)
- **Fase 1.1:** Criar a rota de API [`src/app/api/v1/library/documents/route.ts`](file:///c:/projects/soberania-ai/src/app/api/v1/library/documents/route.ts):
  - **`GET`**: Extrai os materiais e categorias únicas diretamente do `DIDACTIC_CORPUS` (`getAllCorpusChunks()`), agrupados por categoria/área temática (`subject`), permitindo filtros por termo de busca ou categoria.
  - **`POST`**: Recebe novo material submetido pelo professor e repassa para `documentIngestionService.ingestMaterial()`, indexando instantaneamente novos chunks com metadados (`bookTitle`, `author`, `chapter`, `pageNumber`, `content`).
- **Fase 1.2:** Atualizar `POST /api/v1/teacher/plans` para receber e persistir:
  - `academicPeriod` (ex: "2026.1", "2026.2", "Anual 2026", "Modular").
  - `basicBibliography` (IDs e títulos das obras selecionadas).
  - `complementaryBiblio` (Artigos e guias complementares).

### Fase 2: Seleção Dinâmica de Disciplina & Período Letivo
- **Fase 2.1:** Buscar dinamicamente as disciplinas alocadas ao professor via `/api/v1/admin/subjects` para popular o Dropdown no topo da página.
- **Fase 2.2:** Componente de Período Acadêmico Dinâmico:
  - Opções pré-definidas: `1º Semestre/2026`, `2º Semestre/2026`, `Anual 2026`.
  - Opção `Personalizado` permitindo digitar períodos específicos (ex: `1º Trimestre/2026`, `Módulo Intensivo`, etc.).
- **Fase 2.3:** Atualização reativa dos metadados laterais (Carga Horária, Curso, Código).

### Fase 3: Componente de Referências Bibliográficas & Modal Tríplice
- **Fase 3.1:** Card de Referências Bibliográficas em `/teacher/plans/new`:
  - Listagem dos chips de referências selecionadas (com autor, título, tag da categoria e botão de remoção).
  - Badge dinâmico de status do RAG: *"✓ X Obras & Artigos Indexados no RAG Local"*.
- **Fase 3.2:** Modal de seleção tríplice:
  - **Aba 1 (Por Categoria):** Checkboxes por área temática (ex: *Bancos de Dados*, *Engenharia de Software*, *Diretrizes MEC/DCNs*). Marcar a categoria adiciona todos os livros e artigos pertencentes a ela de forma atômica.
  - **Aba 2 (Por Documento Individual):** Campo de busca rápida e lista com checkboxes para cada livro/artigo do `DIDACTIC_CORPUS`.
  - **Aba 3 (Novo Documento / Upload):** Formulário direto de upload de material didático (Título, Autor, Categoria e Conteúdo/Páginas), acionando o endpoint de ingestão RAG.

### Fase 4: Geração Socrática com RAG Híbrido
- **Fase 4.1:** Integração do botão *"IA Socrática: Gerar Sugestão Ementa"*:
  - Dispara rota de geração conectada ao `executeHybridSearch` com a query contextual da disciplina.
  - Enriquecimento do prompt com os chunks recuperados do acervo oficial selecionado.
- **Fase 4.2:** Preenchimento automático dos blocos com citações documentais:
  - Bloco 1: Ementa Oficial.
  - Bloco 2: Objetivos de Aprendizagem (Bloom N1 a N6).
  - Bloco 3: Metodologia e Dinâmica Socrática.

### Fase 5: Validação, Verificação e Testes
- **Fase 5.1:** Validação estrita de tipos com `npx tsc --noEmit`.
- **Fase 5.2:** Execução de linter com `npm run lint`.
- **Fase 5.3:** Testes unitários do pipeline com `npm test`.

---

## 4. Matriz de Responsabilidades

| Agente | Domínio | Ações no Plano |
|---|---|---|
| `explorer-agent` | Discovery | Mapeamento das estruturas existentes em `src/domains/rag/` |
| `backend-specialist` | API & RAG | Rota `/api/v1/library/documents` reutilizando `ingestion.ts` e `hybrid-search.ts` |
| `frontend-specialist` | UI / Telas | Dropdowns dinâmicos, Período Letivo e Modal Tríplice em `/teacher/plans/new` |
| `project-planner` | Governança | Documentação e validação dos fluxos pedagógicos |
| `orchestrator` | Coordenação | Garantia de conformidade com Clean Code, DDD e Zero Erros |

---

## 5. Critérios de Homologação

1. [ ] Reutilização mandatória de `documentIngestionService` e `executeHybridSearch` sem duplicação de lógica RAG.
2. [ ] Disciplina selecionável dinamicamente via `/api/v1/admin/subjects`.
3. [ ] Período letivo flexível (semestral, anual ou customizado).
4. [ ] Ingestão de novos documentos alimenta o corpus RAG em tempo real.
5. [ ] IA Socrática gera plano pedagógico referenciando explicitamente o acervo selecionado.
6. [ ] `npx tsc --noEmit` e `npm run lint` aprovados com código 0.
