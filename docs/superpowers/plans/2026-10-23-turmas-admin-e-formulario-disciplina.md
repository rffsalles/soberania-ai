# Turmas no admin e formulário de disciplina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin cria e edita turmas por uma página própria e de dentro do modal de disciplina, e o formulário de disciplina deixa de pedir "Curso / Ano" em um campo só.

**Architecture:** Turmas ganham CRUD (sem exclusão) no padrão já existente de disciplinas: validador zod em `admin.validator.ts`, repositório e serviço em `src/domains/academic/services`, POST/PUT na rota `/api/v1/admin/classes`, página `/admin/classes` com `ClassFormModal` em `_components`. O modal de disciplina troca o `<select>` de turma por `AdvancedCombobox` com "+ Nova turma...", ganha um select de nível acadêmico, e o serviço de disciplina passa a derivar ano letivo e semestre da turma vinculada.

**Tech Stack:** Next.js (App Router, client pages), React, TypeScript, Prisma, zod, vitest (+ jsdom e `@testing-library/react` para componentes), Radix via `@/components/ui`.

**Spec:** `docs/superpowers/specs/2026-10-23-turmas-admin-e-formulario-disciplina-design.md`

## Global Constraints

- Todo o trabalho é feito direto em `main`. Não criar branch nem worktree (CLAUDE.md do projeto).
- Não commitar `package.json`, `package-lock.json` nem `.mcp.json`: a alteração pendente neles (dependência `shadcn`) é de outro trabalho. Usar `git add` com caminhos explícitos em todo commit.
- Sem migração Prisma: `Class.semester` continua `Int` obrigatório.
- Textos de interface e mensagens de erro em português do Brasil, com os valores exatos da spec.
- Nenhum `alert()`/`confirm()` novo. Erros de modal aparecem em `<p role="alert">`.
- Mensagens de erro de domínio: `'Já existe uma turma com este código.'` (409) e `'Turma não encontrada.'` (404).
- Rótulos de nível acadêmico: `HIGHER_EDUCATION` → "Ensino Superior", `HIGH_SCHOOL` → "Ensino Médio", `ELEMENTARY` → "Fundamental".
- Testes de componente levam `// @vitest-environment jsdom` na primeira linha e `import * as React from 'react'`; o `vitest.config.ts` roda em `node` por padrão.
- Commits terminam com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Código de turma com espaços nas bordas ("  ADS-2026-3A ") deve ser gravado sem espaços; o admin espera que `ADS-2026-3A` e `ADS-2026-3A ` sejam a mesma turma. Teste em Task 1 (validador).
2. Ano e semestre chegam do formulário como string ("2026", "3") e devem virar número antes de ir ao banco. Teste em Task 1 (validador) e Task 5 (modal envia número).
3. Editar uma turma mantendo o próprio código não pode dar 409. Teste em Task 1 (serviço).
4. Ao editar uma disciplina que já tem turma, o combobox deve abrir com essa turma selecionada, e não em "Sem turma". Teste em Task 7.
5. Criar uma turma pelo "+ Nova turma..." não pode apagar o que o admin já digitou no modal de disciplina; a nova turma deve ficar selecionada. Teste em Task 7.

---

### Task 1: Validador, repositório e serviço de turmas

**Files:**
- Modify: `src/lib/validators/admin.validator.ts`
- Modify: `src/domains/academic/services/class-repository.ts`
- Modify: `src/domains/academic/services/class-service.ts`
- Test: `src/lib/validators/__tests__/admin.validator.test.ts`
- Test: `src/domains/academic/services/__tests__/class-service.test.ts`

**Interfaces:**
- Consumes: `DomainError(status, message)` de `@/lib/api/domain-error`; `db` de `@/lib/db`.
- Produces:
  - `createClassSchema`, `updateClassSchema`, `type CreateClassInput = { name: string; code: string; year: number; semester: number }` em `admin.validator.ts`.
  - Em `class-repository.ts`: `type ClassPublic = { id: string; name: string; code: string; semester: number; year: number }`; `listClasses(): Promise<(ClassPublic & { _count: { students: number; subjects: number } })[]>`; `findClassById(id: string): Promise<ClassPublic | null>`; `findClassByCode(code: string): Promise<ClassPublic | null>`; `createClass(data: CreateClassInput): Promise<ClassPublic>`; `updateClass(id: string, data: CreateClassInput): Promise<ClassPublic>`.
  - Em `class-service.ts`: `type ClassDeps = { repo: Pick<typeof realRepo, 'listClasses' | 'findClassById' | 'findClassByCode' | 'createClass' | 'updateClass'> }`; `listClasses(deps?)`; `createClass(input: CreateClassInput, deps?)`; `updateClass(id: string, input: CreateClassInput, deps?)`.

