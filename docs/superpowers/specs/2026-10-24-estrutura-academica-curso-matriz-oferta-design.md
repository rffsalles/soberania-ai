# Estrutura acadêmica: curso, matriz curricular e oferta — Design

Data: 2026-10-24
Status: aprovado em brainstorming, aguardando revisão da spec

## Contexto e problema

Em `/teacher/plans/new` o professor escolhe uma disciplina e um período letivo. As duas escolhas são independentes e nada valida a coerência entre elas.

1. `Subject` já está amarrada a uma `Class`, que tem `year` e `semester`. O professor escolhe ainda um `AcademicPeriod` do catálogo global (`TeachingPlan.academicPeriodId`). No seed, a turma é do 3º semestre e o plano é de 2026.1, sem relação verificada.
2. `Subject.courseName` é texto livre. `academicLevel` está na disciplina, mas é atributo do curso.
3. `Subject.code` é `@unique`. Não dá para reofertar BD101 no período seguinte.
4. `Class.semester` significa posição no curso (3º semestre de ADS), não semestre do calendário. `Class.year` duplica o ano que deveria vir do período.
5. `Subject` guarda cópias de dados da turma (`academicYear`, `semester`), sincronizadas por `src/domains/academic/services/subject-service.ts`.

Objetivo: separar curso, matriz curricular (catálogo de disciplinas do curso) e oferta (disciplina numa turma, num período). O período do plano passa a ser derivado da oferta. O professor não escolhe período.

Critérios de sucesso:

- O admin cadastra curso, disciplinas da matriz, períodos, turmas e ofertas pela interface.
- A mesma disciplina (BD101) pode ser ofertada em turmas de períodos diferentes.
- O professor cria um plano escolhendo apenas uma oferta sua. Curso, período e carga horária aparecem somente leitura.
- Nenhum dado de curso, período ou turma fica copiado em `Subject` ou `TeachingPlan`.

## Decisões

- **Professor não escolhe período.** O período é decisão administrativa. Derivar elimina a incoerência por construção.
- **Curso vira tabela (`Course`).** Texto livre não permite filtrar disciplinas por curso nem validar oferta. `academicLevel` passa para o curso.
- **Matriz separada de oferta.** `Discipline` é o catálogo do curso (código, nome, carga horária). `Subject` é a oferta (disciplina × turma). Reofertar é criar um novo `Subject`, não duplicar código. É o modelo correto a longo prazo.
- **`Subject` continua sendo a oferta no código.** Planos, agendas, chat, avaliações e `TeacherSubject` já apontam para `Subject`. Nenhuma FK downstream muda. O catálogo entra com nome novo, `Discipline`.
- **Vocabulário da UI.** "Disciplina" = catálogo (`Discipline`). "Oferta" = disciplina numa turma (`Subject`). "Turma" = `Class`. "Curso" = `Course`.
- **`academicLevel` vira enum Prisma `AcademicLevel`.** Hoje é `String` com três valores fixos. O enum impede valor inválido no banco.
- **Turma pertence a um curso e a um período.** `Class.courseId` e `Class.academicPeriodId` obrigatórios. `Class.year` sai: o ano vem de `academicPeriod.year`.
- **Sem migração de dados.** Protótipo sem dados em produção (decisão do usuário). Só migração de schema gerada pelo Prisma, reset do banco de dev e seed reescrito.
- **Oferta e disciplina têm vínculos imutáveis na edição.** `Subject.classId`/`disciplineId` e `Discipline.courseId` não mudam no PUT. Mudar quebraria planos e agendas já ligados. Para corrigir, cria-se outro registro.
- **Curso da turma só muda se ela não tem ofertas.** Com ofertas, mudar o curso violaria a regra "disciplina do curso da turma". O serviço responde 409.
- **Ofertas do professor vêm da rota existente.** `GET /api/v1/admin/subjects` passa a filtrar por papel: TEACHER recebe só as suas ofertas (via `TeacherSubject`); ADMIN recebe todas. Não cria rota nova; a página do professor e `TeacherReportsPage` já consomem essa rota.
- **Cursos e disciplinas são ADMIN-only em todos os métodos.** A UI do professor não lê essas rotas: os dados chegam pelos includes da oferta. As rotas ficam sob o prefixo `/api/v1/admin`, já `ADMIN_ONLY` em `src/lib/auth/rbac.ts`.

## Modelo de dados

Arquivo: `prisma/schema.prisma`. Blocos completos dos modelos novos e alterados. Modelos não listados não mudam.

