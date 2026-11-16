# soberania-ai

> Project memory for Claude Code. Keep this file short and high-signal —
> bloated memory gets ignored. Put hard guarantees in hooks, not prose.

## Git

- Todo trabalho de implementação roda em um worktree próprio por issue/feature (`EnterWorktree` ou `/pm:issue-work`), nunca direto em `main`. O hook `guard-main-branch` bloqueia edição em `main`.
- Um branch por worktree, nome `type/N-slug`. Commits seguem conventional commits.
- PR para `main` com `Closes #N`: abra com `/pm:commit-push-pr`; mergeie com `/pm:pr-merge` depois do CI.
- Antes de começar, rode `git branch --show-current`. Se estiver em `main`, crie ou entre no worktree.
- Ao terminar, remova o worktree com `/pm:worktree-remove`.

## Modo orquestrador (obrigatório)

Você planeja, delega, verifica e reporta. Subagentes (tool Agent) executam o trabalho.

**NUNCA** use Edit/Write nem leia código em massa: despache um Agent. Você só pode:

- responder sem tocar em arquivo
- verificar: testes, typecheck, git diff
- editar `.claude/tmp/` e `.claude/memory/`
- editar config de 1-3 linhas
- usar git, gh e MCP

Sem outras exceções: "é mais rápido" ou "já tenho o contexto" não justificam.

**Todo Agent:**

- model explícito: haiku = mecânico; sonnet = multi-arquivo, review, debug; opus = julgamento. Sem o modelo? Use outro, nunca faça você mesmo.
- em paralelo: vários Agent numa só mensagem. Em série só se editam o mesmo arquivo ou um depende do outro.
- contexto completo: subagente não herda nada. Passe tarefa, paths, restrições e retorno.

Por quê: paralelo é mais rápido e preserva seu contexto para coordenar.

## Behavioral guidelines
<!-- aia-harness:behavioral — non-negotiable; do not edit, reorder, or remove during enrichment -->