- [ ] **Step 1: Escrever os testes do validador (falhando)**

Acrescentar ao final de `src/lib/validators/__tests__/admin.validator.test.ts` (importar `createClassSchema` e `updateClassSchema` junto dos imports existentes):

```ts
describe('createClassSchema', () => {
  const base = { name: '3º Semestre · ADS', code: 'ADS-2026-3A' };
  it('aplica padrões de ano atual e semestre 1', () => {
    expect(createClassSchema.parse(base)).toMatchObject({ year: new Date().getFullYear(), semester: 1 });
  });
  it('coage ano e semestre vindos como string', () => {
    expect(createClassSchema.parse({ ...base, year: '2027', semester: '3' })).toMatchObject({ year: 2027, semester: 3 });
  });
  it('remove espaços nas bordas de nome e código', () => {
    expect(createClassSchema.parse({ name: '  Turma A ', code: '  ADS-2026-3A ' })).toMatchObject({ name: 'Turma A', code: 'ADS-2026-3A' });
  });
  it('rejeita semestre fora de 1 a 4 e código curto', () => {
    expect(createClassSchema.safeParse({ ...base, semester: 5 }).success).toBe(false);
    expect(createClassSchema.safeParse({ ...base, semester: 0 }).success).toBe(false);
    expect(createClassSchema.safeParse({ ...base, code: 'A' }).success).toBe(false);
  });
  it('updateClassSchema exige id', () => {
    expect(updateClassSchema.safeParse(base).success).toBe(false);
    expect(updateClassSchema.safeParse({ ...base, id: 'c1' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts`
Expected: FAIL com "createClassSchema" não exportado.

- [ ] **Step 3: Implementar os esquemas em `src/lib/validators/admin.validator.ts`**

```ts
export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da turma'),
  code: z.string().trim().min(2, 'Informe o código da turma'),
  year: z.coerce.number().int().min(2020).max(2050).default(() => new Date().getFullYear()),
  semester: z.coerce.number().int().min(1).max(4).default(1),
});
export const updateClassSchema = createClassSchema.extend({ id: z.string().min(1, 'ID é obrigatório') });
export type CreateClassInput = z.infer<typeof createClassSchema>;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/validators/__tests__/admin.validator.test.ts`
Expected: PASS.

- [ ] **Step 5: Reescrever `src/domains/academic/services/__tests__/class-service.test.ts` (falhando)**