```prisma
enum AcademicLevel {
  HIGHER_EDUCATION
  HIGH_SCHOOL
  ELEMENTARY
}

// Curso (ex.: "Análise e Desenvolvimento de Sistemas", "Ensino Médio")
model Course {
  id            String        @id @default(cuid())
  name          String
  code          String        @unique // ex: "ADS"
  academicLevel AcademicLevel @default(HIGHER_EDUCATION)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  disciplines Discipline[]
  classes     Class[]

  @@map("courses")
}

// Disciplina da matriz curricular do curso (catálogo)
model Discipline {
  id            String   @id @default(cuid())
  courseId      String
  code          String // ex: "BD101", único dentro do curso
  name          String // ex: "Banco de Dados I"
  description   String?  @db.Text
  workloadHours Int // carga horária da matriz, ex: 80
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  course    Course    @relation(fields: [courseId], references: [id])
  offerings Subject[]

  @@unique([courseId, code])
  @@index([courseId])
  @@map("disciplines")
}

// Turma: grupo de alunos de um curso, num período letivo, numa posição da matriz
model Class {
  id               String   @id @default(cuid())
  courseId         String
  academicPeriodId String
  name             String
  code             String   @unique
  semester         Int // posição na matriz: 3 = 3º semestre (superior) ou 3º ano (médio/fundamental)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  course         Course         @relation(fields: [courseId], references: [id])
  academicPeriod AcademicPeriod @relation(fields: [academicPeriodId], references: [id])
  students       User[]
  agendas        Agenda[]
  subjects       Subject[]

  @@index([courseId])
  @@index([academicPeriodId])
  @@map("classes")
}

// Oferta: uma disciplina da matriz numa turma
model Subject {
  id           String   @id @default(cuid())
  disciplineId String
  classId      String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  discipline         Discipline       @relation(fields: [disciplineId], references: [id])
  class              Class            @relation(fields: [classId], references: [id])
  teacherAssignments TeacherSubject[]
  teachingPlans      TeachingPlan[]
  agendas            Agenda[]

  @@unique([disciplineId, classId])
  @@index([classId])
  @@index([disciplineId])
  @@map("subjects")
}

model AcademicPeriod {
  id        String    @id @default(cuid())
  name      String // ex: "1º Semestre / 2026 (2026.1)"
  code      String    @unique // ex: "2026.1"
  year      Int       @default(2026)
  semester  Int? // 1, 2, ou null para anual
  type      String    @default("SEMESTER") // "SEMESTER" | "ANNUAL" | "TERM" | "INTENSIVE"
  startDate DateTime?
  endDate   DateTime?
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  classes Class[]

  @@map("academic_periods")
}

model TeachingPlan {
  id                  String   @id @default(cuid())
  subjectId           String
  teacherId           String
  syllabus            String   @db.Text
  generalObjectives   String   @db.Text
  specificObjectives  String   @db.Text
  unitsContent        Json
  methodology         String   @db.Text
  assessmentCriteria  String   @db.Text
  basicBibliography   String[]
  complementaryBiblio String[]
  status              String   @default("DRAFT")
  totalHours          Int
  theoryHours         Int
  practiceHours       Int
  ndeComplianceStatus String   @default("Pendente de Avaliação Colegiado")
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  subject     Subject          @relation(fields: [subjectId], references: [id])
  schedules   CourseSchedule[]
  assessments Assessment[]

  @@index([subjectId])
  @@map("teaching_plans")
}
```

Notas:

- `AcademicPeriod` não ganha nem perde coluna. Só a back-relation muda: sai `teachingPlans`, entra `classes`.
- `Class` perde `year`. `Subject` perde `name`, `code`, `description`, `courseName`, `academicLevel`, `academicYear`, `semester`; `classId` vira obrigatório. `TeachingPlan` perde `academicPeriodId`, a relação `academicPeriod` e o índice `@@index([academicPeriodId])`.
- Relações novas usam o `onDelete` padrão (Restrict). Não há exclusão de curso, disciplina ou turma neste escopo.
- `TeacherSubject`, `Agenda`, `User` não mudam no schema. `Agenda.subject` (texto) continua existindo e passa a ser preenchido com `discipline.name`.

Derivações (únicas fontes):

| Dado | Caminho |
|---|---|
| Nome e código da disciplina | `subject.discipline.name`, `subject.discipline.code` |
| Carga horária da matriz | `subject.discipline.workloadHours` |
| Curso e nível | `subject.class.course.name`, `.code`, `.academicLevel` |
| Período do plano | `plan.subject.class.academicPeriod` |
| Ano letivo | `class.academicPeriod.year` |
| Posição na matriz | `class.semester` |
| Período do aluno | `user.class.academicPeriod` |

## Regras de negócio

1. **Oferta coerente.** Criar `Subject` exige `discipline.courseId === class.courseId`. Senão, 400 "A disciplina não pertence ao curso da turma.".
2. **Oferta única.** Já existe `Subject` com o mesmo `disciplineId` e `classId`: 409 "Esta disciplina já é ofertada nesta turma.".
3. **Referências existentes.** Turma inexistente: 404 "Turma não encontrada.". Disciplina inexistente: 404 "Disciplina não encontrada.". Curso inexistente (disciplina ou turma): 404 "Curso não encontrado.". Período inexistente (turma): 404 "Período letivo não encontrado.".
4. **Disciplina única no curso.** Mesmo `code` no mesmo curso: 409 "Já existe uma disciplina com este código neste curso.". O mesmo código em outro curso é permitido.
5. **Curso único.** Mesmo `code`: 409 "Já existe um curso com este código.".
6. **Curso da turma.** No PUT de turma, mudar `courseId` quando a turma tem ofertas: 409 "A turma tem ofertas; não é possível trocar o curso.". Mudar o período é permitido.
7. **Edição de oferta.** O PUT de oferta só altera `teacherIds`. `classId` e `disciplineId` não estão no schema de update.
8. **Edição de disciplina.** O PUT de disciplina altera `code`, `name`, `description`, `workloadHours`. `courseId` não está no schema de update.
9. **Plano exige alocação.** `createPlan` com papel TEACHER exige `TeacherSubject(teacherId, subjectId)`. Senão, 403 "Você não está alocado a esta oferta.". Oferta inexistente: 404 "Oferta não encontrada.". ADMIN não precisa de alocação (mesmo critério de `assertOwnsPlan` em `teaching-plan-service.ts`).
10. **Plano sem período e sem troca de oferta.** POST não aceita `academicPeriodId`. PUT não aceita `academicPeriodId` nem `subjectId`. O schema zod do PUT remove os dois; chaves extras são descartadas pelo zod (comportamento padrão de `z.object`).
11. **Horas pré-preenchidas.** Ao escolher a oferta num plano novo, a UI preenche `totalHours` com `discipline.workloadHours`. `theoryHours` e `practiceHours` seguem vazias. O professor edita tudo. O servidor continua exigindo as três horas (regra atual de `createPlan`).
12. **Geração por IA com contexto do servidor.** `/api/v1/teacher/plans/generate` recebe `subjectId`. Nome da disciplina, curso, período e carga horária são lidos do banco. Professor não alocado: 403. O cliente não envia mais texto de curso ou período.
13. **Fluxo do admin a cada período.** Curso e disciplinas são cadastrados uma vez. A cada período o admin cria (ou reaproveita) o `AcademicPeriod`, cria turmas e ofertas, e aloca professores.

## Migração e seed

### Migração

