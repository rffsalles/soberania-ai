# Estrutura acadêmica, fase 2: interface do admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin telas para cadastrar cursos, disciplinas da matriz, turmas (com curso e período) e ofertas (turma × disciplina × professores), consumindo a API da fase 1, com o menu admin em Cursos → Disciplinas → Turmas → Ofertas.

**Architecture:** Cada entidade segue o padrão de `src/app/admin/classes/page.tsx` + `_components/<X>FormModal.tsx`: a página carrega a lista com `fetch`, abre o modal para criar/editar e refaz o GET depois de salvar; o modal guarda o estado do formulário, monta o payload e mostra o erro da API inline. Tipos de linha são locais ao arquivo do modal (exportados para a página). Testes de componente com Testing Library em jsdom, `fetch` substituído por `vi.stubGlobal` e `AdaptiveModal`/`AdvancedCombobox` mockados como em `SubjectFormModal.test.tsx`.

**Tech Stack:** Next.js 15 (App Router, client components), React, TypeScript, Tailwind, lucide-react, vitest 3 + `@testing-library/react` 16 + jsdom (via `// @vitest-environment jsdom`; sem `jest-dom` nem `user-event`, usar `fireEvent` e asserções nativas).

**Spec:** `docs/superpowers/specs/2026-10-24-estrutura-academica-curso-matriz-oferta-design.md` (seções "Interface do admin", "Testes" › "Componentes", "Fases de execução" item 2 e a nota "Atualizados nas fases 2 e 3"). A fase 1 (`docs/superpowers/plans/2026-10-24-estrutura-academica-fase-1-schema-servicos-api.md`, commits `8e1c246..945a3f1`) está pronta: rotas, validadores e constantes de rota já existem e **não** são replanejados aqui.

## Global Constraints

- Trabalho direto em `main`, sem branch nem worktree. Commits em `main`, sem pull request. Mensagens em pt-BR (`feat(admin): ...`), terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Não commitar `package.json`, `package-lock.json` nem `.mcp.json`. `git add` sempre com caminhos explícitos.
- Textos de UI em português do Brasil. Vocabulário da spec: "Curso" = `Course`, "Disciplina" = `Discipline` (catálogo), "Turma" = `Class`, "Oferta" = `Subject`.
- RBAC já está no servidor (`requireUser` nas rotas; `/admin` e `/api/v1/admin` são `ADMIN_ONLY` em `src/lib/auth/rbac.ts`). A UI não checa papel. `rbac.ts` e `routes.ts` não mudam (`ROUTES.ADMIN_COURSES`, `ROUTES.ADMIN_DISCIPLINES`, `API_ROUTES.ADMIN_COURSES`, `API_ROUTES.ADMIN_DISCIPLINES`, `API_ROUTES.ACADEMIC_PERIODS` já existem). Usar sempre as constantes, nunca a string literal da rota.
- Padrão de modal: `AdaptiveModal` de `@/components/adaptive/adaptive-modal`; `<form onSubmit>`; erro em `<p role="alert" className="text-xs text-red-600">`; botões "Cancelar" (outline) e submit (`loading ? 'Salvando...' : editing ? 'Atualizar X' : 'Salvar X'`); `catch` → `'Erro ao conectar com servidor.'`; um efeito em `[open, editing...]` repõe os campos e limpa o erro a cada abertura.
- Modal aninhado (período dentro de turma, turma dentro de oferta) é renderizado como irmão do `AdaptiveModal`/`<form>` pai (fragmento), nunca dentro do `<form>`: o `submit` do React borbulha pelo portal e dispararia o `onSubmit` do formulário pai.
- Sem tipos compartilhados novos: cada tipo de linha (`CourseOption`, `DisciplineOption`, `ClassOption`, `OfferingItem`) vive no arquivo do seu modal e é exportado de lá. Não importar tipos de `src/domains/**` em componentes.
- Depois de salvar, a página **refaz o GET** da lista (`onSuccess` sem argumento ou ignorado), nunca mescla a resposta do POST/PUT. Obrigatório nas ofertas: POST/PUT de `/api/v1/admin/subjects` devolvem só `teacherAssignments`, sem `discipline` nem `class`.
- PUT de curso, turma e oferta aplica default a campo omitido (`academicLevel` → `HIGHER_EDUCATION`, `semester` → `1`, `teacherIds` → `[]`). Os modais **sempre** enviam esses campos no PUT, e os testes afirmam o body inteiro com `toEqual`.
- Imutáveis na edição (regras 7 e 8 da spec): disciplina não envia `courseId` no PUT e mostra o select Curso desabilitado; oferta envia só `{ id, teacherIds }` e mostra Turma e Disciplina desabilitadas.
- Fora desta fase (fase 3): `src/app/teacher/plans/new/**` (exceto a troca de caminho de import da Task 1), `types.ts` `SubjectOption` → `OfferingOption`, `OfferingContextCard`, lista de planos, aulas/cronogramas/avaliações/relatórios, dashboard do aluno. Sem exclusão em nenhuma página.
- Ids de fixture em testes no formato cuid (`c` + 9+ caracteres sem hífen, ex.: `ccourse00001`), como na fase 1.
- Gate de tipo por task: `npx tsc --noEmit 2>&1 | grep -E "src/app/admin|src/app/teacher/plans/new|src/components/layout"` sem saída.
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar `npx vitest run src/app/api/v1/agent/chat` isolado.

## Review Focus

1. Trocar a turma no formulário de oferta depois de escolher uma disciplina deve limpar a disciplina e recarregar a lista com o `courseId` da nova turma; senão o admin envia uma disciplina do curso antigo e recebe 400. Teste na Task 5 (`'trocar a turma limpa a disciplina e recarrega pelo curso novo'`).
2. Disciplina de outro curso não aparece no select de disciplina, mesmo se a resposta trouxer uma (filtro defensivo por `courseId` no cliente). Teste na Task 5 (`'lista só disciplinas do curso da turma'`).
3. Editar uma turma com ofertas e trocar o curso mostra no modal o 409 `'A turma tem ofertas; não é possível trocar o curso.'`, sem fechar nem chamar `onSuccess`. Teste na Task 2.
4. Período criado por "Cadastrar novo período..." aparece selecionado no combobox e é o `academicPeriodId` enviado no POST da turma. Teste na Task 2.
5. Oferta duplicada mostra o 409 `'Esta disciplina já é ofertada nesta turma.'` e mantém o modal aberto com as escolhas. Teste na Task 5.

---

### Task 1: Mover `PeriodCreateInlineModal` para `admin/classes`

**Files:**
- Move: `src/app/teacher/plans/new/_components/PeriodCreateInlineModal.tsx` → `src/app/admin/classes/_components/PeriodCreateInlineModal.tsx` (`git mv`)
- Modify: `src/app/teacher/plans/new/types.ts` (remove `AcademicPeriodOption`)
- Modify: `src/app/teacher/plans/new/_components/PlanHeaderControls.tsx:9-10` (só imports)
- Modify: `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx:13-18` (só imports)
- Test: `src/app/admin/classes/_components/__tests__/PeriodCreateInlineModal.test.tsx` (novo)

