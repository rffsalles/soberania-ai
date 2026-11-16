---
description: 'Implements an issue, an epic or a free task 100% autonomously through /goal. Single issue or free task: 5-phase pipeline (implementation, gates, /code-review once, draft PR, PR review loop with a ceiling of 3 rounds, then ready). Epic: PHASES 1-3 plus integration per sub-issue (one /code-review each) plus a FINAL REVIEW (PHASES 3-5) on the epic-to-main PR. Step 2 only builds and prints the /goal for manual paste (never auto-runs it). No stop in the middle of the pipeline (safety gates only).'
argument-hint: '[issue-num] [--base <branch>] [--epic] [--worktree|--no-worktree] | "free task"'
---

## Injected context

- Current branch: !`git branch --show-current`
- Owner/Repo: !`node -p "const c=require('./.claude/pm-config.json');c.owner+'/'+c.repo" 2>/dev/null || echo "NOT_FOUND"`
- Arguments: $ARGUMENTS

> This command follows the pipeline of `.claude/commands/pm/issue-work.md` inside an autonomous `/goal` loop, and adds epic mode and free-task mode. The review runs **once per finished issue or sub-issue** (never per task, commit or wave). Epic: each sub-issue runs PHASE 3 (one `/code-review`), and PHASE 5 is deferred to the FINAL REVIEW (PHASES 3-5) on the epic-to-main PR (see MODE: EPIC > FINALIZATION in `loop-mode-epic.md`).
>
> `main` in this file means the default branch of the repository. Use the real name when it differs.
>
> Step 2 only **builds and prints** the `/goal`. It never runs it. The user pastes it by hand in the same session to start the autonomous run.
>
> No `python3` in this file. All parsing is `gh --jq` or `node -p`/`node -e`: on Windows the stock `python3` is an App Execution Alias stub that opens the Microsoft Store.
>
> Run this command in a session opened in this repository. If the session cwd is not this repo (session at the workspace root, or a subagent whose Bash cwd resets on each call), stop and ask the user to reopen the session here. Do not redirect with `git -C` or `gh -R`.

---

## Step 0 - Mode and flags

> `/code-review` and the `superpowers:*` skills used by the phases come from Claude Code plugins, not from this repository. If one is missing, run `/aia-harness:add-plugins` to install them.

> The main session is a pure orchestrator. It never implements or fixes inline. It always dispatches a subagent: the specialist for the task type from the "Workflow & Agents" table of the root `CLAUDE.md` (never `general-purpose` when a specialist is listed). Delegate heavy reading (diffs, code, issue checks) to the phases and subagents: the main context only coordinates and validates evidence. Phases are sequential (single issue or free task: 5; epic sub-issue: 1-3 plus integration, and the FINAL REVIEW once on the epic), with zero parallelism between phases. Parallelism lives only inside a phase: `superpowers:subagent-driven-development` and `/code-review` already include fan-out and tiers (Haiku for search, Sonnet for implementation, Opus for architectural judgment; where installed, the hook `.claude/hooks/orchestration-mode.mjs` sets the model and parallelism policy). Never flatten the tiers. Send independent Bash calls (Pre-Pipeline C+D, Post-Pipeline E+F of `loop-mode-single.md`) in the same message.

Parse `$ARGUMENTS` before you act:

| Pattern | Mode | Target PR branch |
| --- | --- | --- |
| `<num>` | Single issue | `main` |
| `<num> --base <branch>` | Single issue | `<branch>` |
| `<num> --epic` | Epic | `main` (through the integration branch; `--epic` ignores `--base`) |
| Text without a number | Free (no GitHub) | optional |
| Empty or invalid | usage, then stop | - |

Extract:

- `ISSUE_NUM`: issue number
- `BASE_BRANCH`: PR target (default `main`)
- `IS_EPIC`: true if `--epic`
- `FREE_TASK`: free text, no number
- `WORKTREE_FLAG`: `--worktree` = true, `--no-worktree` = false, none = undefined (default in Step 0.5)

**Empty or invalid:** print the usage and stop. **Invalid (objective test):** no pattern of the table matches. That is: `--epic` or `--base` without an operand (issue number or branch), `--worktree` and `--no-worktree` in the same call, or `--epic` on free text (no number).

**Epic without `--epic`:** in modes `<num>` and `<num> --base <branch>`, read the native sub-issues before SETUP. Run:

```bash
OWNER_REPO=$(node -p "const c=require('./.claude/pm-config.json');c.owner+'/'+c.repo")
gh api repos/$OWNER_REPO/issues/$ISSUE_NUM/sub_issues --jq '[.[] | select(.state == "open")] | length'
```

If the result is 1 or more, ask the user with `AskUserQuestion` (options: epic, recommended; single issue; one sub-issue only) before you create a branch, worktree or status. If the result is 0 or the call fails, follow the table. INIT runs with the user present, so asking is allowed here. It is not a stop of the autonomous loop.