```ts
import { describe, it, expect } from 'vitest';
import { listClasses, createClass, updateClass, type ClassDeps } from '../class-service';

const c1 = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 };
const c2 = { id: 'c2', name: '1º Semestre · ADS', code: 'ADS-2026-1A', semester: 1, year: 2026 };

function makeDeps(rows = [c1, c2]) {
  const calls: { op: string; id?: string; data: Record<string, unknown> }[] = [];
  const deps: ClassDeps = {
    repo: {
      listClasses: async () => rows.map((r) => ({ ...r, _count: { students: 0, subjects: 0 } })),
      findClassById: async (id) => rows.find((r) => r.id === id) ?? null,
      findClassByCode: async (code) => rows.find((r) => r.code === code) ?? null,
      createClass: async (data) => {
        calls.push({ op: 'create', data });
        return { id: 'new', ...data };
      },
      updateClass: async (id, data) => {
        calls.push({ op: 'update', id, data });
        return { id, ...data };
      },
    },
  };
  return { deps, calls };
}

const input = { name: 'Turma Nova', code: 'NOVA-2026-1', year: 2026, semester: 1 };

describe('listClasses', () => {
  it('devolve as turmas do repositório com contagens', async () => {
    const { deps } = makeDeps();
    expect(await listClasses(deps)).toHaveLength(2);
  });
});

describe('createClass', () => {
  it('cria quando o código é inédito', async () => {
    const { deps, calls } = makeDeps();
    expect(await createClass(input, deps)).toMatchObject({ id: 'new', code: 'NOVA-2026-1' });
    expect(calls[0]).toMatchObject({ op: 'create', data: input });
  });
  it('rejeita código já usado com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(createClass({ ...input, code: 'ADS-2026-3A' }, deps)).rejects.toMatchObject({
      status: 409,
      message: 'Já existe uma turma com este código.',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('updateClass', () => {
  it('atualiza mantendo o próprio código', async () => {
    const { deps, calls } = makeDeps();
    await updateClass('c1', { ...input, code: 'ADS-2026-3A' }, deps);
    expect(calls[0]).toMatchObject({ op: 'update', id: 'c1', data: { code: 'ADS-2026-3A' } });
  });
  it('rejeita código de outra turma com 409', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateClass('c1', { ...input, code: 'ADS-2026-1A' }, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);
  });
  it('rejeita turma inexistente com 404', async () => {
    const { deps, calls } = makeDeps();
    await expect(updateClass('nope', input, deps)).rejects.toMatchObject({
      status: 404,
      message: 'Turma não encontrada.',
    });
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `npx vitest run src/domains/academic/services/__tests__/class-service.test.ts`
Expected: FAIL com `createClass`/`updateClass` não exportados.

- [ ] **Step 7: Implementar repositório e serviço**

Em `class-repository.ts`: exportar `type ClassPublic`; `listClasses` acrescenta `_count: { select: { students: true, subjects: true } }` ao `select` existente; `findClassByCode(code)` usa `findUnique({ where: { code }, select })`; `createClass(data)` usa `db.class.create({ data, select })`; `updateClass(id, data)` usa `db.class.update({ where: { id }, data, select })`. Tipar `data` como `CreateClassInput` importado de `@/lib/validators/admin.validator`.

Em `class-service.ts`: `const defaultDeps: ClassDeps = { repo: realRepo }`; `createClass` lança 409 se `findClassByCode(input.code)` devolver algo; `updateClass` lança 409 se `findClassByCode(input.code)` devolver turma com `id !== id`, lança 404 se `findClassById(id)` for `null`, senão `repo.updateClass(id, input)`. Remover o comentário "provisionadas por seed/banco (sem CRUD no admin nesta versão)" e substituir por "Turmas do admin: listagem para vínculo e CRUD sem exclusão.".

- [ ] **Step 8: Rodar e confirmar que passa, com typecheck**

Run: `npx vitest run src/domains/academic/services/__tests__/class-service.test.ts src/lib/validators/__tests__/admin.validator.test.ts && npx tsc --noEmit`
Expected: PASS nos dois arquivos; `tsc` sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validators/admin.validator.ts src/lib/validators/__tests__/admin.validator.test.ts src/domains/academic/services/class-repository.ts src/domains/academic/services/class-service.ts src/domains/academic/services/__tests__/class-service.test.ts
git commit -m "feat(turmas): validador, repositório e serviço com criação e edição

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: POST e PUT em /api/v1/admin/classes

**Files:**
- Modify: `src/app/api/v1/admin/classes/route.ts`
- Modify: `src/lib/auth/rbac.ts` (só o comentário da linha `[API_ROUTES.ADMIN_CLASSES]`)
- Test: `src/app/api/v1/admin/classes/__tests__/route.test.ts` (criar)

**Interfaces:**
- Consumes: `createClassSchema`, `updateClassSchema` (Task 1); `createClass`, `updateClass`, `listClasses` de `@/domains/academic/services/class-service`; `requireUser`, `apiError`.
- Produces: `POST` responde `{ success: true, class }`; `PUT` idem; 400 com `{ success: false, error, details }`.

- [ ] **Step 1: Escrever o teste da rota (falhando)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listClasses: vi.fn(),
  createClass: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/lib/auth/request-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/domains/academic/services/class-service', () => ({
  listClasses: mocks.listClasses,
  createClass: mocks.createClass,
  updateClass: mocks.updateClass,
}));

import { POST, PUT } from '../route';

const admin = { id: 'a1', role: Role.ADMIN, classId: null };
const klass = { id: 'c9', name: 'Turma', code: 'T-2026-1', year: 2026, semester: 1 };

function req(method: 'POST' | 'PUT', body: unknown) {
  return new Request('http://x/api/v1/admin/classes', { method, body: JSON.stringify(body) });
}

describe('/api/v1/admin/classes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue(admin);
  });

  it('POST cria a turma e devolve success', async () => {
    mocks.createClass.mockResolvedValue(klass);
    const res = await POST(req('POST', { name: 'Turma', code: 'T-2026-1', year: '2026', semester: '1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, class: klass });
    expect(mocks.createClass).toHaveBeenCalledWith({ name: 'Turma', code: 'T-2026-1', year: 2026, semester: 1 });
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(), [Role.ADMIN]);
  });

  it('POST devolve 400 com a primeira mensagem do zod', async () => {
    const res = await POST(req('POST', { name: 'T', code: 'T-2026-1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, error: 'Informe o nome da turma' });
    expect(mocks.createClass).not.toHaveBeenCalled();
  });

  it('PUT separa o id e chama updateClass', async () => {
    mocks.updateClass.mockResolvedValue(klass);
    const res = await PUT(req('PUT', { id: 'c9', name: 'Turma', code: 'T-2026-1', year: 2026, semester: 2 }));
    expect(res.status).toBe(200);
    expect(mocks.updateClass).toHaveBeenCalledWith('c9', { name: 'Turma', code: 'T-2026-1', year: 2026, semester: 2 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/v1/admin/classes/__tests__/route.test.ts`
Expected: FAIL com `POST`/`PUT` não exportados.

