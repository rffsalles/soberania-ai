# Turmas no admin e formulário de disciplina — Design

Data: 2026-10-23
Status: aprovado em conversa, aguardando revisão da spec

## Problema

Em `/admin/subjects`, o modal "Nova Disciplina & Vínculos" tem três problemas:

1. O campo Turma é um `<select>` nativo que só lista turmas provisionadas por seed. Não há como criar uma turma pelo admin: a API `/api/v1/admin/classes` só tem GET e o serviço diz "sem CRUD no admin nesta versão".
2. Não existe página de Turmas no menu do admin. O menu tem apenas Disciplinas e Telemetria.
3. O campo "Curso / Ano" é um texto livre (`courseName`) que pede duas coisas ao mesmo tempo. A disciplina tem outros três campos que o formulário esconde: `academicLevel` (aparece na tabela, mas não é editável), `academicYear` (sempre o ano atual na criação) e `semester` (nunca preenchido). A turma selecionada já carrega ano e semestre.

## Objetivo

O admin monta a estrutura acadêmica (turmas e disciplinas) sem depender de seed, com um formulário em que cada campo tem um único significado.

Critérios de sucesso:

- Criar uma turma sem sair do modal de disciplina, e a nova turma fica selecionada.
- Ver e editar turmas por uma entrada "Turmas" no menu do admin.
- Nenhum campo do formulário de disciplina pede duas informações ao mesmo tempo. Ano letivo e semestre da disciplina vêm da turma.

## Decisões tomadas

- **Curso / Ano**: separar e derivar. "Curso" vira texto simples. "Nível acadêmico" vira select visível. Ano letivo e semestre da disciplina são derivados da turma selecionada; sem turma, vale o ano atual e semestre nulo. `courseName` continua existindo como texto porque alimenta o prompt de geração de plano de ensino e a lista de planos do professor.
- **Página Turmas**: lista com cadastro e edição, sem exclusão (a turma é referenciada por alunos, agendas e disciplinas). O mesmo modal de turma serve na página e no combobox da disciplina.
- **Campos da turma**: Nome, Código, Ano letivo (padrão ano atual) e Semestre (1 a 4, padrão 1). Sem migração: `semester` continua obrigatório no esquema; escola anual usa 1.
- **Estrutura**: Turmas como domínio próprio, no padrão já existente de disciplinas (página em `src/app/admin/classes`, modal em `_components`, serviço e repositório em `src/domains/academic/services`).

## Fora de escopo

- Exclusão de turma.
- Semestre opcional (migração).
- Modelo de Curso como entidade.
- Mudanças nos modais de agenda ou cronograma que leem a turma.
- Os arquivos `package.json`, `package-lock.json` e `.mcp.json` que estão sem commit (dependência `shadcn`) não fazem parte deste trabalho.

## Arquitetura

### 1. Dados e API de turmas

**`src/lib/validators/admin.validator.ts`**

```ts
export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da turma'),
  code: z.string().trim().min(2, 'Informe o código da turma'),
  year: z.coerce.number().int().min(2020).max(2050).default(() => new Date().getFullYear()),
  semester: z.coerce.number().int().min(1).max(4).default(1),
});
export const updateClassSchema = createClassSchema.extend({
  id: z.string().min(1, 'ID é obrigatório'),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;
```

**`src/domains/academic/services/class-repository.ts`**

- `listClasses` passa a selecionar também `_count: { select: { students: true, subjects: true } }`.
- Novas funções: `findClassByCode(code)`, `createClass(data)`, `updateClass(id, data)`. Todas usam o mesmo `select` público (id, name, code, semester, year).

**`src/domains/academic/services/class-service.ts`**

- `ClassDeps.repo` passa a exigir `listClasses`, `findClassById`, `findClassByCode`, `createClass`, `updateClass`.
- `createClass(input, deps)`: se `findClassByCode(input.code)` existir, lança `DomainError(409, 'Já existe uma turma com este código.')`; senão cria.
- `updateClass(id, input, deps)`: se `findClassByCode(input.code)` existir com `id` diferente, lança o mesmo 409; se `findClassById(id)` não existir, lança `DomainError(404, 'Turma não encontrada.')`; senão atualiza.
- O comentário "provisionadas por seed/banco (sem CRUD no admin nesta versão)" é removido.

