# 📄 PLAN-pedagogical-pipeline.md: Esteira Pedagógica Encadeada (Admin → Professor → Tutora Lucy → Ata por Aluno)

> **Status:** 🟢 Concluído com Sucesso e Validado (100%)  
> **Arquitetura Base:** Encadeamento de Dados por Single Source of Truth (SSOT) no PostgreSQL  
> **Provedor de Mídia:** Armazenamento S3 Parametrizável (AWS S3 / MinIO Institucional On-Premises)  
> **Diretrizes Visuais & Produto:** [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) | [`docs/UX_UI_DESIGN_SYSTEM.md`](file:///c:/projects/soberania-ai/docs/UX_UI_DESIGN_SYSTEM.md)

---

## 1. 🎯 Objetivos do Plano

Este plano especifica a engenharia para o fluxo pedagógico completo do **Soberania AI**, atendendo tanto a **Instituições de Ensino Básico (K-12 / Escolas)** quanto **Ensino Superior (Faculdades e Universidades)**.

A esteira garante que cada etapa consuma como contexto imutável o resultado da etapa anterior, assegurando **geração por IA livre de alucinações**, auditoria acadêmica e **geração de atas pedagógicas específicas por aluno**.

---

## 2. 🧱 Arquitetura de Dados & Modelagem Prisma

### 2.1 Novas Tabelas e Relacionamentos N:N (`prisma/schema.prisma`)

```prisma
// ==========================================
// Módulo de Gestão Acadêmica & Professores (Etapa 0)
// ==========================================

model Subject {
  id           String             @id @default(cuid())
  name         String             // ex: "Banco de Dados I" ou "Física III"
  code         String             @unique // ex: "BD101"
  description  String?            @db.Text
  courseName   String             // ex: "ADS", "Engenharia de Software" ou "3º Ano EM"
  academicLevel String            // "HIGHER_EDUCATION" | "HIGH_SCHOOL" | "ELEMENTARY"
  academicYear Int                // Ano letivo ou ano do curso (ex: 2026)
  semester     Int?               // Semestre (opcional para escolas anuais)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  teacherAssignments TeacherSubject[]
  teachingPlans      TeachingPlan[]
  classes            Class[]

  @@map("subjects")
}

// Tabela Pivô para Vínculo N:N (Professor <-> Matérias/Turmas)
model TeacherSubject {
  id        String   @id @default(cuid())
  teacherId String
  subjectId String
  createdAt DateTime @default(now())

  teacher User    @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  subject Subject @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@unique([teacherId, subjectId])
  @@index([teacherId])
  @@index([subjectId])
  @@map("teacher_subjects")
}

// ==========================================
// Esteira Pedagógica do Professor (Etapas 1 a 4)
// ==========================================

// 1. Plano de Ensino (Macro)
model TeachingPlan {
  id                   String           @id @default(cuid())
  subjectId            String
  teacherId            String
  syllabus             String           @db.Text // Ementa oficial
  generalObjectives    String           @db.Text // Objetivos gerais
  specificObjectives   String           @db.Text // Objetivos específicos
  unitsContent         Json             // Array de { unitNumber, title, topics: [] }
  methodology          String           @db.Text // Metodologia de ensino
  assessmentCriteria   String           @db.Text // Critérios de avaliação
  basicBibliography    String[]         // Bibliografia básica
  complementaryBiblio  String[]         // Bibliografia complementar
  status               String           @default("DRAFT") // DRAFT, APPROVED
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  subject           Subject          @relation(fields: [subjectId], references: [id])
  schedules         CourseSchedule[]
  assessments       Assessment[]

  @@index([subjectId])
  @@map("teaching_plans")
}

// 2. Cronograma de Aulas (Calendário)
model CourseSchedule {
  id             String       @id @default(cuid())
  teachingPlanId String
  startDate      DateTime
  endDate        DateTime
  holidays       Json?        // Datas de recessos e feriados
  totalClasses   Int
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  teachingPlan TeachingPlan @relation(fields: [teachingPlanId], references: [id], onDelete: Cascade)
  lessonPlans  LessonPlan[]

  @@map("course_schedules")
}

// 3. Plano de Aula (Micro / Encontro Específico)
model LessonPlan {
  id               String         @id @default(cuid())
  courseScheduleId String
  agendaId         String?        @unique
  classDate        DateTime
  classNumber      Int
  topicTitle       String
  dailyObjective   String         @db.Text
  timeScript       Json           // Roteiro minuto a minuto [{ timeRange, activity, description }]
  methodology      String         @db.Text
  resourcesNeeded  String[]
  fixationExercise String         @db.Text
  mediaType        String?        // "YOUTUBE" | "S3_UPLOAD" | "NONE"
  mediaUrl         String?        // URL do YouTube ou URI do S3
  s3ObjectKey      String?        // Chave do objeto no S3 da instituição
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  courseSchedule CourseSchedule @relation(fields: [courseScheduleId], references: [id], onDelete: Cascade)
  agenda         Agenda?        @relation(fields: [agendaId], references: [id])

  @@index([courseScheduleId])
  @@map("lesson_plans")
}

// 4. Instrumentos de Avaliação
model Assessment {
  id             String       @id @default(cuid())
  teachingPlanId String
  title          String
  type           String       // "EXAM" | "GROUP_WORK" | "CASE_STUDY"
  questions      Json         // Questões, enunciados, gabaritos e critérios
  rubrics        Json         // Rubricas formais de correção
  maxScore       Float        @default(10.0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  teachingPlan TeachingPlan @relation(fields: [teachingPlanId], references: [id], onDelete: Cascade)

  @@map("assessments")
}
```

---

## 3. 📦 Configuração Parametrizada de Mídia S3 / MinIO

O armazenamento de vídeo e mídia para planos de aula utilizará um cliente S3 configurável no arquivo `.env`:

```env
# ------------------------------------------
# S3 Storage Configuration (MinIO / AWS S3 / Cloudflare R2)
# ------------------------------------------
S3_ENDPOINT="https://s3.instituicao.edu.br" # ou http://localhost:9000 para MinIO local
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="sua-access-key"
S3_SECRET_ACCESS_KEY="sua-secret-key"
S3_BUCKET_NAME="soberania-media-bucket"
S3_FORCE_PATH_STYLE=true # Requerido para MinIO on-premises
```

Serviço utilitário em `src/lib/storage/s3-service.ts`:
- Função de upload com presigned URLs para upload direto do navegador.
- Suporte a geração de URLs temporárias com assinatura de leitura segura.

---

## 4. 🎙️ Componentização Universal: Chat Socrático Multimodal (`<UniversalSocraticChat />`)

> **Sim, está 100% correto e é uma prática recomendada de arquitetura!** O painel de chat com a Tutora Lucy / IA Socrática será um único componente reutilizável encapsulado em `src/components/ai/universal-socratic-chat.tsx`, com suporte **Multimodal completo** ativado em qualquer tela em que for renderizado (Professor, Aluno, Prova ou Admin).

### 4.1 Recursos Multimodais Obrigatórios do Chat Universal:

1. 🎤 **Gravação de Áudio/Voz em Tempo Real (Microfone):**
   - Botão de microfone com gravador via `navigator.mediaDevices.getUserMedia` + Web Audio API / `MediaRecorder`.
   - Feedback visual de gravação (onda sonora em tom Orange/Teal).
   - Envio direto para transcrição *STT (Speech-to-Text)* via Groq Whisper (`whisper-large-v3`) ou ElevenLabs antes do processamento socrático.

2. 📁 **Upload de Arquivos de Áudio (`.mp3`, `.wav`, `.m4a`, `.webm`):**
   - Ícone de anexo/clipe para upload de gravações de voz ou trechos de áudio de aulas.

3. 🖼️ **Upload e Colagem de Imagens (`.png`, `.jpg`, `.webp`):**
   - Suporte a seleção de arquivos e colagem direta da área de transferência (`Ctrl+V`).
   - Leitura multimodal / Visão Computacional pelo modelo de IA para interpretar **Diagramas de Entidade-Relacionamento (ERD)**, **Esquemas de Banco de Dados**, **quadros brancos** ou **anotações de caderno**.

4. 🧠 **Parametrização por Prop de Contexto (`context`):**
   ```tsx
   interface UniversalSocraticChatProps {
     mode: 'CLASSROOM_STUDENT' | 'TEACHER_ASSISTANT' | 'ASSESSMENT_EXAM' | 'ADMIN_AUDIT';
     subjectId?: string;
     teachingPlanId?: string;
     lessonPlanId?: string;
     assessmentId?: string;
     studentId?: string;
     guardrails?: {
       antiCheat: boolean;
       socraticOnly: boolean;
       deductPointsOnHint?: boolean;
     };
   }
   ```

5. 📚 **Renderização de Citações RAG & Scaffolding Pedagógico:**
   - Exibição de cards de citação da ementa e bibliografia oficial.
   - Botões de suporte cognitivo (*Scaffolding*: "Dica Nível 1", "Dica Nível 2", "Pedir contraexemplo").

---

---

## 5. 🎨 Mapeamento de Telas & Protótipos no Stitch MCP (`@mcp:stitch:`)

> **Projeto Stitch:** `projects/9396079196886748298` (Soberania AI)  
> **Design System Stitch:** `assets/3ffe9534fee54863929a8949d6039a09` (Soberania AI - Teal `#0D9488` & Orange `#F97316`)

| Etapa do Pipeline | Rota da Aplicação | Dispositivo | Stitch Screen ID | Título do Protótipo no Stitch |
|---|---|---|---|---|
| **Etapa 0** (Admin N:N) | `/admin/subjects` & `/admin/teachers` | Desktop | `0618a6d45c3f45afaa8b4ccf04724859` | Soberania AI - Gestão N:N de Professores e Disciplinas |
| **Etapa 1** (Plano de Ensino) | `/teacher/plans/new` | Desktop | `6933ecc2cd0348cbb7ac3b25ec9d4e92` | Soberania AI - Elaboração do Plano de Ensino (Etapa 1) |
| **Etapa 2** (Cronograma) | `/teacher/schedules` | Desktop | `fbc926aebec44b8fa8f79d6b46f915d3` | Soberania AI - Cronograma de Aulas & Calendário Acadêmico (Etapa 2) |
| **Etapa 3** (Plano de Aula & S3) | `/teacher/lessons` | Desktop | `2d4b0a059f1b491fba87c6a94beb0711` | Soberania AI - Editor de Plano de Aula Diário & Mídias S3 / YouTube (Etapa 3) |
| **Etapa 4** (Avaliações com IA) | `/teacher/assessments` | Desktop | `bce555b0694e43d8aab512a1c6fd5117` | Soberania AI - Gerador de Avaliações e Provas Supervisionadas (Etapa 4) |
| **Etapa 5** (Sala Interativa & Ata) | `/classroom/[sessionId]` | Desktop | `17166d731bf8456cb830f3c26e59e937` | Soberania AI - Sala de Aula Interativa do Aluno & Ata Pedagógica (Etapa 5) |
| **Etapa 5** (Sala Interativa & Ata) | `/classroom/[sessionId]` | Mobile | `fd93eed66e79475faadf0cc9c30a4b1c` | Soberania AI - Sala de Aula e Ata Pedagógica Mobile (Etapa 5) |

---

## 6. 🚀 Fases de Implementação & Tarefas Detalhadas

### Fase 1: Atualização do Banco & Migração Física [Backend & DB]
- [x] Atualizar `prisma/schema.prisma` com os modelos `Subject`, `TeacherSubject`, `TeachingPlan`, `CourseSchedule`, `LessonPlan` e `Assessment`.
- [x] Executar `npx prisma migrate dev --name add_pedagogical_pipeline` para commitar a migração em `prisma/migrations/`.
- [x] Atualizar o gerador de seed de dados `src/lib/auth/seed-users.ts` com dados iniciais de matérias e vínculos N:N de professores.

---

### Fase 2: Gestão Administrativa de Professores & Matérias (Etapa 0) [Admin UI]
> 🎨 **Protótipo Stitch:** Screen ID `0618a6d45c3f45afaa8b4ccf04724859` (Desktop)
- [x] Criar tela de **Gerenciamento de Professores** em `/admin/teachers` (Listagem, Cadastro com Hash de Senha, Edição e Desativação).
- [x] Criar tela de **Cadastro de Matérias/Disciplinas** em `/admin/subjects` (Definição de Curso, Ano Letivo, Nível Acadêmico K-12/Faculdade e Atribuição N:N de Professores).
- [x] Aplicar componentes `shadcn/ui` (Table, Dialog, Select, Badge, Sonner) conforme `UX_UI_DESIGN_SYSTEM.md`.

---

### Fase 3: Esteira Pedagógica do Professor com IA (Etapas 1 a 4) [Teacher UI & AI]
- [x] **Etapa 1 — Gerador de Plano de Ensino (`/teacher/plans/new`):**
  - 🎨 **Protótipo Stitch:** Screen ID `6933ecc2cd0348cbb7ac3b25ec9d4e92` (Desktop)
  - Form com auxílio da IA (Groq/SLM) gerando Ementa, Unidades, Bibliografia e Metodologia.
- [x] **Etapa 2 — Gerador de Cronograma de Aulas (`/teacher/schedules`):**
  - 🎨 **Protótipo Stitch:** Screen ID `fbc926aebec44b8fa8f79d6b46f915d3` (Desktop)
  - IA distribui as unidades no calendário oficial da turma com feriados.
- [x] **Etapa 3 — Criador de Plano de Aula + Mídia S3 (`/teacher/lessons`):**
  - 🎨 **Protótipo Stitch:** Screen ID `2d4b0a059f1b491fba87c6a94beb0711` (Desktop)
  - Form com geração socrática do roteiro minuto a minuto.
  - Componente de Mídia com duas abas: **YouTube URL** e **Upload para S3/MinIO**.
- [x] **Etapa 4 — Gerador de Avaliações & Rubricas (`/teacher/assessments`):**
  - 🎨 **Protótipo Stitch:** Screen ID `bce555b0694e43d8aab512a1c6fd5117` (Desktop)
  - IA elabora provas e rubricas de correção baseadas estritamente nas unidades cadastradas.

---

### Fase 4: Execução na Sala de Aula & Diário de Classe por Aluno (Etapa 5) [Student & AI]
- [x] **Componentização Reutilizável de Chat (`<UniversalSocraticChat />`):**
  - Implementar em `src/components/ai/universal-socratic-chat.tsx` o painel de IA reutilizável em todas as telas.
  - Habilitar gravação de voz em tempo real (MediaRecorder API), upload de arquivo de áudio (`.mp3`, `.wav`, `.m4a`), upload/colagem de imagem (`.png`, `.jpg` para OCR/diagramas ERD) e sugestões socráticas.
- [x] **Etapa 5 — Sala de Aula Interativa & Ata Pedagógica (`/classroom/[sessionId]`):**
  - 🎨 **Protótipo Stitch Desktop:** Screen ID `17166d731bf8456cb830f3c26e59e937`
  - 🎨 **Protótipo Stitch Mobile:** Screen ID `fd93eed66e79475faadf0cc9c30a4b1c`
- [x] Conectar o player de vídeo (`InteractiveVideoPlayer`) para consumir o vídeo do S3 ou YouTube configurado na Etapa 3.
- [x] Atualizar a **Tutora Lucy** para injetar o `LessonPlan` e `TeachingPlan` da aula como contexto imutável (Zero Alucinação).
- [x] Aprimorar o consolidador de **Ata Pedagógica por Aluno** (`PedagogicalMinute`):
  - Emissão da Ata individualizada com nota de engajamento, hesitação, tópicos dominados/a reforçar e parecer personalizado para o Professor Titular.

---

## 📊 Plano de Verificação & Validação


### Testes Automatizados
- `npm run typecheck` / `npx tsc --noEmit` para garantir tipagem estrita de todos os novos modelos do Prisma (Passou com 0 erros).
- `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .` (Passou sem falhas de código ou vazamento de segredos).

### Validação Manual de UX/UI
- Conformidade visual total com `docs/UX_UI_DESIGN_SYSTEM.md` (uso das cores `brand-teal` `#0D9488`, `brand-orange` `#F97316`, tipografia Poppins/Inter, vidro `.glass` e ícones Lucide React).
- Esteira completa conectada: **Admin cadastra Professor/Matéria → Professor gera Plano com IA → Aluno faz aula com Tutora Lucy → Ata individual gerada no banco**.
