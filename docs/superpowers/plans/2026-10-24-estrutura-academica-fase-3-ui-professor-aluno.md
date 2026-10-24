# Estrutura acadêmica, fase 3: interface do professor e do aluno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O professor cria e edita planos escolhendo só uma oferta sua (curso, turma, período e carga horária aparecem somente leitura), vê os planos agrupados por período e as ofertas rotuladas nos relatórios; o aluno vê no dashboard o período da própria turma.

**Architecture:** Um helper puro `formatOfferingLabel` dá o rótulo único da oferta. A tela `/teacher/plans/new` perde todo o estado de período: o período passa a ser lido de `subject.class.academicPeriod` (já incluído pela API da fase 1) e mostrado num `OfferingContextCard` somente leitura dentro de `PlanHeaderControls`. A lista de planos agrupa por `subject.class.academicPeriod`. O dashboard do aluno lê `user.class.academicPeriod` de `useCurrentUser` (`/api/v1/auth/me`) e deixa de chamar `/api/v1/academic-periods`. Nenhuma rota, serviço ou schema muda.

**Tech Stack:** Next.js 15 (App Router, client components), React, TypeScript, Tailwind, lucide-react, vitest 3 + `@testing-library/react` 16 + jsdom (via `// @vitest-environment jsdom`; sem `jest-dom` nem `user-event`, usar `fireEvent` e asserções nativas).

**Spec:** `docs/superpowers/specs/2026-10-24-estrutura-academica-curso-matriz-oferta-design.md` (seções "Interface de professor e aluno", "Testes" › "Componentes" (`OfferingContextCard.test.tsx`, `offering-label.test.ts`), "Fases de execução" item 3, regras 10 e 11). Fases 1 e 2 (`docs/superpowers/plans/2026-10-24-estrutura-academica-fase-1-schema-servicos-api.md`, `...-fase-2-ui-admin.md`, commits `8e1c246..343e261`) estão em `main` e **não** são replanejadas: a API já devolve as formas abaixo, os bodies de POST/PUT/generate de `TeachingPlanNewPage` já estão sem `academicPeriodId`, e `LessonsPage`/`SchedulesPage`/`AssessmentsPage` já leem `p.subject.discipline.name (p.subject.discipline.code)`.

Formas da API consumidas (fase 1, conferidas no código):

- `GET /api/v1/admin/subjects` (`API_ROUTES.ADMIN_SUBJECTS`) → `{ success, subjects }`. TEACHER recebe só ofertas com `TeacherSubject` dele (`listSubjects` em `subject-service.ts`). Cada item inclui `discipline` (todos os campos: `id, code, name, workloadHours, ...`), `class: { id, name, code, semester, course: { id, name, code, academicLevel }, academicPeriod: { id, name, code, year, ... } }`, `teacherAssignments`, `teachingPlans`.
- `GET /api/v1/teacher/plans` e `GET /api/v1/teacher/plans/[id]` → `plan.subject` com o mesmo include (`subjectContext` em `teaching-plan-repository.ts`: `discipline: true, class: { include: { course: true, academicPeriod: true } }`).
- `POST /api/v1/teacher/plans/generate` → body `{ subjectId, selectedReferences }`. `POST /api/v1/teacher/plans` sem `academicPeriodId`; `PUT` sem `subjectId`/`academicPeriodId`.
- `GET /api/v1/auth/me` → `{ user: CurrentUser }`, `CurrentUser = AuthenticatedUser & { class?: ClassContext | null }`, `ClassContext = { id, name, code, semester, course: { name, code }, academicPeriod: { name, code } }` (`src/lib/auth/types.ts`).

## Global Constraints

- Trabalho direto em `main`, sem branch nem worktree. Commits em `main`, sem pull request. Mensagens em pt-BR (`feat(professor): ...`, `feat(aluno): ...`, `refactor(professor): ...`), terminando com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Não commitar `package.json`, `package-lock.json` nem `.mcp.json`. `git add` sempre com caminhos explícitos.
- Textos de UI em português do Brasil. Vocabulário da spec: "Disciplina" = catálogo (`Discipline`), "Oferta" = `Subject`, "Turma" = `Class`, "Curso" = `Course`. Na tela do plano, toda menção a "disciplina vinculada" como escolha do professor vira "oferta".
- O professor não escolhe nem cria período em lugar nenhum: nenhum componente sob `src/app/teacher`, `src/app/(teacher)` ou `src/app/(student)` chama `/api/v1/academic-periods` nem importa `PeriodCreateInlineModal`/`AcademicPeriodOption` (o import cruzado professor→admin `@/app/admin/classes/_components/PeriodCreateInlineModal` sai na Task 3).
- Tipos de linha são locais: `OfferingOption` em `src/app/teacher/plans/new/types.ts`; os demais declarados no próprio arquivo do componente/página. Não importar **tipos** de `src/domains/**` em componentes novos ou alterados.
- **Exceção decidida — `formatOfferingLabel`:** fica onde a spec manda, `src/domains/academic/offering-label.ts`, como helper puro (sem Prisma, sem `db`, sem imports). Há precedente de componentes importando helpers puros de `src/domains` por valor (`@/domains/teaching/schedule-generator` em `MeetingsTable.tsx`, `@/domains/agendas/agenda-validator` em `ClassroomPage.tsx`, `@/domains/teaching/media-type`). Os componentes importam só a função; o tipo de entrada é estrutural, então `OfferingOption` e os tipos locais de linha satisfazem a assinatura sem importar tipo nenhum de `src/domains`.
- Usar sempre as constantes de `src/lib/constants/routes.ts` (`API_ROUTES.ADMIN_SUBJECTS`, `API_ROUTES.TEACHER_PLANS`, `API_ROUTES.LIBRARY`, `ROUTES.TEACHER_PLANS`, `ROUTES.TEACHER_PLANS_NEW`, `ROUTES.TEACHER_SCHEDULES`) nos arquivos tocados; caminhos derivados como `` `${API_ROUTES.TEACHER_PLANS}/generate` ``. Não criar constante nova.
- Ids de fixture no formato cuid (`c` + 9+ caracteres sem hífen, ex.: `csubject0001`), como nas fases 1 e 2.
- Mock de combobox e `routeFetch`: copiar literalmente de `src/app/admin/classes/_components/__tests__/ClassFormModal.test.tsx` (linhas 12-27 e 33-39). O mock renderiza `<label htmlFor={id}>` + `<select id={id} disabled>` com opções `title | subtitle`; por isso todo `AdvancedCombobox` desta fase recebe `id`.
- Gate de tipo por task: `npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"` sem saída.
- Teste instável conhecido: fallback CLASSROOM em `src/app/api/v1/agent/chat/__tests__/route.test.ts` (~1 em 5). Se for a única falha, rodar `npx vitest run src/app/api/v1/agent/chat` isolado.
- Fora de escopo: `src/app/admin/page.tsx` (redirecionamento não decidido pelo usuário), qualquer rota/serviço/schema, `rbac.ts`, `default-periods.ts`.