- Sem backfill.
- A migração gerada por `migrate dev --create-only` pode incluir a remoção dos índices `hnsw`/`gin` e da coluna gerada `content_tsv`, criados por SQL em `20261020130000_pgvector_fulltext`. Remover essas linhas do SQL gerado antes de aplicar. O arquivo deve ficar só com o enum, as tabelas novas e as alterações de `classes`, `subjects` e `teaching_plans`.
- Passos:
  1. Editar `prisma/schema.prisma` conforme acima.
  2. `npx prisma migrate dev --create-only --name estrutura_academica_curso_matriz_oferta` gera a migração em `prisma/migrations/<timestamp>_estrutura_academica_curso_matriz_oferta/`.
  3. `npx prisma migrate reset --force` recria o banco de dev, aplica todas as migrações e roda `prisma/seed.ts`.
- `migrate reset` **apaga todos os dados locais** (usuários, acervo, chunks, planos). Aceito pelo usuário: é protótipo. O seed recria os dados de demonstração e o acervo.
- Sem terminal interativo, o `migrate dev` pode pedir confirmação. Alternativa: rodar antes `npx prisma migrate reset --force --skip-seed` e repetir o passo 2.
- `--create-only` evita que o `migrate dev` tente aplicar colunas obrigatórias sobre linhas existentes; o reset aplica sobre banco vazio.

### Seed

Arquivos: `prisma/seed-data/academic.ts` e `prisma/seed.ts`. Continua idempotente (upsert por chaves únicas).

Constantes em `prisma/seed-data/academic.ts`:

```ts
export const DEMO_COURSE = {
  code: 'ADS',
  name: 'Análise e Desenvolvimento de Sistemas',
  academicLevel: AcademicLevel.HIGHER_EDUCATION,
} as const;

export const DEMO_DISCIPLINE = {
  code: 'BD101',
  name: 'Banco de Dados I',
  workloadHours: 80,
} as const;

export const DEMO_PERIOD_CODE = '2026.1';

export const DEMO_CLASS = {
  code: 'ADS-2026-3A',
  name: '3º Semestre · ADS',
  semester: 3,
} as const;
```

`DEMO_SUBJECT` sai. `DEMO_TEACHING_PLAN`, `DEMO_SCHEDULE`, `DEMO_LESSON_PLANS`, `DEMO_ASSESSMENT` não mudam.

Ordem em `main()` de `prisma/seed.ts` (a turma agora depende de curso e período):

1. Upsert de `DEFAULT_PERIODS` (`src/domains/academic/default-periods.ts`). Busca `period` por `DEMO_PERIOD_CODE`.
2. Upsert de `Course` por `code`.
3. Upsert de `Discipline` por `courseId_code`.
4. Upsert de `Class` por `code`, com `courseId` e `academicPeriodId`.
5. `seedUsers(klass.id)`: aluno demo mantém `classId` da turma.
6. Upsert de `Subject` por `disciplineId_classId`.
7. Upsert de `TeacherSubject` (professor demo × oferta).
8. `seedCategories()`.
9. Plano demo: `planWhere = { subjectId, teacherId }` (sem `academicPeriodId`).
10. Cronograma, planos de aula, avaliação: inalterados.
11. Agendas: `subject: DEMO_DISCIPLINE.name` no lugar de `subject.name`.

`src/domains/academic/default-periods.ts` fica como está. Os períodos são fixos em 2026; corrigir isso está fora de escopo.

## API

Padrão de rota: o de `src/app/api/v1/admin/classes/route.ts` (`requireUser`, `safeParse`, 400 com `issues[0].message`, `apiError`). Schemas em `src/lib/validators/admin.validator.ts`, exceto onde indicado.

| Rota | Método | Papel | Payload / zod | Resposta |
|---|---|---|---|---|
| `/api/v1/admin/courses` | GET | ADMIN | — | `{ success, courses }` com `_count: { disciplines, classes }`, ordem `name asc` |
| `/api/v1/admin/courses` | POST | ADMIN | `createCourseSchema` | `{ success, course }` |
| `/api/v1/admin/courses` | PUT | ADMIN | `updateCourseSchema` | `{ success, course }` |
| `/api/v1/admin/disciplines` | GET | ADMIN | query `courseId?` | `{ success, disciplines }` com `course: { id, name, code }` e `_count: { offerings }`, ordem `code asc` |
| `/api/v1/admin/disciplines` | POST | ADMIN | `createDisciplineSchema` | `{ success, discipline }` |
| `/api/v1/admin/disciplines` | PUT | ADMIN | `updateDisciplineSchema` | `{ success, discipline }` |
| `/api/v1/admin/classes` | GET | TEACHER, ADMIN | — | `{ success, classes }` com `course`, `academicPeriod`, `_count` |
| `/api/v1/admin/classes` | POST | ADMIN | `createClassSchema` (novo formato) | `{ success, class }` |
| `/api/v1/admin/classes` | PUT | ADMIN | `updateClassSchema` | `{ success, class }` |
| `/api/v1/admin/subjects` | GET | TEACHER, ADMIN | — | `{ success, subjects }`; TEACHER só as suas ofertas |
| `/api/v1/admin/subjects` | POST | ADMIN | `createOfferingSchema` | `{ success, subject }` |
| `/api/v1/admin/subjects` | PUT | ADMIN | `updateOfferingSchema` | `{ success, subject }` |
| `/api/v1/academic-periods` | GET/POST | sem mudança | sem mudança | sem mudança |
| `/api/v1/teacher/plans` | POST | TEACHER, ADMIN | `createTeachingPlanSchema` (novo, em `teaching-plan.validator.ts`) | `{ success, plan }` |
| `/api/v1/teacher/plans/[id]` | PUT | TEACHER, ADMIN | `updateTeachingPlanSchema` sem `subjectId` e `academicPeriodId` | `{ success, plan }` |
| `/api/v1/teacher/plans/generate` | POST | TEACHER, ADMIN | `{ subjectId, selectedReferences }` | `{ success, data }` |
| `/api/v1/auth/me` | GET | todos | — | `{ user }` com `user.class` (ver abaixo) |

Schemas zod:

```ts
const academicLevel = z.enum(['HIGHER_EDUCATION', 'HIGH_SCHOOL', 'ELEMENTARY']);

export const createCourseSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do curso'),
  code: z.string().trim().min(2, 'Informe o código do curso'),
  academicLevel: academicLevel.default('HIGHER_EDUCATION'),
});
export const updateCourseSchema = createCourseSchema.extend({ id: z.string().min(1, 'ID é obrigatório') });

export const createDisciplineSchema = z.object({
  courseId: z.string({ required_error: 'Curso inválido' }).cuid('Curso inválido'),
  code: z.string().trim().min(2, 'Informe o código da disciplina'),
  name: z.string().trim().min(2, 'Informe o nome da disciplina'),
  description: z.string().trim().optional(),
  workloadHours: z.coerce.number().int('Informe a carga horária em horas inteiras')
    .min(1, 'A carga horária deve ser maior que zero').max(1000, 'Informe no máximo 1000 horas'),
});
export const updateDisciplineSchema = createDisciplineSchema
  .omit({ courseId: true })
  .extend({ id: z.string().min(1, 'ID é obrigatório') });

export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da turma'),
  code: z.string().trim().min(2, 'Informe o código da turma'),
  courseId: z.string({ required_error: 'Selecione o curso' }).cuid('Selecione o curso'),
  academicPeriodId: z.string({ required_error: 'Selecione o período letivo' }).cuid('Selecione o período letivo'),
  semester: z.coerce.number().int('Informe uma posição válida')
    .min(1, 'Informe uma posição entre 1 e 12').max(12, 'Informe uma posição entre 1 e 12').default(1),
});
export const updateClassSchema = createClassSchema.extend({ id: z.string().min(1, 'ID é obrigatório') });

export const createOfferingSchema = z.object({
  classId: z.string({ required_error: 'Selecione a turma' }).cuid('Selecione a turma'),
  disciplineId: z.string({ required_error: 'Selecione a disciplina' }).cuid('Selecione a disciplina'),
  teacherIds: z.array(z.string()).default([]),
});
export const updateOfferingSchema = z.object({
  id: z.string().min(1, 'ID é obrigatório'),
  teacherIds: z.array(z.string()).default([]),
});
```

- Campo obrigatório ausente (chave fora do JSON) devolve a mesma mensagem pt-BR do campo, nunca o `"Required"` do zod. Todo `z.string()` obrigatório novo (`courseId`, `academicPeriodId`, `classId`, `disciplineId`, `subjectId`, `syllabus`) recebe `{ required_error: <mesma mensagem> }`.
- `semester` passa de 1–4 para 1–12. Agora é posição na matriz: cursos superiores têm 6 a 10 semestres; ensino fundamental tem 9 anos.
- `upsertSubjectSchema` e `updateSubjectSchema` são substituídos por `createOfferingSchema` e `updateOfferingSchema`. `UpsertSubjectInput` sai.
- Em `src/lib/validators/teaching-plan.validator.ts`:
  - `updateTeachingPlanSchema` perde `subjectId` e `academicPeriodId`.
  - Novo `createTeachingPlanSchema = updateTeachingPlanSchema.extend({ subjectId: z.string({ required_error: 'Selecione a oferta' }).min(1, 'Selecione a oferta'), syllabus: z.string({ required_error: 'Informe a ementa' }).min(1, 'Informe a ementa'), totalHours: hoursInput, theoryHours: hoursInput, practiceHours: hoursInput })`, com `const hoursInput = z.union([z.number(), z.string()]).nullable().optional()`. A UI envia `null` quando o campo está vazio; o zod não rejeita. A validação de horas, com mensagem pt-BR, continua em `createPlan`. `type CreateTeachingPlanInput = z.infer<typeof createTeachingPlanSchema>`. A rota POST passa a validar com o schema (hoje passa o body cru para `createPlan`).
- `generatePlanSchema` em `src/app/api/v1/teacher/plans/generate/route.ts`: sai `subjectName`, `courseName`, `academicPeriod`; entra `subjectId: z.string({ required_error: 'Selecione a oferta para gerar.' }).min(1, 'Selecione a oferta para gerar.')`. A rota troca `.parse` por `safeParse`, no padrão das rotas admin (400 com `issues[0].message`), para devolver `'Selecione a oferta para gerar.'`.
- `/api/v1/auth/me`: a rota acrescenta `class` ao objeto `user` da resposta, lido por nova função `findClassContext(classId)` em `class-repository.ts`: `{ id, name, code, semester, course: { name, code }, academicPeriod: { name, code } } | null`. `AuthenticatedUser` e o JWT não mudam. Novos tipos `ClassContext` e `CurrentUser = AuthenticatedUser & { class?: ClassContext | null }`, ambos em `src/lib/auth/types.ts`, usado por `src/components/layout/use-current-user.ts`.
- `src/lib/constants/routes.ts`: novas constantes `ROUTES.ADMIN_COURSES = '/admin/courses'`, `ROUTES.ADMIN_DISCIPLINES = '/admin/disciplines'`, `API_ROUTES.ADMIN_COURSES = '/api/v1/admin/courses'`, `API_ROUTES.ADMIN_DISCIPLINES = '/api/v1/admin/disciplines'`. `src/lib/auth/rbac.ts` não muda: os prefixos `/admin` e `/api/v1/admin` já são `ADMIN_ONLY`.

### Serviços e repositórios

Todos em `src/domains/academic/services/`, com injeção de `deps` no padrão de `class-service.ts`.