> Usage: `/pm:issue-work-in-loop <issue-num> [--base <branch>] [--epic] [--worktree|--no-worktree]` or `/pm:issue-work-in-loop "free task"`

**Precondition:** `gh auth status` must show the scopes `repo`, `project`, `read:org` and `workflow`. If one is missing, run `/pm:setup-project` first (same precondition as `/pm:issue-work`).

Read the mode file now with the Read tool, before Step 0.5. MODE=single: `.claude/skills/github-pm/references/loop-mode-single.md`. MODE=epic: `.claude/skills/github-pm/references/loop-mode-epic.md` and also `.claude/skills/github-pm/references/loop-mode-single.md` (an epic sub-issue runs as a single issue). MODE=free: `.claude/skills/github-pm/references/loop-mode-free.md`. Do not continue without it: it holds the mode's SETUP, /goal template and post-pipeline. The terms Pre-Pipeline, Post-Pipeline, Step G, Step H, Iteration per sub-issue and FINALIZATION name sections of the mode file.

---

## Step 0.5 - Worktree (decision and TASK_BRANCH)

> A dedicated worktree (own dir and own branch). Zero questions: automatic. This step only decides and computes names. The **creation** happens in Step 1 (INIT), before the /goal.

`USE_WORKTREE`:

- `--worktree` = `true`
- `--no-worktree` = `false`
- no flag = `true` (default)
- Anti-nesting guard: if `git rev-parse --show-toplevel` already contains `.claude/worktrees/`, force `false`

> Epic: the worktree exists only at the epic level. Sub-issues always use `USE_WORKTREE=false`.

Record in the transcript: `USE_WORKTREE=<true|false> (origin: <flag|default|guard>)`.

**`TASK_BRANCH`** - Single issue / Epic. The prefix comes from the labels of the issue (the issue templates set `bug`, `enhancement` or `task`). The vocabulary is the same as `/pm:worktree-new` (`feat`/`fix`/`chore`/`docs`):

```bash
OWNER_REPO=$(node -p "const c=require('./.claude/pm-config.json');c.owner+'/'+c.repo")

BRANCH_PREFIX=$(gh issue view $ISSUE_NUM --repo $OWNER_REPO --json labels \
  --jq '[.labels[].name] as $l
        | if   ($l | index("bug"))            then "fix"
          elif ($l | index("task"))           then "chore"
          elif ($l | index("documentation"))  then "docs"
          else "feat" end')

ISSUE_SLUG=$(node .claude/skills/github-pm/scripts/branch-slug.mjs $ISSUE_NUM $OWNER_REPO)
[ -n "$ISSUE_SLUG" ] || { echo "issue #$ISSUE_NUM has no slug (gh failed or the title has no letter or digit) - stop"; exit 1; }

TASK_BRANCH="${BRANCH_PREFIX}/${ISSUE_NUM}-${ISSUE_SLUG}"
```

> `.claude/skills/github-pm/scripts/branch-slug.mjs` computes the slug. It transliterates accents in `node` (`.normalize("NFD")` and removal of the combining marks) **before** it lowercases and replaces the rest with `-`: an accented letter becomes its ASCII base letter (a-tilde becomes `a`). In jq, `ascii_downcase` leaves the accented letter as it is and `gsub` replaces it with `-`, so the slug would come out broken. The epic SETUP (`EPIC_SLUG`, `--max 30`) uses the same script.

**`TASK_BRANCH`** - Free (`FREE_TASK`, no `ISSUE_NUM`), same transliteration through the same script, with `--text`. Inside a worktree the Bash guard can refuse an inline `node -e`: compute this slug before `EnterWorktree`.

```bash
FREE_SLUG=$(node .claude/skills/github-pm/scripts/branch-slug.mjs --text "$FREE_TASK")
[ -n "$FREE_SLUG" ] || { echo "the free task has no slug (no letter or digit) - stop"; exit 1; }
TASK_BRANCH="feat/$FREE_SLUG"
```

---

## Step 1 - INIT before the /goal (run NOW, before you emit the /goal)

> Mirrors the setup of `/pm:issue-work` (worktree, In Progress, comment), but **without** its interactive `superpowers:brainstorming`: here the plan is born inside PHASE 1, in the `/goal`. Worktree, branch and ticket setup happen NOW, in the command body, **before** the /goal. The /goal runs entirely inside the worktree (it never starts on `main` and moves later). Once, no re-run.

Run according to the mode:

- **Single issue:** common SETUP (worktree/branch), then Pre-Pipeline Issue (read ticket, validate, assign, In Progress). See MODE: SINGLE ISSUE in `loop-mode-single.md`.
- **Epic:** graph pre-check (selection script), then epic SETUP (epic branch and worktree), then read the epic, then assign and In Progress (epic issue). See MODE: EPIC > SETUP in `loop-mode-epic.md`.
- **Free:** common SETUP (worktree/branch, `BASE_BRANCH=main`). See MODE: FREE > SETUP in `loop-mode-free.md`.