**Interfaces:**
- Produces, em `src/app/admin/classes/_components/PeriodCreateInlineModal.tsx`:
  - `export interface AcademicPeriodOption { id: string; name: string; code: string; year: number; semester?: number | null; type?: string }` (copiado literalmente de `types.ts`).
  - `export function PeriodCreateInlineModal(props: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (period: AcademicPeriodOption) => void })` — comportamento, textos e labels inalterados (`'Nome do Período *'`, `'Código / Sigla *'`, `'Ano Letivo *'`, botão `'Cadastrar e Selecionar'`; POST em `/api/v1/academic-periods`).

- [ ] **Step 1: Escrever o teste na nova localização**

```tsx
// @vitest-environment jsdom
// mock de AdaptiveModal igual ao de ClassFormModal.test.tsx (renderiza <h2>{title}</h2>{children} quando open)
import { PeriodCreateInlineModal } from '../PeriodCreateInlineModal';

it('cadastra o período com POST e devolve o período criado', async () => {
  const period = { id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, period }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  const onCreated = vi.fn(); const onOpenChange = vi.fn();
  render(<PeriodCreateInlineModal open onOpenChange={onOpenChange} onCreated={onCreated} />);
  fireEvent.change(screen.getByLabelText('Nome do Período *'), { target: { value: '2º Semestre / 2026 (2026.2)' } });
  fireEvent.change(screen.getByLabelText('Código / Sigla *'), { target: { value: '2026.2' } });
  fireEvent.change(screen.getByLabelText('Semestre / Módulo'), { target: { value: '2' } });
  fireEvent.click(screen.getByText('Cadastrar e Selecionar'));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(period));
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/v1/academic-periods');
  expect(JSON.parse(String(init.body))).toEqual({ name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, type: 'SEMESTER', semester: 2 });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('mostra o erro da API e não chama onCreated', async () => {
  // fetch → { success: false, error: 'Já existe um período letivo com o código 2026.2.' }, status 409
  // preencher nome e código, clicar 'Cadastrar e Selecionar'
  expect(await screen.findByText('Já existe um período letivo com o código 2026.2.')).toBeTruthy();
  expect(onCreated).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/classes/_components/__tests__/PeriodCreateInlineModal.test.tsx`
Expected: FAIL com `Failed to resolve import "../PeriodCreateInlineModal"`.

- [ ] **Step 3: Mover o arquivo e o tipo**

`git mv` do componente; no arquivo movido, trocar `import type { AcademicPeriodOption } from '../types'` pela declaração exportada da interface. Remover `AcademicPeriodOption` de `src/app/teacher/plans/new/types.ts`. Em `PlanHeaderControls.tsx` e `TeachingPlanNewPage.tsx`, importar `PeriodCreateInlineModal` e/ou `type AcademicPeriodOption` de `@/app/admin/classes/_components/PeriodCreateInlineModal`; nenhuma outra linha muda nesses arquivos (a página do professor deixa de usar o modal só na fase 3).

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npx vitest run src/app/admin/classes/_components/__tests__/PeriodCreateInlineModal.test.tsx && npx tsc --noEmit 2>&1 | grep -E "src/app/admin|src/app/teacher/plans/new"`
Expected: 2 testes PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/classes/_components/PeriodCreateInlineModal.tsx src/app/admin/classes/_components/__tests__/PeriodCreateInlineModal.test.tsx src/app/teacher/plans/new/_components/PeriodCreateInlineModal.tsx src/app/teacher/plans/new/types.ts src/app/teacher/plans/new/_components/PlanHeaderControls.tsx src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx
git commit -m "refactor(admin): move o cadastro inline de período letivo para a área de turmas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Turma com curso e período; coluna Curso na listagem

**Files:**
- Modify: `src/app/admin/classes/_components/ClassFormModal.tsx`
- Modify: `src/app/admin/classes/page.tsx`
- Modify: `src/app/admin/subjects/_components/SubjectFormModal.tsx` (só o `subtitle` de `classItems`, para compilar)
- Modify: `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx` (só a fixture `classes` e a asserção do subtítulo)
- Test: `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx` (reescrito)
- Test: `src/app/admin/classes/__tests__/page.test.tsx` (novo)

**Interfaces:**
- Consumes: `PeriodCreateInlineModal`, `AcademicPeriodOption` (Task 1); `CourseOption` **não** existe ainda — o modal declara o tipo mínimo local `type CourseChoice = { id: string; name: string; code: string }` para o select. GET `API_ROUTES.ADMIN_COURSES` → `{ success, courses }`; GET `API_ROUTES.ACADEMIC_PERIODS` → `{ success, periods }`; POST/PUT `API_ROUTES.ADMIN_CLASSES` → `{ success, class }` (`ClassPublic`, sem `_count`).
- Produces, em `ClassFormModal.tsx`:
  ```ts
  export interface ClassOption {
    id: string; name: string; code: string; semester: number;
    courseId: string; academicPeriodId: string;
    course: { id: string; name: string; code: string; academicLevel: string };
    academicPeriod: { id: string; name: string; code: string; year: number };
    _count?: { students: number; subjects: number };
  }
  export interface ClassFormModalProps { open: boolean; onOpenChange: (open: boolean) => void; editingClass: ClassOption | null; onSuccess: (klass: ClassOption) => void }
  ```
  (`year` sai.) Ids de campo: `class-name`, `class-code`, `class-course` (`<select>`), `class-period-combobox` (`AdvancedCombobox`), `class-semester` (`<Input type="number" min={1} max={12}>`).

- [ ] **Step 1: Reescrever `ClassFormModal.test.tsx`**

Mocks: `AdaptiveModal` como hoje; `@/components/ui/advanced-combobox` com o mock abaixo (reusado nas Tasks 5 e no teste de página), que respeita `id`, `disabled` e só mostra o botão de "novo" quando há `addNewLabel`:

```tsx
type Item = { id: string; title: string; subtitle?: string; badge?: string };
vi.mock('@/components/ui/advanced-combobox', () => ({
  AdvancedCombobox: ({ id, label, items, selectedId, onSelect, disabled, addNewLabel, onAddNewClick }: {
    id?: string; label?: string; items: Item[]; selectedId: string | null; onSelect: (id: string) => void;
    disabled?: boolean; addNewLabel?: string; onAddNewClick?: () => void;
  }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} disabled={disabled} value={selectedId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="">—</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.title}{i.subtitle ? ` | ${i.subtitle}` : ''}</option>)}
      </select>
      {addNewLabel && <button type="button" onClick={onAddNewClick}>{addNewLabel}</button>}
    </div>
  ),
  AdvancedMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));
