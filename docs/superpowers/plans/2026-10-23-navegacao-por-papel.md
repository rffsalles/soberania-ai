# Navegação por Papel: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo papel (aluno, professor, admin) vê em todas as páginas autenticadas um menu com as suas telas e o botão Sair, e o professor cai sempre em `/teacher/plans` após o login.

**Architecture:** O header compartilhado (`AppHeader`) sai das páginas e passa a ser renderizado por cinco `layout.tsx`, um por área de `src/app`. As listas de links ficam em um módulo próprio por papel ao lado do header. A tela de login e o logo do header usam `getDefaultRouteForRole`, que já é a rota inicial do middleware.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, lucide-react, vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-23-navegacao-por-papel-design.md`

## Global Constraints

- Textos de interface em português do Brasil; rótulos exatos do menu: `Painel`, `Planos de Ensino`, `Aulas`, `Cronogramas`, `Avaliações`, `Acervo RAG`, `Relatórios`, `Disciplinas`, `Telemetria`.
- Todo `href` de menu vem de `ROUTES` em `src/lib/constants/routes.ts`; nenhuma string de rota literal nos componentes.
- `getDefaultRouteForRole` (`src/lib/auth/rbac.ts`) é a única fonte da rota inicial de cada papel.
- Nenhuma mudança visual no header além dos links e do destino do logo. Nenhum menu lateral.
- Testes de componente usam `// @vitest-environment jsdom` na primeira linha e `cleanup()` em `afterEach`, como `LoginPage.test.tsx`.
- Commits só dos arquivos da tarefa. O working tree tem alterações do usuário não relacionadas (`.env.example`, `next-env.d.ts`, `src/domains/rag/...`): não incluir nem reverter.

## Review Focus

1. Papel desconhecido vindo de `/api/v1/auth/me` (fora do enum): o header deve renderizar sem links, não quebrar. Teste em Task 1 (`getNavLinksForRole`).
2. Admin ou professor em `/dashboard` (rota liberada a todos, mas fora do menu deles): nenhum link marcado como ativo, sem erro. Teste em Task 2.
3. `/teacher/plans/new` deve marcar `Planos de Ensino` como ativo e nada mais; `/teacher/lessons` não pode marcar `Planos de Ensino`. Teste em Task 2.
4. Header com usuário ainda carregando: nenhum link renderizado e o esqueleto do menu de usuário presente. Teste em Task 2.
5. Login de STUDENT e ADMIN continuam indo para `/dashboard` e `/appliance`; `redirect=/x` válido tem prioridade sobre a rota padrão. Teste em Task 4.

---

### Task 1: Listas de links por papel

**Files:**
- Create: `src/components/layout/nav-links.ts`
- Test: `src/components/layout/__tests__/nav-links.test.ts`

**Interfaces:**
- Consumes: `ROUTES` (`@/lib/constants/routes`), `Role` (`@prisma/client`), `canAccessRoute` (`@/lib/auth/rbac`), ícones de `lucide-react`.
- Produces:
  - `export interface NavLink { href: string; label: string; icon: LucideIcon }`
  - `export const NAV_LINKS_BY_ROLE: Readonly<Record<Role, readonly NavLink[]>>`
  - `export function getNavLinksForRole(role: Role | string | undefined): readonly NavLink[]` — devolve `[]` para papel ausente ou fora do mapa.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/layout/__tests__/nav-links.test.ts
import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { canAccessRoute } from '@/lib/auth/rbac';
import { ROUTES } from '@/lib/constants/routes';
import { NAV_LINKS_BY_ROLE, getNavLinksForRole } from '../nav-links';

const labels = (role: Role) => NAV_LINKS_BY_ROLE[role].map((l) => l.label);