## Review Focus

1. **Oferta sem alocação do professor não aparece no combobox.** O filtro é do servidor; a UI não pode ter outra fonte de ofertas (nada de `/api/v1/admin/classes` nem lista local). Teste na Task 3 (`'plano novo lista só as ofertas devolvidas pela API e não busca períodos'`).
2. **Plano salvo reabre com a oferta correta e o cartão preenchido**, mesmo quando a oferta do plano não está na lista do usuário (admin editando plano de professor, ou alocação removida depois). Teste na Task 3 (`'plano salvo reabre com a oferta, o cartão e as horas salvas; PUT sem subjectId nem academicPeriodId'`).
3. **`totalHours` digitado pelo professor não é sobrescrito** ao trocar de oferta; só o valor que veio da matriz é atualizado. Teste na Task 3 (`'trocar de oferta atualiza só a carga horária vinda da matriz'`).
4. **Aluno sem turma** vê `'Período letivo não cadastrado'`; enquanto `/auth/me` carrega, o fallback não pisca. Teste na Task 6.
5. **Rótulo "3º Ano" para `HIGH_SCHOOL` e `ELEMENTARY`**, "3º Sem" só para `HIGHER_EDUCATION`. Teste na Task 1.

---

### Task 1: `formatOfferingLabel`

**Files:**
- Create: `src/domains/academic/offering-label.ts`
- Test: `src/domains/academic/__tests__/offering-label.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OfferingLabelInput = {
    discipline: { code: string; name: string };
    class: { semester: number; course: { code: string; academicLevel: string }; academicPeriod: { code: string } };
  };
  export function formatOfferingLabel(offering: OfferingLabelInput): string
  ```
  Formato: `` `${discipline.code} · ${discipline.name} · ${class.semester}º ${unidade} ${course.code} · ${academicPeriod.code}` ``, com `unidade = 'Ano'` para `'HIGH_SCHOOL'` e `'ELEMENTARY'` e `'Sem'` para qualquer outro valor. `academicLevel` é `string` (não o enum Prisma) para o helper não depender de `@prisma/client`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { formatOfferingLabel } from '../offering-label';

const base = {
  discipline: { code: 'BD101', name: 'Banco de Dados I' },
  class: { semester: 3, course: { code: 'ADS', academicLevel: 'HIGHER_EDUCATION' }, academicPeriod: { code: '2026.1' } },
};

