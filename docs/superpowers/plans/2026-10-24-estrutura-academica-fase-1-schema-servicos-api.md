# Estrutura acadêmica, fase 1: schema, serviços e API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar curso (`Course`), matriz curricular (`Discipline`) e oferta (`Subject`) no banco, nos serviços e na API, com o período do plano derivado de `subject.class.academicPeriod`, deixando `npm run typecheck` e `npm test` verdes ao final.

**Architecture:** Fatias verticais por entidade. Cada task leva validador zod (`src/lib/validators`), repositório Prisma e serviço com `deps` injetados (`src/domains/academic/services`) e a rota em `src/app/api/v1`, com testes de serviço (deps falsos) e de rota (serviços mockados com `vi.mock`). A task 1 troca o schema e regenera o client; a partir dela o `tsc` fica vermelho até a task 10, e cada task prova que os arquivos que tocou não têm erro de tipo. UI só recebe ajustes mínimos de leitura de campo e de body (task 10); layout novo fica para as fases 2 e 3.

**Tech Stack:** Next.js (App Router), TypeScript, Prisma 6 (PostgreSQL + pgvector), zod 3, vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-estrutura-academica-curso-matriz-oferta-design.md` (seções "Modelo de dados", "Regras de negócio", "Migração e seed", "API", "Testes" e "Fases de execução", item 1).

## Global Constraints

- Todo o trabalho é feito direto em `main`. Não criar branch nem worktree. Commits em `main`, sem pull request.
- Não commitar `package.json`, `package-lock.json` nem `.mcp.json` (alterações pendentes de outro trabalho). Usar `git add` com caminhos explícitos em todo commit.
- Antes da task 1, o orquestrador confirma com o usuário que pode rodar `npx prisma migrate reset --force`: ele **apaga todos os dados locais** (usuários, acervo, chunks, planos). O PostgreSQL local de `DATABASE_URL` precisa estar no ar.
- Sem backfill e sem migração de dados. Só a migração gerada pelo Prisma.
- Mensagens de erro e textos em português do Brasil, com os valores exatos da spec:
  - 400 `'A disciplina não pertence ao curso da turma.'`
  - 409 `'Esta disciplina já é ofertada nesta turma.'`
  - 404 `'Turma não encontrada.'`, `'Disciplina não encontrada.'`, `'Curso não encontrado.'`, `'Período letivo não encontrado.'`, `'Oferta não encontrada.'`
  - 409 `'Já existe uma disciplina com este código neste curso.'`, `'Já existe um curso com este código.'`, `'Já existe uma turma com este código.'`
  - 409 `'A turma tem ofertas; não é possível trocar o curso.'`
  - 403 `'Você não está alocado a esta oferta.'`
- Campo obrigatório ausente (chave fora do JSON) devolve a mesma mensagem pt-BR do campo, nunca o `"Required"` padrão do zod: os campos `z.string()` obrigatórios dos schemas novos recebem `{ required_error: <mesma mensagem do .cuid()/.min()> }`.
- Nenhum dado de curso, período ou turma copiado em `Subject` ou `TeachingPlan`. Derivações únicas: nome/código da disciplina em `subject.discipline`, carga horária em `subject.discipline.workloadHours`, curso em `subject.class.course`, período em `subject.class.academicPeriod`.
- Serviços recebem `deps` com padrão `deps: XDeps = defaultDeps` (como `class-service.ts`). Testes de serviço nunca tocam o Prisma.
- RBAC: `/api/v1/admin/courses` e `/api/v1/admin/disciplines` exigem `[Role.ADMIN]` em GET, POST e PUT. GET de `/api/v1/admin/classes` e `/api/v1/admin/subjects` aceita `[Role.TEACHER, Role.ADMIN]`; POST/PUT, `[Role.ADMIN]`. Plano e geração aceitam `[Role.TEACHER, Role.ADMIN]`. `src/lib/auth/rbac.ts` não muda.
- Rotas no padrão de `src/app/api/v1/admin/classes/route.ts`: `requireUser`, `safeParse`, 400 com `{ success: false, error: parsed.error.issues[0].message, details: parsed.error.flatten() }`, `apiError` no `catch`.
- PUT de oferta não aceita `classId`/`disciplineId`; PUT de disciplina não aceita `courseId`; POST/PUT de plano não aceitam `academicPeriodId`; PUT de plano não aceita `subjectId`. Chaves extras são descartadas pelo `z.object` (sem `.strict()`).
- Ids usados em testes de validador/rota que passam por `.cuid()` começam com `c` e têm 9+ caracteres sem hífen (ex.: `ccourse00001`).
- Gate de tipo por task (a partir da task 1, até a task 10): `npx tsc --noEmit 2>&1 | grep -E "<arquivos da task>"` sem saída. O `tsc` completo só fica verde na task 10.
- Teste instável conhecido: o fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` falha ~1 em 5 execuções; se for a única falha, repetir o arquivo isolado.
- Commits terminam com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A tela de novo plano envia `totalHours: null` quando o campo está vazio. O POST deve responder 400 com `'Informe a carga horária total (maior que zero), teórica e prática.'` (mensagem do `createPlan`), não o `"Expected number, received null"` do zod. Teste na Task 6 (validador aceita `null` e string; serviço rejeita com a mensagem pt-BR).
2. Payload sem a chave `courseId`, `academicPeriodId`, `classId`, `disciplineId` ou `subjectId` deve devolver a mensagem pt-BR do campo (`'Selecione o curso'` etc.), não `"Required"`. Testes nas Tasks 4, 5 e 6 (validador).
3. Editar uma turma com ofertas, mantendo o mesmo `courseId` (só nome, código ou período mudam), deve ser aceito; o 409 é só para troca de curso. Teste na Task 4.
4. Editar um curso ou uma disciplina mantendo o próprio código não pode dar 409. Testes nas Tasks 2 e 3.
5. `/api/v1/auth/me` para professor ou admin (sem `classId`) devolve `user.class: null` sem consultar o banco; para aluno com turma, devolve o contexto da turma. Teste na Task 9.

---

### Task 1: Schema Prisma, migração e seed

**Files:**
- Modify: `prisma/schema.prisma` (blocos `Class`, `Subject`, `AcademicPeriod`, `TeachingPlan`; novos `enum AcademicLevel`, `Course`, `Discipline`)
- Create: `prisma/migrations/<timestamp>_estrutura_academica_curso_matriz_oferta/migration.sql` (gerado)
- Modify: `prisma/seed-data/academic.ts`
- Modify: `prisma/seed.ts` (função `main`)

**Interfaces:**
- Consumes: `DEFAULT_PERIODS` de `src/domains/academic/default-periods.ts` (sem mudança).
- Produces: client Prisma com `AcademicLevel`, `db.course`, `db.discipline`, `Class.courseId`/`academicPeriodId` obrigatórios e sem `year`, `Subject` só com `disciplineId`/`classId` (obrigatório) e `@@unique([disciplineId, classId])` (chave composta `disciplineId_classId`), `Discipline` com `@@unique([courseId, code])` (chave `courseId_code`), `TeachingPlan` sem `academicPeriodId`. Constantes `DEMO_COURSE`, `DEMO_DISCIPLINE`, `DEMO_PERIOD_CODE`, `DEMO_CLASS` em `prisma/seed-data/academic.ts`.

- [ ] **Step 1: Editar `prisma/schema.prisma`**

Copiar literalmente o bloco `prisma` da seção "Modelo de dados" da spec (linhas 44–172): acrescentar `enum AcademicLevel`, `model Course`, `model Discipline`; substituir os blocos inteiros de `Class`, `Subject`, `AcademicPeriod` e `TeachingPlan`. `User`, `Agenda` e `TeacherSubject` não mudam.

- [ ] **Step 2: Validar o schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Gerar a migração sem aplicar**

Run: `npx prisma migrate dev --create-only --name estrutura_academica_curso_matriz_oferta`
Expected: `Prisma Migrate created the following migration without applying it 2026…_estrutura_academica_curso_matriz_oferta`.
Se o comando pedir confirmação de perda de dados ou falhar por ambiente não interativo, rodar antes `npx prisma migrate reset --force --skip-seed` (banco vazio com as migrações antigas) e repetir o Step 3.

- [ ] **Step 4: Conferir o SQL gerado**

Run: `grep -nE "material_chunks|DROP INDEX|content_tsv|embedding" prisma/migrations/*_estrutura_academica_curso_matriz_oferta/migration.sql`
Expected: sem saída. Se houver linhas, são drift dos índices `hnsw`/`gin` e da coluna gerada criados por SQL na migração `20261020130000_pgvector_fulltext`: apagar essas instruções do `migration.sql`. O arquivo deve conter só `CREATE TYPE "AcademicLevel"`, `CREATE TABLE "courses"`/`"disciplines"` e alterações em `classes`, `subjects`, `teaching_plans` (com seus índices e FKs).

- [ ] **Step 5: Reescrever `prisma/seed-data/academic.ts`**

Importar `AcademicLevel` de `@prisma/client`. Substituir `DEMO_CLASS` e `DEMO_SUBJECT` pelas constantes exatas da spec (seção "Seed"): `DEMO_COURSE = { code: 'ADS', name: 'Análise e Desenvolvimento de Sistemas', academicLevel: AcademicLevel.HIGHER_EDUCATION }`, `DEMO_DISCIPLINE = { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 }`, `DEMO_PERIOD_CODE = '2026.1'`, `DEMO_CLASS = { code: 'ADS-2026-3A', name: '3º Semestre · ADS', semester: 3 }`, todas `as const`. `DEMO_SUBJECT` sai. `DEMO_TEACHING_PLAN`, `DEMO_SCHEDULE`, `DEMO_LESSON_PLANS`, `DEMO_ASSESSMENT` não mudam.

- [ ] **Step 6: Reordenar `main()` em `prisma/seed.ts`**

Na ordem da spec, todos idempotentes:
1. Upsert de `DEFAULT_PERIODS` (como hoje) e `period = findUniqueOrThrow({ where: { code: DEMO_PERIOD_CODE } })`.
2. `course = prisma.course.upsert({ where: { code: DEMO_COURSE.code }, update: { name, academicLevel }, create: { ...DEMO_COURSE } })`.
3. `discipline = prisma.discipline.upsert({ where: { courseId_code: { courseId: course.id, code: DEMO_DISCIPLINE.code } }, update: { name, workloadHours }, create: { ...DEMO_DISCIPLINE, courseId: course.id } })`.
4. `klass = prisma.class.upsert({ where: { code: DEMO_CLASS.code }, update: { name, semester, courseId, academicPeriodId: period.id }, create: { ...DEMO_CLASS, courseId: course.id, academicPeriodId: period.id } })`.
5. `teacher = await seedUsers(klass.id)` (sem mudança).
6. `subject = prisma.subject.upsert({ where: { disciplineId_classId: { disciplineId: discipline.id, classId: klass.id } }, update: {}, create: { disciplineId: discipline.id, classId: klass.id } })`.
7. Upsert de `TeacherSubject` (como hoje).
8. `seedCategories()`.
9. `planWhere = { subjectId: subject.id, teacherId: teacher.id }` (sem `academicPeriodId`).
10. Cronograma, planos de aula e avaliação: inalterados.
11. Agendas: `subject: DEMO_DISCIPLINE.name` no lugar de `subject.name`.