- `course-repository.ts`, `course-service.ts`: `listCourses`, `findCourseById`, `findCourseByCode`, `createCourse`, `updateCourse`. Regras 3 e 5.
- `discipline-repository.ts`, `discipline-service.ts`: `listDisciplines({ courseId? })`, `findDisciplineById`, `findDisciplineByCourseAndCode`, `createDiscipline`, `updateDiscipline`. Regras 3, 4 e 8.
- `class-repository.ts`, `class-service.ts`: select com `course` e `academicPeriod`; ordem `academicPeriod.year desc`, `semester asc`, `name asc`. Novos deps `courses.findCourseById` e `periods.findPeriodById` (nova função em `academic-period-repository.ts`). `countOfferings(classId)` para a regra 6. Nova `findClassContext`.
- `subject-repository.ts`, `subject-service.ts` (oferta): `listSubjects(user)` com `where` por papel; include `discipline`, `class: { include: { course, academicPeriod } }`, `teacherAssignments`, `teachingPlans`. `createSubject` aplica regras 1, 2 e 3. `updateSubject` só sincroniza professores e devolve 404 "Oferta não encontrada." se a oferta não existir. Nova `getOfferingContext(subjectId, user)` devolve `{ subjectName, courseName, academicPeriod, workloadHours }` para a geração (regras 9 e 12). A lógica de `academicYear`/`semester` copiados some.
- `teacher-subject-repository.ts`: nova `isTeacherAssigned(teacherId, subjectId)`; `listTeachersWithSubjects` inclui `subject.discipline`.
- `src/domains/teaching/services/teaching-plan-service.ts`: `CreatePlanInput` perde `academicPeriodId`. Novos deps `offerings.findSubjectById` e `assignments.isTeacherAssigned` (regra 9). `insertPlan` sem `academicPeriodId`.
- `src/domains/teaching/services/teaching-plan-repository.ts`: `planFull` e `planBasic` trocam `academicPeriod: true` por `subject: { include: { discipline: true, class: { include: { course: true, academicPeriod: true } } } }`. `findPlanForAssessment` seleciona `subject.discipline.name`.
- `src/domains/teaching/services/plan-generation-service.ts`: `GeneratePlanInput` ganha `workloadHours?: number`. A rota monta o input com `getOfferingContext`.
- `src/domains/agents/prompts/teaching-plan-prompt.ts`: entrada ganha `workloadHours?: number`; quando presente acrescenta a linha `Carga horária: 80h`.

## Interface do admin

Padrão: `src/app/admin/classes/page.tsx` + `src/app/admin/classes/_components/ClassFormModal.tsx`. Sem exclusão em nenhuma página.

### `/admin/courses` (novo)

- `src/app/admin/courses/page.tsx`: tabela com Nome, Código, Nível, Disciplinas (contagem), Turmas (contagem), ação Editar. Busca por nome ou código. Botão "Novo curso".
- `src/app/admin/courses/_components/CourseFormModal.tsx`: Nome, Código, Nível acadêmico (select: Ensino Superior, Ensino Médio, Ensino Fundamental). POST/PUT em `/api/v1/admin/courses`. Erro da API exibido no modal; erro limpo ao reabrir.

### `/admin/disciplines` (novo)

- `src/app/admin/disciplines/page.tsx`: filtro por curso (select, padrão "Todos"); tabela com Código, Nome, Curso, Carga horária, Ofertas (contagem), ação Editar. Botão "Nova disciplina".
- `src/app/admin/disciplines/_components/DisciplineFormModal.tsx`: Curso (select; desabilitado na edição), Código, Nome, Carga horária (h), Descrição (opcional). Pré-seleciona o curso do filtro ativo.

### `/admin/classes` (alterado)

- `ClassFormModal`: sai "Ano". Entra select "Curso" (de `/api/v1/admin/courses`) e combobox "Período letivo" (de `/api/v1/academic-periods`) com ação "Cadastrar novo período..." que abre `PeriodCreateInlineModal`. Mantém Nome, Código e "Posição na matriz" (rótulo do campo `semester`, texto de ajuda "Ex.: 3 para 3º semestre ou 3º ano").
- `PeriodCreateInlineModal` muda de `src/app/teacher/plans/new/_components/` para `src/app/admin/classes/_components/PeriodCreateInlineModal.tsx`. O tipo `AcademicPeriodOption` vai junto (exportado do mesmo arquivo); sai de `src/app/teacher/plans/new/types.ts`.
- `page.tsx`: coluna "Ano" vira "Período" (`academicPeriod.code`); nova coluna "Curso" (`course.code`); "Semestre" vira "Posição".

### `/admin/subjects` vira "Ofertas"

- `SubjectFormModal` vira formulário de oferta, em três passos na mesma tela:
  1. Turma: combobox existente com "+ Nova turma..." (abre `ClassFormModal`). Rótulo do item: `name`, subtítulo `course.code · academicPeriod.code`.
  2. Disciplina: combobox filtrado por `courseId` da turma escolhida (`GET /api/v1/admin/disciplines?courseId=`). Desabilitado até escolher a turma. Rótulo `code · name`, subtítulo `workloadHours h`.
  3. Professores: multi-combobox existente.
- Saem Nome, Código, Curso e Nível.
- Na edição, Turma e Disciplina aparecem desabilitadas; só Professores muda (regra 7).
- Título do modal: "Nova oferta" / "Editar oferta". Botão da página: "Nova oferta".
- `page.tsx`: tabela com Disciplina (`code · name`), Turma, Curso, Período, Professores, Planos. Busca por código, nome da disciplina, turma ou curso.

### Navegação

`src/components/layout/nav-links.ts`, `ADMIN_LINKS`, nesta ordem:

1. Cursos → `ROUTES.ADMIN_COURSES`, ícone `GraduationCap`
2. Disciplinas → `ROUTES.ADMIN_DISCIPLINES`, ícone `Library`
3. Turmas → `ROUTES.ADMIN_CLASSES`, ícone `Users`
4. Ofertas → `ROUTES.ADMIN_SUBJECTS`, ícone `BookMarked`
5. Telemetria e links do professor, como hoje.

A entrada atual "Disciplinas" de `/admin/subjects` passa a se chamar "Ofertas". Os paths de página e API de `/admin/subjects` não mudam, para não quebrar links e testes de RBAC.

## Interface de professor e aluno

### Novo plano (`/teacher/plans/new`)

