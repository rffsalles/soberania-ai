# Navegação por papel: menu, logoff e rota inicial consistente

Data: 2026-10-23

## Problema

Aluno, professor e admin não têm uma navegação uniforme entre as telas autenticadas.

- O header compartilhado (`src/components/layout/app-header.tsx`), que contém a barra de links e o botão "Sair" (`user-nav.tsx`), é incluído página a página. Só as páginas do aluno, `/reports` e `/appliance` o renderizam. Nenhuma página de `/teacher/*` nem `/admin/subjects` o inclui, então o professor e o admin ficam sem menu e sem logoff nessas telas.
- Os links do header são genéricos (Painel, Analytics Docente, Acervo RAG, Hardware & Telemetria) filtrados por RBAC. Faltam Planos, Aulas, Cronogramas, Avaliações e Disciplinas. "Painel" aponta para o painel do aluno mesmo para professor e admin.
- A tela de login (`LoginPage.tsx`) envia o professor para `/materials` (rota legada que redireciona para `/teacher/materials`), enquanto o middleware, quando já existe cookie, usa `getDefaultRouteForRole`, que devolve `/teacher/plans`. Por isso o primeiro acesso cai em materiais e os seguintes em planos.

## Objetivo

Em todas as telas autenticadas, cada papel vê um menu com as suas telas e a opção de sair. A tela inicial pós-login é a mesma no primeiro acesso e nos seguintes.

Critérios de sucesso:

1. Logar como aluno, professor e admin e ver, em toda página autenticada, o menu do papel e o botão Sair.
2. Navegar entre as telas do papel pelo menu, com o link ativo destacado.
3. Professor autenticado sem parâmetro de retorno cai em `/teacher/plans` no primeiro login e nos seguintes.
4. `npm run test:ci` passa (typecheck, lint, vitest, build).

Decisões já tomadas com o usuário:

- Tela inicial do professor: Planos de Ensino (`/teacher/plans`).
- Menu do admin: telas de gestão mais todas as ferramentas docentes.

## Desenho

### 1. Header nos layouts por área

Cinco arquivos `layout.tsx` novos, cada um renderizando `<AppHeader />` seguido de `{children}`:

- `src/app/(student)/layout.tsx`
- `src/app/(teacher)/layout.tsx`
- `src/app/(admin)/layout.tsx`
- `src/app/teacher/layout.tsx`
- `src/app/admin/layout.tsx`

São cinco arquivos porque as pastas das áreas estão espalhadas entre grupos de rota e pastas comuns. Reorganizar as pastas em um grupo único foi descartado pelo churn (cerca de trinta páginas renomeadas).

As oito páginas que hoje importam e renderizam `AppHeader` deixam de fazê-lo, em todos os seus ramos (carregamento, erro, conteúdo):

- `src/app/(student)/dashboard/_components/DashboardPage.tsx`
- `src/app/(student)/classroom/[sessionId]/_components/ClassroomPage.tsx`
- `src/app/(student)/study-group/[groupId]/_components/StudyGroupPage.tsx`
- `src/app/(student)/office-hours/[agendaId]/_components/OfficeHoursPage.tsx`
- `src/app/(student)/exam/[examId]/_components/ExamPage.tsx`
- `src/app/(student)/draft-review/[agendaId]/_components/DraftReviewPage.tsx`
- `src/app/(teacher)/reports/_components/TeacherReportsPage.tsx`
- `src/app/(admin)/appliance/_components/ApplianceTelemetryPage.tsx`

Login (`(auth)`), landing (`/`) e pitch (`/pitch`) ficam fora dos layouts, como hoje. O root layout não muda.

### 2. Menu por papel

Novo módulo `src/components/layout/nav-links.ts`, ao lado do header, exportando um mapa de papel para lista de links `{ href, label, icon }`:

| Papel | Links, nesta ordem |
| --- | --- |
| STUDENT | Painel (`/dashboard`) |
| TEACHER | Planos de Ensino (`/teacher/plans`), Aulas (`/teacher/lessons`), Cronogramas (`/teacher/schedules`), Avaliações (`/teacher/assessments`), Acervo RAG (`/teacher/materials`), Relatórios (`/reports`) |
| ADMIN | Disciplinas (`/admin/subjects`), Telemetria (`/appliance`), seguidos da lista completa do professor |

Os `href` vêm de `ROUTES` em `src/lib/constants/routes.ts`. Os ícones são componentes do `lucide-react`.

O `AppHeader` passa a:

- Escolher a lista pelo `user.role` carregado por `useCurrentUser`. Sem usuário carregado, a lista é vazia (comportamento atual).
- Continuar filtrando cada link por `canAccessRoute(href, role)` como rede de segurança. Com as listas corretas o filtro não remove nada; ele existe para que um erro na lista nunca exponha um link proibido.
- Marcar como ativo o link cujo `href` é igual ao `pathname` ou é prefixo dele seguido de `/`. Isso substitui a exceção atual para `/dashboard`.
- Apontar o logo para `getDefaultRouteForRole(user.role)` quando há usuário, e para `/` quando não há.

O layout visual do header (barra superior com logo, telemetria e menu de usuário; sub-barra com os links) não muda. Em telas estreitas a sub-barra continua rolando horizontalmente.

### 3. Login e rota inicial

`LoginPage.tsx` substitui as três strings fixas por `getDefaultRouteForRole(data.user.role)`. O parâmetro `redirect` continua tendo prioridade quando começa com `/`. `getDefaultRouteForRole` fica como única fonte da rota inicial para login e middleware. A rota legada `/materials` continua redirecionando para `/teacher/materials`.

### 4. Logoff

Nada muda em `user-nav.tsx`. O botão Sair passa a aparecer em todas as páginas autenticadas por consequência da seção 1.

### Tratamento de erros

Sem mudanças de comportamento: enquanto `/api/v1/auth/me` carrega, o header mostra o esqueleto do menu de usuário e nenhum link; se a chamada falha, mostra o botão Entrar.

## Testes

- `src/components/layout/__tests__/nav-links.test.ts`: para cada papel, todo `href` da lista é permitido por `canAccessRoute`; a lista do admin contém, na mesma ordem relativa, todos os links do professor; a lista do professor não contém rotas de admin.
- `src/components/layout/__tests__/app-header.test.tsx` (jsdom, com `next/navigation` e `useCurrentUser` mockados): professor vê os seis rótulos do seu menu e o botão Sair; aluno vê só Painel; o logo aponta para a rota padrão do papel; o link cujo caminho é prefixo do `pathname` recebe o estilo ativo.
- `src/app/(auth)/login/_components/__tests__/LoginPage.test.tsx`: com `fetch` mockado devolvendo um usuário TEACHER e sem parâmetro `redirect`, `router.push` é chamado com `/teacher/plans`.
- Gate final: `npm run test:ci`.

## Fora de escopo

- Remover os links "Voltar aos Planos" das páginas do professor.
- Menu lateral, hambúrguer ou qualquer mudança visual no header além dos links.
- Reorganizar as pastas de `src/app`.
