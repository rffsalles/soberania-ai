# 📋 Plano: Extração Inteligente de Metadados (Título, Autores e Categorias) das 4 Primeiras Páginas via IA

> **Task Slug:** `document-metadata-ai-extraction`  
> **Status:** 🟡 Proposto (Aguardando Aprovação)  
> **Data:** 17/09/2026  
> **Agentes Responsáveis:** `@[project-planner]`, `@[backend-specialist]`, `@[frontend-specialist]`, `@[security-auditor]`, `@[test-engineer]`  
> **Documentos de Referência:** [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) · [`docs/UX_UI_DESIGN_SYSTEM.md`](file:///c:/projects/soberania-ai/docs/UX_UI_DESIGN_SYSTEM.md) · [`docs/rules/CLEAN_CODE.md`](file:///c:/projects/soberania-ai/docs/rules/CLEAN_CODE.md) · [`TSX_SCREEN_RULES.md`](file:///c:/projects/soberania-ai/.agent/rules/TSX_SCREEN_RULES.md)

---

## 1. 🎯 Contexto e Objetivo

Hoje, ao realizar o upload de um documento (PDF, DOCX, TXT, MD) na modal da **Biblioteca de Documentos** ou na aba de referências do **Plano de Ensino** (`/teacher/plans/new`), o sistema utiliza apenas o nome bruto do arquivo (ex: `d1eab99681feeb983a44471df9e2d1d3.pdf`) para preencher o título, exigindo que o professor digite manualmente os autores e selecione as áreas temáticas.

### Solução Proposta
Implementar uma funcionalidade de **Inspeção Inteligente Pré-Upload**:
1. Ao anexar um arquivo na Dropzone, o sistema analisa o texto das **4 primeiras páginas** (onde residem capa, folha de rosto, ficha catalográfica e sumário).
2. Envia este trecho para o provedor de IA local (`aiProviderService` / SLM On-Premises ou LLM configurado) com prompt estruturado em formato JSON.
3. Extrai com alta precisão:
   - **Título Oficial da Obra ou Artigo** (limpo de extensões ou códigos de versão).
   - **Nome(s) do(s) Autor(es)** (formatado em nome legível, ex: *"Marco Tulio Valente"* ou *"Ana Silva e Pedro Santos"*).
   - **Categorias / Áreas Temáticas Recomendadas** (alinhadas com as disciplinas e categorias do sistema).
4. **Auto-preenchimento Visual no Front-End**: Os inputs são atualizados automaticamente com um badge discreto ✨ *"Preenchido via IA (Páginas 1–4)"*, mantendo total liberdade para o professor revisar ou editar.

---

## 2. 🏗️ Arquitetura e Decisões Técnicas

| Componente | Solução Técnica | Justificativa |
|---|---|---|
| **Escopo de Leitura** | Primeiras **4 páginas** do documento | Capa (Pág 1), Ficha Catalográfica / Rosto (Pág 2-3) e Sumário (Pág 4) contêm 99% dos metadados bibliográficos |
| **Leitor de Páginas** | `parseDocumentFile(buffer, filename)` | Reaproveita o motor já implementado com suporte nativo a PDF, DOCX, TXT, MD e fallback OCR |
| **Agente de Extração** | `documentInspectorService.inspectHeaderPages(...)` | Constrói o prompt com schema JSON e invoca `aiProviderService.generateCompletion(...)` |
| **API Endpoint** | `POST /api/v1/library/documents/inspect` | Endpoint dedicado para inspeção prévia sem gravar arquivos no banco de dados |
| **Interface Front-End** | `MaterialUploadModal.tsx` & `ReferenceUploadTab.tsx` | Chamada assíncrona ao anexar arquivo com feedback de carregamento suave (*"✨ Analisando capa e autores..."*) |

---

## 3. 📦 Detalhamento das Etapas de Implementação

### Fase 1: Domínio de Inspeção de Documentos (`backend-specialist`)
1. **Criar Módulo `src/domains/rag/document-inspector.ts`**:
   - `export interface ExtractedDocumentMetadata`:
     ```ts
     export interface ExtractedDocumentMetadata {
       title: string;
       author: string;
       categories: string[];
       confidence: number;
       summary: string;
     }
     ```
   - Método `inspectDocumentHeader(buffer: Buffer, filename: string): Promise<ExtractedDocumentMetadata>`:
     - Extrai as páginas via `parseDocumentFile(buffer, filename)`.
     - Seleciona apenas as **4 primeiras páginas** (`pages.slice(0, 4)`).
     - Se o texto total for < 30 caracteres (PDF escaneado sem OCR), aciona o fallback de OCR nas 4 primeiras páginas.
     - Monta o prompt pedagógico solicitando extração bibliográfica estrita em JSON:
       ```json
       {
         "title": "Engenharia de Software Moderna",
         "author": "Marco Tulio Valente",
         "categories": ["Engenharia de Software", "Desenvolvimento Web"],
         "summary": "Livro texto sobre princípios de arquitetura e desenvolvimento"
       }
       ```
     - Valida o retorno do provedor de IA com Zod `extractedMetadataSchema`.

---

### Fase 2: Endpoint REST de Inspeção (`backend-specialist` + `security-auditor`)
1. **Criar Endpoint `POST /api/v1/library/documents/inspect`**:
   - Localização: `src/app/api/v1/library/documents/inspect/route.ts`.
   - Aceita `multipart/form-data` contendo `file`.
   - Executa `validateFileSafety(fileBuffer, file.name)`.
   - Invoca `documentInspectorService.inspectDocumentHeader(...)`.
   - Retorna HTTP 200:
     ```json
     {
       "success": true,
       "metadata": {
         "title": "Engenharia de Software Moderna",
         "author": "Marco Tulio Valente",
         "categories": ["Engenharia de Software"],
         "confidence": 0.95
       }
     }
     ```
   - Em caso de falha de extração por IA, retorna fallback gracioso com o nome limpo do arquivo como título e autor em branco.

---

### Fase 3: Integração no Front-End & UX/UI (`frontend-specialist`)
1. **Atualizar `ReferenceUploadTab.tsx` e `MaterialUploadModal.tsx`**:
   - Estado `isInspecting: boolean`.
   - Ao selecionar ou soltar o arquivo na Dropzone:
     - Dispara `POST /api/v1/library/documents/inspect` em segundo plano.
     - Exibe indicador no topo dos campos:
       `<div className="flex items-center gap-1.5 text-xs text-brand-teal animate-pulse"><Sparkles className="h-3.5 w-3.5" /> Analisando autor e título nas 4 primeiras páginas...</div>`
     - Quando a requisição retorna com sucesso:
       - Atualiza `title` com o título oficial.
       - Atualiza `author` com os autores extraídos.
       - Marca as `selectedCategories` sugeridas se existirem nas categorias do sistema.
       - Exibe um Badge discreto nos campos: `<Badge variant="outline" className="text-[10px] bg-brand-teal/10 text-brand-teal border-brand-teal/20">✨ Auto-preenchido por IA</Badge>`.

---

### Fase 4: Suíte de Testes e Verificação (`test-engineer`)
1. **Testes Unitários (`src/domains/rag/__tests__/document-inspector.test.ts`)**:
   - Teste de extração com fixture de texto de capa.
   - Teste de truncamento estrito nas 4 primeiras páginas.
   - Teste de fallback gracioso se a resposta da IA vier vazia ou malformatada.
2. **Checagem de Qualidade**:
   - `npx tsc --noEmit` (Zero erros).
   - `npm run lint` (Zero warnings/errors).
   - `npm test` (Todos os testes aprovados).

---

## 4. 🛡️ Diretrize de Código e Conformidade PRD & UX/UI

1. **Soberania On-Premises (PRD)**:
   - A extração utiliza o `aiProviderService` local do appliance sem vazar dados para apis externas não autorizadas.
2. **Conformidade com UX_UI_DESIGN_SYSTEM.md**:
   - Badges e loaders utilizando tokens `brand-teal` (`#0D9488`), ícones Lucide React (`Sparkles`, `FileCheck`), cantos `rounded-xl`, e animações suaves sem layout shift.
3. **Limites de Código**:
   - Manter arquivos abaixo do limite de 350 LOC e 0 `any`.

---

## 5. 🧪 Plano de Verificação

### Automated Tests
```bash
npx tsc --noEmit
npm run lint
npm test
```

### Manual Verification
1. Abrir a modal em `http://localhost:3000/teacher/plans/new` -> "Adicionar Referência" -> "Upload de Arquivo".
2. Selecionar um PDF ou DOCX real.
3. Verificar a exibição do indicador visual de inspeção por IA.
4. Confirmar o preenchimento automático dos campos Título, Autor e Categorias.