Each SETUP is detailed in the mode file read in Step 0 (the common SETUP, Branch A and B, is in this file). INIT done: go to Step 2.

---

## Step 2 - Build the /goal and stop

> This step only **builds** the `/goal` line of the mode (template in the mode file read in Step 0) and **prints it in the chat**. It never runs it. Once the user pastes it, `/goal` registers a condition and re-fires the turn until the evaluator confirms it. Never `/loop` (it runs on an interval and ignores phases). Anatomy of the condition: skill `goal-builder` (`.claude/skills/goal-builder/SKILL.md`).
>
> The line = trigger + **Roles** block (delegation) + measurable criteria (checkmarks, PR, lint/test, CI). The evaluator only reads the transcript. Never cite `/pm:issue-work-in-loop` in the line: it re-loops the command. Cite the **files** `.claude/commands/pm/issue-work-in-loop.md` and the mode file(s) of `.claude/skills/github-pm/references/`, the source of the phases (the loop reads them, it does not invoke them).
>
> `/goal` needs a trusted workspace and hooks on (it fails with `disableAllHooks`/`allowManagedHooksOnly`). In auto mode there is no per-tool stop.
>
> **Roles (mandatory in every template of the mode files):** the main session ALWAYS orchestrates, plans and delegates. It never implements or edits code directly. Specialist subagents (`ls .claude/agents/` and the `description` of each) do all implementation. Repeat the rule of Step 0 in the `/goal` text.

### /goal templates by mode

The /goal template of each mode is in the mode file read in Step 0. Print the template of the current mode as written there.

### Stop criteria of the whole loop (objective)

The pasted `/goal` iterates turn by turn. It ends the **whole loop** (not just one iteration) only on one of these objective conditions. All can be checked in the transcript. None is "if it looks done":

1. **Success (goal reached):** all markers of the mode are in the transcript (single issue/free: 5x `✅ PHASE N`; epic: each `✅ Sub-issue #N` of the automatic ones plus `✅ EPIC FINAL REVIEW`) **and** the PR is ready on the base, with the CI checks green (`check-pr-status.mjs` exit 0). **STOP** without merging `main` and without leaving the worktree (see common SETUP, Branch A step 6). Emit the final message that offers `/pm:pr-merge <N>` and end the turn.
2. **Epic - sub-issues exhausted:** `next-epic-subissue.mjs` exits with `5` (no `OPEN` sub-issue of the same repo). Then FINALIZATION, then the epic PR ready (CI green), then end.
3. **Recurring error / stuck / ceiling:** 25 consecutive turns with no new ✅ marker, **or** the turn ceiling of the mode (single issue/free: 120 in total; epic: 100 per sub-issue and 120 in the FINAL REVIEW), **or** `REVIEW: BLOCKED` (PHASE 3) or `REVIEW-PR: BLOCKED` (PHASE 5 / FINALIZATION F3: ceiling of 3 rounds), **or** 6 CI waits of 240 s that never leave `waiting` (CI wait in PHASE 5, Step G, F3). All of these are in the /goal text. Stop and report to the user.
4. **Safety gate not cleared:** the base sync (PHASE 4.1) or `check-pr-status.mjs` returns a blocking exit that does not resolve (conflict, failed CI, invalid PR). The phase stalls. If it persists, it becomes (3) and stops.
5. **Epic - controlled stop of the selection:** `next-epic-subissue.mjs` exits with `3` (the next eligible is a `manual` task), `4` (open sub-issues exist, all waiting for a blocker) or `6` (child of another repo). Emit the script message (its first line is the marker `EPIC STOP — <reason>`) and **STOP**. No FINALIZATION, no epic PR, and do not close or comment the issue. The worktree and `$EPIC_BRANCH` stay as they are. To resume: resolve the reason and run `/pm:issue-work-in-loop <epic> --epic` again (see MODE: EPIC > Iteration per sub-issue in `loop-mode-epic.md`).

Continuous progress (new ✅ every few turns) **never** triggers a stop: an epic of 3-5 sub-issues legitimately uses 100+ turns.

### After building

Never run the `/goal`. Never chain straight into PHASE 1 (or any phase) on the assumption that text printed in the transcript already fired something: the user fires the `/goal` by hand. Print the full `/goal` line in a code block, then the **final message** to the user (template; fill the placeholders with the real values of this run):

> ✅ INIT done - mode `<SINGLE ISSUE | EPIC | FREE>`, branch `<TASK_BRANCH or EPIC_BRANCH>`, worktree `<.claude/worktrees/<branch> | none (USE_WORKTREE=false)>`.
> 👉 Copy the `/goal` line above and paste it **in the SAME session** to start the autonomous pipeline - the pasted session resumes exactly where INIT stopped.
> ⚠️ This command did **not** run the `/goal`: running it is manual, yours. Nothing ran beyond INIT.

**End the command here.** Worktree, branch and ticket (Step 1/INIT) are ready.

### Protocol per turn (reference - runs only after the user pastes the /goal)