Acrescentar `courses: await prisma.course.count()` e `disciplines: await prisma.discipline.count()` ao `console.table`.

- [ ] **Step 7: Recriar o banco e rodar o seed**

Run: `npx prisma migrate reset --force`
Expected: aplica todas as migrações, incluindo `…_estrutura_academica_curso_matriz_oferta`, regenera o client, imprime a tabela com `courses: 1`, `disciplines: 1`, `classes: 1`, `subjects: 1`, `teachingPlans: 1` e a linha `Seed concluído`.

- [ ] **Step 8: Provar a idempotência do seed e o estado da migração**

Run: `npm run db:seed && npx prisma migrate status`
Expected: segunda tabela com as mesmas contagens, `Seed concluído`, e `Database schema is up to date!`.

- [ ] **Step 9: Confirmar que a suíte de testes segue verde**

Run: `npm test`
Expected: PASS (os testes usam deps falsos; o `tsc` fica vermelho até a Task 10, como previsto).

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/*_estrutura_academica_curso_matriz_oferta prisma/seed.ts prisma/seed-data/academic.ts
git commit -m "feat(academico): schema com curso, matriz curricular e oferta; seed reescrito

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Cursos — validador, repositório, serviço e rota

**Files:**
- Modify: `src/lib/validators/admin.validator.ts`
- Create: `src/domains/academic/services/course-repository.ts`
- Create: `src/domains/academic/services/course-service.ts`
- Create: `src/app/api/v1/admin/courses/route.ts`
- Test: `src/lib/validators/__tests__/admin.validator.test.ts`
- Test: `src/domains/academic/services/__tests__/course-service.test.ts`
- Test: `src/app/api/v1/admin/courses/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `DomainError(status, message)` de `@/lib/api/domain-error`; `db` de `@/lib/db`; `AcademicLevel` de `@prisma/client`.
- Produces:
  - Em `admin.validator.ts`: `const academicLevel = z.enum(['HIGHER_EDUCATION', 'HIGH_SCHOOL', 'ELEMENTARY'])`; `createCourseSchema`, `updateCourseSchema` (literais da spec); `type CreateCourseInput = z.infer<typeof createCourseSchema>`.
  - Em `course-repository.ts`: `type CoursePublic = { id: string; name: string; code: string; academicLevel: AcademicLevel }`; `listCourses(): Promise<(CoursePublic & { _count: { disciplines: number; classes: number } })[]>` (ordem `name asc`); `findCourseById(id: string): Promise<CoursePublic | null>`; `findCourseByCode(code: string): Promise<CoursePublic | null>`; `createCourse(data: CreateCourseInput): Promise<CoursePublic>`; `updateCourse(id: string, data: CreateCourseInput): Promise<CoursePublic>`.
  - Em `course-service.ts`: `type CourseDeps = { repo: Pick<typeof realRepo, 'listCourses' | 'findCourseById' | 'findCourseByCode' | 'createCourse' | 'updateCourse'> }`; `listCourses(deps?)`; `createCourse(input: CreateCourseInput, deps?)`; `updateCourse(id: string, input: CreateCourseInput, deps?)`.
  - Rota `/api/v1/admin/courses`: `GET` → `{ success: true, courses }`; `POST` → `{ success: true, course }`; `PUT` → separa `id` e chama `updateCourse(id, input)`.

- [ ] **Step 1: Escrever os testes do validador (falhando)**

Acrescentar a `src/lib/validators/__tests__/admin.validator.test.ts` (importar `createCourseSchema`, `updateCourseSchema`):

```ts
describe('createCourseSchema', () => {
  it('aplica nível HIGHER_EDUCATION por padrão e remove espaços', () => {
    expect(createCourseSchema.parse({ name: '  Ensino Médio ', code: ' EM ' })).toEqual({
      name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGHER_EDUCATION',
    });
  });
  it('rejeita nível desconhecido e nome curto com mensagem pt-BR', () => {
    expect(createCourseSchema.safeParse({ name: 'ADS', code: 'ADS', academicLevel: 'MBA' }).success).toBe(false);
    expect(createCourseSchema.safeParse({ name: 'A', code: 'ADS' }).error?.issues[0].message).toBe('Informe o nome do curso');
  });
  it('updateCourseSchema exige id', () => {
    expect(updateCourseSchema.safeParse({ name: 'ADS', code: 'ADS' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Escrever `src/domains/academic/services/__tests__/course-service.test.ts` (falhando)**

```ts
import { describe, it, expect } from 'vitest';
import { listCourses, createCourse, updateCourse, type CourseDeps } from '../course-service';

const ads = { id: 'co1', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' as const };
const em = { id: 'co2', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' as const };
const input = { name: 'Engenharia de Software', code: 'ES', academicLevel: 'HIGHER_EDUCATION' as const };

function makeDeps(rows = [ads, em]) {
  const calls: { op: string; id?: string; data: unknown }[] = [];
  const deps: CourseDeps = {
    repo: {
      listCourses: async () => rows.map((r) => ({ ...r, _count: { disciplines: 0, classes: 0 } })),
      findCourseById: async (id) => rows.find((r) => r.id === id) ?? null,
      findCourseByCode: async (code) => rows.find((r) => r.code === code) ?? null,
      createCourse: async (data) => { calls.push({ op: 'create', data }); return { id: 'new', ...data }; },
      updateCourse: async (id, data) => { calls.push({ op: 'update', id, data }); return { id, ...data }; },
    },
  };
  return { deps, calls };
}

describe('course-service', () => {
  it('lista com contagens', async () => {
    expect(await listCourses(makeDeps().deps)).toHaveLength(2);
  });
  it('cria curso com código inédito', async () => {
    const { deps, calls } = makeDeps();
    await createCourse(input, deps);
    expect(calls[0]).toEqual({ op: 'create', data: input });
  });
  it('rejeita código duplicado com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(createCourse({ ...input, code: 'ADS' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe um curso com este código.' });
    expect(calls).toHaveLength(0);
  });
  it('atualiza mantendo o próprio código', async () => {
    const { deps, calls } = makeDeps();
    await updateCourse('co1', { ...input, code: 'ADS' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'co1', data: { code: 'ADS' } });
  });
  it('rejeita no update o código de outro curso com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateCourse('co1', { ...input, code: 'EM' }, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });
  it('rejeita update de curso inexistente com 404', async () => {
    const { deps } = makeDeps();
    await expect(updateCourse('nope', input, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
  });
});
```

- [ ] **Step 3: Escrever `src/app/api/v1/admin/courses/__tests__/route.test.ts` (falhando)**

Mesmo esqueleto de `src/app/api/v1/admin/classes/__tests__/route.test.ts` (`vi.hoisted` com `requireUser`, `listCourses`, `createCourse`, `updateCourse`; `vi.mock('@/lib/auth/request-user')` e `vi.mock('@/domains/academic/services/course-service')`; `beforeEach` com `requireUser.mockResolvedValue(admin)`). Casos:

```ts
it('GET exige ADMIN e devolve os cursos', async () => {
  mocks.listCourses.mockResolvedValue([course]);
  const res = await GET(new Request('http://x/api/v1/admin/courses'));
  expect(await res.json()).toEqual({ success: true, courses: [course] });
  expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
});
it('POST exige ADMIN e aplica o nível padrão', async () => {
  mocks.createCourse.mockResolvedValue(course);
  await POST(req('POST', { name: 'Engenharia', code: 'ES' }));
  expect(mocks.createCourse).toHaveBeenCalledWith({ name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' });
  expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
});
it('POST devolve 400 com a primeira mensagem do zod', async () => {
  const res = await POST(req('POST', { name: 'Engenharia', code: 'E' }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ success: false, error: 'Informe o código do curso' });
  expect(mocks.createCourse).not.toHaveBeenCalled();
});
it('PUT exige ADMIN e separa o id', async () => {
  mocks.updateCourse.mockResolvedValue(course);
  await PUT(req('PUT', { id: 'co1', name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' }));
  expect(mocks.updateCourse).toHaveBeenCalledWith('co1', { name: 'Engenharia', code: 'ES', academicLevel: 'HIGHER_EDUCATION' });
  expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/course-service.test.ts src/app/api/v1/admin/courses`
Expected: FAIL (`createCourseSchema` não exportado; módulos `course-service` e `../route` inexistentes).

- [ ] **Step 5: Implementar validador, repositório, serviço e rota**

Validador: copiar `academicLevel`, `createCourseSchema` e `updateCourseSchema` da spec; exportar `CreateCourseInput`.
Repositório: `select` com `id, name, code, academicLevel`; `listCourses` acrescenta `_count: { select: { disciplines: true, classes: true } }` e `orderBy: { name: 'asc' }`; `findCourseByCode` usa `findUnique({ where: { code } })`.
Serviço: `createCourse` lança 409 se `findCourseByCode(input.code)` devolver algo; `updateCourse` lança 404 `'Curso não encontrado.'` se `findCourseById(id)` for `null`, depois 409 se `findCourseByCode` devolver curso com `id !== id`.
Rota: `GET`, `POST`, `PUT` com `requireUser(req, [Role.ADMIN])`, no padrão de `admin/classes/route.ts`.

- [ ] **Step 6: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/course-service.test.ts src/app/api/v1/admin/courses && npx tsc --noEmit 2>&1 | grep -E "course-(service|repository)|admin/courses"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/admin.validator.ts src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/course-repository.ts src/domains/academic/services/course-service.ts src/domains/academic/services/__tests__/course-service.test.ts src/app/api/v1/admin/courses
git commit -m "feat(cursos): validador, serviço e rota admin de cursos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Disciplinas da matriz — validador, repositório, serviço e rota

**Files:**
- Modify: `src/lib/validators/admin.validator.ts`
- Create: `src/domains/academic/services/discipline-repository.ts`
- Create: `src/domains/academic/services/discipline-service.ts`
- Create: `src/app/api/v1/admin/disciplines/route.ts`
- Test: `src/lib/validators/__tests__/admin.validator.test.ts`
- Test: `src/domains/academic/services/__tests__/discipline-service.test.ts`
- Test: `src/app/api/v1/admin/disciplines/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `findCourseById` de `course-repository.ts` (Task 2).
- Produces:
  - Em `admin.validator.ts`: `createDisciplineSchema`, `updateDisciplineSchema` (literais da spec; `courseId` com `z.string({ required_error: 'Curso inválido' })`); `type CreateDisciplineInput = z.infer<typeof createDisciplineSchema>`; `type UpdateDisciplineInput = Omit<z.infer<typeof updateDisciplineSchema>, 'id'>`.
  - Em `discipline-repository.ts`: `type DisciplinePublic = { id: string; courseId: string; code: string; name: string; description: string | null; workloadHours: number }`; `listDisciplines(filter: { courseId?: string }): Promise<(DisciplinePublic & { course: { id: string; name: string; code: string }; _count: { offerings: number } })[]>` (ordem `code asc`); `findDisciplineById(id: string): Promise<DisciplinePublic | null>`; `findDisciplineByCourseAndCode(courseId: string, code: string): Promise<DisciplinePublic | null>`; `createDiscipline(data: CreateDisciplineInput): Promise<DisciplinePublic>`; `updateDiscipline(id: string, data: UpdateDisciplineInput): Promise<DisciplinePublic>`.
  - Em `discipline-service.ts`: `type DisciplineDeps = { repo: Pick<typeof realRepo, 'listDisciplines' | 'findDisciplineById' | 'findDisciplineByCourseAndCode' | 'createDiscipline' | 'updateDiscipline'>; courses: Pick<typeof courseRepo, 'findCourseById'> }`; `listDisciplines(filter?: { courseId?: string }, deps?)`; `createDiscipline(input: CreateDisciplineInput, deps?)`; `updateDiscipline(id: string, input: UpdateDisciplineInput, deps?)`.
  - Rota `/api/v1/admin/disciplines`: `GET` lê `courseId` da query → `{ success: true, disciplines }`; `POST` → `{ success: true, discipline }`; `PUT` separa `id`.

- [ ] **Step 1: Escrever os testes do validador (falhando)**

```ts
describe('createDisciplineSchema', () => {
  const base = { courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I' };
  it('coage a carga horária vinda como string', () => {
    expect(createDisciplineSchema.parse({ ...base, workloadHours: '80' }).workloadHours).toBe(80);
  });
  it('limita a carga horária com mensagens pt-BR', () => {
    const msg = (v: unknown) => createDisciplineSchema.safeParse({ ...base, workloadHours: v }).error?.issues[0].message;
    expect(msg(0)).toBe('A carga horária deve ser maior que zero');
    expect(msg(1001)).toBe('Informe no máximo 1000 horas');
    expect(msg(80.5)).toBe('Informe a carga horária em horas inteiras');
  });
  it('exige courseId cuid com mensagem pt-BR, mesmo ausente', () => {
    const { courseId: _omit, ...semCurso } = base;
    expect(createDisciplineSchema.safeParse({ ...semCurso, workloadHours: 80 }).error?.issues[0].message).toBe('Curso inválido');
    expect(createDisciplineSchema.safeParse({ ...base, courseId: 'x', workloadHours: 80 }).error?.issues[0].message).toBe('Curso inválido');
  });
  it('updateDisciplineSchema descarta courseId', () => {
    const parsed = updateDisciplineSchema.parse({ ...base, id: 'd1', workloadHours: 80 });
    expect(parsed).not.toHaveProperty('courseId');
  });
});
```

- [ ] **Step 2: Escrever `src/domains/academic/services/__tests__/discipline-service.test.ts` (falhando)**

Fixtures: cursos `co1` e `co2`; disciplinas `d1 = { id: 'd1', courseId: 'co1', code: 'BD101', name: 'Banco de Dados I', description: null, workloadHours: 80 }` e `d2 = { id: 'd2', courseId: 'co1', code: 'ED101', ... }`. `makeDeps()` no mesmo formato da Task 2 (`calls` com `op`, `id`, `data`; `listDisciplines` registra o filtro recebido; `courses.findCourseById` devolve o curso ou `null`).

```ts
const input = { courseId: 'co1', code: 'POO101', name: 'Programação OO', workloadHours: 60 };
const upd = { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 };

it('cria disciplina no curso', async () => { /* calls[0] toEqual { op: 'create', data: input } */ });
it('rejeita curso inexistente com 404', async () => {
  await expect(createDiscipline({ ...input, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
});
it('rejeita mesmo código no mesmo curso com 409', async () => {
  await expect(createDiscipline({ ...input, code: 'BD101' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe uma disciplina com este código neste curso.' });
});
it('aceita o mesmo código em outro curso', async () => {
  await createDiscipline({ ...input, courseId: 'co2', code: 'BD101' }, deps);
  expect(calls[0]).toMatchObject({ op: 'create', data: { courseId: 'co2', code: 'BD101' } });
});
it('update mantém o próprio código e nunca envia courseId', async () => {
  await updateDiscipline('d1', { ...upd, courseId: 'co2' } as never, deps);
  expect(calls[0]).toMatchObject({ op: 'update', id: 'd1' });
  expect(calls[0].data).not.toHaveProperty('courseId');
});
it('update rejeita código de outra disciplina do curso com 409', async () => {
  await expect(updateDiscipline('d1', { ...upd, code: 'ED101' }, deps)).rejects.toMatchObject({ status: 409 });
});
it('update de disciplina inexistente: 404', async () => {
  await expect(updateDiscipline('nope', upd, deps)).rejects.toMatchObject({ status: 404, message: 'Disciplina não encontrada.' });
});
it('repassa o filtro courseId ao repositório', async () => {
  await listDisciplines({ courseId: 'co1' }, deps);
  expect(calls[0]).toEqual({ op: 'list', data: { courseId: 'co1' } });
});
```

- [ ] **Step 3: Escrever `src/app/api/v1/admin/disciplines/__tests__/route.test.ts` (falhando)**

Esqueleto da Task 2, mockando `@/domains/academic/services/discipline-service`. Casos: GET, POST e PUT chamam `requireUser` com `[Role.ADMIN]`; `GET(new Request('http://x/api/v1/admin/disciplines?courseId=co1'))` chama `listDisciplines` com `{ courseId: 'co1' }` e sem query com `{ courseId: undefined }`; POST com `workloadHours: 0` devolve 400 `{ success: false, error: 'A carga horária deve ser maior que zero' }`; PUT com `{ id: 'd1', courseId: 'ccourse00002', code: 'BD101', name: 'Banco de Dados I', workloadHours: '80' }` chama `updateDiscipline('d1', { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 })`.

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/discipline-service.test.ts src/app/api/v1/admin/disciplines`
Expected: FAIL (exports e módulos inexistentes).

- [ ] **Step 5: Implementar validador, repositório, serviço e rota**

Repositório: `listDisciplines` usa `where: filter.courseId ? { courseId: filter.courseId } : {}`, `include`/`select` com `course: { select: { id, name, code } }` e `_count: { select: { offerings: true } }`, `orderBy: { code: 'asc' }`; `findDisciplineByCourseAndCode` usa `findUnique({ where: { courseId_code: { courseId, code } } })`.
Serviço, ordem das checagens: `createDiscipline` → 404 curso, 409 duplicada; `updateDiscipline` → 404 disciplina (`findDisciplineById`), 409 se `findDisciplineByCourseAndCode(existing.courseId, input.code)` tiver `id !== id`, depois `repo.updateDiscipline(id, { code, name, description, workloadHours })` montado campo a campo (nunca espalhar `input`).
Rota: `GET` faz `listDisciplines({ courseId: new URL(req.url).searchParams.get('courseId') || undefined })`.

- [ ] **Step 6: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/discipline-service.test.ts src/app/api/v1/admin/disciplines && npx tsc --noEmit 2>&1 | grep -E "discipline-(service|repository)|admin/disciplines"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/admin.validator.ts src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/discipline-repository.ts src/domains/academic/services/discipline-service.ts src/domains/academic/services/__tests__/discipline-service.test.ts src/app/api/v1/admin/disciplines
git commit -m "feat(disciplinas): matriz curricular por curso com serviço e rota admin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Turmas com curso e período

**Files:**
- Modify: `src/lib/validators/admin.validator.ts` (`createClassSchema`, `updateClassSchema`, `CreateClassInput`)
- Modify: `src/domains/academic/services/academic-period-repository.ts`
- Modify: `src/domains/academic/services/class-repository.ts`
- Modify: `src/domains/academic/services/class-service.ts`
- Modify: `src/app/api/v1/admin/classes/route.ts` (só se o tipo exigir; o código atual já repassa `parsed.data`)
- Test: `src/lib/validators/__tests__/admin.validator.test.ts` (substitui os blocos `createClassSchema` e `createClassSchema (mensagens do ano)`)
- Test: `src/domains/academic/services/__tests__/class-service.test.ts` (reescrito)
- Test: `src/app/api/v1/admin/classes/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `findCourseById` (Task 2).
- Produces:
  - `createClassSchema`/`updateClassSchema` literais da spec, com `required_error` em `courseId` (`'Selecione o curso'`) e `academicPeriodId` (`'Selecione o período letivo'`); `type CreateClassInput = { name: string; code: string; courseId: string; academicPeriodId: string; semester: number }`.
  - Em `academic-period-repository.ts`: `findPeriodById(id: string): Promise<AcademicPeriod | null>`.
  - Em `class-repository.ts`: `type ClassPublic = { id: string; name: string; code: string; semester: number; courseId: string; academicPeriodId: string; course: { id: string; name: string; code: string; academicLevel: AcademicLevel }; academicPeriod: { id: string; name: string; code: string; year: number } }`; `listClasses(): Promise<(ClassPublic & { _count: { students: number; subjects: number } })[]>` com `orderBy: [{ academicPeriod: { year: 'desc' } }, { semester: 'asc' }, { name: 'asc' }]`; `findClassById`, `findClassByCode` → `Promise<ClassPublic | null>`; `createClass(data: CreateClassInput)`, `updateClass(id: string, data: CreateClassInput)` → `Promise<ClassPublic>`; `countOfferings(classId: string): Promise<number>`.
  - Em `class-service.ts`: `type ClassDeps = { repo: Pick<typeof realRepo, 'listClasses' | 'findClassById' | 'findClassByCode' | 'createClass' | 'updateClass' | 'countOfferings'>; courses: Pick<typeof courseRepo, 'findCourseById'>; periods: Pick<typeof periodRepo, 'findPeriodById'> }`; `listClasses(deps?)`, `createClass(input, deps?)`, `updateClass(id, input, deps?)` com as mesmas assinaturas de hoje.

- [ ] **Step 1: Substituir os testes de `createClassSchema` no validador (falhando)**

Apagar os blocos `describe('createClassSchema', …)` e `describe('createClassSchema (mensagens do ano)', …)` e escrever:

```ts
describe('createClassSchema', () => {
  const base = { name: '3º Semestre · ADS', code: 'ADS-2026-3A', courseId: 'ccourse00001', academicPeriodId: 'cperiod00001' };
  it('aplica posição 1 por padrão e não tem ano', () => {
    const parsed = createClassSchema.parse(base);
    expect(parsed.semester).toBe(1);
    expect(parsed).not.toHaveProperty('year');
  });
  it('aceita posição de 1 a 12 vinda como string', () => {
    expect(createClassSchema.parse({ ...base, semester: '12' }).semester).toBe(12);
  });
  it('rejeita posição fora de 1 a 12 com mensagem pt-BR', () => {
    for (const semester of [0, 13]) {
      expect(createClassSchema.safeParse({ ...base, semester }).error?.issues[0].message).toBe('Informe uma posição entre 1 e 12');
    }
  });
  it('exige curso e período com mensagem pt-BR, inválidos ou ausentes', () => {
    const { courseId: _c, ...semCurso } = base;
    const { academicPeriodId: _p, ...semPeriodo } = base;
    expect(createClassSchema.safeParse(semCurso).error?.issues[0].message).toBe('Selecione o curso');
    expect(createClassSchema.safeParse({ ...base, courseId: 'x' }).error?.issues[0].message).toBe('Selecione o curso');
    expect(createClassSchema.safeParse(semPeriodo).error?.issues[0].message).toBe('Selecione o período letivo');
  });
  it('updateClassSchema exige id', () => {
    expect(updateClassSchema.safeParse(base).success).toBe(false);
    expect(updateClassSchema.safeParse({ ...base, id: 'c1' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Reescrever `class-service.test.ts` (falhando)**

```ts
import { describe, it, expect } from 'vitest';
import { listClasses, createClass, updateClass, type ClassDeps } from '../class-service';

const course = (id: string) => ({ id, name: 'ADS', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' as const });
const period = (id: string) => ({ id, name: `Período ${id}`, code: id, year: 2026 });
const klass = (id: string, code: string, courseId = 'co1', academicPeriodId = 'p1') => ({
  id, name: `Turma ${id}`, code, semester: 3, courseId, academicPeriodId, course: course(courseId), academicPeriod: period(academicPeriodId),
});
const c1 = klass('c1', 'ADS-2026-3A');
const c2 = klass('c2', 'ADS-2026-1A');

function makeDeps(offerings: Record<string, number> = { c1: 2 }) {
  const calls: { op: string; id?: string; data: Record<string, unknown> }[] = [];
  const deps: ClassDeps = {
    repo: {
      listClasses: async () => [c1, c2].map((r) => ({ ...r, _count: { students: 0, subjects: 0 } })),
      findClassById: async (id) => [c1, c2].find((r) => r.id === id) ?? null,
      findClassByCode: async (code) => [c1, c2].find((r) => r.code === code) ?? null,
      createClass: async (data) => { calls.push({ op: 'create', data }); return { ...klass('new', data.code), ...data }; },
      updateClass: async (id, data) => { calls.push({ op: 'update', id, data }); return { ...klass(id, data.code), ...data }; },
      countOfferings: async (id) => offerings[id] ?? 0,
    },
    courses: { findCourseById: async (id) => (['co1', 'co2'].includes(id) ? course(id) : null) },
    periods: { findPeriodById: async (id) => (['p1', 'p2'].includes(id) ? (period(id) as never) : null) },
  };
  return { deps, calls };
}

const input = { name: 'Turma Nova', code: 'NOVA-2026-1', courseId: 'co1', academicPeriodId: 'p1', semester: 1 };

describe('createClass', () => {
  it('cria com curso e período existentes', async () => { /* calls[0] toEqual { op: 'create', data: input } */ });
  it('404 para curso inexistente', async () => {
    await expect(createClass({ ...input, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
  });
  it('404 para período inexistente', async () => {
    await expect(createClass({ ...input, academicPeriodId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Período letivo não encontrado.' });
  });
  it('409 para código duplicado', async () => {
    await expect(createClass({ ...input, code: 'ADS-2026-3A' }, deps)).rejects.toMatchObject({ status: 409, message: 'Já existe uma turma com este código.' });
  });
});

describe('updateClass', () => {
  const same = { name: 'Turma c1', code: 'ADS-2026-3A', courseId: 'co1', academicPeriodId: 'p1', semester: 3 };
  it('404 para turma inexistente', async () => {
    await expect(updateClass('nope', input, deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
  });
  it('409 para código de outra turma', async () => {
    await expect(updateClass('c1', { ...same, code: 'ADS-2026-1A' }, deps)).rejects.toMatchObject({ status: 409 });
  });
  it('409 ao trocar o curso de turma com ofertas', async () => {
    await expect(updateClass('c1', { ...same, courseId: 'co2' }, deps)).rejects.toMatchObject({
      status: 409, message: 'A turma tem ofertas; não é possível trocar o curso.',
    });
    expect(calls).toHaveLength(0);
  });
  it('aceita troca de período em turma com ofertas', async () => {
    await updateClass('c1', { ...same, academicPeriodId: 'p2' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c1', data: { academicPeriodId: 'p2' } });
  });
  it('aceita editar turma com ofertas mantendo o curso', async () => {
    await updateClass('c1', { ...same, name: 'Novo nome' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', data: { name: 'Novo nome', courseId: 'co1' } });
  });
  it('aceita trocar o curso de turma sem ofertas', async () => {
    await updateClass('c2', { ...same, code: 'ADS-2026-1A', courseId: 'co2' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c2', data: { courseId: 'co2' } });
  });
  it('404 para curso ou período inexistente no update', async () => {
    await expect(updateClass('c1', { ...same, courseId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Curso não encontrado.' });
    await expect(updateClass('c1', { ...same, academicPeriodId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Período letivo não encontrado.' });
  });
});
```

(`deps`/`calls` vêm de `const { deps, calls } = makeDeps()` em cada `it`.)

- [ ] **Step 3: Atualizar `src/app/api/v1/admin/classes/__tests__/route.test.ts` (falhando)**

Payloads passam a `{ name: 'Turma', code: 'T-2026-1', courseId: 'ccourse00001', academicPeriodId: 'cperiod00001', semester: '1' }`. `POST` espera `createClass` chamado com `{ name: 'Turma', code: 'T-2026-1', courseId: 'ccourse00001', academicPeriodId: 'cperiod00001', semester: 1 }` e `mocks.createClass.mock.calls[0][0]` sem a propriedade `year`; o PUT espera `updateClass('c9', { …mesmo objeto, semester: 2 })`. Acrescentar: `GET` chama `requireUser` com `[Role.TEACHER, Role.ADMIN]`. Fixture `klass` sem `year`.

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/class-service.test.ts src/app/api/v1/admin/classes`
Expected: FAIL (`countOfferings`/`courses`/`periods` inexistentes; schema ainda pede `year`).

- [ ] **Step 5: Implementar**

Validador: substituir `createClassSchema` pelo literal da spec, mais `required_error`. Repositório de período: `findPeriodById` com `findUnique({ where: { id } })`. Repositório de turma: novo `classSelect` com os campos de `ClassPublic`; `countOfferings` com `db.subject.count({ where: { classId } })`.
Serviço, ordem das checagens: `createClass` → 404 curso, 404 período, 409 código. `updateClass` → 404 turma (`findClassById`), 409 código de outra turma, 404 curso, 404 período, 409 se `input.courseId !== existing.courseId && (await countOfferings(id)) > 0`. `defaultDeps = { repo: realRepo, courses: courseRepo, periods: periodRepo }`.

- [ ] **Step 6: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/class-service.test.ts src/app/api/v1/admin/classes && npx tsc --noEmit 2>&1 | grep -E "class-(service|repository)|academic-period-repository|admin/classes/route"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/admin.validator.ts src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/academic-period-repository.ts src/domains/academic/services/class-repository.ts src/domains/academic/services/class-service.ts src/domains/academic/services/__tests__/class-service.test.ts src/app/api/v1/admin/classes
git commit -m "feat(turmas): turma pertence a curso e período; posição na matriz de 1 a 12

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Oferta (`Subject`) — validação curso × turma, filtro por papel e contexto para a IA

**Files:**
- Modify: `src/lib/validators/admin.validator.ts` (remove `upsertSubjectSchema`, `updateSubjectSchema`, `UpsertSubjectInput`; acrescenta `createOfferingSchema`, `updateOfferingSchema`)
- Modify: `src/domains/academic/services/teacher-subject-repository.ts`
- Modify: `src/domains/academic/services/subject-repository.ts` (reescrito)
- Modify: `src/domains/academic/services/subject-service.ts`
- Modify: `src/app/api/v1/admin/subjects/route.ts`
- Test: `src/lib/validators/__tests__/admin.validator.test.ts` (remove os blocos `upsertSubjectSchema` e `updateSubjectSchema`)
- Test: `src/domains/academic/services/__tests__/subject-service.test.ts` (reescrito)
- Test: `src/app/api/v1/admin/subjects/__tests__/route.test.ts` (novo)

**Interfaces:**
- Consumes: `findClassById` → `ClassPublic` (Task 4); `findDisciplineById` → `DisciplinePublic` (Task 3).
- Produces:
  - `createOfferingSchema`, `updateOfferingSchema` (literais da spec, com `required_error` `'Selecione a turma'` e `'Selecione a disciplina'`); `type CreateOfferingInput = z.infer<typeof createOfferingSchema>`.
  - Em `teacher-subject-repository.ts`: `isTeacherAssigned(teacherId: string, subjectId: string): Promise<boolean>`; `listTeachersWithSubjects` passa a incluir `subject: { include: { discipline: true } }`.
  - Em `subject-repository.ts`: `listSubjects(where: Prisma.SubjectWhereInput)` com include `discipline`, `class: { include: { course: true, academicPeriod: true } }`, `teacherAssignments: { include: { teacher: { select: teacherPublicSelect } } }`, `teachingPlans: { select: { id, status, updatedAt } }`, ordem `createdAt desc`; `findSubjectById(id: string): Promise<{ id: string; disciplineId: string; classId: string } | null>`; `findSubjectByDisciplineAndClass(disciplineId: string, classId: string): Promise<{ id: string } | null>`; `findOfferingContext(id: string): Promise<{ discipline: { name: string; workloadHours: number }; class: { course: { name: string }; academicPeriod: { name: string } } } | null>`; `createSubjectWithTeachers(data: { disciplineId: string; classId: string }, teacherIds: string[])`; `replaceSubjectTeachers(id: string, teacherIds: string[])`.
  - Em `subject-service.ts`: `type SubjectActor = { id: string; role: Role }`; `type OfferingContext = { subjectName: string; courseName: string; academicPeriod: string; workloadHours: number }`; `type SubjectDeps = { repo: Pick<typeof realRepo, 'listSubjects' | 'findSubjectById' | 'findSubjectByDisciplineAndClass' | 'findOfferingContext' | 'createSubjectWithTeachers' | 'replaceSubjectTeachers'>; classes: Pick<typeof classRepo, 'findClassById'>; disciplines: Pick<typeof disciplineRepo, 'findDisciplineById'>; assignments: Pick<typeof teacherRepo, 'isTeacherAssigned'> }`; `listSubjects(user: SubjectActor, deps?)`; `createSubject(input: CreateOfferingInput, deps?)`; `updateSubject(id: string, input: { teacherIds: string[] }, deps?)`; `getOfferingContext(subjectId: string, user: SubjectActor, deps?): Promise<OfferingContext>`. `listTeachers`/`createTeacher` não mudam.

- [ ] **Step 1: Trocar os testes de validador de disciplina por oferta (falhando)**

Apagar `describe('upsertSubjectSchema')` e `describe('updateSubjectSchema')` e os imports correspondentes. Escrever:

```ts
describe('createOfferingSchema', () => {
  it('aplica teacherIds vazio por padrão', () => {
    expect(createOfferingSchema.parse({ classId: 'cclass000001', disciplineId: 'cdisc0000001' }).teacherIds).toEqual([]);
  });
  it('exige turma e disciplina com mensagem pt-BR, mesmo ausentes', () => {
    expect(createOfferingSchema.safeParse({ disciplineId: 'cdisc0000001' }).error?.issues[0].message).toBe('Selecione a turma');
    expect(createOfferingSchema.safeParse({ classId: 'cclass000001', disciplineId: 'x' }).error?.issues[0].message).toBe('Selecione a disciplina');
  });
  it('updateOfferingSchema descarta classId e disciplineId', () => {
    expect(updateOfferingSchema.parse({ id: 's1', classId: 'cclass000001', disciplineId: 'cdisc0000001', teacherIds: ['t1'] }))
      .toEqual({ id: 's1', teacherIds: ['t1'] });
  });
});
```

- [ ] **Step 2: Reescrever `subject-service.test.ts` (falhando)**

```ts
import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { createSubject, updateSubject, listSubjects, getOfferingContext, type SubjectDeps } from '../subject-service';

const teacher = { id: 't1', role: Role.TEACHER };
const otherTeacher = { id: 't2', role: Role.TEACHER };
const admin = { id: 'a1', role: Role.ADMIN };
const disc = (id: string, courseId: string) => ({ id, courseId, code: id, name: id, description: null, workloadHours: 80 });
const disciplines: Record<string, ReturnType<typeof disc>> = { d1: disc('d1', 'co1'), d2: disc('d2', 'co2'), d3: disc('d3', 'co1') };
const ctxRow = {
  discipline: { name: 'Banco de Dados I', workloadHours: 80 },
  class: { course: { name: 'Análise e Desenvolvimento de Sistemas' }, academicPeriod: { name: '1º Semestre / 2026 (2026.1)' } },
};

function makeDeps() {
  const calls: { op: string; id?: string; data?: unknown; teacherIds?: string[] }[] = [];
  const offerings = [{ id: 's1', disciplineId: 'd1', classId: 'c1' }];
  const deps: SubjectDeps = {
    repo: {
      listSubjects: async (where) => { calls.push({ op: 'list', data: where }); return []; },
      findSubjectById: async (id) => offerings.find((o) => o.id === id) ?? null,
      findSubjectByDisciplineAndClass: async (d, c) => offerings.find((o) => o.disciplineId === d && o.classId === c) ?? null,
      findOfferingContext: async (id) => (id === 's1' ? ctxRow : null),
      createSubjectWithTeachers: async (data, teacherIds) => { calls.push({ op: 'create', data, teacherIds }); return { id: 'new' } as never; },
      replaceSubjectTeachers: async (id, teacherIds) => { calls.push({ op: 'update', id, teacherIds }); return { id } as never; },
    },
    classes: { findClassById: async (id) => (id === 'c1' ? ({ id: 'c1', courseId: 'co1' } as never) : null) },
    disciplines: { findDisciplineById: async (id) => disciplines[id] ?? null },
    assignments: { isTeacherAssigned: async (t, s) => t === 't1' && s === 's1' },
  };
  return { deps, calls };
}

describe('createSubject (oferta)', () => {
  it('cria a oferta só com disciplina, turma e professores', async () => {
    const { deps, calls } = makeDeps();
    await createSubject({ classId: 'c1', disciplineId: 'd3', teacherIds: ['t1'] }, deps);
    expect(calls[0]).toEqual({ op: 'create', data: { disciplineId: 'd3', classId: 'c1' }, teacherIds: ['t1'] });
  });
  it('400 para disciplina de outro curso', async () => {
    const { deps, calls } = makeDeps();
    await expect(createSubject({ classId: 'c1', disciplineId: 'd2', teacherIds: [] }, deps))
      .rejects.toMatchObject({ status: 400, message: 'A disciplina não pertence ao curso da turma.' });
    expect(calls).toHaveLength(0);
  });
  it('409 para oferta duplicada', async () => {
    const { deps } = makeDeps();
    await expect(createSubject({ classId: 'c1', disciplineId: 'd1', teacherIds: [] }, deps))
      .rejects.toMatchObject({ status: 409, message: 'Esta disciplina já é ofertada nesta turma.' });
  });
  it('404 para turma ou disciplina inexistente', async () => {
    const { deps } = makeDeps();
    await expect(createSubject({ classId: 'nope', disciplineId: 'd1', teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Turma não encontrada.' });
    await expect(createSubject({ classId: 'c1', disciplineId: 'nope', teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Disciplina não encontrada.' });
  });
});

describe('updateSubject (oferta)', () => {
  it('só sincroniza professores, ignorando turma e disciplina', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { teacherIds: ['t2'], classId: 'c9', disciplineId: 'd9' } as never, deps);
    expect(calls).toEqual([{ op: 'update', id: 's1', teacherIds: ['t2'] }]);
  });
  it('404 para oferta inexistente', async () => {
    const { deps } = makeDeps();
    await expect(updateSubject('nope', { teacherIds: [] }, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
  });
});

describe('listSubjects', () => {
  it('TEACHER recebe só as ofertas em que está alocado', async () => {
    const { deps, calls } = makeDeps();
    await listSubjects(teacher, deps);
    expect(calls[0].data).toEqual({ teacherAssignments: { some: { teacherId: 't1' } } });
  });
  it('ADMIN recebe todas', async () => {
    const { deps, calls } = makeDeps();
    await listSubjects(admin, deps);
    expect(calls[0].data).toEqual({});
  });
});

describe('getOfferingContext', () => {
  const expected = { subjectName: 'Banco de Dados I', courseName: 'Análise e Desenvolvimento de Sistemas', academicPeriod: '1º Semestre / 2026 (2026.1)', workloadHours: 80 };
  it('devolve disciplina, curso, período e carga horária para o professor alocado e para o ADMIN', async () => {
    const { deps } = makeDeps();
    expect(await getOfferingContext('s1', teacher, deps)).toEqual(expected);
    expect(await getOfferingContext('s1', admin, deps)).toEqual(expected);
  });
  it('403 para professor não alocado; 404 para oferta inexistente', async () => {
    const { deps } = makeDeps();
    await expect(getOfferingContext('s1', otherTeacher, deps)).rejects.toMatchObject({ status: 403, message: 'Você não está alocado a esta oferta.' });
    await expect(getOfferingContext('nope', teacher, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
  });
});
```

- [ ] **Step 3: Escrever `src/app/api/v1/admin/subjects/__tests__/route.test.ts` (falhando)**

Esqueleto da Task 2, mockando `@/domains/academic/services/subject-service` (`listSubjects`, `createSubject`, `updateSubject`). Casos:
- `GET` chama `requireUser` com `[Role.TEACHER, Role.ADMIN]` e `listSubjects` com o usuário devolvido por `requireUser` (`expect(mocks.listSubjects).toHaveBeenCalledWith(teacherUser)`).
- `POST` com `{ classId: 'cclass000001', disciplineId: 'cdisc0000001' }` chama `requireUser` com `[Role.ADMIN]` e `createSubject({ classId: 'cclass000001', disciplineId: 'cdisc0000001', teacherIds: [] })`; resposta `{ success: true, subject }`.
- `POST` sem `disciplineId` devolve 400 `{ success: false, error: 'Selecione a disciplina' }`.
- `PUT` com `{ id: 's1', classId: 'cclass000001', teacherIds: ['t1'] }` chama `requireUser` com `[Role.ADMIN]` e `updateSubject('s1', { teacherIds: ['t1'] })`.

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/subject-service.test.ts src/app/api/v1/admin/subjects`
Expected: FAIL.

- [ ] **Step 5: Implementar**

Serviço, ordem em `createSubject`: 404 turma → 404 disciplina → 400 se `discipline.courseId !== klass.courseId` → 409 se `findSubjectByDisciplineAndClass` devolver algo → `createSubjectWithTeachers({ disciplineId, classId }, teacherIds)`. `updateSubject`: 404 `'Oferta não encontrada.'` se `findSubjectById(id)` for `null`, depois `replaceSubjectTeachers(id, input.teacherIds)`. `listSubjects`: `where` = `{ teacherAssignments: { some: { teacherId: user.id } } }` para `Role.TEACHER`, `{}` para os demais. `getOfferingContext`: 404 se `findOfferingContext` for `null`; para `Role.TEACHER`, 403 se `isTeacherAssigned(user.id, subjectId)` for `false`; devolve `{ subjectName: discipline.name, courseName: class.course.name, academicPeriod: class.academicPeriod.name, workloadHours: discipline.workloadHours }`. Remover o comentário e a lógica de `academicYear`/`semester` copiados.
Repositório: `replaceSubjectTeachers` mantém a transação `deleteMany` + `update` com `teacherAssignments: { create }`, sem outros campos. `isTeacherAssigned` usa `findUnique({ where: { teacherId_subjectId: { teacherId, subjectId } } })`.
Rota: `GET` passa `user` a `listSubjects`; `POST` valida com `createOfferingSchema`; `PUT` valida com `updateOfferingSchema` e chama `updateSubject(id, { teacherIds })`.

- [ ] **Step 6: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/__tests__/subject-service.test.ts src/app/api/v1/admin/subjects && npx tsc --noEmit 2>&1 | grep -E "subject-(service|repository)|teacher-subject-repository|admin/subjects/route|admin.validator"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/admin.validator.ts src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/teacher-subject-repository.ts src/domains/academic/services/subject-repository.ts src/domains/academic/services/subject-service.ts src/domains/academic/services/__tests__/subject-service.test.ts src/app/api/v1/admin/subjects
git commit -m "feat(ofertas): oferta coerente com o curso da turma e lista filtrada por papel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Plano de ensino sem período e com professor alocado

**Files:**
- Modify: `src/lib/validators/teaching-plan.validator.ts`
- Modify: `src/domains/teaching/services/teaching-plan-service.ts`
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts` (`planFull`, `planBasic`; `findPlanForAssessment` fica para a Task 8)
- Modify: `src/app/api/v1/teacher/plans/route.ts`
- Test: `src/lib/validators/__tests__/teaching-plan.validator.test.ts` (novo)
- Test: `src/domains/teaching/services/__tests__/teaching-plan-service.test.ts`
- Test: `src/app/api/v1/teacher/plans/__tests__/route.test.ts` (novo)

**Interfaces:**
- Consumes: `findSubjectById` de `subject-repository.ts` e `isTeacherAssigned` de `teacher-subject-repository.ts` (Task 5).
- Produces:
  - `updateTeachingPlanSchema` sem `subjectId` e `academicPeriodId`. `createTeachingPlanSchema = updateTeachingPlanSchema.extend({ subjectId: z.string({ required_error: 'Selecione a oferta' }).min(1, 'Selecione a oferta'), syllabus: z.string({ required_error: 'Informe a ementa' }).min(1, 'Informe a ementa'), totalHours: hoursInput, theoryHours: hoursInput, practiceHours: hoursInput })`, onde `const hoursInput = z.union([z.number(), z.string()]).nullable().optional()` (as mensagens de horas continuam em `createPlan`, como diz a spec). `type CreateTeachingPlanInput = z.infer<typeof createTeachingPlanSchema>`.
  - Em `teaching-plan-service.ts`: `CreatePlanInput` sem `academicPeriodId`; `totalHours`/`theoryHours`/`practiceHours: number | string | null | undefined` (`toHours` trata `null` como ausente). `TeachingPlanDeps` ganha `offerings: { findSubjectById(id: string): Promise<{ id: string } | null> }` e `assignments: { isTeacherAssigned(teacherId: string, subjectId: string): Promise<boolean> }`.
  - Em `teaching-plan-repository.ts`: `planFull = { subject: { include: { discipline: true, class: { include: { course: true, academicPeriod: true } } } }, schedules: { include: { lessonPlans: true } }, assessments: true }`; `planBasic = { subject: { include: { discipline: true, class: { include: { course: true, academicPeriod: true } } } } }`.

- [ ] **Step 1: Escrever `src/lib/validators/__tests__/teaching-plan.validator.test.ts` (falhando)**

```ts
import { describe, it, expect } from 'vitest';
import { createTeachingPlanSchema, updateTeachingPlanSchema } from '../teaching-plan.validator';

describe('updateTeachingPlanSchema', () => {
  it('descarta subjectId e academicPeriodId', () => {
    expect(updateTeachingPlanSchema.parse({ subjectId: 's2', academicPeriodId: 'ap1', syllabus: 'x' })).toEqual({ syllabus: 'x' });
  });
  it('rejeita null em coluna obrigatória', () => {
    expect(updateTeachingPlanSchema.safeParse({ syllabus: null }).success).toBe(false);
  });
});

describe('createTeachingPlanSchema', () => {
  it('exige oferta e ementa com mensagens pt-BR', () => {
    expect(createTeachingPlanSchema.safeParse({ syllabus: 'x' }).error?.issues[0].message).toBe('Selecione a oferta');
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1', syllabus: '' }).error?.issues[0].message).toBe('Informe a ementa');
  });
  it('descarta academicPeriodId', () => {
    expect(createTeachingPlanSchema.parse({ subjectId: 's1', syllabus: 'x', academicPeriodId: 'ap1' })).not.toHaveProperty('academicPeriodId');
  });
  it('deixa horas null ou string para o serviço validar', () => {
    expect(createTeachingPlanSchema.safeParse({ subjectId: 's1', syllabus: 'x', totalHours: null, theoryHours: '60', practiceHours: 20 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Atualizar `teaching-plan-service.test.ts` (falhando)**

`makeDeps(initial, opts: { offerings?: string[]; assigned?: [string, string][] } = {})` acrescenta `offerings: { findSubjectById: async (id) => ((opts.offerings ?? ['s1']).includes(id) ? { id } : null) }` e `assignments: { isTeacherAssigned: async (t, s) => (opts.assigned ?? [['t1', 's1']]).some(([a, b]) => a === t && b === s) }`. Remover o import de `updateTeachingPlanSchema`, o caso `'update schema rejects null for non-nullable columns'` (coberto no Step 1) e trocar `'partial update leaves unspecified fields untouched and null clears academicPeriodId'` por um caso sem `academicPeriodId` (fixture sem `academicPeriodId`; espera `{ syllabus: 'new', methodology: 'm', subjectId: 's1' }`). Acrescentar:

```ts
const valid = { subjectId: 's1', syllabus: 'x', totalHours: 80, theoryHours: 60, practiceHours: 20 };

it('createPlan rejeita professor não alocado com 403', async () => {
  const { deps, plans } = makeDeps();
  await expect(createPlan(otherTeacher, valid, deps)).rejects.toMatchObject({ status: 403, message: 'Você não está alocado a esta oferta.' });
  expect(plans).toHaveLength(0);
});
it('createPlan rejeita oferta inexistente com 404', async () => {
  const { deps } = makeDeps();
  await expect(createPlan(teacher, { ...valid, subjectId: 'nope' }, deps)).rejects.toMatchObject({ status: 404, message: 'Oferta não encontrada.' });
});
it('ADMIN cria plano sem alocação', async () => {
  const { deps, plans } = makeDeps();
  await createPlan(admin, valid, deps);
  expect(plans[0]).toMatchObject({ teacherId: 'a1', subjectId: 's1' });
});
it('insertPlan nunca recebe academicPeriodId', async () => {
  const { deps, plans } = makeDeps();
  await createPlan(teacher, { ...valid, academicPeriodId: 'ap1' } as never, deps);
  expect(plans[0]).not.toHaveProperty('academicPeriodId');
});
it('createPlan responde em pt-BR quando a UI envia horas null', async () => {
  const { deps } = makeDeps();
  await expect(createPlan(teacher, { ...valid, totalHours: null, theoryHours: null, practiceHours: null }, deps))
    .rejects.toMatchObject({ status: 400, message: 'Informe a carga horária total (maior que zero), teórica e prática.' });
});
```

- [ ] **Step 3: Escrever `src/app/api/v1/teacher/plans/__tests__/route.test.ts` (falhando)**

Mocks `requireUser`, `createPlan`, `listPlansForTeacher` (módulo `@/domains/teaching/services/teaching-plan-service`). Casos:
- `POST` sem `subjectId` devolve 400 `{ success: false, error: 'Selecione a oferta' }` e não chama `createPlan`.
- `POST` com `{ subjectId: 's1', syllabus: 'x', academicPeriodId: 'ap1', totalHours: 80, theoryHours: 60, practiceHours: 20 }` chama `requireUser` com `[Role.TEACHER, Role.ADMIN]` e `createPlan(teacherUser, …)` com segundo argumento sem `academicPeriodId` (`expect(mocks.createPlan.mock.calls[0][1]).not.toHaveProperty('academicPeriodId')`); resposta `{ success: true, plan }`.

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/teaching-plan.validator.test.ts src/domains/teaching/services/__tests__/teaching-plan-service.test.ts src/app/api/v1/teacher/plans/__tests__`
Expected: FAIL.

- [ ] **Step 5: Implementar**

`createPlan`, ordem: 400 `'Disciplina e ementa são obrigatórias.'` (mensagem atual) se faltar `subjectId`/`syllabus` → 404 `'Oferta não encontrada.'` se `offerings.findSubjectById` for `null` → 403 para `Role.TEACHER` sem `isTeacherAssigned(user.id, subjectId)` → 400 de horas (regra atual) → `insertPlan` sem `academicPeriodId`. `defaultDeps = { repo: realRepo, offerings: subjectRepo, assignments: teacherSubjectRepo }`. Rota POST: `createTeachingPlanSchema.safeParse(body)`; 400 no padrão das rotas admin; `createPlan(user, parsed.data)`. `src/app/api/v1/teacher/plans/[id]/route.ts` não muda (o schema já descarta as chaves).

- [ ] **Step 6: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/lib/validators/__tests__/teaching-plan.validator.test.ts src/domains/teaching/services/__tests__/teaching-plan-service.test.ts src/app/api/v1/teacher/plans/__tests__ && npx tsc --noEmit 2>&1 | grep -E "teaching-plan-service|teaching-plan.validator|teacher/plans/route|teacher/plans/\[id\]"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validators/teaching-plan.validator.ts src/lib/validators/__tests__/teaching-plan.validator.test.ts src/domains/teaching/services/teaching-plan-service.ts src/domains/teaching/services/teaching-plan-repository.ts src/domains/teaching/services/__tests__/teaching-plan-service.test.ts src/app/api/v1/teacher/plans/route.ts src/app/api/v1/teacher/plans/__tests__
git commit -m "feat(planos): período derivado da oferta e plano exige professor alocado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Geração por IA com contexto lido do servidor

**Files:**
- Modify: `src/domains/agents/prompts/teaching-plan-prompt.ts`
- Modify: `src/domains/teaching/services/plan-generation-service.ts`
- Modify: `src/app/api/v1/teacher/plans/generate/route.ts`
- Test: `src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts`
- Test: `src/domains/teaching/services/__tests__/plan-generation-service.test.ts`
- Test: `src/app/api/v1/teacher/plans/generate/__tests__/route.test.ts` (novo)

**Interfaces:**
- Consumes: `getOfferingContext(subjectId, user): Promise<OfferingContext>` (Task 5).
- Produces: `TeachingPlanPromptInput` e `GeneratePlanInput` ganham `workloadHours?: number`; `generatePlanSchema = z.object({ subjectId: z.string({ required_error: 'Selecione a oferta para gerar.' }).min(1, 'Selecione a oferta para gerar.'), selectedReferences: <como hoje> })`.

- [ ] **Step 1: Escrever os testes de prompt e serviço (falhando)**

Em `teaching-plan-prompt.test.ts`:

```ts
it('buildTeachingPlanMessages inclui a carga horária quando informada', () => {
  const [, user] = buildTeachingPlanMessages({ subjectName: 'Banco de Dados', workloadHours: 80, references: [], chunks: [] });
  expect(user.content).toContain('Carga horária: 80h');
});
```

e acrescentar `expect(user.content).not.toContain('Carga horária')` ao caso `'omite curso e período quando não informados'`.

Em `plan-generation-service.test.ts`:

```ts
it('repassa a carga horária da matriz ao prompt', async () => {
  const { deps } = makeDeps();
  const streamChat = vi.spyOn(deps, 'streamChat');
  await generatePlanSuggestion({ ...input, workloadHours: 80 }, deps);
  expect(streamChat.mock.calls[0][0][1].content).toContain('Carga horária: 80h');
});
```

- [ ] **Step 2: Escrever `src/app/api/v1/teacher/plans/generate/__tests__/route.test.ts` (falhando)**

Mocks `requireUser`, `getOfferingContext` (`vi.mock('@/domains/academic/services/subject-service', () => ({ getOfferingContext: mocks.getOfferingContext }))`) e `generatePlanSuggestion` (`vi.mock('@/domains/teaching/services/plan-generation-service', …)`). Casos:

```ts
const ctx = { subjectName: 'Banco de Dados I', courseName: 'Análise e Desenvolvimento de Sistemas', academicPeriod: '1º Semestre / 2026 (2026.1)', workloadHours: 80 };
const refs = [{ id: 'm1', title: 'Sistemas de Banco de Dados', author: 'Elmasri' }];

it('exige subjectId', async () => {
  const res = await POST(req({ selectedReferences: refs }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ success: false, error: 'Selecione a oferta para gerar.' });
  expect(mocks.getOfferingContext).not.toHaveBeenCalled();
});
it('lê o contexto da oferta no servidor e repassa ao serviço', async () => {
  mocks.getOfferingContext.mockResolvedValue(ctx);
  mocks.generatePlanSuggestion.mockResolvedValue({ syllabus: 's' });
  const res = await POST(req({ subjectId: 's1', subjectName: 'ignorado', courseName: 'ignorado', selectedReferences: refs }));
  expect(await res.json()).toEqual({ success: true, data: { syllabus: 's' } });
  expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.TEACHER, Role.ADMIN]);
  expect(mocks.getOfferingContext).toHaveBeenCalledWith('s1', teacherUser);
  expect(mocks.generatePlanSuggestion).toHaveBeenCalledWith({ ...ctx, references: refs });
});
it('propaga 403 de professor não alocado', async () => {
  mocks.getOfferingContext.mockRejectedValue(new DomainError(403, 'Você não está alocado a esta oferta.'));
  const res = await POST(req({ subjectId: 's1', selectedReferences: [] }));
  expect(res.status).toBe(403);
  expect(mocks.generatePlanSuggestion).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts src/domains/teaching/services/__tests__/plan-generation-service.test.ts src/app/api/v1/teacher/plans/generate`
Expected: FAIL.

- [ ] **Step 4: Implementar**

Prompt: depois da linha de período, `if (input.workloadHours) lines.push(\`Carga horária: ${input.workloadHours}h\`)`. Serviço: repassar `workloadHours: input.workloadHours` a `buildTeachingPlanMessages`. Rota: `user = await requireUser(…)`; `safeParse` com 400 no padrão das rotas admin (troca o `.parse` atual); `context = await getOfferingContext(body.subjectId, user)`; `generatePlanSuggestion({ ...context, references: body.selectedReferences })`.

- [ ] **Step 5: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts src/domains/teaching/services/__tests__/plan-generation-service.test.ts src/app/api/v1/teacher/plans/generate && npx tsc --noEmit 2>&1 | grep -E "teaching-plan-prompt|plan-generation-service|plans/generate"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/domains/agents/prompts/teaching-plan-prompt.ts src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts src/domains/teaching/services/plan-generation-service.ts src/domains/teaching/services/__tests__/plan-generation-service.test.ts src/app/api/v1/teacher/plans/generate
git commit -m "feat(planos): geração por IA lê disciplina, curso, período e carga horária da oferta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Aulas, cronogramas, avaliações, agendas e atas leem `discipline.name`

**Files:**
- Modify: `src/domains/teaching/services/lesson-plan-repository.ts`
- Modify: `src/domains/teaching/services/lesson-service.ts`
- Modify: `src/domains/teaching/services/course-schedule-repository.ts`
- Modify: `src/domains/teaching/services/assessment-repository.ts`
- Modify: `src/domains/teaching/services/teaching-plan-repository.ts` (`findPlanForAssessment`)
- Modify: `src/domains/assessments/services/assessment-service.ts`
- Modify: `src/domains/agendas/services/agenda-repository.ts`
- Modify: `src/domains/agendas/services/agenda-service.ts` (só tipos)
- Modify: `src/domains/pedagogy/services/minute-repository.ts`
- Modify: `src/domains/pedagogy/services/minutes-service.ts`
- Test: `src/domains/teaching/services/__tests__/lesson-service.test.ts`
- Test: `src/domains/assessments/services/__tests__/assessment-service.test.ts`
- Test: `src/domains/pedagogy/services/__tests__/minutes-service.test.ts`

**Interfaces:**
- Consumes: schema da Task 1.
- Produces:
  - `LessonWithContext.courseSchedule.teachingPlan.subject: { id: string; classId: string; discipline: { name: string } }`; `lessonContextInclude` seleciona `subject: { select: { id: true, classId: true, discipline: { select: { name: true } } } }`.
  - `listLessonsBySchedule`, `listSchedulesByPlan`, `createSchedule`, `listAssessmentsByPlan`: `teachingPlan: { include: { subject: { include: { discipline: true } } } }` (a UI passa a ler `subject.discipline.name`/`.code`).
  - `findPlanForAssessment` seleciona `subject: { select: { discipline: { select: { name: true } } } }`; `PlanForAssessment.subject: { discipline: { name: string } }`.
  - `agenda-repository.findSubject(subjectId): Promise<{ name: string; classId: string } | null>` (seleciona `classId` e `discipline.name` e devolve `{ name: row.discipline.name, classId: row.classId }`); `AgendaDeps.repo.findSubject` e `assertAgendaReferences(input, subjectClassId: string, deps)` com `classId: string`.
  - `minuteInclude.agenda.select.subjectRef = { select: { discipline: { select: { name: true } } } }`; `toDTO` usa `r.agenda.subjectRef?.discipline.name ?? r.agenda.subject`.

- [ ] **Step 1: Atualizar fixtures e asserções (falhando)**

- `lesson-service.test.ts`: `baseLesson(teacherId: string)` passa a montar `subject: { id: 'sub1', classId: 'c1', discipline: { name: 'BD' } }`; o parâmetro e a opção `classId` de `makeDeps` saem; apagar `it('skips the sync when the subject has no class')`. O caso `'creates one agenda, then the second call updates the same one'` segue esperando `subject: 'BD'`.
- `assessment-service.test.ts`: fixture `subject: { discipline: { name: 'Banco de Dados' } }` e novo caso:

```ts
it('busca trechos pelo nome da disciplina da matriz', async () => {
  const { deps } = makeDeps('isto não é json');
  const search = vi.spyOn(deps, 'search');
  await generateQuestions(teacher, input, deps);
  expect(search).toHaveBeenCalledWith(expect.objectContaining({ subjectName: 'Banco de Dados' }));
});
```

- `minutes-service.test.ts`: as três fixtures `subjectRef: { name: 'Banco de Dados' }` viram `subjectRef: { discipline: { name: 'Banco de Dados' } }`; a asserção `expect(minute.subjectName).toBe('Banco de Dados')` fica.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/domains/teaching/services/__tests__/lesson-service.test.ts src/domains/assessments/services/__tests__/assessment-service.test.ts src/domains/pedagogy/services/__tests__/minutes-service.test.ts`
Expected: FAIL (agenda com `subject: undefined`; busca com `subjectName: undefined`; `subjectName` da ata cai em `'BD'`).

- [ ] **Step 3: Implementar**

`syncAgendaForLesson` remove o ramo "sem turma" e o `console.warn` (turma agora é obrigatória) e usa `subject: subject.discipline.name`. `assessment-service.ts` troca `plan.subject.name` por `plan.subject.discipline.name` nas linhas de `search` e de `bookTitle`. `agenda-service.ts` só ajusta tipos; `agenda-service.test.ts` não muda (o mock de `findSubject` já devolve `{ name, classId }`).

- [ ] **Step 4: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/domains/teaching src/domains/assessments src/domains/agendas src/domains/pedagogy && npx tsc --noEmit 2>&1 | grep -E "src/domains/(teaching|assessments|agendas|pedagogy)/"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/teaching/services/lesson-plan-repository.ts src/domains/teaching/services/lesson-service.ts src/domains/teaching/services/course-schedule-repository.ts src/domains/teaching/services/assessment-repository.ts src/domains/teaching/services/teaching-plan-repository.ts src/domains/assessments/services/assessment-service.ts src/domains/agendas/services/agenda-repository.ts src/domains/agendas/services/agenda-service.ts src/domains/pedagogy/services/minute-repository.ts src/domains/pedagogy/services/minutes-service.ts src/domains/teaching/services/__tests__/lesson-service.test.ts src/domains/assessments/services/__tests__/assessment-service.test.ts src/domains/pedagogy/services/__tests__/minutes-service.test.ts
git commit -m "refactor(dominio): aulas, avaliações, agendas e atas leem o nome da disciplina da matriz

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `/auth/me` com contexto da turma e constantes de rota

**Files:**
- Modify: `src/lib/auth/types.ts`
- Modify: `src/domains/academic/services/class-repository.ts` (nova `findClassContext`)
- Modify: `src/app/api/v1/auth/me/route.ts`
- Modify: `src/components/layout/use-current-user.ts`
- Modify: `src/lib/constants/routes.ts`
- Test: `src/app/api/v1/auth/me/__tests__/route.test.ts` (novo)

**Interfaces:**
- Consumes: `getSessionUser(token): Promise<AuthenticatedUser | null>` de `@/lib/auth/session`; `AUTH_COOKIE_NAME` de `@/lib/auth/rbac`.
- Produces:
  - Em `src/lib/auth/types.ts`: `type ClassContext = { id: string; name: string; code: string; semester: number; course: { name: string; code: string }; academicPeriod: { name: string; code: string } }`; `type CurrentUser = AuthenticatedUser & { class?: ClassContext | null }`. `AuthenticatedUser` e o JWT não mudam.
  - Em `class-repository.ts`: `findClassContext(classId: string): Promise<ClassContext | null>`.
  - `/api/v1/auth/me` responde `{ user: { ...user, class: ClassContext | null } }`.
  - `useCurrentUser(initialUser?: CurrentUser | null, enabled?: boolean): { user: CurrentUser | null; isLoading: boolean }`.
  - `ROUTES.ADMIN_COURSES = '/admin/courses'`, `ROUTES.ADMIN_DISCIPLINES = '/admin/disciplines'`, `API_ROUTES.ADMIN_COURSES = '/api/v1/admin/courses'`, `API_ROUTES.ADMIN_DISCIPLINES = '/api/v1/admin/disciplines'`.

- [ ] **Step 1: Escrever `src/app/api/v1/auth/me/__tests__/route.test.ts` (falhando)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import { AUTH_COOKIE_NAME } from '@/lib/auth/rbac';

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn(), findClassContext: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock('@/domains/academic/services/class-repository', () => ({ findClassContext: mocks.findClassContext }));

import { GET } from '../route';

const base = { name: 'Ana', email: 'ana@x', enrollment: null, avatarUrl: null, sessionId: 'se1' };
const ctx = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' }, academicPeriod: { name: '1º Semestre / 2026 (2026.1)', code: '2026.1' } };
const withCookie = () => new NextRequest('http://x/api/v1/auth/me', { headers: { cookie: `${AUTH_COOKIE_NAME}=tok` } });

describe('/api/v1/auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aluno com turma recebe o contexto da turma', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...base, id: 's1', role: Role.STUDENT, classId: 'c1' });
    mocks.findClassContext.mockResolvedValue(ctx);
    const body = await (await GET(withCookie())).json();
    expect(body.user).toMatchObject({ id: 's1', class: ctx });
    expect(mocks.findClassContext).toHaveBeenCalledWith('c1');
  });
  it('usuário sem turma recebe class null sem consultar o banco', async () => {
    mocks.getSessionUser.mockResolvedValue({ ...base, id: 't1', role: Role.TEACHER, classId: null });
    const body = await (await GET(withCookie())).json();
    expect(body.user.class).toBeNull();
    expect(mocks.findClassContext).not.toHaveBeenCalled();
  });
  it('sem cookie responde 401', async () => {
    expect((await GET(new NextRequest('http://x/api/v1/auth/me'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/v1/auth/me`
Expected: FAIL (`body.user.class` indefinido).

- [ ] **Step 3: Implementar**

`findClassContext` usa `db.class.findUnique({ where: { id: classId }, select: { id, name, code, semester, course: { select: { name, code } }, academicPeriod: { select: { name, code } } } })`. A rota acrescenta `class: user.classId ? await findClassContext(user.classId) : null` ao objeto `user` da resposta. `use-current-user.ts` troca `AuthenticatedUser` por `CurrentUser`. Constantes em `routes.ts` ao lado de `ADMIN_SUBJECTS`/`ADMIN_CLASSES`. `nav-links.ts` não muda nesta fase (menu é da fase 2).

- [ ] **Step 4: Rodar e confirmar que passa; gate de tipo**

Run: `npx vitest run src/app/api/v1/auth/me src/components/layout && npx tsc --noEmit 2>&1 | grep -E "auth/me|lib/auth/types|use-current-user|constants/routes|class-repository"`
Expected: PASS; `grep` sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/types.ts src/domains/academic/services/class-repository.ts src/app/api/v1/auth/me src/components/layout/use-current-user.ts src/lib/constants/routes.ts
git commit -m "feat(auth): /auth/me devolve curso e período da turma do usuário

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Ajustes mínimos na UI e typecheck verde

**Files:**
- Modify: `src/app/teacher/lessons/_components/LessonsPage.tsx`
- Modify: `src/app/teacher/schedules/_components/SchedulesPage.tsx`
- Modify: `src/app/teacher/assessments/_components/AssessmentsPage.tsx`
- Modify: `src/components/assessments/use-assessments.ts`
- Modify: `src/app/teacher/plans/page.tsx`
- Modify: `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx` (só bodies de fetch)
- Modify: qualquer outro arquivo que `npx tsc --noEmit` ainda apontar

**Interfaces:**
- Consumes: formatos de resposta das Tasks 5, 6 e 8.
- Produces: `PlanOption.subject: { id: string; classId: string; discipline: { name: string; code: string }; class?: { id: string; name: string } | null }` em `use-assessments.ts`.

- [ ] **Step 1: Listar os erros de tipo restantes**

Run: `npx tsc --noEmit 2>&1 | grep -E "error TS" | cut -d'(' -f1 | sort -u`
Expected: só arquivos de UI (`src/app/**`, `src/components/**`) ou nenhum. Erro fora da UI volta para a task dona do arquivo.

- [ ] **Step 2: Trocar leituras de campo e bodies**

- Lessons, Schedules, Assessments: `{p.subject.name} ({p.subject.code})` → `{p.subject.discipline.name} ({p.subject.discipline.code})`.
- `use-assessments.ts`: tipo `PlanOption.subject` acima.
- `teacher/plans/page.tsx`: tipo local `subject` com `discipline: { name: string; code: string }` e `class: { name: string; course: { name: string } }` no lugar de `name`/`code`/`courseName`/`academicYear`; busca e células leem `subject.discipline.name`, `subject.discipline.code`, `subject.class.course.name`. Sem agrupamento por período (fase 3).
- `TeachingPlanNewPage.tsx`: `handleGenerateAI` envia `{ subjectId: selectedSubjectId, selectedReferences }`; `handleSavePlan` envia `subjectId` só no POST e nunca `academicPeriodId`. O seletor de período, `types.ts` (`SubjectOption` → `OfferingOption`) e `PlanHeaderControls` ficam para a fase 3.
- Admin (`classes/page.tsx`, `SubjectFormModal`, `subjects/page.tsx`), `TeacherReportsPage` e `DashboardPage` ficam para as fases 2 e 3: usam tipos locais e compilam; ficam incoerentes em runtime, como a spec aceita.

- [ ] **Step 3: Rodar o typecheck completo**

Run: `npm run typecheck`
Expected: termina com código 0, sem `error TS`.

- [ ] **Step 4: Rodar a suíte**

Run: `npm test`
Expected: PASS (inclui `ClassFormModal.test.tsx`, `SubjectFormModal.test.tsx` e `nav-links.test.ts` sem alteração, pois mockam `fetch` e o menu não mudou).

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/lessons/_components/LessonsPage.tsx src/app/teacher/schedules/_components/SchedulesPage.tsx src/app/teacher/assessments/_components/AssessmentsPage.tsx src/components/assessments/use-assessments.ts src/app/teacher/plans/page.tsx src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx
git commit -m "fix(ui): telas do professor leem a disciplina da oferta e não enviam período

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Acrescentar ao `git add` os arquivos extras que o Step 1 apontar.)

---

### Task 11: Gate final da fase 1

**Files:** nenhum (só verificação; correções voltam para a task dona do arquivo).

- [ ] **Step 1: Banco do zero com seed**

Run: `npx prisma migrate reset --force`
Expected: todas as migrações aplicadas e `Seed concluído`.

- [ ] **Step 2: Idempotência do seed**

Run: `npm run db:seed`
Expected: `Seed concluído`, mesmas contagens.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: código 0.

- [ ] **Step 4: Suíte completa**

Run: `npm test`
Expected: PASS. Se só o teste de fallback CLASSROOM de `src/app/api/v1/agent/chat/__tests__/route.test.ts` falhar, rodar `npx vitest run src/app/api/v1/agent/chat` até passar.

- [ ] **Step 5: Nenhum resto de campo removido no domínio e na API**

Run: `grep -rnE "academicPeriodId|courseName|academicYear|subject\.name|subjectRef\?\.name" src/domains src/app/api src/lib | grep -v __tests__`
Expected: só `courseName` em `plan-generation-service.ts`, `teaching-plan-prompt.ts` e `subject-service.ts` (`OfferingContext`), que são texto derivado e não coluna.

- [ ] **Step 6: Árvore limpa**

Run: `git status --short`
Expected: só `package.json`, `package-lock.json` e `.mcp.json` pendentes (de outro trabalho).

---

## Testes existentes que quebram e onde são atualizados

| Teste | Motivo | Task |
|---|---|---|
| `src/lib/validators/__tests__/admin.validator.test.ts` — blocos `createClassSchema` e `createClassSchema (mensagens do ano)` | `year` sai; `semester` 1–12; `courseId`/`academicPeriodId` obrigatórios | 4 |
| `src/lib/validators/__tests__/admin.validator.test.ts` — blocos `upsertSubjectSchema` e `updateSubjectSchema` e o import | schemas removidos | 5 |
| `src/domains/academic/services/__tests__/class-service.test.ts` | fixtures sem `year`; novos deps `courses`, `periods`, `countOfferings` | 4 |
| `src/app/api/v1/admin/classes/__tests__/route.test.ts` | payload com `courseId`/`academicPeriodId`, sem `year` | 4 |
| `src/domains/academic/services/__tests__/subject-service.test.ts` | oferta substitui disciplina com nome/código/turma opcional | 5 |
| `src/domains/teaching/services/__tests__/teaching-plan-service.test.ts` — `makeDeps`, `'partial update … null clears academicPeriodId'`, `'update schema rejects null …'` | deps `offerings`/`assignments`; `academicPeriodId` sai; validação movida para `teaching-plan.validator.test.ts` | 6 |
| `src/domains/agents/prompts/__tests__/teaching-plan-prompt.test.ts` | caso novo de carga horária (nada quebra) | 7 |
| `src/domains/teaching/services/__tests__/plan-generation-service.test.ts` | caso novo de carga horária (nada quebra) | 7 |
| `src/domains/teaching/services/__tests__/lesson-service.test.ts` — `baseLesson`, `makeDeps`, `'skips the sync when the subject has no class'` | `subject.discipline.name`; turma obrigatória | 8 |
| `src/domains/assessments/services/__tests__/assessment-service.test.ts` | fixture `subject.discipline.name` | 8 |
| `src/domains/pedagogy/services/__tests__/minutes-service.test.ts` | fixture `subjectRef.discipline.name` | 8 |
| `src/domains/agendas/services/__tests__/agenda-service.test.ts` | não quebra: o repositório achata `discipline.name` em `name` | — |
| `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx`, `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx`, `src/components/layout/__tests__/nav-links.test.ts` | não quebram na fase 1 (mockam `fetch`; menu inalterado); atualizados na fase 2 | fase 2 |
