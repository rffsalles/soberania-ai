This file is read by `/pm:issue-work-in-loop` Step 0 (MODE=single: SETUP, Pre-Pipeline, Post-Pipeline with Step G and H, plus the /goal template; also read for each epic sub-issue). PHASE sections, Review watchdog and CI wait are in the core file `.claude/commands/pm/issue-work-in-loop.md`.

**Single issue** (`ISSUE_NUM` + `BASE_BRANCH`):

```text
/goal execute the implementation of issue #ISSUE_NUM (target PR: BASE_BRANCH) following EXACTLY
the 5-phase pipeline described in .claude/commands/pm/issue-work-in-loop.md and .claude/skills/github-pm/references/loop-mode-single.md -
read both in the 1st turn (INIT already done, do not repeat):
PHASE 1 superpowers:subagent-driven-development (waves, no reviewer per task); PHASE 2 deterministic
gates; PHASE 3 /code-review once (round 0, before the 1st push); PHASE 4
superpowers:finishing-a-development-branch (draft PR); PHASE 5 PR review loop
(/pm:code-review-pr, at most 3 rounds; gh pr ready is the last step and fires the full CI).
Roles: the main agent ALWAYS orchestrates, plans and delegates - NEVER edits source code or
tests directly; all implementation (code, tests, review fixes) goes through specialist
subagents (`ls .claude/agents/` and the `description` of each, by the scope of the touched file).
Auxiliary text in .claude/tmp/, the commit message, the PR body and PHASE 4.0 (issue body) belong
to the main agent and do not break the role.
Evidence of /code-review: the line "REVIEW: OK" and the checkmarks are written by the main agent
in the turn text and count as evidence.
Evidence of PHASE 2: the literal output of the lint, typecheck and test commands in the transcript.
Finish: 5x "✅ PHASE N (<name>) done — <evidence>" in the transcript + last line
"REVIEW: OK" of /code-review + last line "REVIEW-PR: READY" of the PR review loop +
PR ready on BASE_BRANCH with the CI checks green (check-pr-status.mjs exit 0 or 4), waiting for human review +
Post-Pipeline E (comment the PR on the issue) + F (board status In Review) done;
do NOT merge into main automatically (Step G) and do NOT close the issue (Step H) - both are post-goal;
do NOT leave the worktree - it stays active so /pm:pr-merge does the cleanup (never ExitWorktree at the end of the goal);
when all of this is reached, STOP and emit the final message ("PR #N ready and reviewed, CI green, worktree active -
run /pm:pr-merge N to merge?") and end the turn - never auto-merge and never auto-run /pm:pr-merge;
also stop on "REVIEW: BLOCKED" or "REVIEW-PR: BLOCKED" (including a CI with no conclusion),
after 25 consecutive turns with no new ✅ marker in the transcript
(stuck detection - continuous progress does not trigger it) or after 120 turns in total (goal ceiling)
```

## MODE: SINGLE ISSUE

### SETUP (INIT - Step 1)

See **Common SETUP** in the core file (only if the branch does not exist).

### Pre-Pipeline (INIT - Step 1, after SETUP)

**A - Read the ticket:**

```bash
gh issue view $ISSUE_NUM --repo $OWNER_REPO --json number,title,body,labels,state,projectItems
```

**B - Validate fields:** missing priority, effort or type: 1 comment listing the gaps, then **go on**. **Objective gate (the only one):** section "Acceptance criteria" missing, empty, or with no verifiable item (a `- [ ]` checkbox whose condition is observable: file, test, command output or UI state): comment exactly what is missing and **stop**. Criteria present and verifiable: go on. (It runs in INIT, before the /goal, with the user present. It is not a stop of the autonomous loop.)

> Issue in **Blocked**: stop and ask the user to resolve the block (or take it out of Blocked) before running the loop. Same guard as `/pm:worktree-new`.

**C - Comment the start:**

```bash
gh issue comment $ISSUE_NUM --repo $OWNER_REPO --body "Starting implementation. Plan: [summary of the technical scope of the issue]"
```

**D - Assign + In Progress:** an assignment failure does not block, it only warns.

