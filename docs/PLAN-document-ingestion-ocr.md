# 📋 Plano: Ingestão de Documentos (PDF, DOCX, TXT/MD), Motor de OCR e Acervo de Materiais

> **Task Slug:** `document-ingestion-ocr`  
> **Status:** 🟢 Concluído (implementado e coberto por testes; ver `CODEBASE.md` e o domínio `rag`)  
> **Data:** 17/09/2026  
> **Agentes Responsáveis:** `@[project-planner]`, `@[backend-specialist]`, `@[frontend-specialist]`, `@[database-architect]`, `@[security-auditor]`  
> **Documentos de Referência:** [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) · [`docs/UX_UI_DESIGN_SYSTEM.md`](file:///c:/projects/soberania-ai/docs/UX_UI_DESIGN_SYSTEM.md) · [`docs/rules/CLEAN_CODE.md`](file:///c:/projects/soberania-ai/docs/rules/CLEAN_CODE.md) · [`docs/rules/DATA_TABLE.md`](file:///c:/projects/soberania-ai/docs/rules/DATA_TABLE.md) · [`TSX_SCREEN_RULES.md`](file:///c:/projects/soberania-ai/.agent/rules/TSX_SCREEN_RULES.md)

---

## 1. 🎯 Contexto e Diagnóstico

### 1.1 O Desafio
Hoje, o cadastro de materiais bibliográficos e referências didáticas no Soberania AI depende exclusivamente da colagem manual de texto puro em uma `<Textarea>` na aba de referências (`/teacher/plans/new`). Professores e coordenadores acadêmicos necessitam:
1. Fazer upload de arquivos reais de suas disciplinas (**PDFs vetoriais**, **PDFs digitalizados/scaneados**, arquivos **DOCX** e notas em **TXT/Markdown**).
2. Armazenar o binário original em disco/storage de forma segura para permitir **download futuro** pelos docentes.
3. Ter um motor de **OCR (Optical Character Recognition)** embutido para processar páginas escaneadas ou apostilas sem camada de texto vetorial.
4. Parametrizar limites de tamanho e configurações de upload diretamente via variáveis de ambiente (`.env`).
5. Acessar e gerenciar todo o acervo institucional através da rota **`/teacher/materials`** (atualmente inexistente com erro 404).

---

## 2. 🏗️ Decisões Arquiteturais & Tecnologias

| Componente | Solução Técnica | Justificativa |
|---|---|---|
| **Parser PDF (Vetorial)** | `pdf-parse` / `unpdf` | Extração ultra-rápida de texto e quebras de página nativas em Node.js |
| **Parser DOCX** | `mammoth` | Preserva estrutura de tópicos, seções e parágrafos sem poluição de tags Word |
| **Motor de OCR** | `tesseract.js` (Worker Node) | Reconhece caracteres em imagens/scans com dicionário Português (`por`) e Inglês (`eng`) quando o PDF tem baixa densidade de caracteres vetoriais |
| **Armazenamento de Binários** | Storage local seguro (`storage/materials/`) | Armazena o arquivo com UUID único, preservando o nome original no banco e servindo via streaming seguro com headers de proteção |
| **Configurações Dinâmicas** | `.env` (`MAX_UPLOAD_SIZE_MB`, `ALLOWED_EXTENSIONS`, `OCR_ENABLED`) | Parametrização sem necessidade de recompilação |
| **Banco de Dados** | Prisma ORM (`DidacticMaterial`, `MaterialChunk`) | Atualização do modelo existente e criação de **migração física obrigatória** |
| **UI Acervo de Materiais** | `src/app/teacher/materials/` | Tela institucional completa seguindo estritamente `DATA_TABLE.md` e `UX_UI_DESIGN_SYSTEM.md` |

---

## 3. 📦 Detalhamento das Etapas de Implementação

### Fase 1: Infraestrutura, Dependências e Banco de Dados (`database-architect` + `backend-specialist`)
1. **Instalação de Dependências**:
   - `pdf-parse` (extração de texto de PDF)
   - `mammoth` (extração de texto de DOCX)
   - `tesseract.js` (motor de OCR para PDFs escaneados e imagens)
   - `@types/pdf-parse`
2. **Atualização do Schema Prisma (`prisma/schema.prisma`)**:
   - Incrementar modelo `DidacticMaterial`:
     ```prisma
     model DidacticMaterial {
       id               String          @id @default(cuid())
       title            String
       author           String
       edition          String?
       subject          String
       totalPages       Int
       filePath         String          // Caminho no storage do servidor
       originalFilename String?         // Nome original enviado pelo usuário
       fileSize         Int?            // Tamanho em bytes
       mimeType         String?         // application/pdf, etc.
       isOcrApplied     Boolean         @default(false)
       status           String          @default("INDEXED") // UPLOADING, PARSING, OCR_PROCESSING, INDEXED, ERROR
       errorMessage     String?
       createdAt        DateTime        @default(now())
       updatedAt        DateTime        @updatedAt
       chunks           MaterialChunk[]
       @@map("didactic_materials")
     }
     ```
3. **Migração Física Obrigatória**:
   - Executar `npx prisma migrate dev --name add_material_file_metadata_and_ocr` (gerando pasta física em `prisma/migrations/`).
   - Executar `npx prisma generate`.
4. **Variáveis de Ambiente (`.env` e `.env.example`)**:
   - `MAX_UPLOAD_SIZE_MB="25"`
   - `ALLOWED_DOCUMENT_EXTENSIONS="pdf,docx,txt,md"`
   - `ENABLE_OCR="true"`
   - `MATERIALS_STORAGE_DIR="./storage/materials"`

---

### Fase 2: Serviços de Domínio RAG, Extração e OCR (`backend-specialist`)
1. **Módulo de Extração Modular (`src/domains/rag/file-parser.ts`)**:
   - `parseDocumentFile(buffer: Buffer, filename: string, mimeType: string): Promise<ParsedDocumentResult>`
   - Detecção por extensão e magic bytes.
   - Detecção automática de necessidade de OCR: se uma página PDF possuir menos de 40 caracteres de texto legível, aciona o fallback de OCR via `tesseract.js`.
2. **Serviço de OCR (`src/domains/rag/ocr-service.ts`)**:
   - Pipeline de OCR encapsulado com suporte a idiomas `por` + `eng`.
   - Limpeza e normalização do texto extraído.
3. **Evolução do `DocumentIngestionService` (`src/domains/rag/ingestion.ts`)**:
   - Integrar suporte a salvamento de metadados completos de materiais e chunks no Prisma (`DidacticMaterial` + `MaterialChunk`).
   - Sincronização direta com o corpus em memória do RAG Híbrido (`addChunksToCorpus`).

---

### Fase 3: Endpoints de API REST (`backend-specialist` + `security-auditor`)
1. **Endpoint de Upload Multipart (`POST /api/v1/library/documents/upload`)**:
   - Processa `multipart/form-data` contendo:
     - `file`: Arquivo binário (PDF, DOCX, TXT, MD).
     - `title`: Título da obra/artigo.
     - `author`: Autor(es).
     - `categories`: JSON array ou string separada por vírgula.
   - Valida tamanho máximo contra `MAX_UPLOAD_SIZE_MB` do `.env`.
   - Grava arquivo em `./storage/materials/[materialId]-[sanitizedFilename]`.
   - Executa parse/OCR, chunking semântico e indexação no banco e corpus RAG.
   - Retorna o resumo do material indexado com contagem de páginas e chunks.
2. **Endpoint de Listagem do Acervo (`GET /api/v1/library/materials`)**:
   - Retorna lista paginada de materiais com filtros de busca, categoria e status.
3. **Endpoint de Download Seguro (`GET /api/v1/library/materials/[id]/download`)**:
   - Valida existência do material no banco.
   - Faz streaming do arquivo com headers seguros (`Content-Type`, `Content-Disposition: attachment; filename="..."`).
4. **Endpoint de Deleção (`DELETE /api/v1/library/materials/[id]`)**:
   - Remove o arquivo físico do disco, os chunks do banco e expurga do corpus RAG.

---

### Fase 4: Tela do Acervo de Materiais (`/teacher/materials`) (`frontend-specialist`)
1. **Thin Page (`src/app/teacher/materials/page.tsx`)**:
   - Thin wrapper com `'use client'`, importando `TeacherMaterialsPage`.
2. **Componente Principal (`src/app/teacher/materials/_components/TeacherMaterialsPage.tsx`)**:
   - **Header Pedagógico**: Título "Acervo de Materiais Didáticos & RAG", badges de estatísticas (Total de Obras, Chunks Indexados, Categorias).
   - **Barra de Ações**: Botão primário `+ Novo Material / Upload`, barra de busca com debounce e filtro por categoria.
   - **Tabela shadcn (`<Table>`)**:
     - Conforme `DATA_TABLE.md`: Container `glass rounded-xl overflow-hidden`.
     - Colunas: Material (Título e Autor), Categorias (Badges), Tipo/Extensão (Ícone + Formato), Chunks & Páginas, OCR (Badge indicativo caso tenha sido processado com OCR), Tamanho, Ações (Download, Visualizar Chunks, Excluir).
     - Estados: Skeleton de carregamento, Empty State ilustrado pedagógico, tratamento de erros.
3. **Modal de Upload de Materiais (`MaterialUploadModal.tsx`)**:
   - `AdaptiveModal` com drag & drop zone, validação visual de tamanho e progresso detalhado.

---

### Fase 5: Atualização da Aba de Upload no Plano de Ensino (`/teacher/plans/new`) (`frontend-specialist`)
1. **Refatoração de `ReferenceUploadTab.tsx`**:
   - Substituir o `<Textarea>` puro como entrada primária por um **Dropzone Interativo** com suporte a arrastar arquivo ou navegar.
   - Exibir cartão do arquivo selecionado com ícone do tipo (`FileText`, `FileCode`), nome, tamanho e botão de remoção.
   - Seletor de categorias com `AdvancedMultiCombobox` e modal inline de nova categoria mantidos e integrados.
   - Barra de progresso multi-etapa durante o envio:
     - 📤 Enviando arquivo...
     - 🔍 Extraindo conteúdo (e executando OCR se necessário)...
     - 🧠 Fatiando chunks semânticos e indexando no RAG...
   - Tab secundária comutável: "Colar Texto Manualmente" mantida como fallback para anotações rápidas.

---

## 4. 🛡️ Segurança, Guardrails & Diretrizes de Código

1. **Proteção contra DoS e Uploads Maliciosos**:
   - Validação de magic bytes (verificação dos primeiros bytes do buffer para garantir que um `.exe` renomeado para `.pdf` seja rejeitado).
   - Sanitização de nomes de arquivos para evitar ataques de Directory Traversal (`path.basename` + hash aleatório).
2. **Conformidade com TSX Screen Rules**:
   - Zero `any`, arquivos rigorosamente abaixo de 350 linhas de código (LOC).
   - Cores exclusivamente via tokens CSS de `UX_UI_DESIGN_SYSTEM.md` (sem hexadecimais soltos ou roxo).
   - Componentes shadcn/ui New York com `cursor-pointer` em botões e linhas de tabela.
3. **Tratamento de Exceções**:
   - Se o OCR falhar em uma página específica, a ingestão não deve abortar; registra advertência e continua nas demais páginas.

---

## 5. 🧪 Plano de Verificação e Testes

| Teste | Escopo | Ferramenta / Método |
|---|---|---|
| **Extração DOCX** | Conversão de arquivo `.docx` com títulos H1/H2 e tabelas em chunks estruturados | Teste unitário Vitest em `file-parser.test.ts` |
| **Extração PDF Vetorial** | Extração de páginas, preservação de número de página e chunking semântico | Teste unitário Vitest em `file-parser.test.ts` |
| **OCR Fallback** | Processamento de imagem/página escaneada com `tesseract.js` | Teste unitário Vitest com fixture mock |
| **Upload API Route** | Envio de `multipart/form-data`, persistência no disco e criação no Prisma | Teste de integração de API via script `scratch/` |
| **Download Seguro** | Verificação de headers `Content-Disposition` e streaming de bytes | Teste via cURL / fetch |
| **Validação de Código** | ESLint + TypeScript Typecheck | `rtk npx tsc --noEmit` & `rtk npm run lint` |
| **Verificação E2E Visual** | Navegação em `/teacher/materials` e envio via `/teacher/plans/new` | Inspeção no navegador |