- [ ] **Step 3: Implementar `POST` e `PUT` em `route.ts`**

Copiar a estrutura de `src/app/api/v1/admin/subjects/route.ts`: `requireUser(req, [Role.ADMIN])`, `safeParse`, 400 com `parsed.error.issues[0].message` e `details: parsed.error.flatten()`, chamada ao serviço, `NextResponse.json({ success: true, class: ... })`, `apiError` no catch. Em `PUT`, `const { id, ...input } = parsed.data`.

Em `rbac.ts`, trocar o comentário `// Somente leitura: turmas existentes para vincular disciplinas.` por `// Escrita restrita a ADMIN fica em requireUser na rota.`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/api/v1/admin/classes/__tests__/route.test.ts src/lib/auth/__tests__/rbac.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/admin/classes/route.ts src/app/api/v1/admin/classes/__tests__/route.test.ts src/lib/auth/rbac.ts
git commit -m "feat(turmas): POST e PUT em /api/v1/admin/classes restritos a ADMIN

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Disciplina deriva ano letivo e semestre da turma

**Files:**
- Modify: `src/domains/academic/services/subject-service.ts`
- Test: `src/domains/academic/services/__tests__/subject-service.test.ts`

**Interfaces:**
- Consumes: `SubjectDeps.classes.findClassById` (já existe; o fake em `makeDeps` devolve `{ id, name: 'Turma', code: 'T1', semester: 1, year: 2026 }`).
- Produces: `createSubject`/`updateSubject` com `classId` string gravam `academicYear` e `semester` da turma; `classId: null` grava `semester: null`.

- [ ] **Step 1: Acrescentar os testes (falhando)**

No `describe('createSubject')`:

```ts
  it('grava ano letivo e semestre da turma vinculada', async () => {
    const { deps, calls } = makeDeps();
    await createSubject({ ...base, academicYear: 2020, classId: 'c1' }, deps);
    expect(calls[0].data).toMatchObject({ academicYear: 2026, semester: 1 });
  });
```

No `describe('updateSubject')`:

```ts
  it('ao trocar de turma, grava ano letivo e semestre da nova turma', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { ...base, academicYear: 2020, classId: 'c1' }, deps);
    expect(calls[0].data).toMatchObject({ academicYear: 2026, semester: 1 });
  });
  it('ao desvincular, zera o semestre e mantém o ano', async () => {
    const { deps, calls } = makeDeps();
    await updateSubject('s1', { ...base, classId: null }, deps);
    expect(calls[0].data).toMatchObject({ semester: null, academicYear: 2026 });
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/domains/academic/services/__tests__/subject-service.test.ts`
Expected: FAIL nos três testes novos (`semester` ausente, `academicYear` 2020).

- [ ] **Step 3: Implementar em `subject-service.ts`**

`assertClassExists(classId, deps)` passa a devolver a turma (`const klass = await deps.classes.findClassById(classId); if (!klass) throw ...; return klass;`). Em `createSubject` e `updateSubject`, quando `classId` é string: `{ ...data, academicYear: klass.year, semester: klass.semester, class: { connect: { id: classId } } }`. Em `updateSubject` com `classId === null`: `{ ...data, semester: null, class: { disconnect: true } }`. Atualizar o comentário de `SubjectInput` para dizer que ano letivo e semestre vêm da turma quando há vínculo.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/domains/academic/services/__tests__/subject-service.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domains/academic/services/subject-service.ts src/domains/academic/services/__tests__/subject-service.test.ts
git commit -m "feat(disciplinas): ano letivo e semestre derivam da turma vinculada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rota /admin/classes e entrada "Turmas" no menu

**Files:**
- Modify: `src/lib/constants/routes.ts`
- Modify: `src/components/layout/nav-links.ts`
- Test: `src/components/layout/__tests__/nav-links.test.ts`
- Test: `src/lib/auth/__tests__/rbac.test.ts`

**Interfaces:**
- Produces: `ROUTES.ADMIN_CLASSES = '/admin/classes'`; `ADMIN_LINKS` = Disciplinas, Turmas, Telemetria, depois `TEACHER_LINKS`.

- [ ] **Step 1: Atualizar os testes (falhando)**

Em `nav-links.test.ts`, trocar o teste `'admin vê gestão seguida da lista completa do professor'` por:

```ts
  it('admin vê gestão seguida da lista completa do professor', () => {
    expect(labels(Role.ADMIN)).toEqual(['Disciplinas', 'Turmas', 'Telemetria', ...labels(Role.TEACHER)]);
    expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 3).map((l) => l.href)).toEqual([
      ROUTES.ADMIN_SUBJECTS,
      ROUTES.ADMIN_CLASSES,
      ROUTES.APPLIANCE,
    ]);
  });
```