1. **Think before coding** — state assumptions explicitly; if multiple interpretations exist, present them instead of picking silently; say so when a simpler approach exists; if something is unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem. No speculative features, no abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the request requires; match existing style; don't refactor, reformat, or "improve" adjacent code. Remove orphans *your* change created; leave pre-existing dead code alone (mention it, don't delete it). Every changed line should trace directly to the user's request.
4. **Goal-driven execution** — turn tasks into verifiable goals ("fix the bug" → "write a test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify check per step, then loop until verified.
5. **Main session = orchestrator — it does not implement.** Plan, decide, coordinate; ALL delegable implementation and analysis goes to a specialist subagent via `Agent`, parallel when scopes don't conflict.
6. **Write to ASD-STE100.** Put every text you produce — reply, subagent prompt, commit, PR, doc, memory — in Simplified Technical English, and apply the same rules to Portuguese. Lead with the result. Use one term per concept and one meaning per term. Keep an instruction to 20 words and a description to 25. Keep a paragraph to 6 sentences. Write one instruction per sentence, in the imperative, in the active voice and in a simple tense. Put the action in the verb, not in a noun ("validate", not "do the validation"). Give the command before the risk in a warning. Break complex text into a vertical list. Cut preamble, flourish, repetition and recap — but never to the point where a sentence gains a second reading.

## Lean delivery — plan, execution and review
<!-- aia-harness:lean-delivery — non-negotiable; do not edit, reorder, or remove during enrichment -->

Applies to every plan (`superpowers:writing-plans`, `/plan`, planner agents) and every execution (`superpowers:subagent-driven-development` in waves, `/orchestrate`). On conflict with a skill, rule or agent description, this section wins.

- **A plan specifies; it does not implement.** Per task: `Files:` and `Depends-on:` (parallel waves), the contract or signature, the rules and business rules that apply (by name), and the test cases. Write code only where the exact form is the requirement: money math, API contract, migration, locking query.
- **A task is a cohesive slice for one specialist, with its own tests** (schema + migration; service + tests; route + contract + tests). No micro-tasks; aim for at most 8. An acceptance criterion is not a task: point to the test that proves it.
- **Out of the plan:** review tasks, final-gate tasks, criteria-matrix tasks (they are pipeline steps), "validate data" apart from the test, scenario simulation in rounds, repeated dry-runs, waits of hours or days, and manual user actions. Simulate only a critical money or security scenario that no automated test covers: one run, inside the task that implements it.
- **What only production can confirm** (real data, a window of days, a manual check) is a criterion marked `(post-deploy)`. It becomes one "Post-deploy follow-up" item in the PR body. It is not a task. It never blocks the merge or the issue closing: the PR keeps `Closes #n`.
- **Review once per finished issue or sub-issue:** the project's code-review flow (`/code-review`, with its own internal rounds) and, on the PR, its normal loop. Never per task, wave or plan phase. No per-task reviewer (not even for money or auth), no fix-and-re-review rounds, and no separate final review from the execution skill. The task gate is its scoped tests passing; if they fail, the same specialist fixes them (2 attempts at most), then escalate. Fix P0/P1 findings directly; minor findings follow the review flow's own severity cut, with no extra round.
- **Implementers are the project's specialist agents with an explicit `model`:** `sonnet`, or `haiku` for docs, config and mechanical edits with a complete spec. Never `opus`.
- **Docs and config have no plan:** dispatch directly to a Haiku or Sonnet agent.
- **Status to the user:** 1 line per milestone, not task by task.

## Stack
TypeScript, Python, SQL · Next.js + React + shadcn/ui + Prisma · npm

Architecture: **layered**.

## Canonical commands
Always use these exact commands (do not guess):

- **Install:** `npm install`
- **Lint:** `npm run lint`
- **Typecheck:** `npm run typecheck`
- **Test:** `npm run test`
- **Build:** `npm run build`
- **Run/Dev:** `npm run dev`

## Skills — for this stack

> Invoke the matching skill before working in its domain.

- **UI/UX** → `ui-ux-pro-max:ui-ux-pro-max` — component design, accessibility, UX
- **Tailwind** → `tailwind-patterns` — utility patterns, theming, responsive layout
- **Database (Prisma/PostgreSQL)** → `database-design` — schema, migrations, indexes, queries

## Workflow & Agents

Invoke `superpowers:subagent-driven-development` for **non-trivial** implementation — trigger it when the request meets **≥2** of:

- touches **3+ files** or **2+ domains/layers** (UI + agent, API + DB…)
- is a **new feature / epic / cross-cutting refactor** (not a one-line or single-function change)
- needs a **multi-step plan** or ordered tasks, each with its own verification
- has **unclear scope or root cause** and needs exploration before coding

Skip SDD — delegate to a single haiku/sonnet specialist — for typo/copy fixes, single-function edits and one-file bugs with an obvious cause; config of 1-3 lines may be edited directly (see `## Modo orquestrador`).

Plans and review cadence follow **Lean delivery** (above): the plan specifies, the task gate is its scoped tests, and review runs once per finished issue.

When dispatching subagents, you MUST use the matching specialist agent from `.claude/agents/` — never the generic agent when a specialist covers the domain. Pass the exact name as `subagent_type`.

Model dispatch: the `model` you pass on the call wins over the agent's frontmatter `model`, and the agent's frontmatter `effort` applies either way — the Agent tool takes no effort parameter. A generic dispatch or a project/user agent with no `model` on the call or in frontmatter is force-set to `sonnet` by a PreToolUse hook, so it never silently inherits this session's model — except namespaced plugin agents (`plugin:name`), left unrewritten since their frontmatter isn't reliably hook-resolvable. Pass `model` explicitly on every dispatch, cheapest tier that fits: `haiku` for search, docs, config and mechanical edits with a complete spec; `sonnet` for implementation, tests, review and debugging; `opus` for planning, cross-domain orchestration and the final review of a money, security or irreversible change — never as an implementer.

Specialists live in `.claude/agents/` (descriptions = when to use); dispatch rules: `.claude/rules/07-subagent-dispatch.md`.

### Superpowers → Project Specialists (mandatory bridging)
<!-- aia-harness:agent-routing — superpowers→specialist bridge; do not remove -->

Superpowers skills (`superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`,
`superpowers:executing-plans`, `superpowers:systematic-debugging`) show `general-purpose` as the default
`subagent_type` in their examples. **Never dispatch `general-purpose` (or a generic
implementer) when a specialist below covers the domain** — pass the specialist's exact
name as `subagent_type` instead.

> Basis: superpowers itself states "User's explicit instructions (CLAUDE.md) — highest
> priority." This section applies that priority over the agent types its examples suggest.
> The normal flow is unchanged (`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`);
> only the dispatched `subagent_type` changes.

| When superpowers would use `general-purpose` for… | Dispatch instead |
|---|---|
| Multi-domain feature — subdelegates to specialists | `orchestrator` |
| Review / audit changed code | `code-reviewer` / `security-reviewer` |
| E2E / QA automation | `qa-automation-engineer` |
| Unit / integration tests | `test-engineer` |
| Schema / migration / query / data modeling | `database-architect` |
| Deploy / CI/CD / infra | `devops-engineer` |
| Backend / API / server-side / domain logic | `backend-specialist` |
| UI / components / styling / pages | `frontend-specialist` |
| Performance profiling / optimization | `performance-optimizer` |
| Understand legacy code before changing it | `code-archaeologist` |
| Bug / crash / root-cause analysis | `debugger` |
| Explore / map an unfamiliar codebase | `explorer-agent` |
| Documentation (only when explicitly requested) | `documentation-writer` |
| Offensive security / pentest | `penetration-tester` |
| Security audit / defensive review | `security-auditor` |

### Parallel wave execution (subagent-driven-development)
<!-- aia-harness:parallel-sdd — parallel wave execution override; do not remove -->

Override `superpowers:subagent-driven-development`'s serial one-implementer-at-a-time default with
parallel waves of independent tasks. Its "never dispatch implementers in parallel" red flag is
superseded here because its two premises are removed: disjoint file ownership per wave, and
controller-serialized commits instead of implementer self-commits. During planning, tag each task
`Files:` / `Depends-on:`; batch tasks with disjoint `Files` and no mutual dependency into one wave,
and dispatch their implementers in a single message using the specialist types from the table above.
Keep the skill's implementer prompt contract intact — the only change is implementers do
NOT self-commit. Drop the skill's per-task reviewer, fix and re-review rounds, and final review:
review runs once per finished issue (see "Lean delivery"). Untagged or uncertain tasks run serial
(no regression). Full protocol: `.claude/rules/08-parallel-subagent-driven-development.md`.

## Architecture map

Domain CLAUDE.md files load on demand in: `src/components/`, `src/domains/*`, `src/lib/auth/`, `src/app/api/v1/`, `prisma/`.

- `src/middleware.ts` — gate único de sessão: valida cookie JWT (`@/lib/auth/token`), aplica RBAC por prefixo (`@/lib/auth/rbac`), responde 401/403 em `/api/*` e injeta `x-user-*`.
- `src/app/(admin|teacher|student)/` — páginas por papel; UI própria em `_components/` (testes em `__tests__/`); chamam `/api/v1/*`.
- `src/app/api/v1/<recurso>/route.ts` — handlers finos: `requireUser` → service do domínio → `NextResponse.json({ success, ... })`; erros via `apiError`.
- `src/domains/<dominio>/` — regras de negócio: academic, agendas, agents (tutora/prompts/guardrails), assessments, auth, classroom, pedagogy, rag, storage, teaching, telemetry.
- `src/domains/classroom/` — sala de aula por eventos (`class-event-*`, SSE via `class-event-stream`), política da tutora proativa e worker de rascunhos de passo.
- `src/domains/rag/` — ingestão, capítulos em árvore, busca híbrida (pgvector + tsvector + gate lexical); embeddings via `@/lib/embeddings`.
- `src/domains/agents/` — pipeline da tutora (`tutor-pipeline`, `citation-guard`, `answer-judge`); LLM só via `@/lib/ai-provider`.
- `src/domains/*/services/*-service.ts` + `*-repository.ts` — serviço orquestra, repositório fala com Prisma (`@/lib/db`).
- `src/lib/auth/` — `requireUser(req, roles)`, sessão, senha, RBAC; `AuthError` (401/403).
- `src/lib/api/` — `apiError` e `DomainError(status, msg)`: mapeamento único erro → resposta.
- `src/lib/validators/*.validator.ts` — schemas Zod de entrada, usados por serviços/rotas.
- `src/lib/mcp/` e `src/app/api/v1/mcp/` — servidor MCP e tools expostas; `src/lib/sandbox/` — execução Python isolada.
- `src/components/` — UI compartilhada por feature (`ui/` = primitivos); sem regra de negócio.
- `prisma/` — `schema.prisma` (PostgreSQL + pgvector), `migrations/` timestampadas, `seed.ts` + `seed-data/`.
- `tests/playwright` e `tests/e2e` — E2E; `evals/` — avaliação Python da tutora (fora do `npm test`).

## Conventions

- Imports sempre pelo alias `@/` (nunca `../../`); domínios expõem API pública via `index.ts` quando existe.
- Rota API: `try { requireUser(req, [Role...]) → serviço } catch { return apiError(e) }`; falha de negócio = `throw new DomainError(status, msg)`. Resposta `{ success: true, ... }` ou `{ success: false, error }`.
- Autorização em duas camadas: prefixo em `PROTECTED_ROUTE_ROLES` (`lib/auth/rbac.ts`) + `requireUser` na rota; ao criar rota/página nova, registre o prefixo no RBAC.
- Regra de negócio fica em `src/domains/*/services`, nunca em `route.ts` nem em componente; entrada validada com Zod em `lib/validators/<x>.validator.ts`.
- Testes Vitest ao lado do código em `__tests__/*.test.ts(x)`; UI com Testing Library, serviços com Prisma mockado; E2E em `tests/playwright`. Ver flaky conhecidos antes de investigar.
- Textos de UI, mensagens de erro, commits e docs em pt-BR; identificadores de código em inglês.
- Migration: `prisma migrate dev` gera DROPs espúrios por drift do pgvector/tsvector (`Unsupported`); revise o SQL antes de commitar. Nunca rodar seed no banco de dev 5432.
- `.claude/rules/05-testing.md` wins over `.claude/rules/ecc/common/testing.md`: no 80% coverage gate, no mandatory TDD.

## Engineering rules
<!-- aia-harness:fixed — non-negotiable; do not edit, reorder, or remove during enrichment -->

- Match the style of surrounding code; do not introduce new patterns unprompted.
- Test what can break — business rules, branching logic, money/security/auth, bug regressions; skip trivial getters, wrappers, config, presentational UI (rubric: `.claude/rules/05-testing.md`).
- Run the lint + test commands above before claiming work is complete.
- Never commit secrets; keep them in gitignored env files (`.env`/`.env.local`) — `.claude/settings.local.json` is only for MCP-server credentials referenced by `.mcp.json`.
- Fix every compilation/syntax/lint error found during a session — regardless of whether you edited the file. Never leave the build broken or label errors "pre-existing, not related".
- When performing a code review (user requests it or a workflow triggers it), always use `code-reviewer` and `security-reviewer`, applying the `uncle-bob-craft` skill's criteria (Dependency Rule, SOLID in context, code smells) alongside their findings.

## graphify
<!-- aia-harness:graphify-root — knowledge-graph usage; merged section, do not remove -->

When graphify-out/graph.json exists, it holds a knowledge graph of this project: god nodes, communities and cross-file relationships.

Rules:

- To locate code or trace a flow, run `graphify query "<question>"`, `graphify explain "<concept>"` or `graphify path "<A>" "<B>"` first — before rg/grep/find or reading files — via plain Bash, not ctx_execute. Output TRUNCATED: pass `--budget <n>` or narrow the question. Skip the graph when the exact path is known.
- Never run `graphify update .`, `graphify .`, `graphify install` or `graphify extract`. Git hooks rebuild the graph after commit, checkout, merge and rewrite.
- A hook injects this rule in every session and subagent. Fan out code investigation to specialist subagents (`model: haiku`) in parallel, never one at a time.
- If context-mode is installed, its `ctx_*` tools are only for large output. Keep graphify, git and rtk on plain Bash.

@.claude/memory/INSTRUCTIONS.md
@.claude/memory/MEMORY.md
<!-- Generated by aia-harness. Edit freely; re-run /aia-harness:doctor to audit. -->

## obsidian-vault
<!-- aia-harness:obsidian-root — vault memory pillar; merged section, do not remove -->

- **obsidian-vault** (`.claude/rules/obsidian.md`) - this project's long-term memory at `vault-obsidian/`, MCP-only access via `mcp__obsidian__*` tools, never direct file access.

Before answering anything that touches a past decision, a failed approach, or a convention spanning modules, or when resuming work from an earlier session, call `mcp__obsidian__search_notes_tool` first. See `.claude/rules/obsidian.md` for the full trigger table, write-tool traps, and access rules.