- `src/app/teacher/plans/new/types.ts` (fase 3, junto com `PlanHeaderControls` e `OfferingContextCard`): `SubjectOption` vira `OfferingOption = { id; discipline: { code; name; workloadHours }; class: { id; name; semester; course: { name; code; academicLevel }; academicPeriod: { id; name; code } } }`.
- Novo helper puro `src/domains/academic/offering-label.ts`: `formatOfferingLabel(o)` → `"BD101 · Banco de Dados I · 3º Sem ADS · 2026.1"`. Para `HIGH_SCHOOL` e `ELEMENTARY` usa `"3º Ano"`. Usado pelo combobox do professor e pela listagem de planos.
- `PlanHeaderControls.tsx`:
  - Combobox "Oferta *" com os itens de `GET /api/v1/admin/subjects` (já filtrado para o professor). Título = `formatOfferingLabel`. Texto de ajuda atual mantido ("Peça ao administrador para cadastrá-la e alocar você").
  - Novo componente `src/app/teacher/plans/new/_components/OfferingContextCard.tsx`, somente leitura: Curso, Turma, Período letivo, Carga horária da matriz. Sem oferta escolhida, não renderiza.
  - Saem as props `periods`, `selectedPeriodId`, `onSelectPeriodId`, `onPeriodCreated`, `effectivePeriodName`, o combobox de período e o `PeriodCreateInlineModal`.
- `TeachingPlanNewPage.tsx`:
  - Remove o estado `periods`/`selectedPeriodId`, o fetch de `/api/v1/academic-periods`, `activePeriod` e o handler de período criado.
  - `isAiLocked = !selectedSubjectId || references.length === 0`. A mensagem "Selecione o período letivo." sai.
  - Ao escolher a oferta num plano novo, preenche `ndeCompliance.totalHours` com `discipline.workloadHours` (regra 11). Ao editar plano salvo, mantém as horas salvas.
  - `handleGenerateAI` envia `{ subjectId: selectedSubjectId, selectedReferences }`.
  - `handleSavePlan`: POST envia `subjectId` sem `academicPeriodId`. PUT não envia `subjectId` nem `academicPeriodId`. Na edição, o combobox de oferta fica desabilitado (regra 10).

### Lista de planos (`src/app/teacher/plans/page.tsx`)

- Tipo local de `subject` passa a ter `discipline` e `class.course`/`class.academicPeriod`.
- Planos agrupados por período (`subject.class.academicPeriod`), grupos ordenados por `year desc`, `code desc`. Cabeçalho do grupo = `academicPeriod.name`.
- Linha: `discipline.name`, `discipline.code`, `course.name`, turma. Busca por esses campos.

### Outras páginas do professor

- `src/app/teacher/lessons/_components/LessonsPage.tsx`, `src/app/teacher/schedules/_components/SchedulesPage.tsx`, `src/app/teacher/assessments/_components/AssessmentsPage.tsx`: `p.subject.name (p.subject.code)` vira `p.subject.discipline.name (p.subject.discipline.code)`.
- `src/components/assessments/use-assessments.ts` e `src/app/teacher/assessments/_components/PublishDialog.tsx`: tipo de `subject` com `discipline` e `classId: string` (não mais nullable).
- `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx`: opções de disciplina usam `formatOfferingLabel`. Para TEACHER a lista passa a mostrar só as ofertas dele (efeito do filtro por papel; é o comportamento correto).

### Dashboard do aluno

- `src/app/(student)/dashboard/_components/DashboardPage.tsx`: remove `useActivePeriodName` e o fetch de `/api/v1/academic-periods`. O período exibido é `user.class?.academicPeriod.name` vindo de `useCurrentUser`. Sem turma, o bloco não aparece.
- Efeito colateral positivo: `src/lib/auth/rbac.ts` lista `/api/v1/academic-periods` como `STAFF_ROLES`, então o aluno hoje não lê o período por essa rota. A nova origem não depende dela.

## Superfície afetada

Gerada a partir de `grep -rn "subject\.name\|subject\.code\|courseName\|academicLevel\|academicYear\|\.semester\|classId"` e de `academicPeriod`, depois filtrada. `classId` de `Agenda`/`User` não muda; arquivos que só leem esses campos não entram.