**`src/app/api/v1/admin/classes/route.ts`**

- `POST`: `requireUser(req, [Role.ADMIN])`, valida com `createClassSchema`, responde `{ success: true, class }` ou 400 com `parsed.error.issues[0].message` e `details`, igual à rota de disciplinas.
- `PUT`: idem com `updateClassSchema`, separa `id` do restante e chama `updateClass`.
- `GET` continua para TEACHER e ADMIN.
- RBAC (`src/lib/auth/rbac.ts`): sem mudança na matriz. O comentário "Somente leitura: turmas existentes para vincular disciplinas." passa a "Escrita restrita a ADMIN fica em requireUser na rota.", como em disciplinas.

### 2. Derivação de ano e semestre na disciplina

**`src/domains/academic/services/subject-service.ts`**

- `assertClassExists` passa a devolver a turma encontrada (`{ id, name, code, semester, year }`).
- `createSubject` com `classId`: grava `academicYear: turma.year`, `semester: turma.semester` e `class: { connect }`.
- `updateSubject` com `classId` string: idem. Com `classId: null`: `semester: null` e `class: { disconnect: true }`; `academicYear` não muda. Com `classId` ausente: nada muda em relação a hoje.
- Sem turma na criação, vale o padrão do validador (`academicYear` = ano atual, `semester` ausente).

**Formulário**: deixa de enviar `academicYear`. Envia `academicLevel` do select.

### 3. Página Turmas no menu

- `src/lib/constants/routes.ts`: `ADMIN_CLASSES: '/admin/classes'` em `ROUTES`. O prefixo `/admin` já é ADMIN_ONLY na matriz do RBAC, nada a adicionar.
- `src/components/layout/nav-links.ts`: `ADMIN_LINKS` passa a ser Disciplinas, Turmas (ícone `Users` do lucide), Telemetria, seguidos dos links do professor.
- `src/app/admin/classes/page.tsx` (client): cabeçalho no mesmo estilo da página de disciplinas, busca por nome ou código, botão "+ Nova turma", tabela com colunas Nome, Código, Ano, Semestre, Alunos, Disciplinas e Ações (botão "Editar"). Estados de carregamento, erro com "Tentar novamente" e lista vazia ("Nenhuma turma cadastrada.").
- `src/app/admin/classes/_components/ClassFormModal.tsx`:
  - Props: `open`, `onOpenChange`, `editingClass: ClassOption | null`, `onSuccess(klass: ClassOption)`.
  - Campos: Nome (ex: "3º Semestre · ADS"), Código (ex: "ADS-2026-3A"), Ano letivo (number, padrão ano atual), Semestre (select 1 a 4, padrão 1).
  - Título "Nova turma" / "Editar turma". Botões "Cancelar" e "Salvar turma" / "Atualizar turma".
  - Erro da API aparece em `<p role="alert">` abaixo do formulário. Não usa `alert()`.
  - Usa `AdaptiveModal`, `Input`, `Label`, `Button` como os modais existentes.
- O tipo `ClassOption` sai de `SubjectFormModal.tsx` e passa a viver em `ClassFormModal.tsx` (com `_count?: { students: number; subjects: number }` opcional). `SubjectFormModal` e a página de disciplinas importam de lá.

### 4. Formulário de disciplina

**`src/app/admin/subjects/_components/SubjectFormModal.tsx`**

- Ordem: Nome da disciplina; Código e Curso lado a lado; Nível acadêmico; Turma; Professores.
- "Curso": label "Curso", placeholder "ex: ADS, Engenharia de Software, Ensino Médio".
- "Nível acadêmico": `<select>` com Ensino Superior (`HIGHER_EDUCATION`), Ensino Médio (`HIGH_SCHOOL`), Fundamental (`ELEMENTARY`). Padrão `HIGHER_EDUCATION` na criação; na edição, o valor salvo.
- "Turma": `AdvancedCombobox` (seleção única, de `@/components/ui/advanced-combobox`).
  - Itens: primeiro `{ id: NO_CLASS_ID, title: 'Sem turma', subtitle: 'não aparece para alunos' }`, depois uma entrada por turma com `title: name`, `subtitle: \`${year} · ${semester}º semestre\``, `badge: code`.
  - `NO_CLASS_ID` é uma constante local (`'__none__'`); no envio vira `classId: null`.
  - `addNewLabel="+ Nova turma..."`, `onAddNewClick={onRequestCreateClass}`.
  - Texto de apoio abaixo: "Ano letivo e semestre vêm da turma selecionada."