describe('formatOfferingLabel', () => {
  it('superior usa "Sem"', () => {
    expect(formatOfferingLabel(base)).toBe('BD101 · Banco de Dados I · 3º Sem ADS · 2026.1');
  });
  it('ensino médio usa "Ano"', () => {
    expect(formatOfferingLabel({ ...base, class: { ...base.class, course: { code: 'EM', academicLevel: 'HIGH_SCHOOL' } } }))
      .toBe('BD101 · Banco de Dados I · 3º Ano EM · 2026.1');
  });
  it('ensino fundamental usa "Ano"', () => {
    expect(formatOfferingLabel({ ...base, class: { ...base.class, semester: 9, course: { code: 'EF', academicLevel: 'ELEMENTARY' } } }))
      .toBe('BD101 · Banco de Dados I · 9º Ano EF · 2026.1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/domains/academic/__tests__/offering-label.test.ts`
Expected: FAIL com `Failed to resolve import "../offering-label"`.

- [ ] **Step 3: Implementar `formatOfferingLabel` em `src/domains/academic/offering-label.ts`** (arquivo sem imports; JSDoc de uma linha dizendo que é usado pela UI do professor).

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npx vitest run src/domains/academic/__tests__/offering-label.test.ts && npx tsc --noEmit 2>&1 | grep -E "src/domains/academic"`
Expected: 3 PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/domains/academic/offering-label.ts src/domains/academic/__tests__/offering-label.test.ts
git commit -m "feat(professor): rótulo único de oferta (código · disciplina · posição curso · período)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `OfferingOption` e `OfferingContextCard`

**Files:**
- Modify: `src/app/teacher/plans/new/types.ts` (`SubjectOption` → `OfferingOption`; remove `GeneratedPlanData`, sem uso e com `academicPeriod: string`)
- Modify: `src/app/teacher/plans/new/_components/PlanHeaderControls.tsx:10,13,16` e `TeachingPlanNewPage.tsx:15,51` (só o nome do tipo)
- Create: `src/app/teacher/plans/new/_components/OfferingContextCard.tsx`
- Create: `src/app/teacher/plans/new/_components/__tests__/fixtures.ts` (fixtures compartilhadas pelas Tasks 2 e 3)
- Test: `src/app/teacher/plans/new/_components/__tests__/OfferingContextCard.test.tsx`

**Interfaces:**
- Produces, em `types.ts` (forma da spec L409; superconjunto do `SubjectOption` atual, então os consumidores compilam trocando só o nome):
  ```ts
  export interface OfferingOption {
    id: string;
    discipline: { code: string; name: string; workloadHours: number };
    class: {
      id: string; name: string; semester: number;
      course: { name: string; code: string; academicLevel: 'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY' };
      academicPeriod: { id: string; name: string; code: string };
    };
  }
  ```
- Produces, em `OfferingContextCard.tsx`: `export function OfferingContextCard({ offering }: { offering: OfferingOption | null })` — retorna `null` sem oferta. Com oferta: título `'Contexto da oferta'`, ajuda `'Definido pela coordenação. Somente leitura.'`, e um `<dl>` com pares `<dt>`/`<dd>` nesta ordem: `Curso` → `` `${course.name} (${course.code})` ``; `Turma` → `class.name`; `Período letivo` → `academicPeriod.name`; `Carga horária da matriz` → `` `${discipline.workloadHours}h` ``. Nenhum campo editável.
- Produces, em `__tests__/fixtures.ts`:
  ```ts
  export const offeringADS: OfferingOption = {
    id: 'csubject0001',
    discipline: { code: 'BD101', name: 'Banco de Dados I', workloadHours: 80 },
    class: { id: 'cclass00001', name: '3º Semestre · ADS', semester: 3,
      course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS', academicLevel: 'HIGHER_EDUCATION' },
      academicPeriod: { id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1' } },
  };
  export const offeringEM: OfferingOption = {
    id: 'csubject0002',
    discipline: { code: 'MAT201', name: 'Matemática II', workloadHours: 60 },
    class: { id: 'cclass00002', name: '2º Ano · EM', semester: 2,
      course: { name: 'Ensino Médio', code: 'EM', academicLevel: 'HIGH_SCHOOL' },
      academicPeriod: { id: 'cperiod0003', name: 'Ano letivo 2026', code: '2026' } },
  };
  export const LABEL_ADS = 'BD101 · Banco de Dados I · 3º Sem ADS · 2026.1';
  export const LABEL_EM = 'MAT201 · Matemática II · 2º Ano EM · 2026';
  ```

- [ ] **Step 1: Escrever fixtures e o teste do cartão**

```tsx
// @vitest-environment jsdom
import { OfferingContextCard } from '../OfferingContextCard';
import { offeringADS } from './fixtures';

it('mostra curso, turma, período letivo e carga horária da matriz', () => {
  const { container } = render(<OfferingContextCard offering={offeringADS} />);
  expect(screen.getByText('Contexto da oferta')).toBeTruthy();
  expect([...container.querySelectorAll('dt')].map((e) => e.textContent))
    .toEqual(['Curso', 'Turma', 'Período letivo', 'Carga horária da matriz']);
  expect([...container.querySelectorAll('dd')].map((e) => e.textContent))
    .toEqual(['Análise e Desenvolvimento de Sistemas (ADS)', '3º Semestre · ADS', '1º Semestre / 2026 (2026.1)', '80h']);
  expect(container.querySelectorAll('input, select, textarea').length).toBe(0);
});

it('não renderiza sem oferta', () => {
  const { container } = render(<OfferingContextCard offering={null} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/teacher/plans/new/_components/__tests__/OfferingContextCard.test.tsx`
Expected: FAIL com `Failed to resolve import "../OfferingContextCard"` (ou erro de tipo `OfferingOption` não exportado em `fixtures.ts`).

- [ ] **Step 3: Trocar o tipo em `types.ts` e nos dois consumidores; implementar `OfferingContextCard`** com `Card`/`CardHeader`/`CardContent` de `@/components/ui/card`, no estilo `glass rounded-xl border` dos cartões vizinhos (`PlanTelemetryCard`).

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npx vitest run src/app/teacher/plans/new && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"`
Expected: PASS em `OfferingContextCard.test.tsx` (2), `PlanEditorForm.test.tsx` (5) e `PlanNdeComplianceCard.test.tsx` (3); grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/plans/new/types.ts src/app/teacher/plans/new/_components/PlanHeaderControls.tsx src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx src/app/teacher/plans/new/_components/OfferingContextCard.tsx src/app/teacher/plans/new/_components/__tests__/fixtures.ts src/app/teacher/plans/new/_components/__tests__/OfferingContextCard.test.tsx
git commit -m "feat(professor): tipo de oferta e cartão somente leitura com curso, turma, período e carga horária

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Novo plano sem período (`PlanHeaderControls` + `TeachingPlanNewPage`)

As duas mudanças vão juntas: as props de `PlanHeaderControls` mudam e `TeachingPlanNewPage` é o único consumidor.

**Files:**
- Modify: `src/app/teacher/plans/new/_components/PlanHeaderControls.tsx`
- Modify: `src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx`
- Test: `src/app/teacher/plans/new/_components/__tests__/PlanHeaderControls.test.tsx` (novo)
- Test: `src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx` (novo)

**Interfaces:**
- Consumes: `formatOfferingLabel` (Task 1); `OfferingOption`, `OfferingContextCard`, fixtures (Task 2).
- Produces, em `PlanHeaderControls.tsx`:
  ```ts
  export interface PlanHeaderControlsProps {
    offerings: OfferingOption[];
    selectedOfferingId: string;
    onSelectOffering: (id: string) => void;
    activeOffering: OfferingOption | null;
    offeringLocked: boolean;   // true na edição (regra 10)
    isAiLocked: boolean;
    lockReason?: string;
    isGeneratingAI: boolean;
    onGenerateAI: () => void;
  }
  ```
  Saem `periods`, `selectedPeriodId`, `onSelectPeriodId`, `onPeriodCreated`, `effectivePeriodName`, o estado `isPeriodModalOpen`, `periodItems`, o combobox de período, o badge `Período: ...`, o `PeriodCreateInlineModal`, o import de `@/app/admin/classes/_components/PeriodCreateInlineModal` e o ícone `Calendar`.
  - Combobox: `id="plan-offering-combobox"`, `label="Oferta *"`, `placeholder="Pesquisar oferta..."`, `emptyMessage="Nenhuma oferta encontrada."`, `disabled={offeringLocked}`, itens `{ id: o.id, title: formatOfferingLabel(o), subtitle: o.class.name }`. Ajuda abaixo: `'Não encontra a oferta? Peça ao administrador para cadastrá-la e alocar você.'`.
  - À direita do combobox (mesma grade `md:grid-cols-2`), `<OfferingContextCard offering={activeOffering} />`.
  - Cabeçalho: `h1` `Plano de Ensino & Aprendizagem: {activeOffering ? activeOffering.discipline.name : 'Selecione a oferta'}`; subtítulo com oferta: `Curso: {course.name} | Código: {discipline.code} | Status: Em Elaboração`; sem oferta: `'Selecione uma oferta para iniciar a elaboração do plano.'`. Botão de IA e `lockReason` inalterados.
- `TeachingPlanNewPage.tsx` (default export, sem mudança de assinatura):
  - Estado: `offerings: OfferingOption[]`, `selectedSubjectId: string`, `savedOffering: OfferingOption | null` (oferta vinda de `plan.subject` na edição). Saem `periods`, `selectedPeriodId`, `activePeriod`, `handlePeriodCreated`, o fetch de `/api/v1/academic-periods`, a linha 120 (`plan.academicPeriodId`) e o import de `AcademicPeriodOption`.
  - Lista exibida: `savedOffering` na frente de `offerings` quando não estiver nela (por `id`); `activeOffering` é procurada nessa lista. Na edição, `setSavedOffering(plan.subject)` além de `setSelectedSubjectId(plan.subjectId)`.
  - `isAiLocked = !selectedSubjectId || references.length === 0`. `lockReason`: `'Selecione uma oferta.'` → `'Adicione ao menos 1 documento na biblioteca RAG.'`. `alert` de salvar sem oferta: `'Por favor, selecione uma oferta.'`.
  - `handleSelectOffering(id)` (regra 11): só em plano novo (`!editingPlanId`). Se `ndeCompliance.totalHours` é `null` **ou** igual ao `workloadHours` da oferta selecionada antes, troca por `next.discipline.workloadHours`; senão mantém (valor digitado pelo professor). `theoryHours`/`practiceHours` não mudam. Feito no handler, não em efeito, para nunca disparar ao carregar um plano salvo.
  - `offeringLocked={Boolean(editingPlanId)}`.
  - URLs pelas constantes: `API_ROUTES.ADMIN_SUBJECTS`, `` `${API_ROUTES.TEACHER_PLANS}/${editingPlanId}` ``, `` `${API_ROUTES.TEACHER_PLANS}/generate` ``, `API_ROUTES.TEACHER_PLANS`, `` `${API_ROUTES.LIBRARY}/documents` ``; `router.push(ROUTES.TEACHER_SCHEDULES)` / `router.push(ROUTES.TEACHER_PLANS)`. Bodies de POST/PUT/generate como já estão (fase 1).

- [ ] **Step 1: Escrever `PlanHeaderControls.test.tsx`**

Mocks: combobox (copiado, ver Global Constraints); `@/components/layout/provider-badge` → `{ ProviderBadge: () => null }`. Helper `setup(overrides)` com `offerings=[offeringADS, offeringEM]`, `selectedOfferingId=''`, `activeOffering=null`, `offeringLocked=false`, `isAiLocked=true`, `isGeneratingAI=false`, callbacks `vi.fn()`.

- `'lista as ofertas rotuladas por formatOfferingLabel, sem seletor de período'`: opções de `getByLabelText('Oferta *')` = `['—', \`${LABEL_ADS} | 3º Semestre · ADS\`, \`${LABEL_EM} | 2º Ano · EM\`]`; `queryByText(/Período Letivo \/ Semestre/)` e `queryByText('Cadastrar novo período letivo...')` são `null`; `getByText('Não encontra a oferta? Peça ao administrador para cadastrá-la e alocar você.')` existe; `queryByText('Contexto da oferta')` é `null`.
- `'escolher uma oferta chama onSelectOffering com o id'`: `fireEvent.change(getByLabelText('Oferta *'), { target: { value: 'csubject0001' } })` → `onSelectOffering` chamado com `'csubject0001'`.
- `'com oferta ativa mostra o cartão de contexto e o nome da disciplina'`: `activeOffering=offeringADS` → `getByText('Plano de Ensino & Aprendizagem: Banco de Dados I')` e `getByText('Contexto da oferta')` existem.
- `'na edição o combobox de oferta fica desabilitado'`: `offeringLocked=true` → `(getByLabelText('Oferta *') as HTMLSelectElement).disabled === true`.

- [ ] **Step 2: Escrever `TeachingPlanNewPage.test.tsx`**

Mocks:
- `next/navigation`: `const nav = vi.hoisted(() => ({ id: null as string | null, push: vi.fn() }))`; `useRouter: () => ({ push: nav.push })`, `useSearchParams: () => new URLSearchParams(nav.id ? { id: nav.id } : {})` (padrão de `LoginPage.test.tsx`).
- combobox (copiado); `@/components/layout/provider-badge` → `ProviderBadge: () => null`; `@/components/layout/use-appliance-status` → `useApplianceStatus: () => null`.
- `../ReferenceSelectionModal` → `ReferenceSelectionModal: ({ onAddReferences }) => <button type="button" onClick={() => onAddReferences([REF])}>Adicionar referência (mock)</button>`, com `const REF = { id: 'cdoc0000001', title: 'Sistemas de Banco de Dados', author: 'Elmasri', category: 'Banco de Dados' }`.
- `fetch` = `routeFetch(handlers)`; `afterEach`: `cleanup(); vi.unstubAllGlobals(); nav.id = null; nav.push.mockReset()`.

Helpers: `const subjectsOk = (list) => ({ 'GET /api/v1/admin/subjects': { success: true, subjects: list } })`; `bodyOf(method, url)` devolve `JSON.parse` do body da chamada correspondente; `total = () => (screen.getByLabelText('Carga Horária Total (horas) *') as HTMLInputElement).value`.

- `'plano novo lista só as ofertas devolvidas pela API e não busca períodos'` (Review Focus 1): `subjectsOk([offeringADS])`; após `await screen.findByText(\`${LABEL_ADS} | 3º Semestre · ADS\`)`, a select `'Oferta *'` tem 2 opções (`—` + ADS); nenhuma URL chamada contém `academic-periods`; `queryByText('Cadastrar novo período letivo...')` é `null`; `total()` é `''`.
- `'escolher a oferta preenche só a carga horária total; POST envia subjectId sem academicPeriodId'`: handlers `subjectsOk([offeringADS])` + `'POST /api/v1/teacher/plans': { success: true, plan: { id: 'cplan000009' } }`; escolher `csubject0001` → `total()` = `'80'`, `'Teoria (h)'` e `'Prática / Lab (h)'` = `''`; clicar `'Salvar Rascunho'`; `await waitFor` → body do POST tem `subjectId: 'csubject0001'`, `totalHours: 80`, `theoryHours: null`, `practiceHours: null`, `status: 'DRAFT'` e `not.toHaveProperty('academicPeriodId')`; `nav.push` chamado com `'/teacher/plans'`.
- `'trocar de oferta atualiza só a carga horária vinda da matriz'` (Review Focus 3): `subjectsOk([offeringADS, offeringEM])`; escolher ADS → `'80'`; escolher EM → `'60'`; `fireEvent.change` no total para `'72'`; escolher ADS → continua `'72'`.
- `'a IA só destrava com oferta e referência e gera com { subjectId, selectedReferences }'`: handlers `subjectsOk([offeringADS])` + `'POST /api/v1/teacher/plans/generate': { success: true, data: { syllabus: 'Ementa gerada', generalObjectives: '', bloomLevels: [], methodology: '', citations: [] } }`; de início `getByText('IA Bloqueada (Preencha Requisitos)')` e `getByText('Selecione uma oferta.')`; escolher ADS → `getByText('Adicione ao menos 1 documento na biblioteca RAG.')`; clicar `'Adicionar referência (mock)'` → clicar `getByText('IA Socrática: Gerar Sugestão Ementa')`; `await waitFor` → body do generate `toEqual({ subjectId: 'csubject0001', selectedReferences: [REF] })`.
- `'plano salvo reabre com a oferta, o cartão e as horas salvas; PUT sem subjectId nem academicPeriodId'` (Review Focus 2): `nav.id = 'cplan000001'`; handlers `subjectsOk([offeringEM])` (a oferta do plano **não** está na lista), `'GET /api/v1/teacher/plans/cplan000001': { success: true, plan: { id: 'cplan000001', subjectId: 'csubject0001', subject: offeringADS, syllabus: 'Ementa salva', generalObjectives: '', methodology: '', basicBibliography: [], totalHours: 72, theoryHours: 40, practiceHours: 32, ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS, status: 'DRAFT' } }`, `'PUT /api/v1/teacher/plans/cplan000001': { success: true, plan: { id: 'cplan000001' } }`; `await waitFor` → select `'Oferta *'` com `value === 'csubject0001'` e `disabled`; `getByText('Contexto da oferta')` e `getByText('80h')` existem; `total()` = `'72'`; clicar `'Salvar Rascunho'` → body do PUT `not.toHaveProperty('subjectId')`, `not.toHaveProperty('academicPeriodId')`, `totalHours: 72`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/app/teacher/plans/new/_components/__tests__/PlanHeaderControls.test.tsx src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx`
Expected: FAIL (label `'Oferta *'` inexistente; `fetch inesperado: GET /api/v1/academic-periods`; total vazio após escolher a oferta).

- [ ] **Step 4: Reescrever `PlanHeaderControls` conforme Interfaces**

- [ ] **Step 5: Ajustar `TeachingPlanNewPage` conforme Interfaces**

- [ ] **Step 6: Rodar testes, typecheck e resíduos**

Run: `npx vitest run src/app/teacher/plans/new && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"; grep -rnE "academicPeriodId|selectedPeriodId|PeriodCreateInlineModal|AcademicPeriodOption|SubjectOption|academic-periods" src/app/teacher/plans/new --exclude-dir=__tests__`
Expected: PASS em `PlanHeaderControls.test.tsx` (4), `TeachingPlanNewPage.test.tsx` (5) e nos 10 da Task 2; tsc-grep e grep de resíduos sem saída.

- [ ] **Step 7: Commit**

```bash
git add src/app/teacher/plans/new/_components/PlanHeaderControls.tsx src/app/teacher/plans/new/_components/TeachingPlanNewPage.tsx src/app/teacher/plans/new/_components/__tests__/PlanHeaderControls.test.tsx src/app/teacher/plans/new/_components/__tests__/TeachingPlanNewPage.test.tsx
git commit -m "feat(professor): plano escolhe só a oferta; período derivado e carga horária da matriz pré-preenchida

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Lista de planos agrupada por período

**Files:**
- Modify: `src/app/teacher/plans/page.tsx`
- Test: `src/app/teacher/plans/__tests__/page.test.tsx` (novo; mesmo padrão de `src/app/admin/classes/__tests__/page.test.tsx`)

**Interfaces:**
- Consumes: `GET API_ROUTES.TEACHER_PLANS` → `{ success, plans }` com `plan.subject` completo (ver topo).
- Tipo local (não exportado; `page.tsx` não pode exportar nada além do default):
  ```ts
  interface TeachingPlan {
    id: string; subjectId: string; syllabus: string; status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
    totalHours?: number; theoryHours?: number; practiceHours?: number; ndeComplianceStatus?: string;
    createdAt: string; updatedAt: string;
    subject: {
      id: string;
      discipline: { name: string; code: string };
      class: { name: string; course: { name: string; code: string }; academicPeriod: { id: string; name: string; code: string; year: number } };
    };
  }
  ```
  `subject` deixa de ser opcional (sempre vem da API); somem os fallbacks `'Disciplina não informada'`/`'Curso não informado'`.
- Comportamento:
  - Busca (placeholder `'Buscar plano por disciplina, curso ou turma...'`) em `discipline.name`, `discipline.code`, `course.name`, `class.name`, sem diferenciar maiúsculas.
  - Planos filtrados agrupados por `subject.class.academicPeriod.id`; grupos ordenados por `year` desc e depois `code` desc (`b.code.localeCompare(a.code)`); grupo vazio após a busca não aparece. Dentro do grupo, a ordem da API.
  - Cada grupo começa com uma linha de cabeçalho `<TableRow>` com `<TableCell colSpan={6} role="rowheader">{academicPeriod.name}</TableCell>`.
  - Colunas: `Disciplina & Código | Curso / Turma | Status NDE | Carga Horária | Última Atualização | Ações`. Célula "Curso / Turma": `course.name` e, abaixo em texto menor, `class.name`.
  - KPIs inalterados. `fetch(API_ROUTES.TEACHER_PLANS)`; links `ROUTES.TEACHER_PLANS_NEW` e `` `${ROUTES.TEACHER_PLANS_NEW}?id=${plan.id}` ``.

- [ ] **Step 1: Escrever o teste**

Mock de `next/link` não é necessário. Fixture `plan(id, disciplina, turma, periodo)` com `periodo` em `{ id: 'cperiod0001', name: '1º Semestre / 2026 (2026.1)', code: '2026.1', year: 2026 }`, `{ id: 'cperiod0002', name: '2º Semestre / 2026 (2026.2)', code: '2026.2', year: 2026 }`, `{ id: 'cperiod0009', name: '2º Semestre / 2025 (2025.2)', code: '2025.2', year: 2025 }`. `fetch` → `GET /api/v1/teacher/plans` = 4 planos, na ordem: BD101/'Turma A'/2026.1, ES101/'Turma B'/2025.2, BD102/'Turma A'/2026.2, BD103/'Turma C'/2026.1.

- `'agrupa os planos por período, do mais recente para o mais antigo'`: após `findByText('Banco de Dados I')`, `getAllByRole('rowheader').map((h) => h.textContent)` = `['2º Semestre / 2026 (2026.2)', '1º Semestre / 2026 (2026.1)', '2º Semestre / 2025 (2025.2)']`; os `columnheader` = `['Disciplina & Código', 'Curso / Turma', 'Status NDE', 'Carga Horária', 'Última Atualização', 'Ações']`.
- `'cada linha mostra disciplina, código, curso e turma'`: na linha do BD101 (`getByText('BD101').closest('tr')`), `within(row)` encontra `'Análise e Desenvolvimento de Sistemas'` e `'Turma A'`.
- `'a busca por turma filtra e esconde grupos vazios'`: `fireEvent.change(getByPlaceholderText('Buscar plano por disciplina, curso ou turma...'), { target: { value: 'turma b' } })` → `rowheader` = `['2º Semestre / 2025 (2025.2)']`; `queryByText('BD101')` é `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/teacher/plans/__tests__/page.test.tsx`
Expected: FAIL (nenhum `rowheader`; cabeçalho `Curso / Ano`).

- [ ] **Step 3: Implementar em `page.tsx` conforme Interfaces** (agrupamento num `useMemo` sobre os planos filtrados).

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npx vitest run src/app/teacher/plans && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"`
Expected: 3 PASS no novo arquivo e os da pasta `new/`; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add src/app/teacher/plans/page.tsx src/app/teacher/plans/__tests__/page.test.tsx
git commit -m "feat(professor): lista de planos agrupada por período letivo, com curso e turma

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Relatórios do professor com rótulo de oferta; limpeza do tipo de plano em avaliações

**Files:**
- Modify: `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx:26-29,51-81`
- Modify: `src/components/assessments/use-assessments.ts:11`
- Modify: `src/app/teacher/assessments/_components/AssessmentsPage.tsx:36`
- Test: `src/app/(teacher)/reports/_components/__tests__/TeacherReportsPage.test.tsx` (novo)

**Interfaces:**
- Consumes: `formatOfferingLabel` (Task 1); `GET API_ROUTES.ADMIN_SUBJECTS` (TEACHER só as suas — efeito esperado, spec "Outras páginas do professor").
- `TeacherReportsPage.tsx`:
  - `interface SubjectOption { id; name }` vira `interface FilterOption { id: string; name: string }` (todas as ocorrências: `describeFilters`, `nameOf`, `FilterSelect` já usa `{ id; name }`).
  - Tipo local da resposta: `type OfferingRow = { id: string; discipline: { code: string; name: string }; class: { semester: number; course: { code: string; academicLevel: string }; academicPeriod: { code: string } } }`.
  - `useSubjects()` vira `useOfferingOptions(): FilterOption[]`, mapeando `body.subjects as OfferingRow[]` para `{ id: s.id, name: formatOfferingLabel(s) }`. Rótulo do filtro (`'Disciplina'`, `'Todas as disciplinas'`) e o texto impresso `Disciplina: ...` ficam.
- `use-assessments.ts`: `PlanOption.subject.class` passa a `{ id: string; name: string }` (obrigatório; a API sempre inclui `class`). `classId: string` já está certo.
- `AssessmentsPage.tsx`: `const classOptions = plan ? [plan.subject.class] : [];`. `PublishDialog.tsx` não muda: lê só `classOptions: { id; name }[]` e `classOptions[0]?.id` (conferido; nenhum acesso a `subject`).
- `LessonsPage.tsx` e `SchedulesPage.tsx` não mudam (já leem `discipline` desde a fase 1; a spec não pede rótulo de oferta neles).

- [ ] **Step 1: Escrever o teste dos relatórios**

Mocks: `@/components/agendas/use-agenda` → `useAgendas: () => ({ agendas: [], isLoading: false, error: null })`; `@/components/pedagogy/use-minutes` → `useMinutes` e `useHeatmap: () => ({ data: [], isLoading: false, error: null })`, `buildMinuteQuery: () => ''`; `../ClassAgendasSection` → `ClassAgendasSection: () => null`. `fetch` = `routeFetch({ 'GET /api/v1/admin/subjects': { success: true, subjects: [ofertaADS, ofertaEM] } })` com objetos no formato da API (mesmos valores de `offeringADS`/`offeringEM` da Task 2, declarados no teste; não importar de `src/app/teacher/...`).

- `'filtro de disciplina usa o rótulo da oferta'`: `await screen.findByRole('option', { name: 'BD101 · Banco de Dados I · 3º Sem ADS · 2026.1' })` e `getByRole('option', { name: 'MAT201 · Matemática II · 2º Ano EM · 2026' })` existem; nenhuma `option` tem texto vazio.
- `'o resumo impresso usa o rótulo da oferta selecionada'`: `fireEvent.change` na `<select>` que contém a opção ADS (`option.closest('select')`) para `'csubject0001'` → `getByText(/Disciplina: BD101 · Banco de Dados I · 3º Sem ADS · 2026\.1/)` existe.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(teacher)/reports"`
Expected: FAIL (opções sem texto: hoje o componente renderiza `o.name`, `undefined` na oferta).

- [ ] **Step 3: Implementar `TeacherReportsPage`, `use-assessments.ts` e `AssessmentsPage.tsx` conforme Interfaces**

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx vitest run "src/app/(teacher)/reports" src/components/assessments && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"`
Expected: 2 PASS no novo arquivo; `assessment-draft.test.ts` PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(teacher)/reports/_components/TeacherReportsPage.tsx" "src/app/(teacher)/reports/_components/__tests__/TeacherReportsPage.test.tsx" src/components/assessments/use-assessments.ts src/app/teacher/assessments/_components/AssessmentsPage.tsx
git commit -m "feat(professor): relatórios rotulam a oferta; turma do plano sempre presente em avaliações

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard do aluno com o período da turma

**Files:**
- Modify: `src/app/(student)/dashboard/_components/DashboardPage.tsx:14,136-158,180-182`
- Test: `src/app/(student)/dashboard/_components/__tests__/DashboardPage.test.tsx` (novo)

**Interfaces:**
- Consumes: `useCurrentUser(): { user: CurrentUser | null; isLoading: boolean }` (`src/components/layout/use-current-user.ts`).
- Remove `useActivePeriodName` e o fetch de `API_ROUTES.ACADEMIC_PERIODS`; o import vira `import { getAgendaLink } from '@/lib/constants/routes'` (se `API_ROUTES` não tiver outro uso no arquivo).
- `const { user, isLoading: userLoading } = useCurrentUser();` O `Badge` do cabeçalho só renderiza quando `!userLoading`, com texto `user?.class?.academicPeriod.name ?? 'Período letivo não cadastrado'`.

- [ ] **Step 1: Escrever o teste**

Mocks: `@/components/agendas/use-agenda` → `useAgendas: () => ({ agendas: [], isLoading: false, error: null })`; `@/components/pedagogy/use-minutes` → `useMinutes: () => ({ data: [], isLoading: false, error: null })`; `@/components/classroom/pedagogical-minutes-modal` → `PedagogicalMinutesModal: () => null`; `@/components/layout/use-current-user` → `useCurrentUser: () => current`, com `const current = vi.hoisted(() => ({ value: { user: null, isLoading: false } as { user: unknown; isLoading: boolean } }))` e o mock devolvendo `current.value`. `fetch` = `vi.fn(async () => { throw new Error('fetch inesperado') })`.

Fixture: `student = { id: 'cuser000001', name: 'Aluno Demo', email: 'aluno@demo.local', role: 'STUDENT', enrollment: null, avatarUrl: null, classId: 'cclass00001', sessionId: 'csession0001', class: { id: 'cclass00001', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, course: { name: 'Análise e Desenvolvimento de Sistemas', code: 'ADS' }, academicPeriod: { name: '1º Semestre / 2026 (2026.1)', code: '2026.1' } } }`.

- `'mostra o período letivo da turma do aluno sem chamar /academic-periods'`: `current.value = { user: student, isLoading: false }` → `getByText('1º Semestre / 2026 (2026.1)')` e `getByText('Bem-vindo, Aluno Demo!')` existem; `fetch` não foi chamado.
- `'aluno sem turma vê "Período letivo não cadastrado"'` (Review Focus 4): `user: { ...student, classId: null, class: null }` → `getByText('Período letivo não cadastrado')` existe.
- `'enquanto carrega o usuário não mostra o fallback'`: `{ user: null, isLoading: true }` → `queryByText('Período letivo não cadastrado')` é `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run "src/app/(student)/dashboard"`
Expected: FAIL (`fetch inesperado` vindo de `useActivePeriodName`; período da turma não aparece).

- [ ] **Step 3: Implementar conforme Interfaces**

- [ ] **Step 4: Rodar teste e typecheck**

Run: `npx vitest run "src/app/(student)/dashboard" && npx tsc --noEmit 2>&1 | grep -E "src/app/teacher|src/app/\(teacher\)|src/app/\(student\)|src/lib|src/domains/academic|src/components/assessments"`
Expected: 3 PASS; grep sem saída.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(student)/dashboard/_components/DashboardPage.tsx" "src/app/(student)/dashboard/_components/__tests__/DashboardPage.test.tsx"
git commit -m "feat(aluno): dashboard mostra o período letivo da turma do aluno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Gate final da fase 3 e checklist manual das fases 1-3

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

- [ ] **Step 4: Resíduos de período e do tipo antigo**

Run: `grep -rnE "academicPeriodId|selectedPeriodId|PeriodCreateInlineModal|AcademicPeriodOption|SubjectOption|ACADEMIC_PERIODS|academic-periods" src/app/teacher "src/app/(teacher)" "src/app/(student)" --exclude-dir=__tests__`
Expected: sem saída.

- [ ] **Step 5: Árvore limpa**

Run: `git status --short`
Expected: só `package.json`, `package-lock.json` e `.mcp.json` pendentes.

- [ ] **Step 6: Checklist manual para o usuário (navegador, `npm run dev`, banco com o seed da fase 1)**

Como admin:
1. Menu mostra Cursos, Disciplinas, Turmas, Ofertas, Telemetria e as telas do professor.
2. `/admin/courses`: criar "Engenharia de Software" (`ES`, Ensino Superior). Repetir `ES` → `'Já existe um curso com este código.'`.
3. `/admin/disciplines`: filtrar por `ES`, "Nova disciplina" → `ES101 · Algoritmos`, 60 h.
4. `/admin/classes`: "Nova turma" → Curso `ES` → Período letivo → "Cadastrar novo período..." → `2026.2` (fica selecionado) → Posição 1 → salvar; linha mostra `ES`, `2026.2`, `1`.
5. `/admin/subjects`: "Nova oferta" → turma `ES` → só disciplinas de `ES` → `ES101` → alocar o professor demo → salvar. Repetir → `'Esta disciplina já é ofertada nesta turma.'`.
Como professor demo:
6. `/teacher/plans/new`: não existe seletor nem cadastro de período. O combobox "Oferta *" lista `BD101 · Banco de Dados I · 3º Sem ADS · 2026.1` e `ES101 · Algoritmos · 1º Sem ES · 2026.2`, e nenhuma oferta sem alocação.
7. Escolher `ES101`: o cartão "Contexto da oferta" mostra o curso, a turma, `2026.2` e `60h`; "Carga Horária Total" vira 60; Teoria e Prática vazias. Digitar 64 e trocar para `BD101`: o total continua 64.
8. Botão de IA bloqueado com `'Adicione ao menos 1 documento na biblioteca RAG.'`; adicionar uma referência do acervo → "IA Socrática: Gerar Sugestão Ementa" → a ementa é preenchida.
9. Preencher teoria/prática e "Salvar Rascunho" → volta para `/teacher/plans`; o plano aparece sob o grupo do período da oferta, com curso e turma. Buscar pelo nome da turma filtra.
10. "Editar / Continuar": a oferta aparece selecionada e desabilitada, o cartão está preenchido, as horas são as salvas; salvar de novo funciona.
11. `/reports`: o filtro "Disciplina" lista as ofertas do professor com o rótulo completo, e só elas.
12. `/teacher/assessments`: escolher o plano e publicar uma avaliação; a turma da oferta aparece no diálogo.

Como aluno demo:
13. `/dashboard`: o badge do cabeçalho mostra o nome do período da turma do aluno (ex.: `1º Semestre / 2026 (2026.1)`), e o DevTools › Network não mostra chamada a `/api/v1/academic-periods`.

---

## Testes existentes que quebram e onde são atualizados

| Teste | Situação | Task |
|---|---|---|
| `src/app/teacher/plans/new/_components/__tests__/PlanEditorForm.test.tsx` | não quebra (props de `PlanEditorForm` inalteradas) | — |
| `src/app/teacher/plans/new/_components/__tests__/PlanNdeComplianceCard.test.tsx` | não quebra (importa só `NdeComplianceData` de `types.ts`, que fica) | — |
| `src/components/assessments/__tests__/assessment-draft.test.ts` | não quebra (não usa `PlanOption.subject.class`); roda na Task 5 | — |
| `src/app/admin/classes/_components/__tests__/PeriodCreateInlineModal.test.tsx`, `ClassFormModal.test.tsx` | não quebram (o modal de período continua no admin; só o professor deixa de importá-lo) | — |
| `src/lib/auth/__tests__/rbac.test.ts` | não quebra (`rbac.ts` não muda) | — |

Não existe hoje teste para `PlanHeaderControls`, `TeachingPlanNewPage`, `teacher/plans/page.tsx`, `TeacherReportsPage` nem `DashboardPage`; todos são criados nas Tasks 3-6. Se o `npm test` da Task 7 acusar outra quebra, ela volta para a task dona do arquivo.