Schema, seed, migração:

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_estrutura_academica_curso_matriz_oferta/migration.sql` (novo, gerado)
- `prisma/seed.ts`
- `prisma/seed-data/academic.ts`

Domínio acadêmico:

- `src/domains/academic/services/class-repository.ts`
- `src/domains/academic/services/class-service.ts`
- `src/domains/academic/services/subject-repository.ts`
- `src/domains/academic/services/subject-service.ts`
- `src/domains/academic/services/teacher-subject-repository.ts`
- `src/domains/academic/services/academic-period-repository.ts`
- `src/domains/academic/services/course-repository.ts` (novo)
- `src/domains/academic/services/course-service.ts` (novo)
- `src/domains/academic/services/discipline-repository.ts` (novo)
- `src/domains/academic/services/discipline-service.ts` (novo)
- `src/domains/academic/offering-label.ts` (novo)

Ensino, agendas, avaliações, pedagogia:

- `src/domains/teaching/services/teaching-plan-service.ts`
- `src/domains/teaching/services/teaching-plan-repository.ts`
- `src/domains/teaching/services/plan-generation-service.ts`
- `src/domains/teaching/services/lesson-service.ts` (`subject.name` → `discipline.name`; remove o ramo "sem turma", agora impossível)
- `src/domains/teaching/services/lesson-plan-repository.ts`
- `src/domains/teaching/services/course-schedule-repository.ts`
- `src/domains/teaching/services/assessment-repository.ts`
- `src/domains/agents/prompts/teaching-plan-prompt.ts`
- `src/domains/agendas/services/agenda-repository.ts` (`findSubject` seleciona `discipline.name`)
- `src/domains/agendas/services/agenda-service.ts`
- `src/domains/assessments/services/assessment-service.ts` (`plan.subject.name` → `plan.subject.discipline.name`)
- `src/domains/pedagogy/services/minute-repository.ts` (`subjectRef.name` → `subjectRef.discipline.name`)
- `src/domains/pedagogy/services/minutes-service.ts`

Validators, auth, constantes:

- `src/lib/validators/admin.validator.ts`
- `src/lib/validators/teaching-plan.validator.ts`
- `src/lib/auth/types.ts`
- `src/lib/constants/routes.ts`
- `src/components/layout/nav-links.ts`
- `src/components/layout/use-current-user.ts`

Rotas:

- `src/app/api/v1/admin/courses/route.ts` (novo)
- `src/app/api/v1/admin/disciplines/route.ts` (novo)
- `src/app/api/v1/admin/classes/route.ts`
- `src/app/api/v1/admin/subjects/route.ts`
- `src/app/api/v1/teacher/plans/route.ts`
- `src/app/api/v1/teacher/plans/[id]/route.ts`
- `src/app/api/v1/teacher/plans/generate/route.ts`
- `src/app/api/v1/auth/me/route.ts`

UI admin:

- `src/app/admin/courses/page.tsx`, `src/app/admin/courses/_components/CourseFormModal.tsx` (novos)
- `src/app/admin/disciplines/page.tsx`, `src/app/admin/disciplines/_components/DisciplineFormModal.tsx` (novos)
- `src/app/admin/classes/page.tsx`
- `src/app/admin/classes/_components/ClassFormModal.tsx`
- `src/app/admin/classes/_components/PeriodCreateInlineModal.tsx` (movido de `src/app/teacher/plans/new/_components/`)
- `src/app/admin/subjects/page.tsx`
- `src/app/admin/subjects/_components/SubjectFormModal.tsx`

UI professor e aluno:

- `src/app/teacher/plans/new/types.ts`
- `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx`
- `src/app/teacher/plans/new/_components/PlanHeaderControls.tsx`
- `src/app/teacher/plans/new/_components/OfferingContextCard.tsx` (novo)
- `src/app/teacher/plans/new/_components/PeriodCreateInlineModal.tsx` (removido daqui)
- `src/app/teacher/plans/page.tsx`
- `src/app/teacher/lessons/_components/LessonsPage.tsx`
- `src/app/teacher/schedules/_components/SchedulesPage.tsx`
- `src/app/teacher/assessments/_components/AssessmentsPage.tsx`
- `src/app/teacher/assessments/_components/PublishDialog.tsx`
- `src/components/assessments/use-assessments.ts`
- `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx`
- `src/app/(student)/dashboard/_components/DashboardPage.tsx`

Testes existentes que referenciam campos removidos ou formas que mudam (atualizar):

- `src/domains/academic/services/__tests__/subject-service.test.ts`
- `src/domains/academic/services/__tests__/class-service.test.ts`
- `src/domains/teaching/services/__tests__/teaching-plan-service.test.ts`
- `src/domains/teaching/services/__tests__/plan-generation-service.test.ts`
- `src/domains/teaching/services/__tests__/lesson-service.test.ts`
- `src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts` (novo caso de carga horária)
- `src/domains/assessments/services/__tests__/assessment-service.test.ts`
- `src/domains/pedagogy/services/__tests__/minutes-service.test.ts`
- `src/lib/validators/__tests__/admin.validator.test.ts`
- `src/app/api/v1/admin/classes/__tests__/route.test.ts`

Atualizados nas fases 2 e 3 (não quebram na fase 1): `ClassFormModal.test.tsx` e `SubjectFormModal.test.tsx` (fase 2), `nav-links.test.ts` (ordem e rótulos do menu admin, fase 2).

Listados pelo grep, mas sem mudança esperada (usam só `classId` de agenda/usuário ou nomes homônimos): `src/domains/agendas/services/__tests__/agenda-service.test.ts` (não quebra na fase 1), `src/app/api/v1/agendas/[id]/status/__tests__/route.test.ts`, `src/app/api/v1/agent/chat/__tests__/route.test.ts`, `src/app/api/v1/library/documents/inspect/__tests__/route.test.ts`, `src/app/api/v1/library/materials/[id]/download/__tests__/route.test.ts`, `src/components/agendas/agenda-session.ts`, `src/components/pedagogy/__tests__/use-minutes.test.ts`, `src/domains/agendas/services/__tests__/study-group-service.test.ts`, `src/domains/agendas/types.ts`, `src/domains/agents/services/__tests__/chat-service.test.ts`, `src/domains/assessments/services/__tests__/assessment-submissions.test.ts`, `src/domains/assessments/services/__tests__/draft-service.test.ts`, `src/domains/assessments/services/__tests__/exam-service.test.ts`, `src/domains/auth/services/user-repository.ts`, `src/domains/pedagogy/services/__tests__/faq-service.test.ts`, `src/lib/auth/session.ts`, `src/lib/auth/__tests__/get-session-user.test.ts`, `src/lib/auth/__tests__/request-user.test.ts`, `src/lib/mcp/__tests__/mcp-server.test.ts`, `src/lib/mcp/tools/interaction-tool.ts`, `src/lib/validators/agenda.validator.ts`, `src/lib/validators/assessment.validator.ts`, `src/lib/validators/pedagogy.validator.ts`, `src/domains/academic/services/academic-period-service.ts`, `src/components/layout/__tests__/app-header.test.tsx` e `src/app/__tests__/area-layouts.test.tsx` (usam só `ROUTES.ADMIN_SUBJECTS`, que não muda). O `typecheck` confirma: se algum deles quebrar, entra na fase 1.

## Testes

Vitest, com `deps` injetados nos serviços (padrão de `src/domains/academic/services/__tests__/class-service.test.ts`).

Serviços:

- `course-service.test.ts` (novo): cria; 409 em código duplicado; update com código de outro curso → 409; update de curso inexistente → 404.
- `discipline-service.test.ts` (novo): cria; 404 curso inexistente; 409 mesmo código no mesmo curso; mesmo código em outro curso é aceito; update não altera `courseId`; filtro `courseId` repassado ao repositório.
- `class-service.test.ts`: 404 curso inexistente; 404 período inexistente; 409 código duplicado; 409 troca de curso com ofertas; troca de período aceita.
- `subject-service.test.ts`: 400 disciplina de outro curso; 409 oferta duplicada (disciplina × turma); 404 turma; 404 disciplina; update só sincroniza professores; `listSubjects` filtra por professor quando TEACHER e não filtra quando ADMIN; `getOfferingContext` devolve nome, curso, período e horas, e lança 403 para professor não alocado.
- `teaching-plan-service.test.ts`: 403 professor não alocado; 404 oferta inexistente; ADMIN cria sem alocação; `insertPlan` nunca recebe `academicPeriodId`; o caso atual "null clears academicPeriodId" é removido.
- `plan-generation-service.test.ts` e `teaching-plan-prompt.test.ts`: `workloadHours` aparece no prompt quando informado.

Validators (`admin.validator.test.ts`, novo bloco em teste do `teaching-plan.validator.ts`): `workloadHours` coagido e limitado; `semester` 1–12; `updateDisciplineSchema` descarta `courseId`; `updateOfferingSchema` descarta `classId`/`disciplineId`; `updateTeachingPlanSchema` descarta `subjectId`/`academicPeriodId`.

Rotas (padrão de `src/app/api/v1/admin/classes/__tests__/route.test.ts`, serviços mockados):

- `src/app/api/v1/admin/courses/__tests__/route.test.ts`: `requireUser` chamado com `[Role.ADMIN]` em GET, POST, PUT; 400 com payload inválido.
- `src/app/api/v1/admin/disciplines/__tests__/route.test.ts`: idem; GET repassa `courseId` da query.
- `src/app/api/v1/admin/classes/__tests__/route.test.ts`: payload novo (`courseId`, `academicPeriodId`, sem `year`).
- `src/app/api/v1/admin/subjects/__tests__/route.test.ts` (novo): GET com `[TEACHER, ADMIN]` e repassa o usuário a `listSubjects`; POST/PUT com `[ADMIN]`.
- `src/app/api/v1/teacher/plans/generate/__tests__/route.test.ts` (novo): exige `subjectId`; chama `getOfferingContext` e repassa o contexto ao serviço.

Componentes (Testing Library):

- `CourseFormModal.test.tsx`, `DisciplineFormModal.test.tsx` (novos): payload enviado, erro da API exibido, erro limpo ao reabrir; disciplina com Curso desabilitado na edição.
- `ClassFormModal.test.tsx`: envia `courseId` e `academicPeriodId`; não envia `year`; "Cadastrar novo período..." abre o modal e seleciona o período criado.
- `SubjectFormModal.test.tsx` (oferta): Disciplina desabilitada sem turma; lista só disciplinas do curso da turma; payload `{ classId, disciplineId, teacherIds }`; na edição envia só `{ id, teacherIds }`.
- `OfferingContextCard.test.tsx` (novo): mostra curso, turma, período e carga horária; não renderiza sem oferta.
- `offering-label.test.ts` (novo): "3º Sem" para superior; "3º Ano" para médio e fundamental.

Prova de migração e seed:

1. `npx prisma migrate reset --force` termina sem erro e roda o seed.
2. Rodar o seed de novo (`npm run db:seed`) termina sem erro (idempotência).
3. `npm run typecheck` sem erros.
4. `npm test` verde. O teste instável conhecido de fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` é pré-existente; repetir a suíte se só ele falhar.