```bash
ASSIGNEE_LOGIN=$(gh api user --jq .login 2>/dev/null || git config user.name)
gh issue edit $ISSUE_NUM --repo $OWNER_REPO --add-assignee "$ASSIGNEE_LOGIN" \
  || echo "Could not assign the issue to '$ASSIGNEE_LOGIN' - continuing."
```

Status to "In Progress" on the Project v2 board through GraphQL. The item query, the mutation and the IDs are in `.claude/skills/github-pm/references/02-work-issue.md` (step 5) and `.claude/skills/github-pm/references/pm-config-schema.md` (section "How to use the IDs in GraphQL mutations"; the IDs are in `.claude/pm-config.json`). **Read the current Status before you write**:

```bash
gh api graphql -f query='query($proj:ID!){node(id:$proj){... on ProjectV2{items(first:100){nodes{id content{... on Issue{number}} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}' -F proj="<project_id>" --jq '.data.node.items.nodes[] | select(.content.number == <ISSUE_NUM>) | .fieldValueByName.name'
```

Only move to In Progress when the Status is Triage, Backlog, Todo, Ready or empty. Never overwrite In Review, Blocked or Done. Use the status names of `status_options` in `.claude/pm-config.json`. Inside a worktree the Bash guard can refuse a GraphQL query written inline: write the mutation to `.claude/tmp/<file>.graphql` and pass `-F query=@.claude/tmp/<file>.graphql`.

> Safety net: the workflows installed by `/pm:add-github-pm` move the card even if the local GraphQL is skipped. They need the `PROJECTS_PAT` secret and skip silently without it.
>
> - `commit-to-progress.yml`: a push to any branch other than `main` whose commit message holds `#N` moves the issue to In Progress. The `git push -u` of the SETUP carries no new commit, so the net acts only on the first push of PHASE 4.
> - `pr-to-review.yml`: a PR that opens as non-draft, turns ready or reopens moves the issues of its `Closes|Fixes|Resolves #N` to In Review. A draft PR never moves the card.
> - `auto-close-issue.yml`: the merge of a PR closes the issues of its `Closes|Fixes|Resolves #N` and moves them to Done.
> - `issue-to-project.yml`: a new issue enters the board as Triage.
>
> The epic SETUP therefore has a net only after the first push. Until then this GraphQL is the only thing that moves the card to In Progress, and skipping it leaves the card parked.

### Run Pipeline

Step 2 builds and prints the /goal and **ends this command**. PHASE 1 to PHASE 5 (section "5-Phase Pipeline" of the core file) run **inside the /goal session that the user pastes by hand**. Never as a continuation of this command in the same turn.

### Post-Pipeline

**E - Comment the PR:**

```bash
PR_URL=$(gh pr list --repo $OWNER_REPO --head "$TASK_BRANCH" --json url --jq '.[0].url')
gh issue comment $ISSUE_NUM --repo $OWNER_REPO --body "PR opened: $PR_URL. Waiting for review."
```

**F - In Review** _(only after the ready; fallback)_: the PR is born draft and the card stays In Progress. The `ready_for_review` of PHASE 5 fires `pr-to-review.yml`, which moves the card alone. Read the current Status (same read as D). Only if it is not yet In Review (Actions late, failed or not installed), move it by hand through GraphQL (same reference as D), never overwriting Blocked or Done.

**G - Wait for CI and merge** _(post-goal)_:

> The goal ends at "PR ready, `REVIEW-PR: READY`, CI green, waiting for human review". The evaluator confirms it in the transcript. Step G (merge into `main`) is a deliberate stop (safety) and post-goal: it does not interrupt the autonomous run. Epic sub-issue: Step G runs INSIDE the goal (automatic merge into `$EPIC_BRANCH` = loop progress, not a stop). It is the only CI gate of the sub-issue, since PHASES 3 and 5 are deferred, and so it is the step that turns the PR ready. Single issue: ready and CI were already validated in PHASE 5. Re-check, because the state may change.

```bash
PR_NUM=$(gh pr list --repo $OWNER_REPO --head "$TASK_BRANCH" --json number --jq '.[0].number')
```