```

Helper local de `fetch` por método + URL (o modal faz dois GETs ao abrir):

```ts
function routeFetch(handlers: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (!(key in handlers)) throw new Error(`fetch inesperado: ${key}`);
    return new Response(JSON.stringify(handlers[key]), { status: 200 });
  });
}
const courses = [
  { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
];
const periods = [{ id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026, semester: 1, type: 'SEMESTER' }];
const lists = { 'GET /api/v1/admin/courses': { success: true, courses }, 'GET /api/v1/academic-periods': { success: true, periods } };
const existing: ClassOption = {
  id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3,
  courseId: 'ccourse00001', academicPeriodId: 'cperiod0001',
  course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
  academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 },
  _count: { students: 1, subjects: 1 },
};
```

Testes (nomes e asserções):

- `'carrega cursos e períodos ao abrir, sem campo de ano'`: após `await screen.findByText('ADS · Análise e Desenvolvimento de Sistemas')`, as opções de `getByLabelText('Curso')` são `['Selecione o curso', 'ADS · Análise e Desenvolvimento de Sistemas', 'EM · Ensino Médio']`; `getByLabelText('Período letivo')` tem a opção `cperiod0001`; `queryByLabelText('Ano letivo')` é `null`; `getByText('Ex.: 3 para 3º semestre ou 3º ano')` existe; `getByLabelText('Posição na matriz')` existe.
- `'cria com POST enviando curso, período e posição, sem year'`: `fetch` = `routeFetch({ ...lists, 'POST /api/v1/admin/classes': { success: true, class: { ...existing, id: 'cclass00009' } } })`; preencher Nome `'Turma Nova'`, Código `'EM-2026-2A'`, Curso `ccourse00002`, Período letivo `cperiod0001`, Posição `'2'`; clicar `'Salvar turma'`; body do POST `toEqual({ name: 'Turma Nova', code: 'EM-2026-2A', courseId: 'ccourse00002', academicPeriodId: 'cperiod0001', semester: 2 })`; `onSuccess` chamado com a turma; `onOpenChange(false)`.
- `'em edição o PUT sempre envia id, curso, período e posição'`: abrir com `existing`, esperar as listas, clicar `'Atualizar turma'` sem mexer em nada; body do PUT `toEqual({ id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', courseId: 'ccourse00001', academicPeriodId: 'cperiod0001', semester: 3 })`.
- `'sem curso mostra "Selecione o curso" e não envia'`: preencher nome, código e período, sem curso; clicar salvar; `findByRole('alert')` com texto `'Selecione o curso'`; nenhuma chamada com método `POST`. Idem período ausente → `'Selecione o período letivo'` (mesmas mensagens do `createClassSchema`).
- `'"Cadastrar novo período..." abre o cadastro e seleciona o período criado'` (Review Focus 4): handlers incluem `'POST /api/v1/academic-periods': { success: true, period: { id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026, semester: 2, type: 'SEMESTER' } }` e `'POST /api/v1/admin/classes'`; clicar `'Cadastrar novo período...'`, preencher `'Nome do Período *'` e `'Código / Sigla *'`, clicar `'Cadastrar e Selecionar'`; `await waitFor` → `(getByLabelText('Período letivo') as HTMLSelectElement).value === 'cperiod0002'`; o `onSuccess` **não** foi chamado (o submit do modal de período não dispara o formulário da turma); preencher o resto, salvar; body do POST da turma tem `academicPeriodId: 'cperiod0002'`.
- `'mostra o 409 ao trocar o curso de turma com ofertas'` (Review Focus 3): editar `existing`, trocar Curso para `ccourse00002`, PUT responde `{ success: false, error: 'A turma tem ofertas; não é possível trocar o curso.' }`; alerta com esse texto; `onSuccess` e `onOpenChange` não chamados.
- `'limpa o erro ao reabrir'`: provocar o 409 acima; `rerender` com `open={false}` e depois `open`; `queryByRole('alert')` é `null`.

- [ ] **Step 2: Escrever `src/app/admin/classes/__tests__/page.test.tsx`**

Mocks: `@/components/layout/provider-badge` → `{ ProviderBadge: () => null }`; `AdaptiveModal` (null quando fechado). `fetch` → `GET /api/v1/admin/classes` = `{ success: true, classes: [existing] }`.

`'mostra curso, período letivo e posição da turma'`: após `findByText('3º Semestre · ADS')`, os textos de `getAllByRole('columnheader')` são `['Nome', 'Código', 'Curso', 'Período letivo', 'Posição', 'Alunos', 'Ofertas', 'Ações']`; `within(getAllByRole('row')[1])` tem `getByText('ADS')`, `getByText('2026.1')` e `getByText('3')`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/classes`
Expected: FAIL (labels `Curso`/`Período letivo`/`Posição na matriz` inexistentes; body com `year`; cabeçalho `Semestre`).

- [ ] **Step 4: Implementar `ClassFormModal`**

- Estado: `name`, `code`, `courseId: string` (`''` = nenhum), `academicPeriodId: string | null`, `semester: string`, `courses: CourseChoice[]`, `periods: AcademicPeriodOption[]`, `isPeriodModalOpen`, `error`, `loading`.
- Efeito de abertura `[open, editingClass]`: limpa erro; preenche a partir de `editingClass` (`courseId`, `academicPeriodId`, `String(semester)`) ou zera (`semester '1'`).
- Efeito de listas `[open]`: quando `open`, `Promise.all` de `fetch(API_ROUTES.ADMIN_COURSES)` e `fetch(API_ROUTES.ACADEMIC_PERIODS)`; em falha ou `success: false`, `setError('Não foi possível carregar cursos e períodos.')`. Guardar flag `cancelled` no cleanup.
- Campos, nesta ordem: "Nome da turma", "Código", "Curso" (`<select id="class-course">` com `<option value="">Selecione o curso</option>` e `${c.code} · ${c.name}`), "Período letivo" (`AdvancedCombobox id="class-period-combobox" label="Período letivo" placeholder="Selecione o período letivo"`, itens `{ id, title: p.name, badge: p.code }`, `addNewLabel="Cadastrar novo período..."`, `onAddNewClick` abre o modal de período), "Posição na matriz" (`<Label htmlFor="class-semester">`, input numérico 1–12, ajuda `<p>` `'Ex.: 3 para 3º semestre ou 3º ano'`).
- Submit: sem `courseId` → `setError('Selecione o curso')`; sem `academicPeriodId` → `setError('Selecione o período letivo')`; ambos sem `fetch`. Body: `{ ...(editingClass ? { id } : {}), name, code, courseId, academicPeriodId, semester: Number(semester) }`.
- `PeriodCreateInlineModal` como irmão do `AdaptiveModal` (fragmento), com `onCreated={(p) => { setPeriods((prev) => [...prev.filter((x) => x.id !== p.id), p]); setAcademicPeriodId(p.id); }}`.

- [ ] **Step 5: Ajustar `classes/page.tsx` e o subtítulo de turma na oferta**

- Página: cabeçalhos `Nome | Código | Curso | Período letivo | Posição | Alunos | Ofertas | Ações` (`colSpan={8}` nas linhas de estado); células `klass.course.code`, `klass.academicPeriod.code`, `klass.semester`, `_count.students`, `_count.subjects`. Remover o cast `(klass as { academicPeriod?: ... })` e o `?? '—'`. Busca: nome, código ou `course.code` (placeholder `'Buscar por nome, código ou curso...'`). Subtítulo do cabeçalho: `'Turmas de cada curso por período letivo.'`.
- `SubjectFormModal.tsx`: `subtitle: \`${c.course.code} · ${c.academicPeriod.code}\`` (o resto do modal muda na Task 5). Em `SubjectFormModal.test.tsx`, a fixture `classes` passa a ter o formato novo de `ClassOption` (copiar `existing` acima com `id: 'c1'`) e a opção esperada vira `'3º Semestre · ADS | ADS · 2026.1 | ADS-2026-3A'`; a turma `nova` do último teste ganha os mesmos campos.

- [ ] **Step 6: Rodar testes e typecheck**

Run: `npx vitest run src/app/admin && npx tsc --noEmit 2>&1 | grep -E "src/app/admin|src/app/teacher/plans/new"`
Expected: PASS em `ClassFormModal.test.tsx`, `classes/__tests__/page.test.tsx`, `PeriodCreateInlineModal.test.tsx` e `SubjectFormModal.test.tsx` (8, com a fixture nova); grep sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/classes/_components/ClassFormModal.tsx src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx src/app/admin/classes/page.tsx src/app/admin/classes/__tests__/page.test.tsx src/app/admin/subjects/_components/SubjectFormModal.tsx src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx
git commit -m "feat(admin): turma com curso, período letivo e posição na matriz

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Cursos — página e `CourseFormModal`

**Files:**
- Create: `src/app/admin/courses/_components/CourseFormModal.tsx`
- Create: `src/app/admin/courses/page.tsx`
- Test: `src/app/admin/courses/_components/__tests__/CourseFormModal.test.tsx`

**Interfaces:**
- Consumes: GET/POST/PUT `API_ROUTES.ADMIN_COURSES`. GET → `{ success, courses: { id, name, code, academicLevel, _count: { disciplines, classes } }[] }` (ordem `name asc`). POST body = `createCourseSchema` (`{ name, code, academicLevel }`); PUT = `updateCourseSchema` (`+ id`). Erros: `'Informe o nome do curso'`, `'Informe o código do curso'`, 409 `'Já existe um curso com este código.'`, 404 `'Curso não encontrado.'`.
- Produces, em `CourseFormModal.tsx` (usados pela Task 4):
  ```ts
  export type AcademicLevelValue = 'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY';
  export const ACADEMIC_LEVEL_LABELS: Record<AcademicLevelValue, string> =
    { HIGHER_EDUCATION: 'Ensino Superior', HIGH_SCHOOL: 'Ensino Médio', ELEMENTARY: 'Ensino Fundamental' };
  export interface CourseOption { id: string; name: string; code: string; academicLevel: AcademicLevelValue; _count?: { disciplines: number; classes: number } }
  export interface CourseFormModalProps { open: boolean; onOpenChange: (open: boolean) => void; editingCourse: CourseOption | null; onSuccess: () => void }
  export function CourseFormModal(props: CourseFormModalProps)
  ```
  Campos: "Nome do curso" (`course-name`), "Código" (`course-code`), "Nível acadêmico" (`<select id="course-academic-level">`, opções na ordem de `ACADEMIC_LEVEL_LABELS`). Título `'Novo curso'`/`'Editar curso'`, descrição `'Informe os dados do curso.'`, botões `'Salvar curso'`/`'Atualizar curso'`, fallback `'Erro ao salvar curso.'`.

- [ ] **Step 1: Escrever o teste**

Mock de `AdaptiveModal` com título. `fetchOk(body)` como em `ClassFormModal.test.tsx`.

- `'cria o curso com POST enviando nome, código e nível'`: título `'Novo curso'`; opções de `'Nível acadêmico'` = `['Ensino Superior', 'Ensino Médio', 'Ensino Fundamental']` e valor inicial `'HIGHER_EDUCATION'`; preencher `'Ensino Médio'`, `'EM'`, `HIGH_SCHOOL`; `'Salvar curso'`; URL `'/api/v1/admin/courses'`, método `POST`, body `toEqual({ name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' })`; `onSuccess` e `onOpenChange(false)` chamados.
- `'em edição o PUT sempre envia o nível acadêmico'`: `editingCourse = { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' }`; título `'Editar curso'`; select com valor `'HIGH_SCHOOL'`; clicar `'Atualizar curso'` sem mudar nada; body `toEqual({ id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' })`.
- `'mostra o erro da API e mantém o modal aberto'`: `{ success: false, error: 'Já existe um curso com este código.' }` → alerta com o texto; `onSuccess`/`onOpenChange` não chamados.
- `'limpa o erro ao reabrir'`: após o erro, `rerender` fechado e aberto com `editingCourse` → `queryByRole('alert')` é `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/courses`
Expected: FAIL com `Failed to resolve import "../CourseFormModal"`.

- [ ] **Step 3: Implementar `CourseFormModal`**

No padrão de `ClassFormModal` (Global Constraints). Body: `{ ...(editingCourse ? { id } : {}), name, code, academicLevel }`; sucesso quando `data.success`.

- [ ] **Step 4: Implementar `src/app/admin/courses/page.tsx`**

`export default function AdminCoursesPage()`, cópia estrutural de `classes/page.tsx`: Badge `'Etapa 0 • Cursos'` + `ProviderBadge`; título `'Cursos'`; subtítulo `'Cursos da instituição e seu nível acadêmico.'`; botão `'Novo curso'` (ícone `Plus`); busca `'Buscar por nome ou código...'` (nome ou código); colunas `Nome | Código | Nível | Disciplinas | Turmas | Ações` (Nível = `ACADEMIC_LEVEL_LABELS[c.academicLevel]`; contagens de `_count`); ação `'Editar'`. Estados: `'Não foi possível carregar os cursos. Tente novamente.'` (com `'Tentar novamente'`), `'Carregando cursos...'`, `'Nenhum curso cadastrado.'`. `onSuccess={fetchCourses}`.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npx vitest run src/app/admin/courses && npx tsc --noEmit 2>&1 | grep -E "src/app/admin"`
Expected: 4 testes PASS; grep sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/courses
git commit -m "feat(admin): página e formulário de cursos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Disciplinas da matriz — página com filtro por curso e `DisciplineFormModal`

**Files:**
- Create: `src/app/admin/disciplines/_components/DisciplineFormModal.tsx`
- Create: `src/app/admin/disciplines/page.tsx`
- Test: `src/app/admin/disciplines/_components/__tests__/DisciplineFormModal.test.tsx`

**Interfaces:**
- Consumes: `CourseOption` de `@/app/admin/courses/_components/CourseFormModal` (Task 3). GET `API_ROUTES.ADMIN_DISCIPLINES` → `{ success, disciplines: { id, courseId, code, name, description, workloadHours, course: { id, name, code }, _count: { offerings } }[] }` (ordem `code asc`). POST = `createDisciplineSchema` (`{ courseId, code, name, description?, workloadHours }`); PUT = `updateDisciplineSchema` (`{ id, code, name, description?, workloadHours }`, sem `courseId`). Erros: `'Informe o código da disciplina'`, `'Informe o nome da disciplina'`, `'A carga horária deve ser maior que zero'`, `'Informe no máximo 1000 horas'`, 404 `'Curso não encontrado.'`, 409 `'Já existe uma disciplina com este código neste curso.'`.
- Produces, em `DisciplineFormModal.tsx` (usado pela Task 5 só como referência de forma):
  ```ts
  export interface DisciplineOption {
    id: string; courseId: string; code: string; name: string; description: string | null; workloadHours: number;
    course: { id: string; name: string; code: string }; _count?: { offerings: number };
  }
  export interface DisciplineFormModalProps {
    open: boolean; onOpenChange: (open: boolean) => void; editingDiscipline: DisciplineOption | null;
    courses: CourseOption[]; defaultCourseId: string | null; onSuccess: () => void;
  }
  ```
  Campos: "Curso" (`<select id="discipline-course">`, `<option value="">Selecione o curso</option>` + `${c.code} · ${c.name}`, `disabled` na edição), "Código" (`discipline-code`), "Nome da disciplina" (`discipline-name`), "Carga horária (h)" (`discipline-workload`, `type="number" min={1} max={1000}`), "Descrição (opcional)" (`Textarea` de `@/components/ui/textarea`, id `discipline-description`). Título `'Nova disciplina'`/`'Editar disciplina'`, descrição `'Disciplina da matriz curricular do curso.'`, botões `'Salvar disciplina'`/`'Atualizar disciplina'`, fallback `'Erro ao salvar disciplina.'`.

- [ ] **Step 1: Escrever o teste**

Fixtures: `const courses: CourseOption[]` = os dois cursos da Task 2 (`ADS`/`HIGHER_EDUCATION`, `EM`/`HIGH_SCHOOL`), tipados para o literal de `academicLevel` passar; `editing: DisciplineOption = { id: 'cdiscip0001', courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I', description: null, workloadHours: 80, course: { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' } }`.

- `'pré-seleciona o curso do filtro ativo'`: `defaultCourseId='ccourse00002'` → `getByLabelText('Curso').value === 'ccourse00002'` e o select não está `disabled`; com `defaultCourseId={null}` o valor é `''`.
- `'cria com POST enviando curso, código, nome, carga horária numérica e descrição'`: curso `ccourse00001`, `'BD101'`, `'Banco de Dados I'`, carga `'80'`, descrição vazia; `'Salvar disciplina'`; URL `'/api/v1/admin/disciplines'`, `POST`, body `toEqual({ courseId: 'ccourse00001', code: 'BD101', name: 'Banco de Dados I', workloadHours: 80, description: '' })`.
- `'sem curso mostra "Selecione o curso" e não envia'`: alerta `'Selecione o curso'`; `fetch` não chamado.
- `'em edição o curso fica desabilitado e o PUT não envia courseId'`: `getByLabelText('Curso')` com valor `'ccourse00001'` e `disabled === true`; `getByLabelText('Carga horária (h)').value === '80'`; clicar `'Atualizar disciplina'`; body `toEqual({ id: 'cdiscip0001', code: 'BD101', name: 'Banco de Dados I', workloadHours: 80, description: '' })`.
- `'mostra o 409 da API e limpa ao reabrir'`: `{ success: false, error: 'Já existe uma disciplina com este código neste curso.' }` → alerta; `rerender` fechado/aberto → sem alerta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/disciplines`
Expected: FAIL com `Failed to resolve import "../DisciplineFormModal"`.

- [ ] **Step 3: Implementar `DisciplineFormModal`**

Efeito `[open, editingDiscipline, defaultCourseId]`: na edição preenche dos dados (`description ?? ''`, `String(workloadHours)`); na criação `courseId = defaultCourseId ?? ''`, demais vazios. Submit: sem `courseId` (só na criação) → `'Selecione o curso'` sem `fetch`. Body POST `{ courseId, code, name, workloadHours: Number(workloadHours), description: description.trim() }`; PUT `{ id, code, name, workloadHours: Number(workloadHours), description: description.trim() }` (descrição sempre enviada para que apagar o texto persista).

- [ ] **Step 4: Implementar `src/app/admin/disciplines/page.tsx`**

`export default function AdminDisciplinesPage()`. Carrega em `Promise.all` `GET API_ROUTES.ADMIN_DISCIPLINES` (sem query) e `GET API_ROUTES.ADMIN_COURSES`. Filtro `<select id="discipline-course-filter">` com `<Label>` `'Curso'`, opção `''` = `'Todos'` + `${c.code} · ${c.name}`; filtragem no cliente: `courseFilter ? disciplines.filter((d) => d.courseId === courseFilter) : disciplines`. Badge `'Etapa 0 • Matriz curricular'`; título `'Disciplinas'`; subtítulo `'Disciplinas da matriz curricular de cada curso.'`; botão `'Nova disciplina'`; colunas `Código | Nome | Curso | Carga horária | Ofertas | Ações` (`d.course.code`, `${d.workloadHours} h`, `d._count.offerings`); ação `'Editar'`. Modal com `courses`, `defaultCourseId={courseFilter || null}`, `onSuccess={fetchData}`. Estados: `'Não foi possível carregar disciplinas e cursos. Tente novamente.'`, `'Carregando disciplinas...'`, `'Nenhuma disciplina cadastrada.'`.

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npx vitest run src/app/admin/disciplines && npx tsc --noEmit 2>&1 | grep -E "src/app/admin"`
Expected: 5 testes PASS; grep sem saída.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/disciplines
git commit -m "feat(admin): página e formulário de disciplinas da matriz curricular

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Oferta — `SubjectFormModal` e página de ofertas

**Files:**
- Modify: `src/app/admin/subjects/_components/SubjectFormModal.tsx`
- Modify: `src/app/admin/subjects/page.tsx`
- Test: `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx` (reescrito)
- Test: `src/app/admin/subjects/__tests__/page.test.tsx` (novo)

**Interfaces:**
- Consumes: `ClassOption`, `ClassFormModal` (Task 2); `DisciplineOption` (Task 4, só a forma: `{ id, courseId, code, name, workloadHours }` é o que o modal lê); `Teacher`, `TeacherCreateModal` (sem mudança). GET `` `${API_ROUTES.ADMIN_DISCIPLINES}?courseId=${encodeURIComponent(courseId)}` `` → `{ success, disciplines }`. GET `API_ROUTES.ADMIN_SUBJECTS` → `{ success, subjects }` com `discipline`, `class: { ...course, academicPeriod }`, `teacherAssignments: { teacher }[]`, `teachingPlans: { id, status, updatedAt }[]`. POST = `createOfferingSchema` `{ classId, disciplineId, teacherIds }`; PUT = `updateOfferingSchema` `{ id, teacherIds }`. Ambos devolvem `{ success, subject }` só com `teacherAssignments` → a página refaz o GET. Erros: `'Selecione a turma'`, `'Selecione a disciplina'`, 400 `'A disciplina não pertence ao curso da turma.'`, 409 `'Esta disciplina já é ofertada nesta turma.'`, 404 `'Turma não encontrada.'`/`'Disciplina não encontrada.'`/`'Oferta não encontrada.'`.
- Produces, em `SubjectFormModal.tsx` (substitui `SubjectItem`, que sai):
  ```ts
  export interface OfferingItem {
    id: string;
    discipline: { id: string; code: string; name: string; workloadHours: number };
    class: { id: string; name: string; code: string; courseId: string;
             course: { id: string; name: string; code: string }; academicPeriod: { id: string; name: string; code: string } };
    teacherAssignments: { teacher: Teacher }[];
    teachingPlans: { id: string; status: string }[];
  }
  interface SubjectFormModalProps {
    open: boolean; onOpenChange: (open: boolean) => void; editingSubject: OfferingItem | null;
    teachers: Teacher[]; classes: ClassOption[];
    selectedTeachers: string[]; setSelectedTeachers: React.Dispatch<React.SetStateAction<string[]>>;
    selectedClassId: string | null; setSelectedClassId: (id: string | null) => void;
    onSuccess: () => void; onRequestCreateTeacher: () => void; onRequestCreateClass: () => void;
  }
  ```
  Saem `NO_CLASS_ID`, `AcademicLevel`, Nome, Código, Curso, Nível e o texto `'Ano letivo e semestre vêm da turma selecionada.'`.

- [ ] **Step 1: Reescrever `SubjectFormModal.test.tsx`**

Mocks: `AdaptiveModal` com título; o mock de `advanced-combobox` da Task 2 (com `id`, `disabled`, opção `''`). Um `Harness` local guarda `selectedClassId`/`selectedTeachers` em `useState` e repassa ao modal (para que escolher a turma mude a prop), expondo `onSuccess`/`onOpenChange` como `vi.fn()`. Fixtures:

```ts
const ads = { id: 'ccourse00001', name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' };
const em  = { id: 'ccourse00002', name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' };
const p1  = { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 };
const classes: ClassOption[] = [
  { id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, courseId: ads.id, academicPeriodId: p1.id, course: ads, academicPeriod: p1 },
  { id: 'cclass00002', name: '1º Ano · EM', code: 'EM-2026-1A', semester: 1, courseId: em.id, academicPeriodId: p1.id, course: em, academicPeriod: p1 },
];
const bd  = { id: 'cdiscip0001', courseId: ads.id, code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 };
const mat = { id: 'cdiscip0002', courseId: em.id,  code: 'MAT1',  name: 'Matemática I',     workloadHours: 120 };
// routeFetch da Task 2; GET '/api/v1/admin/disciplines?courseId=ccourse00001' → { success: true, disciplines: [bd, mat] } (mat simula resposta suja)
// GET '/api/v1/admin/disciplines?courseId=ccourse00002' → { success: true, disciplines: [mat] }
```

Testes:

- `'lista as turmas com curso e período, sem "Sem turma"'`: título `'Nova oferta'`; opções de `'Turma'` = `['—', '3º Semestre · ADS | ADS · 2026.1', '1º Ano · EM | EM · 2026.1']`; `queryByLabelText('Nome da Disciplina')`, `queryByLabelText('Nível acadêmico')` e `queryByLabelText('Curso')` são `null`.
- `'Disciplina fica desabilitada até escolher a turma'`: `getByLabelText('Disciplina').disabled === true`; nenhum `fetch` feito.
- `'lista só disciplinas do curso da turma'` (Review Focus 2): escolher `cclass00001`; `fetch` chamado com `'/api/v1/admin/disciplines?courseId=ccourse00001'`; `await waitFor` → opções de `'Disciplina'` = `['—', 'BD101 · Banco de Dados I | 80 h']` (sem `MAT1`) e o select habilitado.
- `'trocar a turma limpa a disciplina e recarrega pelo curso novo'` (Review Focus 1): escolher `cclass00001`, esperar, escolher `cdiscip0001`; escolher `cclass00002`; `getByLabelText('Disciplina').value === ''`; `fetch` chamado com `'?courseId=ccourse00002'`; opções = `['—', 'MAT1 · Matemática I | 120 h']`.
- `'cria com POST { classId, disciplineId, teacherIds } e avisa a página sem dados'`: turma `cclass00001`, disciplina `cdiscip0001`, `'Salvar oferta'`; `'POST /api/v1/admin/subjects'` → `{ success: true, subject: { id: 'csubject001', teacherAssignments: [] } }`; body `toEqual({ classId: 'cclass00001', disciplineId: 'cdiscip0001', teacherIds: [] })`; `onSuccess` `toHaveBeenCalledWith()` (sem argumento); `onOpenChange(false)`.
- `'sem disciplina mostra "Selecione a disciplina" e não envia'`: só a turma; alerta `'Selecione a disciplina'`; nenhum `POST`. Sem turma → `'Selecione a turma'`.
- `'oferta duplicada mostra o 409 e mantém as escolhas'` (Review Focus 5): POST → `{ success: false, error: 'Esta disciplina já é ofertada nesta turma.' }`; alerta com o texto; `getByLabelText('Turma').value === 'cclass00001'` e `getByLabelText('Disciplina').value === 'cdiscip0001'`; `onSuccess` não chamado.
- `'em edição só professores mudam e o PUT envia { id, teacherIds }'`: `editingSubject = { id: 'csubject001', discipline: bd, class: { ...classes[0] }, teacherAssignments: [{ teacher: { id: 'cteacher001', name: 'Profa. Ana', email: 'ana@x.br', enrollment: 'P001' } }], teachingPlans: [] }`; título `'Editar oferta'`; `getByLabelText('Turma')` com valor `'cclass00001'` e `disabled`; `getByLabelText('Disciplina')` com valor `'cdiscip0001'`, `disabled`, opção `'BD101 · Banco de Dados I | 80 h'`; `queryByText('+ Nova turma...')` é `null`; nenhum GET de disciplinas; `'Atualizar oferta'`; body do PUT `toEqual({ id: 'csubject001', teacherIds: ['cteacher001'] })`.
- `'"+ Nova turma..." chama onRequestCreateClass'` e `'limpa o erro ao reabrir'`: mantidos do teste atual, adaptados aos textos novos.

- [ ] **Step 2: Escrever `src/app/admin/subjects/__tests__/page.test.tsx`**

Mocks: `provider-badge` → `null`; `AdaptiveModal` com título; `advanced-combobox` da Task 2. `fetch` por rota: `GET /api/v1/admin/subjects` → `{ success: true, subjects: [offering] }` (o `editingSubject` do Step 1 com `teachingPlans: [{ id: 'cplan000001', status: 'DRAFT' }]`), `GET /api/v1/admin/teachers` → `{ success: true, teachers: [ana] }`, `GET /api/v1/admin/classes` → `{ success: true, classes }`, `PUT /api/v1/admin/subjects` → `{ success: true, subject: { id: 'csubject001', teacherAssignments: [] } }`.

- `'lista disciplina, turma, curso, período, professores e planos'`: cabeçalhos `['Disciplina', 'Turma', 'Curso', 'Período', 'Professores', 'Planos', 'Ações']`; `within(getAllByRole('row')[1])` tem `'BD101 · Banco de Dados I'`, `'3º Semestre · ADS'`, `'ADS'`, `'2026.1'`, `'Profa. Ana'` e `'1'` (as KPIs também mostram `1`, por isso o `within`); `queryByText('Nível Acadêmico')` é `null`; botão `'Nova oferta'` existe.
- `'Editar abre a oferta e, ao salvar, recarrega a lista'`: botão `'Editar'` não está `disabled`; clicar → `'Editar oferta'`; clicar `'Atualizar oferta'`; `await waitFor` → chamadas `GET /api/v1/admin/subjects` = 2.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/app/admin/subjects`
Expected: FAIL (labels de Nome/Curso ainda presentes; `'Nova oferta'` inexistente; `Editar` desabilitado).

- [ ] **Step 4: Implementar `SubjectFormModal` como oferta**

- Estado local: `disciplineId: string | null`, `disciplines: { id: string; courseId: string; code: string; name: string; workloadHours: number }[]`, `error`, `loading`.
- Efeito de abertura `[open, editingSubject, setSelectedClassId, setSelectedTeachers]` (setters estáveis, listados para o `exhaustive-deps`): limpa erro; edição → `setSelectedClassId(editingSubject.class.id)`, `setDisciplineId(editingSubject.discipline.id)`, `setSelectedTeachers(ids dos teacherAssignments)`; criação → `setSelectedClassId(null)`, `setDisciplineId(null)`, `setSelectedTeachers([])`. (O teste `'mantém ... turma nova'` de hoje sai: o modal não tem mais campo digitado.)
- Disciplinas da turma (o que o teste e a assinatura não determinam):

```ts
const courseId = classes.find((c) => c.id === selectedClassId)?.courseId ?? null;

React.useEffect(() => {
  if (!open || editingSubject) return;
  setDisciplineId(null);          // trocar de turma sempre limpa a disciplina
  setDisciplines([]);
  if (!courseId) return;
  let cancelled = false;
  fetch(`${API_ROUTES.ADMIN_DISCIPLINES}?courseId=${encodeURIComponent(courseId)}`)
    .then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      if (data.success) setDisciplines(data.disciplines);
      else setError(data.error || 'Não foi possível carregar as disciplinas do curso.');
    })
    .catch(() => { if (!cancelled) setError('Não foi possível carregar as disciplinas do curso.'); });
  return () => { cancelled = true; };
}, [open, editingSubject, selectedClassId, courseId]);

const disciplineItems: ComboboxItem[] = editingSubject
  ? [toItem(editingSubject.discipline)]
  : disciplines.filter((d) => d.courseId === courseId).map(toItem);   // filtro defensivo
// toItem = (d) => ({ id: d.id, title: `${d.code} · ${d.name}`, subtitle: `${d.workloadHours} h` })
```

  `courseId` na dependência cobre a turma criada inline: a página seleciona o id antes de a lista de turmas recarregar; quando a turma chega, o efeito roda de novo e busca as disciplinas.
- Campos, nesta ordem: Turma (`AdvancedCombobox id="subject-class-combobox" label="Turma" placeholder="Selecione a turma"`, itens `{ id, title: c.name, subtitle: \`${c.course.code} · ${c.academicPeriod.code}\`, badge: c.code }`, `disabled={Boolean(editingSubject)}`, `addNewLabel="+ Nova turma..."` só na criação); Disciplina (`id="subject-discipline-combobox" label="Disciplina"`, `placeholder={selectedClassId ? 'Selecione a disciplina' : 'Escolha a turma primeiro'}`, `emptyMessage="Nenhuma disciplina cadastrada para este curso."`, `disabled={!selectedClassId || Boolean(editingSubject)}`); Professores (`AdvancedMultiCombobox label="Professores"`, demais props como hoje).
- Submit: criação sem turma → `'Selecione a turma'`; sem disciplina → `'Selecione a disciplina'` (sem `fetch`). Body POST `{ classId: selectedClassId, disciplineId, teacherIds: selectedTeachers }`; PUT `{ id: editingSubject.id, teacherIds: selectedTeachers }`. Sucesso: `onOpenChange(false); onSuccess();`. Fallback `'Erro ao salvar oferta.'`.
- Título `'Nova oferta'`/`'Editar oferta'`; descrição `'Escolha a turma, uma disciplina do curso da turma e os professores.'`; botões `'Salvar oferta'`/`'Atualizar oferta'`.

- [ ] **Step 5: Reescrever a listagem em `subjects/page.tsx`**

- Remover o tipo local `OfferingRow`, o import de `SubjectItem` e qualquer cast; `subjects: OfferingItem[]`, `editingSubject: OfferingItem | null` (agora usado).
- Cabeçalho: Badge `'Etapa 0 • Ofertas'`; título `'Ofertas'`; subtítulo `'Disciplinas da matriz ofertadas em cada turma, com os professores alocados.'`; botões `'+ Cadastrar Novo Professor'` (como hoje) e `'Nova oferta'` (ícone `Plus`).
- KPIs, todos derivados da lista: `'Ofertas cadastradas'` (`subjects.length`), `'Ofertas sem professor'` (`teacherAssignments.length === 0`), `'Professores alocados'` (ids distintos, como hoje). Sai `'Com turma vinculada'` (toda oferta tem turma).
- Busca `'Buscar por disciplina, turma ou curso...'`: `discipline.code`, `discipline.name`, `class.name`, `class.course.code`, `class.course.name`.
- Colunas `Disciplina | Turma | Curso | Período | Professores | Planos | Ações` (`colSpan={7}`): `` `${discipline.code} · ${discipline.name}` ``; `class.name` + `class.code` em mono; `class.course.code`; `class.academicPeriod.code`; badges de professor ou `'Sem professor'`; `teachingPlans.length`. Sai a coluna `'Nível Acadêmico'` com o `{'—'}` e o ramo `'Sem turma'`.
- Ação `'Editar'` habilitada (sem `disabled`/`title`): `handleOpenEditModal(sub)` faz `setEditingSubject(sub)`, `setSelectedTeachers(ids)`, `setSelectedClassId(sub.class.id)`, `setIsModalOpen(true)`.
- Estados: `'Não foi possível carregar ofertas, professores e turmas. Tente novamente.'`, `'Carregando ofertas...'`, `'Nenhuma oferta cadastrada.'`. `onSuccess={fetchSubjectData}` (refaz o GET). `ClassFormModal` e `TeacherCreateModal` seguem irmãos, como hoje.

- [ ] **Step 6: Rodar testes e typecheck**

Run: `npx vitest run src/app/admin && npx tsc --noEmit 2>&1 | grep -E "src/app/admin"`
Expected: PASS em todos os arquivos de `src/app/admin`; grep sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/subjects/_components/SubjectFormModal.tsx src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx src/app/admin/subjects/page.tsx src/app/admin/subjects/__tests__/page.test.tsx
git commit -m "feat(admin): ofertas com turma, disciplina do curso e professores; edição habilitada

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Menu admin com Cursos, Disciplinas, Turmas e Ofertas

**Files:**
- Modify: `src/components/layout/nav-links.ts` (`ADMIN_LINKS` e imports de ícone)
- Test: `src/components/layout/__tests__/nav-links.test.ts`

**Interfaces:**
- Consumes: `ROUTES.ADMIN_COURSES`, `ROUTES.ADMIN_DISCIPLINES`, `ROUTES.ADMIN_CLASSES`, `ROUTES.ADMIN_SUBJECTS`, `ROUTES.APPLIANCE`; ícones `GraduationCap`, `Library`, `Users`, `BookMarked` de `lucide-react` (existem na versão instalada).
- Produces: `ADMIN_LINKS = [Cursos, Disciplinas, Turmas, Ofertas, Telemetria, ...TEACHER_LINKS]`.

- [ ] **Step 1: Atualizar o teste**

Substituir `'admin vê gestão seguida da lista completa do professor'` por:

```ts
it('admin vê Cursos, Disciplinas, Turmas, Ofertas e Telemetria, seguidos da lista do professor', () => {
  expect(labels(Role.ADMIN)).toEqual(['Cursos', 'Disciplinas', 'Turmas', 'Ofertas', 'Telemetria', ...labels(Role.TEACHER)]);
  expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 5).map((l) => l.href)).toEqual([
    ROUTES.ADMIN_COURSES, ROUTES.ADMIN_DISCIPLINES, ROUTES.ADMIN_CLASSES, ROUTES.ADMIN_SUBJECTS, ROUTES.APPLIANCE,
  ]);
  expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 4).map((l) => l.icon)).toEqual([GraduationCap, Library, Users, BookMarked]);
});
```

(importar os quatro ícones de `lucide-react` no teste). O teste `'só lista rotas que o papel pode acessar'` passa a cobrir `/admin/courses` e `/admin/disciplines` sem mudança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/layout/__tests__/nav-links.test.ts`
Expected: FAIL no caso do admin (`['Disciplinas', 'Turmas', 'Telemetria', ...]`).

- [ ] **Step 3: Atualizar `ADMIN_LINKS`**

`{ href: ROUTES.ADMIN_COURSES, label: 'Cursos', icon: GraduationCap }`, `{ href: ROUTES.ADMIN_DISCIPLINES, label: 'Disciplinas', icon: Library }`, `{ href: ROUTES.ADMIN_CLASSES, label: 'Turmas', icon: Users }`, `{ href: ROUTES.ADMIN_SUBJECTS, label: 'Ofertas', icon: BookMarked }`, Telemetria e `...TEACHER_LINKS` como hoje.

- [ ] **Step 4: Rodar testes do layout e typecheck**

Run: `npx vitest run src/components/layout src/app/__tests__ && npx tsc --noEmit 2>&1 | grep -E "src/components/layout"`
Expected: PASS (inclui `app-header.test.tsx` e `area-layouts.test.tsx`, que usam só `ROUTES.ADMIN_SUBJECTS`); grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/nav-links.ts src/components/layout/__tests__/nav-links.test.ts
git commit -m "feat(admin): menu com cursos, disciplinas, turmas e ofertas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Gate final da fase 2

**Files:** nenhum (só verificação; correções voltam para a task dona do arquivo).

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: código 0, sem `error TS`.

- [ ] **Step 2: Suíte completa**

Run: `npm test`
Expected: PASS. Se só o fallback CLASSROOM de `src/app/api/v1/agent/chat/__tests__/route.test.ts` falhar, rodar `npx vitest run src/app/api/v1/agent/chat` até passar.

- [ ] **Step 3: Lint**

Run: `npx next lint`
Expected: `✔ No ESLint warnings or errors` (ou só avisos pré-existentes fora dos arquivos desta fase).

- [ ] **Step 4: Nenhum resto do formulário antigo**

Run: `grep -rnE "courseName|academicYear|NO_CLASS_ID|SubjectItem|Nível Acadêmico|fase 2" src/app/admin`
Expected: sem saída.

- [ ] **Step 5: Árvore limpa**

Run: `git status --short`
Expected: só `package.json`, `package-lock.json` e `.mcp.json` pendentes.

- [ ] **Step 6: Checklist manual para o usuário (navegador, logado como admin, `npm run dev`)**

1. Menu mostra Cursos, Disciplinas, Turmas, Ofertas, Telemetria e as telas do professor.
2. `/admin/courses`: criar "Engenharia de Software" (`ES`, Ensino Superior); editar e trocar o nível; repetir o código `ES` → mensagem `'Já existe um curso com este código.'` no modal.
3. `/admin/disciplines`: filtrar por `ES`, clicar "Nova disciplina" (curso já selecionado), criar `ES101 · Algoritmos`, 60 h; criar `BD101` em `ES` (aceito; já existe em `ADS`).
4. `/admin/classes`: "Nova turma" → Curso `ES` → Período letivo → "Cadastrar novo período..." → criar `2026.2` → fica selecionado → Posição 1 → salvar; a linha mostra `ES`, `2026.2`, `1`. Editar a turma `ADS-2026-3A` (tem oferta) e trocar o curso → `'A turma tem ofertas; não é possível trocar o curso.'`.
5. `/admin/subjects`: "Nova oferta" → Disciplina desabilitada → escolher a turma `ES` → só disciplinas de `ES` → `ES101` → professor → salvar; a linha aparece com curso, período e professor. Repetir a mesma oferta → `'Esta disciplina já é ofertada nesta turma.'`. "Editar" a oferta: só Professores muda; salvar recarrega a lista.
6. Como o professor alocado, abrir `/teacher/plans/new`: a oferta nova aparece na lista de disciplinas (a tela do plano só muda na fase 3).

---

## Testes existentes que quebram e onde são atualizados

| Teste | Motivo | Task |
|---|---|---|
| `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx` | `year` e "Ano letivo"/"Semestre" saem; `ClassOption` ganha `courseId`, `academicPeriodId`, `course`, `academicPeriod`; o modal faz GET de cursos e períodos ao abrir | 2 (reescrito) |
| `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx` — fixture `classes`, turma `nova` e opção esperada da turma | `ClassOption` sem `year`; subtítulo vira `curso · período` | 2 (ajuste mínimo) |
| `src/app/admin/subjects/_components/__tests__/SubjectFormModal.test.tsx` — todos os casos | formulário de oferta substitui Nome/Código/Curso/Nível; sem "Sem turma"; payload `{ classId, disciplineId, teacherIds }` / `{ id, teacherIds }` | 5 (reescrito) |
| `src/components/layout/__tests__/nav-links.test.ts` — `'admin vê gestão seguida da lista completa do professor'` | menu admin passa a Cursos, Disciplinas, Turmas, Ofertas, Telemetria | 6 |
| `src/components/layout/__tests__/app-header.test.tsx`, `src/app/__tests__/area-layouts.test.tsx` | não quebram (usam só `ROUTES.ADMIN_SUBJECTS`, inalterado) | — |
| `src/app/teacher/plans/new/_components/__tests__/PlanEditorForm.test.tsx`, `PlanNdeComplianceCard.test.tsx` | não quebram (não importam `AcademicPeriodOption` nem o modal de período); o typecheck da Task 1 confirma | — |