- Nova prop `onRequestCreateClass: () => void`.
- Botões: "Salvar disciplina" / "Atualizar disciplina". Título permanece.
- Erro de envio vira `<p role="alert">` inline em vez de `alert()`.
- Payload: `name, code, courseName, academicLevel, teacherIds, classId`. Sem `academicYear`.

**`src/app/admin/subjects/page.tsx`**

- Estados `isClassModalOpen` e `selectedClassId`/`setSelectedClassId`, passados ao `SubjectFormModal` como props, espelhando `selectedTeachers`/`setSelectedTeachers`. O `ClassFormModal` recebe `onSuccess={(klass) => { fetchSubjectData(); setSelectedClassId(klass.id); }}`, de modo que a turma recém-criada fica selecionada, igual ao fluxo do professor recém-criado.
- Cabeçalho da coluna "Curso / Ano" vira "Curso".

### 5. Fluxo "+ Nova turma" dentro da disciplina

1. Admin abre "Nova disciplina", abre o combobox Turma, clica "+ Nova turma...".
2. `ClassFormModal` abre por cima (o modal de disciplina permanece aberto, como acontece com professor).
3. Ao salvar com sucesso, a página recarrega turmas e a nova turma fica selecionada no combobox.
4. Código duplicado: o modal de turma mostra "Já existe uma turma com este código." inline e continua aberto.

## Tratamento de erros

- API: validação 400 com a primeira mensagem do zod; código duplicado 409; turma inexistente 404; demais via `apiError`.
- UI: erro inline com `role="alert"` nos dois modais; estado de carregamento desabilita o botão de envio.

## Testes

- `src/domains/academic/services/__tests__/class-service.test.ts`: `createClass` cria; código duplicado lança 409; `updateClass` atualiza; atualizar para código de outra turma lança 409; atualizar turma inexistente lança 404.
- `src/domains/academic/services/__tests__/subject-service.test.ts`: criar com turma grava `academicYear` e `semester` da turma; `updateSubject` com `classId: null` grava `semester: null` e `disconnect`.
- `src/components/layout/__tests__/nav-links.test.ts`: admin vê Disciplinas, Turmas, Telemetria e depois a lista do professor; `/admin/classes` é acessível pelo admin.
- `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx` (jsdom, `@testing-library/react`, `fetch` mockado): envia POST com `{ name, code, year, semester }`; resposta `{ success: false, error }` mostra o erro em `role="alert"`; em edição envia PUT com `id`.
- `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx`: lista as turmas no combobox; "+ Nova turma..." chama `onRequestCreateClass`; "Sem turma" envia `classId: null`; payload não contém `academicYear` e contém o `academicLevel` do select.
- Verificação final: `npm test`, `npx tsc --noEmit`, `npm run lint`.

## Arquivos tocados

Novos:
- `src/app/admin/classes/page.tsx`
- `src/app/admin/classes/_components/ClassFormModal.tsx`
- `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx`
- `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx`

Alterados:
- `src/lib/validators/admin.validator.ts`
- `src/domains/academic/services/class-repository.ts`
- `src/domains/academic/services/class-service.ts`
- `src/domains/academic/services/subject-service.ts`
- `src/domains/academic/services/__tests__/class-service.test.ts`
- `src/domains/academic/services/__tests__/subject-service.test.ts`
- `src/app/api/v1/admin/classes/route.ts`
- `src/lib/auth/rbac.ts` (só comentário)
- `src/lib/constants/routes.ts`
- `src/components/layout/nav-links.ts`
- `src/components/layout/__tests__/nav-links.test.ts`
- `src/app/admin/subjects/_components/SubjectFormModal.tsx`
- `src/app/admin/subjects/page.tsx`