Em `rbac.test.ts`, acrescentar `'/admin/classes'` nas listas `'nega %s para STUDENT'`, `'nega %s para TEACHER'` e `'permite %s para ADMIN'`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/layout/__tests__/nav-links.test.ts src/lib/auth/__tests__/rbac.test.ts`
Expected: FAIL em nav-links (`ROUTES.ADMIN_CLASSES` indefinido); rbac PASS (o prefixo `/admin` já cobre).

- [ ] **Step 3: Implementar**

Em `routes.ts`, após `ADMIN_SUBJECTS`: `ADMIN_CLASSES: '/admin/classes',`. Em `nav-links.ts`, importar `Users` do lucide e inserir `{ href: ROUTES.ADMIN_CLASSES, label: 'Turmas', icon: Users }` entre Disciplinas e Telemetria.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/components/layout src/lib/auth/__tests__/rbac.test.ts`
Expected: PASS, incluindo `app-header.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants/routes.ts src/components/layout/nav-links.ts src/components/layout/__tests__/nav-links.test.ts src/lib/auth/__tests__/rbac.test.ts
git commit -m "feat(nav): entrada Turmas no menu do admin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: ClassFormModal

**Files:**
- Create: `src/app/admin/classes/_components/ClassFormModal.tsx`
- Test: `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx` (criar)

**Interfaces:**
- Consumes: `AdaptiveModal`, `Button`, `Input`, `Label`, `API_ROUTES.ADMIN_CLASSES`.
- Produces:
  ```ts
  export interface ClassOption { id: string; name: string; code: string; semester: number; year: number; _count?: { students: number; subjects: number } }
  export interface ClassFormModalProps { open: boolean; onOpenChange: (open: boolean) => void; editingClass: ClassOption | null; onSuccess: (klass: ClassOption) => void }
  export function ClassFormModal(props: ClassFormModalProps): JSX.Element
  ```
  Rótulos exatos (com `htmlFor`/`id`): "Nome da turma", "Código", "Ano letivo", "Semestre". Opções do select de semestre: valores `1`–`4`, textos "1º semestre" … "4º semestre". Título "Nova turma" / "Editar turma". Botões "Cancelar" e "Salvar turma" / "Atualizar turma". Texto de carregamento "Salvando...".

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div><h2>{title}</h2>{children}</div> : null,
}));

import { ClassFormModal, type ClassOption } from '../ClassFormModal';

const existing: ClassOption = { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 };

function fetchOk(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe('ClassFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('cria a turma com POST e devolve a turma criada', async () => {
    const created = { id: 'c9', name: 'Turma Nova', code: 'NOVA-2026-1', semester: 2, year: 2027 };
    const fetchMock = fetchOk({ success: true, class: created });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<ClassFormModal open editingClass={null} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    expect(screen.getByText('Nova turma')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: 'Turma Nova' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'NOVA-2026-1' } });
    fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2027' } });
    fireEvent.change(screen.getByLabelText('Semestre'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Salvar turma'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(created));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/classes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Turma Nova', code: 'NOVA-2026-1', year: 2027, semester: 2 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('em edição preenche os campos e envia PUT com id', async () => {
    const fetchMock = fetchOk({ success: true, class: existing });
    vi.stubGlobal('fetch', fetchMock);
    render(<ClassFormModal open editingClass={existing} onOpenChange={() => {}} onSuccess={() => {}} />);
    expect(screen.getByText('Editar turma')).toBeTruthy();
    expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('ADS-2026-3A');
    expect((screen.getByLabelText('Semestre') as HTMLSelectElement).value).toBe('3');
    fireEvent.click(screen.getByText('Atualizar turma'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toMatchObject({ id: 'c1', code: 'ADS-2026-3A', year: 2026, semester: 3 });
  });

  it('mostra o erro da API inline e mantém o modal aberto', async () => {
    vi.stubGlobal('fetch', fetchOk({ success: false, error: 'Já existe uma turma com este código.' }));
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<ClassFormModal open editingClass={null} onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: 'Turma' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ADS-2026-3A' } });
    fireEvent.click(screen.getByText('Salvar turma'));
    expect((await screen.findByRole('alert')).textContent).toBe('Já existe uma turma com este código.');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```


- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx`
Expected: FAIL por módulo `../ClassFormModal` inexistente.

- [ ] **Step 3: Implementar `ClassFormModal.tsx`**

Seguir a estrutura de `TeacherCreateModal.tsx` (estados por campo, `useEffect` que preenche a partir de `editingClass` ou zera, `handleSubmit` com `fetch`, `loading`). Estado `error: string | null`; `<p role="alert" className="text-xs text-red-600">` quando houver. Corpo da requisição: `{ ...(editingClass ? { id: editingClass.id } : {}), name, code, year: Number(year), semester: Number(semester) }`. Sucesso: `onOpenChange(false); onSuccess(data.class)`. Falha: `setError(data.error || 'Erro ao salvar turma.')`; catch: `setError('Erro ao conectar com servidor.')`. Padrões na criação: `year = String(new Date().getFullYear())`, `semester = '1'`. Select de semestre com `className` igual ao `<select>` atual de turma em `SubjectFormModal.tsx`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx && npx tsc --noEmit`
Expected: PASS; `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/classes/_components/ClassFormModal.tsx src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx
git commit -m "feat(turmas): modal de cadastro e edição de turma

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Página /admin/classes

**Files:**
- Create: `src/app/admin/classes/page.tsx`

**Interfaces:**
- Consumes: `ClassFormModal`, `ClassOption` (Task 5); `API_ROUTES.ADMIN_CLASSES` (GET devolve `{ success, classes: ClassOption[] }` com `_count`).
- Produces: página client `AdminClassesPage` (default export).

- [ ] **Step 1: Implementar a página**

Copiar a estrutura de `src/app/admin/subjects/page.tsx` reduzida a uma entidade:
- Estados: `classes`, `loading`, `loadError`, `search`, `isModalOpen`, `editingClass`.
- `fetchClasses` com `fetch(API_ROUTES.ADMIN_CLASSES)`; erro → `'Não foi possível carregar as turmas. Tente novamente.'`.
- Cabeçalho: `Badge` "Etapa 0 • Turmas", `ProviderBadge`, título "Turmas", subtítulo "Turmas que recebem agendas e alunos.", botão "+ Nova turma" (ícone `Plus`).
- Busca por nome ou código (placeholder "Buscar por nome ou código...").
- Tabela: colunas "Nome", "Código", "Ano", "Semestre", "Alunos", "Disciplinas", "Ações" (botão ghost "Editar"). Contagens vêm de `_count?.students ?? 0` e `_count?.subjects ?? 0`. Estados de erro com "Tentar novamente", "Carregando turmas..." e "Nenhuma turma cadastrada." com `colSpan={7}`.
- `ClassFormModal` com `onSuccess={() => fetchClasses()}` e `onOpenChange` que zera `editingClass` ao fechar.

- [ ] **Step 2: Verificar typecheck e lint**

Run: `npx tsc --noEmit && npx next lint --dir src/app/admin/classes`
Expected: sem erros.

- [ ] **Step 3: Verificar no navegador**

Run: `npm run dev` (se já não estiver rodando) e abrir `http://localhost:3000/admin/classes` como ADMIN.
Expected: entrada "Turmas" no menu; tabela com a turma do seed; "+ Nova turma" cria e a lista recarrega; "Editar" preenche o modal; código repetido mostra "Já existe uma turma com este código." no modal.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/classes/page.tsx
git commit -m "feat(turmas): página de listagem, cadastro e edição no admin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: SubjectFormModal com combobox de turma, nível acadêmico e "Curso"

**Files:**
- Modify: `src/app/admin/subjects/_components/SubjectFormModal.tsx`
- Test: `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx` (criar)

**Interfaces:**
- Consumes: `AdvancedCombobox` e `ComboboxItem` de `@/components/ui/advanced-combobox`; `ClassOption` de `../../classes/_components/ClassFormModal`.
- Produces: `SubjectFormModalProps` ganha `selectedClassId: string | null`, `setSelectedClassId: (id: string | null) => void`, `onRequestCreateClass: () => void`; `ClassOption` deixa de ser exportado daqui (é reexportado de `ClassFormModal`). `SubjectItem` permanece.
  - Rótulos/ids: "Nome da Disciplina", "Código", "Curso" (placeholder "ex: ADS, Engenharia de Software, Ensino Médio"), "Nível acadêmico" (`id="subject-academic-level"`), combobox com `label="Turma"` e `id="subject-class-combobox"`.
  - Item sentinela `NO_CLASS_ID = '__none__'` com `title: 'Sem turma'`, `subtitle: 'não aparece para alunos'`; demais itens `title: c.name`, `subtitle: \`${c.year} · ${c.semester}º semestre\``, `badge: c.code`.
  - `addNewLabel="+ Nova turma..."`; texto de apoio "Ano letivo e semestre vêm da turma selecionada."
  - Botões "Salvar disciplina" / "Atualizar disciplina". Payload: `{ id?, name, code, courseName, academicLevel, teacherIds, classId }` (sem `academicYear`).

- [ ] **Step 1: Escrever o teste (falhando)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/adaptive/adaptive-modal', () => ({
  AdaptiveModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

