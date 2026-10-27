# Matrícula de alunos — spec e plano de implementação (2026-10-27)

## Objetivo
Permitir que o ADMIN cadastre alunos e os vincule a uma turma pela interface, para que as aulas publicadas das ofertas da turma apareçam na agenda do aluno. Hoje só o seed grava `User.classId`.

## Decisões
- Escopo v1: cadastro individual (nome, e-mail, matrícula, senha inicial), matricular aluno existente (move de outra turma) e remover da turma. Sem importação CSV.
- Permissão: só ADMIN. `/api/v1/admin/students` herda ADMIN-only de `API_ROUTES.ADMIN` no RBAC; nada a mudar em `rbac.ts`.
- Modelo: uma turma por aluno, campo `User.classId` já existente. Sem migração Prisma.
- Navegação: a lista de alunos vive dentro de Turmas (`/admin/classes/[id]/students`). Sem item novo no menu.
- Mover o aluno vale na próxima requisição: o JWT não guarda `classId` e `getSessionUser` lê o perfil do banco.

## Contrato da API (`/api/v1/admin/students`)
- `GET ?classId=<cuid>` → `{ success: true, students: Student[] }` com os alunos da turma, ordenados por nome. 404 se a turma não existe.
- `GET` sem `classId` → `{ success: true, students: StudentWithClass[] }` com todos os usuários STUDENT, cada um com `class: { id, name, code } | null`, ordenados por nome. Usado pelo seletor de "matricular aluno existente".
- `POST` body `{ name, email, enrollment, password, classId }` → `{ success: true, student }`. Cria usuário com `role: STUDENT`, senha com `hashPassword`, já vinculado à turma. 400 validação, 404 turma inexistente, 409 e-mail ou matrícula já usados.
- `PUT` body `{ id, classId: string | null }` → `{ success: true, student }`. `classId` string matricula (ou move) o aluno; `null` remove da turma. 404 aluno (ou não é STUDENT) ou turma inexistente.
- `Student = { id, name, email, enrollment, classId, createdAt }`. Nunca expor `passwordHash`.
- Erros seguem `apiError` (`DomainError` → status/mensagem; validação → 400 com `error` = primeira mensagem do Zod e `details`).

## Validadores (`src/lib/validators/admin.validator.ts`)
- `createStudentSchema`: `name` trim min 3 'Informe o nome completo'; `email` trim email 'E-mail inválido' toLowerCase; `enrollment` trim min 3 'Informe a matrícula'; `password` min 8 'A senha deve ter no mínimo 8 caracteres'; `classId` cuid 'Selecione a turma'.
- `enrollStudentSchema`: `id` min 1 'ID é obrigatório'; `classId` cuid 'Selecione a turma' nullable.
- Tipos `CreateStudentInput`, `EnrollStudentInput`.

## Domínio (`src/domains/academic/services/`)
- `student-repository.ts`: `studentSelect` (id, name, email, enrollment, classId, createdAt); `listStudentsByClass(classId)`; `listStudents()` (role STUDENT, include `class { id, name, code }`); `findStudentById(id)` (select + role); `findUserByEmailOrEnrollment(email, enrollment)` (reutilizar o de `src/domains/auth/services/user-repository.ts` se couber, senão local); `createStudent({ name, email, enrollment, passwordHash, classId })` com `role: STUDENT`; `setStudentClass(id, classId | null)`.
- `student-service.ts` no padrão `Deps = { repo, classes }` + `defaultDeps`:
  - `listStudentsByClass(classId)`: 404 'Turma não encontrada.' se não existe.
  - `listStudents()`.
  - `createStudent(input)`: 404 turma; 409 'Já existe um usuário com este e-mail.' ou 'Já existe um usuário com esta matrícula.'; hash; cria.
  - `setStudentClass(id, classId)`: 404 'Aluno não encontrado.' (inexistente ou role ≠ STUDENT); se `classId` não nulo, 404 turma; grava.

## API (`src/app/api/v1/admin/students/route.ts`)
- GET/POST/PUT com `requireUser(req, [Role.ADMIN])`, `safeParse`, `apiError`, no mesmo formato de `admin/classes/route.ts`.
- `API_ROUTES.ADMIN_STUDENTS = '/api/v1/admin/students'` em `src/lib/constants/routes.ts`.

## UI
- `src/lib/constants/routes.ts`: helper `adminClassStudentsPath(classId)` → `/admin/classes/${classId}/students`.
- `src/app/admin/classes/page.tsx`: na coluna Ações, link "Alunos" para a página da turma (além de "Editar").
- `src/app/admin/classes/[id]/students/page.tsx` ('use client', mesmo layout das páginas admin): cabeçalho com nome e código da turma (busca `API_ROUTES.ADMIN_CLASSES` e acha pelo id), link "← Turmas"; botões "+ Novo aluno" e "Matricular aluno existente"; busca por nome/e-mail/matrícula; tabela Nome, E-mail, Matrícula, Ações ("Remover da turma", com `window.confirm`); estados erro (role="alert" + "Tentar novamente"), carregando, vazio ('Nenhum aluno matriculado.').
- `_components/StudentFormModal.tsx`: AdaptiveModal com Nome completo, E-mail, Matrícula, Senha inicial (minLength 8), POST em `API_ROUTES.ADMIN_STUDENTS` com `classId`; erro em `<p role="alert">` (não usar `alert()`).
- `_components/EnrollStudentModal.tsx`: AdaptiveModal com `AdvancedCombobox` dos alunos que não estão nesta turma (title `"Nome · matrícula · turma atual ou Sem turma"`), aviso quando o aluno já tem outra turma ("Será movido de X"), PUT `{ id, classId }`.
- Sem `window.alert`. Mensagens em pt-BR.

## Testes
- `src/lib/validators/__tests__/admin.validator.test.ts`: blocos `createStudentSchema` e `enrollStudentSchema`.
- `src/domains/academic/services/__tests__/student-service.test.ts`: padrão `makeDeps()` com arrays em memória; casos 404/409, hash chamado, mover e remover.
- `src/app/api/v1/admin/students/__tests__/route.test.ts`: padrão `vi.hoisted` + `vi.mock` de `request-user` e do serviço; GET com/sem classId, POST válido/inválido, PUT, e `requireUser` chamado com `[Role.ADMIN]`.
- `src/lib/auth/__tests__/rbac.test.ts`: linhas para `/api/v1/admin/students` (ADMIN sim; TEACHER/STUDENT não) e `/admin/classes/abc/students`.
- `src/app/admin/classes/[id]/students/__tests__/page.test.tsx` e `_components/__tests__/{StudentFormModal,EnrollStudentModal}.test.tsx`: padrão `vi.stubGlobal('fetch')` e mock do AdaptiveModal/AdvancedCombobox como em `app/admin/subjects/__tests__/page.test.tsx`.
- `src/app/admin/classes/__tests__/page.test.tsx`: link "Alunos" presente.

## Verificação
- `npx tsc --noEmit` e `npx vitest run` limpos.
- Smoke manual contra o dev server: login como ADMIN, POST aluno novo na TURMA A, GET por classId lista o aluno, PUT `classId: null` remove, PUT com classId matricula de novo.

## Fora de escopo
- Importação em lote, edição de dados do aluno, troca de senha, exclusão de usuário, múltiplas turmas por aluno, permissão para professores.