This command does not run it. It documents what the pasted `/goal` iterates each turn, once the user fires it by hand in the same session:

1. Identify the current phase (Phase tracking)
2. Run the next pending phase, always through a specialist subagent (the main session only delegates)
3. Validate success before you move on
4. Failed: fix and re-run **the same phase** (do not advance)
5. Done: emit `✅ PHASE N (<name>) done — <evidence>`
6. Stop only when the GOAL is reached (tracking of the mode at 100% plus evidence in the transcript) or on a controlled epic stop (stop criterion, item 5)

The mode file stays required during the pasted /goal loop (Step G, Iteration per sub-issue, FINALIZATION, Post-Pipeline). After /compact, re-read it with the Read tool before the next turn.

---

## 5-Phase Pipeline - mandatory

> Never skip a phase. Exact order. Single issue/free task: 5 phases. Epic sub-issue: PHASES 1-3 plus integration on `$EPIC_BRANCH` (PHASE 4: sync, commit, push, PR, Step G). PHASE 3 runs once per sub-issue, on its diff (`$EPIC_BRANCH...HEAD`). PHASE 5 **does not run per sub-issue**: it is deferred to the epic-to-main PR, in the FINAL REVIEW (once, on the integrated diff, with the PR loop). One review per sub-issue and one on the epic, never per task, commit or wave.
>
> Each phase invokes an external skill or command (`superpowers:subagent-driven-development`, `/code-review`, `superpowers:finishing-a-development-branch`, `/pm:code-review-pr`) and picks the specialist from the "Workflow & Agents" table of the root `CLAUDE.md` and the `description` of each agent in `ls .claude/agents/`. This file summarizes only the essentials. **Read the full skill, command or CLAUDE.md before you run it when you need the detail.** Nothing here is "auto-applied": a phase happens only if the turn invokes it explicitly.

```text
Single issue / Free:
PHASE 1 superpowers:subagent-driven-development (no reviewer per task) [ ]
  PHASE 2 deterministic gates                     [ ]
    PHASE 3 /code-review (once, round 0)          [ ]
      PHASE 4 superpowers:finishing-a-development-branch [ ]
        PHASE 5 PR review loop, then ready (<= 3 rounds) [ ]

Epic sub-issue (PHASE 5 deferred):
PHASE 1 -> PHASE 2 -> PHASE 3 (/code-review once, round 0) -> PHASE 4 (sync, commit, push, PR; merge through Step G)

Epic, after the last sub-issue (once):
FINAL REVIEW - PHASES 3-5: /code-review main...HEAD #epic + draft PR + PR review loop, then ready (<= 3 rounds) [ ]
```

### Phase tracking

Internal state. Validate before you advance (epic sub-issue: PHASES 1-3 plus integration; the epic adds the FINAL REVIEW, once at the end):

```text
PHASE 1 superpowers:subagent-driven-development:    [ ] pending
PHASE 2 deterministic gates:                        [ ] pending
PHASE 3 /code-review (once):                        [ ] pending
PHASE 4 superpowers:finishing-a-development-branch: [ ] pending
PHASE 5 PR review loop and ready (single issue/free): [ ] pending
FINAL REVIEW of the epic (epic only, PHASES 3-5):   [ ] pending
```

`[ ]` = pending, run it. All of the mode `[x]` = done (next sub-issue, or end).

> When a phase ends, emit `✅ PHASE N (<name>) done — <evidence>` (for example: PHASE 1 = ledger plus `DONE` reports of the tasks; PHASE 2 = the output of the verification commands; PHASE 3 = "REVIEW: OK"; PHASE 4 = PR URL; PHASE 5 = "REVIEW-PR: READY, CI green"). The evaluator only reads the transcript.

---

### PHASE 1 - superpowers:subagent-driven-development

Tier per task: Haiku (docs, config, mechanical edit with a full spec) or Sonnet; never Opus. Source = **ticket** (`gh issue view $ISSUE_NUM --repo $OWNER_REPO --json title,body,comments,labels`) or `FREE_TASK` (free mode). Split it into tasks (cohesive slices of 1 specialist, with its own tests; up to 8; an acceptance criterion is not a task; an item marked `(post-deploy)` stays out of the tasks). Implement task by task. **It merges plan, implementation and focused tests.** **No reviewer per task**: the review is PHASE 3, once, at the end. Follow the "Lean delivery" and domain rules of the root `CLAUDE.md` and `.claude/rules/`, where the project has them.

> The `Files:` of each task must also declare the **incidental state** it touches (lockfiles, generated code, migrations, build output). Without it, two tasks land in the same wave and collide.