type Item = { id: string; title: string; subtitle?: string; badge?: string };
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ label, items, selectedId, onSelect, addNewLabel, onAddNewClick }: {
    label: string; items: Item[]; selectedId: string | null; onSelect: (id: string) => void; addNewLabel?: string; onAddNewClick?: () => void;
  }) => (
    <div>
      <label htmlFor="combo">{label}</label>
      <select id="combo" value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? ` | ${i.subtitle}` : ''}{i.badge ? ` | ${i.badge}` : ''}</option>)}
      </select>
      <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));

import { SubjectFormModal, type SubjectItem } from '../SubjectFormModal';
import type { ClassOption } from '../../../classes/_components/ClassFormModal';

const classes: ClassOption[] = [
  { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 },
];

function renderModal(overrides: Partial<React.ComponentProps<typeof SubjectFormModal>> = {}) {
  const props: React.ComponentProps<typeof SubjectFormModal> = {
    open: true,
    onOpenChange: vi.fn(),
    editingSubject: null,
    teachers: [],
    classes,
    selectedTeachers: [],
    setSelectedTeachers: vi.fn(),
    selectedClassId: null,
    setSelectedClassId: vi.fn(),
    onSuccess: vi.fn(),
    onRequestCreateTeacher: vi.fn(),
    onRequestCreateClass: vi.fn(),
    ...overrides,
  };
  return { ...render(<SubjectFormModal {...props} />), props };
}

describe('SubjectFormModal', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('lista "Sem turma" e as turmas com ano, semestre e código', () => {
    renderModal();
    const options = Array.from((screen.getByLabelText('Turma') as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual(['Sem turma | não aparece para alunos', '3º Semestre · ADS | 2026 · 3º semestre | ADS-2026-3A']);
    expect(screen.getByText('Ano letivo e semestre vêm da turma selecionada.')).toBeTruthy();
  });

  it('"+ Nova turma..." chama onRequestCreateClass', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('+ Nova turma...'));
    expect(props.onRequestCreateClass).toHaveBeenCalledTimes(1);
  });

  it('selecionar uma turma informa o id; "Sem turma" informa null', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: 'c1' } });
    expect(props.setSelectedClassId).toHaveBeenLastCalledWith('c1');
    fireEvent.change(screen.getByLabelText('Turma'), { target: { value: '__none__' } });
    expect(props.setSelectedClassId).toHaveBeenLastCalledWith(null);
  });

  it('envia nível acadêmico e classId null, sem academicYear', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'MT01' } });
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'Ensino Médio' } });
    fireEvent.change(screen.getByLabelText('Nível acadêmico'), { target: { value: 'HIGH_SCHOOL' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ name: 'Matemática', code: 'MT01', courseName: 'Ensino Médio', academicLevel: 'HIGH_SCHOOL', teacherIds: [], classId: null });
    expect(body).not.toHaveProperty('academicYear');
  });

  it('em edição abre com a turma e o nível da disciplina', () => {
    const editing: SubjectItem = {
      id: 's1', name: 'Cálculo', code: 'MAT01', courseName: 'Engenharia', academicLevel: 'HIGHER_EDUCATION',
      academicYear: 2026, classId: 'c1', class: { id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A' }, teacherAssignments: [],
    };
    const { props } = renderModal({ editingSubject: editing, selectedClassId: 'c1' });
    expect(props.setSelectedClassId).toHaveBeenCalledWith('c1');
    expect((screen.getByLabelText('Turma') as HTMLSelectElement).value).toBe('c1');
    expect((screen.getByLabelText('Nível acadêmico') as HTMLSelectElement).value).toBe('HIGHER_EDUCATION');
    expect(screen.getByText('Atualizar disciplina')).toBeTruthy();
  });

  it('mantém o que foi digitado quando chega uma turma nova e ela fica selecionada', () => {
    const { rerender, props } = renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    const nova: ClassOption = { id: 'c9', name: 'Turma Nova', code: 'NOVA-2026-1', semester: 1, year: 2026 };
    rerender(<SubjectFormModal {...props} classes={[...classes, nova]} selectedClassId="c9" />);
    expect((screen.getByLabelText('Nome da Disciplina') as HTMLInputElement).value).toBe('Matemática');
    expect((screen.getByLabelText('Turma') as HTMLSelectElement).value).toBe('c9');
  });

  it('mostra erro da API inline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Turma não encontrada.' }), { status: 404 })));
    renderModal();
    fireEvent.change(screen.getByLabelText('Nome da Disciplina'), { target: { value: 'Matemática' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'MT01' } });
    fireEvent.change(screen.getByLabelText('Curso'), { target: { value: 'ADS' } });
    fireEvent.click(screen.getByText('Salvar disciplina'));
    expect((await screen.findByRole('alert')).textContent).toBe('Turma não encontrada.');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx`
Expected: FAIL (props novas inexistentes, rótulo "Curso / Ano", botão "Salvar Vínculo").

- [ ] **Step 3: Implementar em `SubjectFormModal.tsx`**

- Remover `ClassOption` daqui; importar `type ClassOption` de `../../classes/_components/ClassFormModal` e reexportar (`export type { ClassOption }`) para não quebrar a página até a Task 8.
- Remover o estado `classId`; usar `selectedClassId`/`setSelectedClassId` das props. No `useEffect` de `editingSubject`: `setSelectedClassId(editingSubject?.classId ?? null)` e `setAcademicLevel(editingSubject?.academicLevel ?? 'HIGHER_EDUCATION')`.
- Estado `academicLevel` tipado como `'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY'`; estado `error: string | null`.
- `classItems: ComboboxItem[]` via `useMemo`: sentinela primeiro, depois `classes.map(...)` conforme Interfaces.
- `AdvancedCombobox` com `id="subject-class-combobox"`, `label="Turma"`, `placeholder="Sem turma (não aparece para alunos)"`, `searchPlaceholder="Buscar por nome ou código..."`, `items={classItems}`, `selectedId={selectedClassId ?? NO_CLASS_ID}`, `onSelect={(id) => setSelectedClassId(id === NO_CLASS_ID ? null : id)}`, `addNewLabel="+ Nova turma..."`, `onAddNewClick={onRequestCreateClass}`; abaixo, `<p className="text-[11px] text-slate-500">Ano letivo e semestre vêm da turma selecionada.</p>`.
- Select "Nível acadêmico" com `<Label htmlFor="subject-academic-level">` e as três opções nos valores/rótulos de Global Constraints, mesma `className` do antigo `<select>` de turma.
- Campo "Curso": `<Label htmlFor="subject-course">Curso</Label>` + `Input id="subject-course"` com o placeholder da spec. Dar `id`/`htmlFor` também a "Nome da Disciplina" (`subject-name`) e "Código" (`subject-code`).
- Payload conforme Interfaces; `classId: selectedClassId`. Na falha: `setError(data.error || 'Erro ao salvar disciplina.')`; catch: `setError('Erro ao salvar disciplina.')`; remover os `alert()`. Renderizar `<p role="alert" className="text-xs text-red-600">{error}</p>` quando houver.
- Botões: "Salvar disciplina" / "Atualizar disciplina".

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx`
Expected: PASS. (`tsc` ainda falha na página de disciplinas por causa das props novas; a Task 8 resolve.)

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/subjects/_components/SubjectFormModal.tsx src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx
git commit -m "feat(disciplinas): combobox de turma com inclusão, nível acadêmico e campo Curso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 8: Página de disciplinas liga o modal de turma e renomeia a coluna

