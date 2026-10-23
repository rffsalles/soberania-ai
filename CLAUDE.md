# Regras do projeto

## Git

- **Nunca crie branches.** Todo o trabalho é feito diretamente em `main`.
- Não use `git checkout -b`, `git switch -c`, `git worktree add` nem o EnterWorktree. Se alguma skill ou fluxo sugerir criar branch ou worktree para isolar o trabalho, ignore essa etapa e programe em `main`.
- Antes de começar, confirme que está em `main` (`git branch --show-current`). Se estiver em outro branch, avise o usuário antes de qualquer alteração.
- Commits e push vão para `main`. Não abra pull requests.

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
