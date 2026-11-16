This file is read by `/pm:issue-work-in-loop` Step 0 (MODE=free: SETUP, Pre-Pipeline, Post-Pipeline, plus the /goal template). PHASE sections, Review watchdog and CI wait are in the core file `.claude/commands/pm/issue-work-in-loop.md`.

**Free** (no GitHub):

```text
/goal execute the task "FREE_TASK" following the 5-phase pipeline (subagent-driven-development with no
reviewer per task, then gates, then code-review once, then finishing, then the PR review loop) described in
.claude/commands/pm/issue-work-in-loop.md and .claude/skills/github-pm/references/loop-mode-free.md -
read both in the 1st turn (INIT already done).
Roles: the main agent ALWAYS orchestrates, plans and delegates - NEVER edits source code or
tests directly (auxiliary text in .claude/tmp/, the commit message and the PR body belong to the
main agent and do not break the role); all implementation goes through specialist subagents
(`ls .claude/agents/` and the `description` of each).
Evidence of /code-review: the line "REVIEW: OK" and the checkmarks are written by the main agent
in the turn text and count as evidence.
Finish: 5x "✅ PHASE N (<name>) done — <evidence>" in the transcript + last line "REVIEW: OK" of
/code-review + the literal output of the lint, typecheck and test commands + code
committed + (if there is an origin) PHASE 5 PR review loop ending in "REVIEW-PR: READY" +
PR ready with the CI checks green;
do NOT leave the worktree - it stays active so /pm:pr-merge does the cleanup (never ExitWorktree at the end of the goal);
when all of this is reached, STOP and emit the final message ("PR #N ready and reviewed, CI green, worktree active -
run /pm:pr-merge N to merge?"; with no PR/origin: "task done, worktree active") and end the turn -
never auto-merge and never auto-run /pm:pr-merge;
also stop on "REVIEW: BLOCKED" or "REVIEW-PR: BLOCKED" (including a CI with no conclusion),
after 25 consecutive turns with no new ✅ marker (stuck detection) or after
120 turns in total (goal ceiling)
```

## MODE: FREE (No GitHub)

Full pipeline, zero GitHub.

### SETUP (INIT - Step 1)

See **Common SETUP** in the core file (`BASE_BRANCH=main`).

### Pre-Pipeline

Derive the completion criterion from `FREE_TASK`.

### Run Pipeline

Step 2 builds and prints the /goal and **ends this command**. PHASE 1 to PHASE 5 run **inside the session of the /goal pasted by hand** (never a continuation of this command), with these adaptations:

- **PHASE 1 (subagent-driven-development):** split `FREE_TASK` into tasks (no reviewer per task); focused tests per task
- **PHASE 2 (deterministic gates):** the project's lint, typecheck and test commands, as in the core file
- **PHASE 3 (/code-review):** once, with no `#issue`; go on only with `REVIEW: OK`, with no re-run
- **PHASE 4 (finishing):** see PHASE 4 of the core file, Free variant: commit with no issue, push plus automatic draft PR if there is an `origin`
- **PHASE 5 (PR review loop):** only if there is a PR (at most 3 rounds); with no PR, PHASE 3 is the final review; no `Closes #`

### Post-Pipeline

When PHASE 5 ends (`REVIEW-PR: READY`, PR ready with the CI green, if there is a PR), stop and emit the final message to the user: PR ready and reviewed, CI green, worktree active. Ask whether the user wants to run `/pm:pr-merge <N>` (the worktree stays active, see the core file, common SETUP, Branch A step 6). Never auto-merge and never auto-run `/pm:pr-merge`.

---