**Epic sub-issue - ready before the gate** (the PR of PHASE 4 is still a draft and does not go through PHASE 5): wait for the checks of the draft to end first (`gh pr checks $PR_NUM --repo $OWNER_REPO`, one run per wait, with the 240 s background `sleep` of **CI wait in the worktree**), so a red draft CI does not fire a full CI that is bound to fail. Then run `gh pr ready $PR_NUM --repo $OWNER_REPO` and go to the gate below. Never `gh pr ready` and `gh pr merge` in sequence, and no `git push` between the ready and the gate: a push on a ready PR cancels the CI in progress and restarts the full cycle. The waits of this step add up to at most 6 per PR.

Gate (`check-pr-status.mjs` refuses a draft with exit 3, so it runs only after the ready):

```bash
node .claude/skills/github-pm/scripts/check-pr-status.mjs $PR_NUM $OWNER_REPO
```

- Exit `0` = CI green.
  - `$BASE_BRANCH` is not `main` (epic intermediate): automatic merge, see "Merge method" below, then Step H.
  - `$BASE_BRANCH` is `main`: **do not merge alone.** Ask through **AskUserQuestion**:
    > ✅ CI passed. PR #$PR_NUM is ready to merge into `main`. Merge now? (yes/no)
    - Yes = the same merge as `/pm:pr-merge`, then Step H.
    - No = end, PR open for manual review, no Step H.
- Exit `1` = blocked. A check CANCELLED, or red from a flaky cause (network, runner), on the SAME head (`gh pr view $PR_NUM --repo $OWNER_REPO --json statusCheckRollup`): `gh run rerun <id>` of that run and re-run the gate. Really red: fix the checks, push, wait for the re-run. No merge.
- Exit `2` = waiting: checks are running. Repeat the wait as in **CI wait in the worktree** (PHASE 5 of the core file). Never `gh pr checks --watch` (it hangs the loop). At most 6 waits, then stop and report. No merge.
- Exit `3` = PR not OPEN, still a draft, or invalid: do not merge, do not advance. Stop and report (never merge blind).
- Exit `4` = CI green with no approval: epic intermediate = treat as exit 0 (automatic merge). PR to `main` = treat as exit 0 (ask).
- Exit `5` = BLOCKED (review): unresolved review threads and/or a requested reviewer who has not submitted. Fix the open threads through the review loop of PHASE 5 of the core file (ceiling of 3 rounds per PR) and re-run. `REVIEW-PR: BLOCKED` = stop and report. No merge in either case. It is never released by a confirmation, unlike exit 4.

If the base moved (the merge state says the branch is behind or in conflict), run the base sync of PHASE 4.1 of the core file, commit the resolution, push and re-run the gate. No merge before that.

⛔ **Never `gh pr merge --auto`** on a PR to `main`. Auto-merge is only for the intermediate (epic) PR.

> **Merge method:** use the strategy `/pm:pr-merge` picks (`--squash` when the repository allows it). The sub-issue merge into the epic branch runs with the sub-issue branch **not checked out** (so `gh` can delete the local copy): first `git checkout $EPIC_BRANCH`, then `gh pr merge $PR_NUM --repo $OWNER_REPO --squash --delete-branch --body "Refs #<sub>"`. The `--body` keeps `Refs #<sub>` in the squash commit for the epic review. If the local branch of the sub-issue still exists afterwards, delete it: see Iteration per sub-issue in `loop-mode-epic.md` (`git branch -D`, because a squash does not leave the branch "merged" for git).

**H - Close + Done** _(post-goal)_:

```bash
gh issue close $ISSUE_NUM --repo $OWNER_REPO
```

Status to "Done" through GraphQL (read the item first, same as D). The workflow `auto-close-issue.yml` does the same on the merge; the explicit close is idempotent.

**I - End the worktree** _(post-goal, only `USE_WORKTREE=true`)_: it does not run at the end of the goal. `/pm:pr-merge` asks about the cleanup after the merge, or the user decides by hand (see the core file, common SETUP, Branch A step 6).

---