**Files:**
- Modify: `src/app/admin/subjects/page.tsx`

**Interfaces:**
- Consumes: `ClassFormModal`, `ClassOption` (Task 5); props novas de `SubjectFormModal` (Task 7).

- [ ] **Step 1: Implementar**

- Importar `ClassFormModal` e `type ClassOption` de `../classes/_components/ClassFormModal`; remover o import de `ClassOption` vindo de `SubjectFormModal`.
- Estados novos: `isClassModalOpen` (boolean) e `selectedClassId` (`string | null`).
- `handleOpenCreateModal`: também `setSelectedClassId(null)`. `handleOpenEditModal(sub)`: também `setSelectedClassId(sub.classId ?? null)`.
- `handleClassCreated = (klass: ClassOption) => { fetchSubjectData(); setSelectedClassId(klass.id); }`.
- Renderizar `<ClassFormModal open={isClassModalOpen} onOpenChange={setIsClassModalOpen} editingClass={null} onSuccess={handleClassCreated} />` ao lado dos outros modais.
- Passar a `SubjectFormModal`: `selectedClassId`, `setSelectedClassId`, `onRequestCreateClass={() => setIsClassModalOpen(true)}`.
- Cabeçalho da coluna "Curso / Ano" vira "Curso".

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: tudo sem erros; todos os testes passam (o teste de rota de chat pode oscilar por dependência de ambiente, conforme memória do projeto; relatar se ocorrer).

- [ ] **Step 3: Verificar no navegador**

Abrir `http://localhost:3000/admin/subjects` como ADMIN, "+ Vincular Professor a Disciplina":
- Campos na ordem Nome, Código + Curso, Nível acadêmico, Turma, Professores.
- Combobox Turma lista "Sem turma" e a turma do seed com subtítulo "2026 · 3º semestre" e badge do código.
- "+ Nova turma..." abre o modal de turma por cima; ao salvar, a nova turma aparece selecionada e o nome já digitado permanece.
- Salvar cria a disciplina; a tabela mostra a coluna "Curso" e a turma.
- Editar uma disciplina com turma abre com ela selecionada.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/subjects/page.tsx
git commit -m "feat(disciplinas): criação de turma de dentro do formulário e coluna Curso

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