## Fases de execução

Um plano de implementação por fase. Cada fase termina com `npm run typecheck` e `npm test` verdes, e commit em `main`.

1. **Schema, migração, seed, domínio e API.** Schema, migração, reset, seed; serviços e repositórios (curso, disciplina, turma, oferta, plano, geração, prompt); validators; rotas novas e alteradas, incluindo `/auth/me`; downstream de domínio (agendas, aulas, avaliações, atas); constantes de rota. A UI pode ficar incoerente em runtime, mas precisa compilar. Para isso, a fase 1 inclui os ajustes mínimos de tipo e de leitura de campo na UI (troca de `subject.name` por `subject.discipline.name`, remoção de `academicPeriodId` dos bodies, tipos de `use-assessments.ts`). `types.ts` (`SubjectOption` → `OfferingOption`) fica para a fase 3. Sem layout novo nessa fase.
2. **Interface do admin.** Páginas e modais de Cursos e Disciplinas; `ClassFormModal` com curso e período; mover `PeriodCreateInlineModal`; `SubjectFormModal` como oferta; listagens; navegação.
3. **Interface de professor e aluno.** Combobox de oferta, `OfferingContextCard`, remoção do seletor de período, pré-preenchimento de horas, geração por `subjectId`, lista de planos agrupada por período, páginas de aulas/cronogramas/avaliações/relatórios, dashboard do aluno.

## Fora de escopo

- Pré-requisitos entre disciplinas.
- Versões da matriz curricular (matriz 2024 × matriz 2026).
- Exclusão de curso, disciplina, turma ou oferta.
- Períodos padrão fixos em 2026 em `src/domains/academic/default-periods.ts`.
- Migração ou backfill de dados.
- Normalizar `Agenda.subject` (texto). Continua sendo preenchido na criação da agenda.
- Corrigir a divergência de RBAC de `/api/v1/academic-periods` (rota aceita STUDENT, `rbac.ts` não). A nova UI do aluno deixa de depender dela.

## Riscos

- **Reset apaga o banco local.** Inclui acervo indexado e embeddings. Mitigação: o seed recria o acervo de demonstração; avisar antes de rodar a fase 1.
- **Superfície grande na fase 1.** Muitos arquivos leem `subject.name`. Mitigação: o `typecheck` aponta cada leitura; a lista acima é o roteiro.
- **Includes mais profundos.** Listas de planos e ofertas passam a carregar `discipline`, `class.course`, `class.academicPeriod`. O volume do protótipo é pequeno; sem paginação nova.
- **Filtro por papel em `/api/v1/admin/subjects`.** Muda o que o professor vê em relatórios e no plano. É o comportamento desejado, mas qualquer tela de professor que esperava a lista completa passa a ver só as suas ofertas.
- **Teste instável pré-existente** em `src/app/api/v1/agent/chat/__tests__/route.test.ts` pode mascarar regressão. Mitigação: rodar o arquivo isolado quando falhar.