describe('NAV_LINKS_BY_ROLE', () => {
  it('só lista rotas que o papel pode acessar', () => {
    for (const role of Object.values(Role)) {
      for (const link of NAV_LINKS_BY_ROLE[role]) {
        expect(canAccessRoute(link.href, role), `${role} ${link.href}`).toBe(true);
      }
    }
  });

  it('aluno vê só o Painel', () => {
    expect(NAV_LINKS_BY_ROLE[Role.STUDENT].map((l) => l.href)).toEqual([ROUTES.DASHBOARD]);
    expect(labels(Role.STUDENT)).toEqual(['Painel']);
  });

  it('professor vê as seis telas docentes, nesta ordem', () => {
    expect(labels(Role.TEACHER)).toEqual([
      'Planos de Ensino', 'Aulas', 'Cronogramas', 'Avaliações', 'Acervo RAG', 'Relatórios',
    ]);
    expect(NAV_LINKS_BY_ROLE[Role.TEACHER].map((l) => l.href)).toEqual([
      ROUTES.TEACHER_PLANS, ROUTES.TEACHER_LESSONS, ROUTES.TEACHER_SCHEDULES,
      ROUTES.TEACHER_ASSESSMENTS, ROUTES.TEACHER_MATERIALS, ROUTES.REPORTS,
    ]);
  });

  it('admin vê gestão seguida da lista completa do professor', () => {
    expect(labels(Role.ADMIN)).toEqual(['Disciplinas', 'Telemetria', ...labels(Role.TEACHER)]);
    expect(NAV_LINKS_BY_ROLE[Role.ADMIN].slice(0, 2).map((l) => l.href)).toEqual([
      ROUTES.ADMIN_SUBJECTS, ROUTES.APPLIANCE,
    ]);
  });

  it('professor não vê rotas de admin', () => {
    for (const link of NAV_LINKS_BY_ROLE[Role.TEACHER]) {
      expect(link.href.startsWith(ROUTES.ADMIN)).toBe(false);
      expect(link.href).not.toBe(ROUTES.APPLIANCE);
    }
  });

  it('getNavLinksForRole devolve lista vazia para papel desconhecido ou ausente', () => {
    expect(getNavLinksForRole(undefined)).toEqual([]);
    expect(getNavLinksForRole('SUPERUSER')).toEqual([]);
    expect(getNavLinksForRole(Role.TEACHER)).toBe(NAV_LINKS_BY_ROLE[Role.TEACHER]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/__tests__/nav-links.test.ts`
Expected: FAIL, módulo `../nav-links` não encontrado.

- [ ] **Step 3: Implement `src/components/layout/nav-links.ts`**

Exporte `NavLink`, `NAV_LINKS_BY_ROLE` e `getNavLinksForRole` com as assinaturas do bloco Interfaces. Ícones: Painel `LayoutDashboard`, Planos de Ensino `ClipboardList`, Aulas `Presentation`, Cronogramas `CalendarDays`, Avaliações `FileCheck2`, Acervo RAG `BookOpen`, Relatórios `BarChart3`, Disciplinas `Library`, Telemetria `Server`. Monte a lista do admin como `[...gestão, ...TEACHER_LINKS]` reutilizando a constante do professor. `getNavLinksForRole` faz lookup no mapa e devolve `[]` quando a chave não existe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/__tests__/nav-links.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/nav-links.ts src/components/layout/__tests__/nav-links.test.ts
git commit -m "feat(nav): per-role navigation link lists"
```

---

### Task 2: Header usa o menu por papel, logo aponta para a rota padrão

**Files:**
- Modify: `src/components/layout/app-header.tsx` (bloco `allNavLinks`/`navLinks` nas linhas 24-31; `<Link href="/dashboard">` na linha 38; cálculo de `isActive` na linha 76)
- Test: `src/components/layout/__tests__/app-header.test.tsx`

**Interfaces:**
- Consumes: `getNavLinksForRole` (Task 1), `getDefaultRouteForRole` e `canAccessRoute` (`@/lib/auth/rbac`), `useCurrentUser` (`./use-current-user`), `usePathname` (`next/navigation`).
- Produces: `AppHeader` sem props (inalterado). O link ativo recebe `aria-current="page"` no `<Link>`; o logo é o `<Link>` cujo texto contém `Soberania`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/app-header.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ROUTES } from '@/lib/constants/routes';

const nav = vi.hoisted(() => ({ pathname: '/' }));
const auth = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email: string; role: string; enrollment: string | null }, isLoading: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../use-current-user', () => ({ useCurrentUser: () => auth }));
vi.mock('../telemetry-badge', () => ({ TelemetryBadge: () => null }));

import { AppHeader } from '../app-header';

const teacher = { id: 't1', name: 'Prof. Carlos', email: 'p@x', role: 'TEACHER', enrollment: 'PROF001' };
const student = { id: 's1', name: 'Maria', email: 'm@x', role: 'STUDENT', enrollment: '202601001' };
const admin = { id: 'a1', name: 'Admin', email: 'a@x', role: 'ADMIN', enrollment: null };

function setup(user: typeof teacher | null, pathname: string, isLoading = false) {
  auth.user = user; auth.isLoading = isLoading; nav.pathname = pathname;
  render(<AppHeader />);
}
const navLinkNames = () => screen.getAllByRole('link').map((a) => a.textContent?.trim()).filter((t) => t && !t.includes('Soberania'));
const activeLink = () => document.querySelector('a[aria-current="page"]');

describe('AppHeader', () => {
  afterEach(() => cleanup());

  it('professor vê os seis links e o botão Sair', () => {
    setup(teacher, ROUTES.TEACHER_PLANS);
    expect(navLinkNames()).toEqual(['Planos de Ensino', 'Aulas', 'Cronogramas', 'Avaliações', 'Acervo RAG', 'Relatórios']);
    expect(screen.getByRole('button', { name: /Sair/ })).toBeTruthy();
  });

  it('aluno vê só o Painel', () => {
    setup(student, ROUTES.DASHBOARD);
    expect(navLinkNames()).toEqual(['Painel']);
  });

  it('logo aponta para a rota padrão do papel', () => {
    setup(admin, ROUTES.ADMIN_SUBJECTS);
    const logo = screen.getByRole('link', { name: /Soberania/ });
    expect(logo.getAttribute('href')).toBe(ROUTES.APPLIANCE);
  });

  it('logo aponta para a raiz sem usuário', () => {
    setup(null, '/');
    expect(screen.getByRole('link', { name: /Soberania/ }).getAttribute('href')).toBe(ROUTES.HOME);
  });

  it('marca ativo o link cujo caminho é prefixo do pathname', () => {
    setup(teacher, ROUTES.TEACHER_PLANS_NEW);
    expect(activeLink()?.textContent).toContain('Planos de Ensino');
    cleanup();
    setup(teacher, ROUTES.TEACHER_LESSONS);
    expect(activeLink()?.textContent).toContain('Aulas');
    expect(activeLink()?.textContent).not.toContain('Planos');
  });

  it('nenhum link ativo quando o admin está numa rota fora do menu', () => {
    setup(admin, ROUTES.DASHBOARD);
    expect(activeLink()).toBeNull();
  });

  it('não renderiza links enquanto o usuário carrega', () => {
    setup(null, ROUTES.TEACHER_PLANS, true);
    expect(navLinkNames()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/__tests__/app-header.test.tsx`
Expected: FAIL nos testes de professor (rótulos antigos), logo (`/dashboard`) e ativo (sem `aria-current`).

- [ ] **Step 3: Modify `app-header.tsx`**

- Remova `allNavLinks` e os imports de ícones que ficarem sem uso. `const navLinks = user ? getNavLinksForRole(user.role).filter((l) => canAccessRoute(l.href, user.role)) : [];`
- Logo: `href={user ? getDefaultRouteForRole(user.role) : ROUTES.HOME}`.
- Ativo: `const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);` e `aria-current={isActive ? 'page' : undefined}` no `<Link>` do item. Remova a exceção de `ROUTES.DASHBOARD`.
- Classes e estrutura JSX permanecem.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/layout`
Expected: PASS (nav-links, app-header, use-current-user).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/app-header.tsx src/components/layout/__tests__/app-header.test.tsx
git commit -m "feat(nav): role-aware header menu, logo links to the role's home route"
```

---

### Task 3: Header nos layouts por área, removido das páginas

**Files:**
- Create: `src/app/(student)/layout.tsx`, `src/app/(teacher)/layout.tsx`, `src/app/(admin)/layout.tsx`, `src/app/teacher/layout.tsx`, `src/app/admin/layout.tsx`
- Modify (remover import na linha 4/5 e cada `<AppHeader />`):
  - `src/app/(student)/dashboard/_components/DashboardPage.tsx:5,155`
  - `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx:4,47,66`
  - `src/app/(student)/study-group/[groupId]/_components/StudyGroupPage.tsx:4,75,84,94`
  - `src/app/(student)/office-hours/[agendaId]/_components/OfficeHoursPage.tsx:4,22`
  - `src/app/(student)/exam/[examId]/_components/ExamPage.tsx:4,67,223`
  - `src/app/(student)/draft-review/[agendaId]/_components/DraftReviewPage.tsx:4,123`
  - `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx:4,147`
  - `src/app/(admin)/appliance/_components/ApplianceTelemetryPage.tsx:4,53`
- Test: `src/app/__tests__/area-layouts.test.tsx`

**Interfaces:**
- Consumes: `AppHeader` (Task 2).
- Produces: cinco `export default function <Area>Layout({ children }: { children: React.ReactNode })` que retornam `<><AppHeader />{children}</>`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/area-layouts.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/layout/use-current-user', () => ({ useCurrentUser: () => ({ user: null, isLoading: true }) }));
vi.mock('@/components/layout/telemetry-badge', () => ({ TelemetryBadge: () => null }));

import StudentLayout from '../(student)/layout';
import TeacherGroupLayout from '../(teacher)/layout';
import AdminGroupLayout from '../(admin)/layout';
import TeacherLayout from '../teacher/layout';
import AdminLayout from '../admin/layout';

const layouts = { StudentLayout, TeacherGroupLayout, AdminGroupLayout, TeacherLayout, AdminLayout };

describe('layouts por área', () => {
  afterEach(() => cleanup());

  for (const [name, Layout] of Object.entries(layouts)) {
    it(`${name} renderiza o header e o conteúdo`, () => {
      render(<Layout><p>conteúdo da página</p></Layout>);
      expect(screen.getByRole('link', { name: /Soberania/ })).toBeTruthy();
      expect(screen.getByText('conteúdo da página')).toBeTruthy();
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/__tests__/area-layouts.test.tsx`
Expected: FAIL, arquivos de layout não encontrados.

- [ ] **Step 3: Create the five layouts**

Mesmo conteúdo nos cinco, mudando só o nome da função (`StudentLayout`, `TeacherGroupLayout`, `AdminGroupLayout`, `TeacherLayout`, `AdminLayout`). Sem `'use client'`: são server components que renderizam o `AppHeader` cliente.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/__tests__/area-layouts.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Remove `AppHeader` from the eight page components**

Em cada arquivo listado, apague a linha de import e cada `<AppHeader />` nas linhas indicadas (todos os ramos: carregamento, erro, não encontrado, conteúdo). Não altere os wrappers `min-h-screen ... flex flex-col`.

- [ ] **Step 6: Verify no page renders the header itself**

Run: `grep -rn "AppHeader" src/app --include='*.tsx' | grep -v layout.tsx | grep -v __tests__`
Expected: nenhuma linha.

Run: `npm run typecheck && npm run lint`
Expected: sem erros (imports não usados removidos).

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(student)/layout.tsx' 'src/app/(teacher)/layout.tsx' 'src/app/(admin)/layout.tsx' src/app/teacher/layout.tsx src/app/admin/layout.tsx src/app/__tests__/area-layouts.test.tsx 'src/app/(student)' 'src/app/(teacher)' 'src/app/(admin)'
git commit -m "refactor(layout): render the app header from area layouts instead of each page"
```

---

### Task 4: Login usa a rota padrão do papel

**Files:**
- Modify: `src/app/(auth)/login/_components/LoginPage.tsx:72-79`
- Test: `src/app/(auth)/login/_components/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `getDefaultRouteForRole(role: Role): string` (`@/lib/auth/rbac`).
- Produces: nada novo.

- [ ] **Step 1: Write the failing tests**

Altere o mock de `next/navigation` para expor um `push` compartilhado e um `redirect` configurável:

```tsx
const nav = vi.hoisted(() => ({ push: vi.fn(), redirect: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.redirect ? { redirect: nav.redirect } : {}),
}));
```

Adicione, com `fireEvent`/`waitFor` de `@testing-library/react` e `fetch` stubado via `vi.stubGlobal` (limpar com `vi.unstubAllGlobals()` e `nav.push.mockClear(); nav.redirect = ''` no `afterEach`):

```tsx
async function submitAs(role: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user: { role } }), { status: 200 })));
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText(/Matrícula/), { target: { value: 'x' } });
  fireEvent.change(screen.getByLabelText(/Senha/), { target: { value: 'y' } });
  fireEvent.click(screen.getByRole('button', { name: /Acessar Ambiente/ }));
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

it.each([
  ['TEACHER', ROUTES.TEACHER_PLANS],
  ['STUDENT', ROUTES.DASHBOARD],
  ['ADMIN', ROUTES.APPLIANCE],
])('%s sem redirect vai para a rota padrão do papel', async (role, expected) => {
  await submitAs(role);
  expect(nav.push).toHaveBeenCalledWith(expected);
});

it('redirect válido tem prioridade sobre a rota padrão', async () => {
  nav.redirect = ROUTES.TEACHER_MATERIALS;
  await submitAs('TEACHER');
  expect(nav.push).toHaveBeenCalledWith(ROUTES.TEACHER_MATERIALS);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run 'src/app/(auth)/login'`
Expected: FAIL no caso TEACHER (`push` chamado com `/materials`).

- [ ] **Step 3: Modify `LoginPage.tsx`**

Substitua a cadeia `else if (data.user.role === 'ADMIN') ... else router.push('/dashboard')` por `router.push(getDefaultRouteForRole(data.user.role))`. Mantenha o ramo do `redirectTarget` e o `router.refresh()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run 'src/app/(auth)/login'`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(auth)/login/_components/LoginPage.tsx' 'src/app/(auth)/login/_components/__tests__/LoginPage.test.tsx'
git commit -m "fix(login): route every role to its default route after login"
```

---

### Task 5: Gate final e verificação manual

**Files:** nenhum novo.

- [ ] **Step 1: Run the full gate**

Run: `npm run test:ci`
Expected: typecheck, lint, vitest e build sem erros.

- [ ] **Step 2: Manual check in the browser (dev server, `NEXT_PUBLIC_DEMO_MODE=true`)**

Para cada credencial de `src/lib/constants/demo-credentials.ts`:

1. Login sem parâmetro de retorno cai em: aluno `/dashboard`, professor `/teacher/plans`, admin `/appliance`.
2. O menu mostra exatamente os links do papel; clicar em cada um troca a página e destaca o link.
3. Botão Sair leva a `/login`; abrir `/teacher/plans` depois disso redireciona para `/login?redirect=/teacher/plans`.
4. Professor: fechar a aba, abrir `/`, clicar em "Entrar na Plataforma" leva a `/teacher/plans`.

Expected: os quatro itens valem para os três papéis (o item 4 só para o professor).

- [ ] **Step 3: Report**

Nenhum commit nesta tarefa. Relate o resultado do gate e da verificação manual.