1. Ledger `.superpowers/sdd/progress.md`: Read it in full before you write (never a blind append; one ledger per worktree). Epic: scope the tasks of the sub-issue under the header `## Sub-issue #N` (sub-issues share the epic worktree).
2. Per task: build the brief, then the implementer (it runs the focused tests of its own task and reports). **No task reviewer and no fix loop per task.**
3. Tier per task: docs, config and mechanical edit with a full spec (even across many files) = Haiku, and check the result on disk; the rest = Sonnet; never Opus. Where installed, the hook `.claude/hooks/subagent-model-guard.mjs` forces `sonnet` on a dispatch with no `model` on the call and no `model` in the agent frontmatter. A namespaced plugin agent (`plugin:name`) is not rewritten. Pass an explicit `model` when you want Haiku.
4. All tasks done: **skip the whole-branch review of the SDD** (`requesting-code-review`). PHASE 3 (`/code-review`) is the only review: running both is a duplicate review, cost with no gain.

**Parallelism - 2 levels:**

- **Intra-task:** specialists in parallel (several `Agent` calls, same message), disjoint scopes. Same file = serialize.
- **Inter-task (waves):** tasks with `Depends-on: none` between them **and** disjoint `Files` go in the SAME wave, implementers in parallel. Implementers do NOT commit: the controller commits after the wave. No tags or a dependent chain = sequential. Where the project has `.claude/rules/08-parallel-subagent-driven-development.md`, it holds the full mechanics.

Each specialist gets a self-contained prompt. A task is done only with the `DONE` report of the implementer and its focused tests green.

**Done when:** tasks finished (`DONE` report and focused tests green), ledger `.superpowers/sdd/progress.md` updated. Full gates and acceptance criteria stay for PHASES 2 and 3.

### PHASE 2 - Deterministic gates

The gates are the project's own lint, typecheck and test commands (see the "Commands" section of the root `CLAUDE.md` and the scripts of the package manifest).

- Where installed, the `Stop` hook `.claude/hooks/verify-on-stop.mjs` runs lint and typecheck by itself when the session edits code, and never fixes anything. It passes silently, so the literal evidence is the output of the commands below.
- Run the project's lint, typecheck and test commands **once**, through a specialist subagent, in check mode (no autofix).
- A gate fails: the specialist of the domain of the failing file fixes it (never inline) and the gates run again. **2 tries**, then stop and report (stop criterion 3).
- Binary: no score, no threshold. No `/simplify`: the review is PHASE 3, once only.
- Epic sub-issue: it applies per sub-issue.

**Done when:** the gates pass. Cite the command output in the transcript.

### PHASE 3 - /code-review

Invoke **`/code-review $BASE_BRANCH...HEAD #$ISSUE_NUM`** (free: no `#`). Always an explicit range, **once only, before the first push** (round 0). `/code-review` dispatches its own reviewers in parallel, consolidates and applies **one** correction pass. **No extra reviewer in this phase** and no `/simplify`. If the project has no `/code-review`, run `/pm:code-review-pr` on the local diff once instead.

- Give the reviewer the acceptance criteria of the issue and ask for a matrix (requirement to evidence). A ❌ criterion becomes a P1 finding and goes into the single correction pass.
- The main session ends the review with a last line `REVIEW: OK` (every P0/P1 finding fixed, gates green after the last correction) or `REVIEW: BLOCKED — <reason>` (stop the loop and report, stop criterion 3). Never re-run `/code-review` in a loop.

> **Review watchdog** (single description: PHASE 5 and F3 of FINALIZATION point here). A review wave (`/code-review`, `/pm:code-review-pr`) has a ceiling of **25 min**, and the main session never waits in silence. Each wave has its own clock:
>
> 1. **Arm** right after you dispatch the wave: `sleep 1500` through the Bash tool with `run_in_background: true`. Note the task id: it is the watchdog of **that** wave.
> 2. **Wave closed on time:** `TaskStop` that watchdog before you go on. A forgotten timer fires inside a later wave and stops its agents too early.
> 3. **Watchdog fired with the wave open:** `TaskStop` on each stuck child and ask the dispatcher of the wave (`SendMessage`) for the partial result. The partial result is diagnostic only: it does not replace the review, and the reviewer with no final result stays pending.
> 4. **Re-run once** each reviewer with no final result, in its own wave with a new watchdog (step 1).
> 5. **The ✅ of the phase comes out only when every reviewer of the wave has a final result.** "Clean review" does not count with an uncovered reviewer. If the re-run also timed out, stop the loop and report to the user, with no ✅ (it counts as recurring error / stuck, stop criterion 3).

**Done when:** `REVIEW: OK` on the last line, with the gates (run after the last correction) green.

### PHASE 4 - superpowers:finishing-a-development-branch

Sync, commit, push, draft PR. Epic sub-issue: 4.1 and the PR to `$EPIC_BRANCH`, without 4.0.

**4.0 - Acceptance criteria on the issue (single issue only; free has no issue):** take the criteria matrix of PHASE 3 (all ✅). Mark the met criteria in the issue body: only the items, the rest untouched. `- [ ] Criterion X` becomes `- [x] ✅ Criterion X — <evidence>`. One edit, done by the main session, with no subagent. Temporary files go in `.claude/tmp/` in the worktree (gitignored): never `/tmp` and never the scratchpad of the system prompt (a permission prompt breaks the loop). Inside the worktree, one statement per Bash call and a literal value in place of a shell variable. `<ISSUE_NUM>` and `<OWNER_REPO>` below are the values of this run, substituted before you run. Items of a `(post-deploy)` follow-up stay as they are (`- [ ]`) and out of the matrix.

```bash
mkdir -p .claude/tmp
```

```bash
gh issue view <ISSUE_NUM> --repo <OWNER_REPO> --json body --jq .body > ".claude/tmp/issue-<ISSUE_NUM>.md"
```

Edit the file and mark ✅ item by item, then:

```bash
gh issue edit <ISSUE_NUM> --repo <OWNER_REPO> --body-file ".claude/tmp/issue-<ISSUE_NUM>.md"
```

**4.1 - Sync with base (mandatory):** never open a PR without syncing. It avoids a conflict at the final merge. The commit subject is a Conventional Commits type with the `(#N)` scope (for example `feat(#12): add ...`); the `#N` in the message is what `commit-to-progress.yml` reads. Epic sub-issue: add `Refs #<sub>` to the commit body (the epic review reads it, see FINALIZATION F2).

```bash
git add <relevant-files>
git commit -m "<type>(#$ISSUE_NUM): <short description>"
```

```bash
git fetch origin $BASE_BRANCH
git merge origin/$BASE_BRANCH
```

| Result | Meaning | Action |
| --- | --- | --- |
| Merge clean (or "Already up to date") | Updated | push, then PR |
| Conflict | Files with `<<<<<<<`/`=======`/`>>>>>>>` (`HEAD` = local, `origin/$BASE_BRANCH` = remote) | a specialist resolves it (keep both sides' intent), then `git add` and `git commit --no-edit`; re-run the PHASE 2 gates |
| `git fetch` fails | Network failure, or the cwd drifted out of the worktree | network: retry. Wrong cwd: go back to the worktree directory and re-run |
| `git branch --show-current` equals `$BASE_BRANCH` | SETUP failed: on the base with no work branch | Invalid state, **not recoverable by retry**. **Immediate stop of the whole loop** and report. Never open a PR from the base to itself. Review Step 1 (SETUP) |
| `git status --short` is not empty | Uncommitted work | commit (above), then sync again |

**4.2 - Skill `superpowers:finishing-a-development-branch`:**

> **Force option 2 - Push and Create PR.** Never 1, 3 or 4.
> The skill does not detect `.claude/worktrees/`, so it does not remove the worktree. That is correct: it stays active at the end of the goal (see common SETUP, Branch A step 6).

Push done: create the draft PR.

```bash
git push

gh pr create \
  --draft \
  --repo $OWNER_REPO \
  --base $BASE_BRANCH \
  --title "<type>(#$ISSUE_NUM): <description>" \
  --assignee "$ASSIGNEE_LOGIN" \
  --body "$(cat <<'EOF'
## Summary
- [bullet points of the changes]

## Validation
- [ ] Gates green (lint, typecheck, tests) ✓
- [ ] Acceptance criteria validated ✓

## Post-deploy follow-up
- [ ] (post-deploy) <criterion of the issue that only production confirms>

Closes #$ISSUE_NUM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> Omit the section "Post-deploy follow-up" when the issue has no `(post-deploy)` criterion. That item does not block the merge or the closing of the issue: the PR keeps `Closes #$ISSUE_NUM`, never `Refs`.

The PR is always DRAFT and points to `$BASE_BRANCH` (never `main` when `$BASE_BRANCH` is not main). The card stays In Progress. `gh pr ready` is the last step of the work (PHASE 5; FINAL REVIEW of the epic; Step G on an epic sub-issue).

**Free (no GitHub):**

```bash
git add <relevant-files>
git commit -m "<type>: <short description>"
```

`git remote get-url origin` resolves: `git push` plus `gh pr create --draft` (same format, with no `Closes #`). No remote: local commit only, state it in the transcript.

**Done when:** clean sync, push done, draft PR open on `$BASE_BRANCH`.

### PHASE 5 - PR review loop, then ready (<= 3 rounds) `[SINGLE ISSUE / FREE ONLY]`

> A bounded loop of at most 3 rounds on the draft PR. An epic sub-issue does NOT run this phase. It is deferred to the epic FINAL REVIEW (same mechanics, once on the epic-to-main PR). The merge of the sub-issue goes straight to Post-Pipeline (Step G turns the PR ready and is its CI gate).

**5.1 - PR review:**

```bash
PR_NUM=$(gh pr list --repo $OWNER_REPO --head "$TASK_BRANCH" --json number --jq '.[0].number')
```

Each round, in order:

1. Invoke `/pm:code-review-pr $PR_NUM`. The wave follows the **Review watchdog** (PHASE 3), with no silent wait. The command posts its findings on the PR. Also read the open review threads left by humans or bots (`node .claude/skills/github-pm/scripts/check-pr-status.mjs` exit 5 lists them).
2. No finding and no open thread: leave the loop (step 5.2).
3. Findings: a specialist fixes them, the gates (PHASE 2) run, **1 commit + 1 push** for the round, and the main session replies on and resolves each thread it fixed.
4. Round 3 ended with findings left: `REVIEW-PR: BLOCKED — <reason>`, stop and report (stop criterion 3). No extra round.

**5.2 - Ready and CI:** while the PR is still a draft, sync the base once more (PHASE 4.1) and push if the merge brought changes. Then `gh pr ready $PR_NUM --repo $OWNER_REPO` (the LAST step of the work), and wait for CI with the **CI wait in the worktree** below until `check-pr-status.mjs` exits `0`. A red CI is fixed inside the ceiling of 3 rounds (fix, push, wait again). Never `git push` right after the ready without a reason: a push on a ready PR restarts the CI. Last line:

- `REVIEW-PR: READY` = PHASE 5 done (the PR is ready and the CI is green).
- `REVIEW-PR: BLOCKED — <reason>` = stop the loop and report to the user (stop criterion 3). A CI with no conclusion in 6 waits, or red with no round left, ends here.

> Note: `check-pr-status.mjs` exits `3` for a draft PR, so run it only after `gh pr ready`. Exit `4` (CI green, no approval) is expected when the repository requires a human review: treat it as success for this phase. Exit `5` means unresolved review threads or a requested reviewer who has not submitted: go back to step 1 of 5.1 for the threads.
>
> **CI wait in the worktree** (single description: Step G and the FINALIZATION F3 follow this mechanics): the worktree guard of Claude Code can refuse a shell with `for`/`while` around a command. No loop: each wait is one `sleep 240` through the Bash tool with `run_in_background: true`, then one run of `node .claude/skills/github-pm/scripts/check-pr-status.mjs <PR> <OWNER/REPO>`. Exit `2` (pending) again: another sleep and run, **at most 6 waits (24 min) per PR**. The 6th that never leaves exit `2` = BLOCKED: stop and report "CI still running after 24 min" (stop criterion 3). Never `gh pr checks --watch` (it hangs the loop).

**Done when:** the review loop ended clean, the PR is ready and the CI is green. Emit `✅ PHASE 5 (PR review loop) done — REVIEW-PR: READY, CI green, PR ready`.

> **End of PHASE 5 = end of the goal (single issue / free).** STOP here, without merging and without running `/pm:pr-merge`. Emit the final message to the user (PR ready and reviewed, CI green, worktree active) and ask whether the user wants to run `/pm:pr-merge <N>`. The worktree stays active (see common SETUP, Branch A step 6).

---

## Common SETUP - Branch / Worktree

Single Issue (`BASE_BRANCH` of Step 0) and Free (`BASE_BRANCH=main`) use this, inside **Step 1 (INIT)**. Epic: own SETUP, see MODE: EPIC.

`TASK_BRANCH` is already computed in Step 0.5.

### Branch A - `USE_WORKTREE=true`

1. `git checkout $BASE_BRANCH && git pull`
2. `EnterWorktree({ name: "<TASK_BRANCH>" })`. Where installed, the hook `.claude/hooks/worktree-create.mjs` (event `WorktreeCreate`) creates the branch `$TASK_BRANCH` and the worktree in `.claude/worktrees/$TASK_BRANCH`, seeds the dependencies through `worktree-seed.mjs` and switches the cwd. Never `git worktree add` through Bash: it does not fire the hook.
3. **Post-creation check** (fallback if the hook did not fire). Before you probe the toolchain, and before you delete anything, wait for the seeder to end: the `status` in `$(git rev-parse --absolute-git-dir)/aia-seed.json` goes from `running` to `done` or `failed` (with no file, there is nothing to wait for). No shell loop: `sleep` in the background and read again, as in **CI wait in the worktree** (PHASE 5). Past about 10 min without a final `status`: delete nothing and report to the user, because there is no way to tell a slow install from a dead one.

   ```bash
   git rev-parse --show-toplevel   # must contain ".claude/worktrees/"
   git branch --show-current       # must == $TASK_BRANCH
   ```

   Toplevel or branch failed: warn, `ExitWorktree({ action: "keep" })`, go on **in place** (degrades to Branch B with no abort). Then confirm the dependencies work with the cheapest command of the project's toolchain (for example the version flag of the compiler or test runner from the root `CLAUDE.md`). Failing: re-run the seeder (`node <root>/.claude/hooks/worktree-seed.mjs <root> <worktree>`, `<root>` = main checkout) or the project's install command inside the worktree. Never `--no-verify` to get around a hook that complains about missing dependencies.

   > Dependencies arrive **asynchronously** (`worktree-seed.mjs`, detached). In that window, hooks that need the toolchain cannot run it. Confirm the toolchain works before you trust any gate.

4. No `git checkout -b`: the worktree is already on the right branch.
5. Initial push: `git push -u origin "$TASK_BRANCH" 2>/dev/null || true`
6. Do not leave the worktree at the end of the loop/goal: it stays active on disk. `ExitWorktree` and cleanup happen only **post-goal**: `/pm:pr-merge` asks whether to remove the worktree after the merge (it routes to `/pm:worktree-remove`), or the user decides by hand. Never `ExitWorktree` as part of the end of the goal. Never `action: "remove"` with pending commits or PR.

### Branch B - `USE_WORKTREE=false`

```bash
git branch --list "$TASK_BRANCH" | grep -q . || (
  git checkout $BASE_BRANCH && git pull &&
  git checkout -b "$TASK_BRANCH" &&
  git push -u origin "$TASK_BRANCH"
)
git checkout "$TASK_BRANCH"
```

---

## Validation per turn

See Phase tracking (above). `[ ]` pending = not done, run the phase. All `[x]` = done (next sub-issue in the epic, or end).

---

## Absolute Rules (never violate)

| Rule | Detail |
| --- | --- |
| ⛔ Never skip a phase | Exact order. Single issue/free: 5 phases; epic sub-issue: PHASES 1-3 plus integration, with PHASE 5 deferred to the FINAL REVIEW (never dropped for good) |
| ⛔ Never finish without tracking at 100% | Issue/free: 5/5; epic: PHASES 1-3 plus integration per automatic sub-issue plus FINAL REVIEW `[x]` |
| ⛔ An epic never ends without a clean FINAL REVIEW | `/code-review` with `REVIEW: OK` + PR review loop with `REVIEW-PR: READY` + CI green on the epic-to-main PR (the controlled stop of the selection pauses the epic, it does not end it) |
| ⛔ One review per issue or sub-issue | `/code-review` once (round 0, before the 1st push) + PR review loop with a ceiling of 3 rounds (only on the PR to `main`); in an epic, once per sub-issue and once on the epic PR; never a review per task, commit or wave; never `/simplify`, `/orchestrate` or a standalone reviewer inside the flow |
| ⛔ Every wait and every goal has a ceiling | CI: at most 6 waits of 240 s per PR, then BLOCKED; `/goal` with a turn ceiling (issue/free: 120; epic: 100 per sub-issue and 120 in the FINAL REVIEW) |
| ⛔ Never create a worktree after the /goal | The worktree is INIT (Step 1), before the /goal. The /goal runs entirely inside it |
| ⛔ Never auto-run the built /goal | Step 2 builds, prints, STOPS. Never assume it already fired |
| ⛔ Never merge `main` alone | Auto-merge only for the intermediate (epic) PR; `main` always asks; never `--auto` on `main` |
| ⛔ Never `gh pr merge` without exit 0 from `check-pr-status.mjs` | Failed/pending checks = total block |
| ⛔ Never open a PR without a clean base sync (PHASE 4.1) | An old branch = conflict, a risk for main |
| ⛔ Never `--no-verify` | A hook failed: investigate and fix |
| ⛔ Never `git worktree add` through Bash | Only `EnterWorktree` fires `worktree-create.mjs` |
| ⛔ Never leave the worktree at the end of the loop/goal | End of PHASE 5 = STOP and ask about `/pm:pr-merge`. **Never** `ExitWorktree`. The worktree stays active until `/pm:pr-merge` (post-goal) does the cleanup, or the user decides by hand. `action:"remove"` only with no pending commits or PR |
| ⛔ Never nest a worktree | Epic: a worktree only on `$EPIC_BRANCH`; sub-issues use `USE_WORKTREE=false` |
| ⛔ `gh pr ready` only at the end, with no push around it | The PR is born draft; the ready is the last step (PHASE 5 / FINAL REVIEW; Step G on an epic sub-issue), never with a `git push` right before or after (a push on a ready PR restarts the CI), and never followed by a merge without the CI green |
| ⛔ Never `python3` in a block of this pipeline | `gh --jq` or `node -p`/`node -e` - the stock `python3` on Windows is a Microsoft Store stub |
| ✅ Worktree default `true`, zero questions | Flags decide; the guard forces `false` if already in `.claude/worktrees/` |
| ✅ Always a built and printed `/goal` after INIT | Step 2 builds, prints, STOPS - the user pastes it by hand in the same session to iterate turn by turn until satisfied |
| ✅ PHASE 1 with no reviewer per task | The implementer runs the focused tests of the task and reports `DONE`; the gates are PHASE 2 |
| ✅ Acceptance criteria in the PHASE 3 matrix | A ❌ criterion becomes a P1 finding; the issue closes only with the whole matrix ✅ (body updated in PHASE 4.0) |
| ✅ Skill `github-pm` for Project v2 | GraphQL through `references/02-work-issue.md` plus `references/pm-config-schema.md` |
| ✅ Temporary files in `.claude/tmp/` in the worktree | Never `/tmp` and never the scratchpad of the system prompt - a permission prompt breaks the autonomous loop |
