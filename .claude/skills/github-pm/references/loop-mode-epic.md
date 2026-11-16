This file is read by `/pm:issue-work-in-loop` Step 0 (MODE=epic: SETUP, Iteration per sub-issue, FINALIZATION, plus the /goal template; read `.claude/skills/github-pm/references/loop-mode-single.md` too). PHASE sections, Review watchdog and CI wait are in the core file `.claude/commands/pm/issue-work-in-loop.md`.

**Epic** (`ISSUE_NUM --epic`):

```text
/goal execute the implementation of epic #ISSUE_NUM until ALL eligible sub-issues (open, same repo and
with no open blocker, chosen by next-epic-subissue.mjs) pass through
PHASES 1-3 (subagent-driven-development with no reviewer per task, then gates, then /code-review once) and through the integration on
feat/epic-ISSUE_NUM-<slug> (PHASE 4: sync, commit, push, PR, merge) described in
.claude/commands/pm/issue-work-in-loop.md, .claude/skills/github-pm/references/loop-mode-epic.md and
.claude/skills/github-pm/references/loop-mode-single.md (read all three in the 1st turn) - each phase emitting
"✅ PHASE N (<name>) done — <evidence>" and each automatic sub-issue emitting
"✅ Sub-issue #N done — PHASES 1-3 + integration OK — PR merged" in the transcript.
Roles: the main agent ALWAYS orchestrates, plans and delegates (never edits source code or
tests directly, not even between sub-issues; auxiliary text in .claude/tmp/, the commit message,
the PR body and the issue body belong to the main agent and do not break the role); all implementation
goes through specialist subagents
(`ls .claude/agents/` and the `description` of each).
Evidence of /code-review: the line "REVIEW: OK" and the checkmarks are written by the main agent
in the turn text and count as evidence.
Finish criterion: all automatic sub-issues merged into feat/epic-ISSUE_NUM-<slug> (the manual ones closed by a human), the literal
output of the lint, typecheck and test commands on the epic branch in the transcript, epic FINAL REVIEW done
(/code-review main...HEAD #epic once with "REVIEW: OK" + PR review loop on the epic PR, at most 3 rounds,
ending in "REVIEW-PR: READY", emitting "✅ EPIC FINAL REVIEW done — <evidence>") and
PR feat/epic-ISSUE_NUM-<slug> -> main READY with the CI checks green, waiting for manual approval; do NOT merge into
main; stop with NO FINALIZATION and no epic PR if the selection script asks for a controlled stop
(manual task, waiting for blockers, or child of another repo) - emit in the transcript the line
"EPIC STOP — <reason>" that it prints and end the turn; also stop on "REVIEW: BLOCKED" or
"REVIEW-PR: BLOCKED", after 6 CI waits (6 x 240 s) that never leave "waiting", after 25 consecutive
turns with no new ✅ marker (an epic with 3-5 sub-issues uses 100+ turns of continuous
progress without triggering it), if one sub-issue goes over 100 turns without emitting "✅ Sub-issue #N done"
or if the FINAL REVIEW goes over 120 turns (turns counted since the last "✅ Sub-issue" marker)
```

## MODE: EPIC

### SETUP (INIT - Step 1, first iteration)

**Graph pre-check (before you create a branch, worktree or status):** run the selection script once (codes in Iteration, step 1):

```bash
node .claude/skills/github-pm/scripts/next-epic-subissue.mjs $ISSUE_NUM $OWNER_REPO
```

- Exit `3`/`4`/`6` = **stop INIT now**: no branch, no worktree, no In Progress, no `/goal` built. Relay the message of the script to the user.
- Exit `5` here **is not** FINALIZATION by itself. The message of the script says the case:
  - **empty graph** = link the native sub-issues before you go on (`addSubIssue`, see `.claude/skills/github-issues/references/sub-issues.md`);
  - **all `CLOSED`** = resume only with real work. Resolve the epic branch through step 1 of the SETUP below (read only). The branch also exists in an abandoned INIT, so existing is not enough: `git rev-list --count origin/main..origin/$EPIC_BRANCH` of 1 or more (the loop already integrated sub-issues, or the last one was manual) = follow the SETUP, and the 1st iteration of the `/goal` falls into FINALIZATION. No branch, or 0 commits ahead = nothing to integrate: stop and check why they closed without the loop (an epic with only `manual` tasks ends here, with no epic PR: close the epic by hand).
- Exit `0` = follow the SETUP below. Any other code (`1`, `2`, `127`...) is a failure: stop and report, never go on.

**Resume: the branch that already exists wins over the slug.** Recomputing the slug (the accent transliteration already changed it once) must never orphan the branch of an epic in progress. The SETUP would open a new branch from `main` and the commits of the sub-issues already integrated would vanish from the final PR. So step 1 (read only) runs on every resume, and only with no branch at all does step 2 compute the slug.

```bash
OWNER_REPO=$(node -p "const c=require('./.claude/pm-config.json');c.owner+'/'+c.repo")
EPIC_TITLE=$(gh issue view $ISSUE_NUM --repo $OWNER_REPO --json title --jq '.title')

# 1) Resolve the epic branch (read only; exit 5 also runs only this step)
git fetch origin || exit 1
REMOTE_EPICS=$(git ls-remote --heads origin "feat/epic-$ISSUE_NUM-*") || exit 1
set -- $(echo "$REMOTE_EPICS" | sed 's#.*refs/heads/##')
if [ $# -gt 1 ]; then   # several: keep the single one with commits ahead of origin/main
  # Each candidate is fetched before the filter: in a `--single-branch` clone the `git fetch origin` above only creates
  # `origin/main`, `rev-list` would fail on all of them and the error below would come out even with a single one ahead.
  for b in "$@"; do git fetch origin "+refs/heads/${b}:refs/remotes/origin/${b}" || exit 1; done
  set -- $(for b in "$@"; do [ "$(git rev-list --count origin/main..origin/$b)" -ge 1 ] && echo "$b"; done)
  [ $# -eq 1 ] || { echo "Epic $ISSUE_NUM: more than one branch and no single one with commits ahead of main - stop and report."; exit 1; }
fi
# "$*", never the numbered positional: Claude Code swaps dollar+digit for the command
# argument before the block reaches the model (with `258 --epic` it became EPIC_BRANCH=--epic).
EPIC_BRANCH="$*"   # 0 or 1 branch (the filter above guarantees it); empty = no branch yet
# Explicit fetch of the resolved branch: in a `--single-branch` clone (`remote.origin.fetch` only with main)
# the `git fetch origin` above does not create `origin/$EPIC_BRANCH`, and without the ref step 3 would be skipped. The braces
# are required: in zsh, `$EPIC_BRANCH:refs` is read as the `:r` modifier and breaks the refspec.
[ -z "$EPIC_BRANCH" ] || git fetch origin "+refs/heads/${EPIC_BRANCH}:refs/remotes/origin/${EPIC_BRANCH}" || exit 1

# 2) No branch: compute the slug
if [ -z "$EPIC_BRANCH" ]; then
  EPIC_SLUG=$(node .claude/skills/github-pm/scripts/branch-slug.mjs $ISSUE_NUM $OWNER_REPO --max 30)
  [ -n "$EPIC_SLUG" ] || { echo "epic #$ISSUE_NUM has no slug (gh failed or the title has no letter or digit) - stop"; exit 1; }
  EPIC_BRANCH="feat/epic-${ISSUE_NUM}-${EPIC_SLUG}"
fi

git checkout main && git pull
# No local branch: it is born from the remote one (checkout only guesses the remote that `remote.origin.fetch` covers,
# and in a `--single-branch` clone it loses it and would fall on main); with neither, a new epic from main.
git checkout "$EPIC_BRANCH" 2>/dev/null \
  || git checkout -b "$EPIC_BRANCH" "origin/$EPIC_BRANCH" 2>/dev/null \
  || git checkout -b "$EPIC_BRANCH"

# 3) Stale local copy (another machine advanced the integration): the fetch of step 1 only moves
#    origin/*, so advance the local one by fast-forward; diverged = stop. Only with
#    $EPIC_BRANCH checked out here - without the guard the merge would land on main.
if [ "$(git branch --show-current)" = "$EPIC_BRANCH" ] \
   && git rev-parse --verify --quiet "origin/$EPIC_BRANCH" >/dev/null; then
  git merge --ff-only "origin/$EPIC_BRANCH" \
    || { echo "$EPIC_BRANCH local diverged from origin/$EPIC_BRANCH - stop and report"; exit 1; }
fi
git push -u origin "$EPIC_BRANCH" 2>/dev/null || true
```

> Run the branch creation and the `git push -u` in separate Bash calls: `guard-main-branch` reads the current branch before the command runs, so a push chained after `git checkout -b` on `main` is blocked.

`USE_WORKTREE=true` (Step 0.5) = `git checkout main` and only then `EnterWorktree({ name: "<EPIC_BRANCH>" })` (same check and fallback as Branch A, common SETUP in the core file). Sub-issues run inside this worktree. The return to `main` is mandatory: with the main checkout parked on `$EPIC_BRANCH`, git refuses to attach to the worktree a branch that is already checked out, `worktree-create.mjs` exits with 2 and `EnterWorktree` fails. INIT then falls back and runs with no worktree.

> Sub-issues have no worktree of their own: a Single Issue with `USE_WORKTREE=false`, a branch merged into `$EPIC_BRANCH` in the epic worktree. Never nest.

**Assign the epic + In Progress** (mirrors step **D** of MODE: SINGLE ISSUE. It runs in INIT, before the /goal. An assignment failure does not block, it only warns):

```bash
ASSIGNEE_LOGIN=$(gh api user --jq .login 2>/dev/null || git config user.name)
gh issue edit $ISSUE_NUM --repo $OWNER_REPO --add-assignee "$ASSIGNEE_LOGIN" \
  || echo "Could not assign the epic to '$ASSIGNEE_LOGIN' - continuing."
```

Epic status to "In Progress" on the Project v2 board through GraphQL (`.claude/skills/github-pm/references/02-work-issue.md`, same read-before-write guard as step D: Status only from Triage, Backlog, Todo, Ready or empty; no date written).

### Iteration per sub-issue

Each turn:

1. Select the next sub-issue with the script (`gh issue view --json subIssues` does not exist: the GraphQL query lives in the script; see also `.claude/skills/github-issues/references/sub-issues.md`):

   ```bash
   node .claude/skills/github-pm/scripts/next-epic-subissue.mjs $ISSUE_NUM $OWNER_REPO
   ```

   **Eligible** = `OPEN`, in the **same repository** as the epic and with **all** native `blockedBy` `CLOSED` (a blocker from another repo counts too). Among the eligible, the first in epic order. Exit codes:

   | Exit | Meaning | Action |
   | --- | --- | --- |
   | `0` | Eligible - stdout `{"number":N,"title":"…"}` | step 3 with `N` |
   | `3` | The eligible one has the label `manual` (a task done by a human, with no PR in the repo) | **STOP the loop** (controlled stop, below) - do not close, do not comment, do not touch the issue |
   | `4` | Open sub-issues exist, none eligible - waiting for blockers | **STOP the loop** (controlled stop, below) - never FINALIZATION |
   | `5` | No `OPEN` sub-issue of the same repo (the message says `no OPEN sub-issue`) | step 2 (FINALIZATION) |
   | `6` | The epic has a sub-issue of another repo (the `number` alone collides with an issue of the local repo) | **STOP the loop** (controlled stop, below) - never process |
   | `1`, `2`, other | Failure to query GitHub, invalid usage or the script did not even run (`127`, wrong cwd); `5` without the message above is also a failure | report and stop - **never** treat as "none open" |

   The label `manual` may not exist in the repo yet. Create it (`gh label create manual`) before an epic holds a manual task, or the script treats that sub-issue as an automatic one.

   **Controlled stop (`3`/`4`/`6`):** emit the message of the script (its first line is already the marker `EPIC STOP — <reason>`) and end the turn, with no FINALIZATION and no epic PR (worktree and `$EPIC_BRANCH` stay as they are). To resume: resolve the reason (run and close the manual task, close the blockers, move the child to the umbrella) and run `/pm:issue-work-in-loop <epic> --epic` again.

2. Exit `5` = FINALIZATION.
3. Sub-issue selected (exit `0`):
   - Run MODE: SINGLE ISSUE (`loop-mode-single.md`) with `BASE_BRANCH=$EPIC_BRANCH` and `USE_WORKTREE=false` (INIT of the sub-issue = only Branch B plus Pre-Pipeline; the worktree is already the epic one). Gate B of Pre-Pipeline failed (the sub-issue has no verifiable "Acceptance criteria"): do not stop the loop. Derive the criteria from the issue body, add the section to the body (`gh issue edit --body-file`), say in the start comment that they were derived, and go on
   - **PHASES 1-3 plus integration (PHASE 4: sync, commit, push, PR, Step G), always.** PHASE 3 (`/code-review` once, `$EPIC_BRANCH...HEAD #<sub-issue>`) runs per sub-issue. PHASE 5 does NOT run per sub-issue (deferred to the FINAL REVIEW; no `/pm:code-review-pr` per sub-issue)
   - The PR of the sub-issue points to `$EPIC_BRANCH` (never `main`)
   - Merge through Step G (exit 0/4 = ready + automatic merge, see "Merge method"; `git checkout $EPIC_BRANCH` comes before the merge). After the merge: `git fetch origin $EPIC_BRANCH && git merge --ff-only origin/$EPIC_BRANCH` (do not use `git pull --ff-only`: it fails with "Cannot fast-forward to multiple branches" when an earlier `git fetch origin <branch>` left several refs in FETCH_HEAD). Then, if `git branch --list "$TASK_BRANCH"` still shows the sub-issue branch, delete the **local** branch: `git branch -D "$TASK_BRANCH"` (`-D` because a squash does not leave the branch "merged" for git, and `-d` would refuse)
   - **Close the sub-issue.** The **native** auto-close of GitHub does not fire (merge into `$EPIC_BRANCH`, not into the default branch). The workflow `auto-close-issue.yml` (when installed) closes the issue and sets the Done column on the merge of the PR (asynchronous, through `Closes #` in the body). Keep the explicit close (idempotent: "already closed" is harmless). It guarantees that step 1 already sees the sub-issue `CLOSED` (emptying the open ones and releasing what it blocks) without depending on the timing of Actions: `gh issue close <sub-num> --repo $OWNER_REPO --comment "Integrated into the epic branch via PR #<pr>"`, then set the Done column through GraphQL (same reference as step D). Without a close (workflow or explicit) the loop stops only on stuck detection.
   - Emit `✅ Sub-issue #N done — PHASES 1-3 + integration OK — PR merged`
4. Next iteration = step 1 again (next eligible sub-issue, controlled stop or FINALIZATION).

### FINALIZATION (all sub-issues closed)

**F1 - Quality gate (epic branch):** first `git checkout "$EPIC_BRANCH" && git fetch origin "$EPIC_BRANCH" && git merge --ff-only "origin/$EPIC_BRANCH"`. A worktree kept from a controlled stop does not go through the fast-forward of the SETUP and may be behind origin. If it failed, stop and report. Then run the project's lint, typecheck and test commands once on the integrated branch (through a specialist subagent, check mode). Build, bundle and deploy-time checks of the project stay with the CI of the epic PR.

**F2 - FINAL REVIEW, local part (PHASE 3), and epic-to-main PR as a draft (PHASE 4):**

1. `/code-review main...HEAD #$ISSUE_NUM` - **once**, on the integrated diff of the epic, round 0 (before the PR opens), following the **Review watchdog** (PHASE 3). Pass only the epic number as the issue. Also tell the reviewer to read `Closes|Fixes|Resolves|Refs #n` in the commits of the branch (merge commits excluded): the squash commit of each sub-issue carries `Refs #<sub>` (PHASE 4.1 and "Merge method"), so each sub-issue criterion is checked once. Last line `REVIEW: OK` = go on; `REVIEW: BLOCKED — <reason>` = stop and report (stop criterion 3).
   If `/code-review` is not installed (see `/aia-harness:add-plugins`), skip round 0 and let `/pm:code-review-pr` on the draft epic PR (F3) be the only review.
2. `/code-review` does not commit: if it applied a correction, commit plus push on `$EPIC_BRANCH` (1 commit).
3. Open the PR:

````bash
ASSIGNEE_LOGIN=$(gh api user --jq .login 2>/dev/null || git config user.name)

gh pr create \
  --draft \
  --repo $OWNER_REPO \
  --base main \
  --title "[EPIC #$ISSUE_NUM] $EPIC_TITLE" \
  --assignee "$ASSIGNEE_LOGIN" \
  --body "$(cat <<'EOF'
## Epic done

Sub-issues implemented and merged into this branch (PHASES 1-3 + integration in each). FINAL REVIEW (PHASES 3-5) consolidated in this PR: `/code-review` once + the PR review loop (at most 3 rounds).

## Test locally
```bash
git checkout $EPIC_BRANCH
# install dependencies and start the app with the commands of the root CLAUDE.md
```

## Validation
- [ ] Gates green (lint, typecheck, tests) ✓
- [ ] Sub-issues closed ✓
- [ ] PHASES 1-3 per sub-issue + epic FINAL REVIEW ✓

## Post-deploy follow-up
- [ ] (post-deploy) <criterion of the issue that only production confirms>

Closes #$ISSUE_NUM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
````

> Omit the section "Post-deploy follow-up" when the issue has no `(post-deploy)` criterion. That item does not block the merge or the closing of the issue: the PR keeps `Closes #$ISSUE_NUM`, never `Refs`.

**F3 - FINAL REVIEW, PR part (mandatory - PHASE 5 deferred from the sub-issues, consolidated once):**

> Ceiling of 3 rounds, as in PHASE 5 of the core file. The goal NEVER ends without `REVIEW-PR: READY`. The wave follows the **Review watchdog** (PHASE 3), with no silent wait.

1. `EPIC_PR_NUM=$(gh pr list --repo $OWNER_REPO --head "$EPIC_BRANCH" --json number --jq '.[0].number')`, then run the PHASE 5 loop of the core file on `$EPIC_PR_NUM` (`/pm:code-review-pr`, fixes, 1 commit + 1 push per round, base sync, `gh pr ready`, **CI wait in the worktree**). The epic PR leaves draft only at the end. Last line `REVIEW-PR: READY` = step 2; `REVIEW-PR: BLOCKED — <reason>` = stop and report.
2. Emit `✅ EPIC FINAL REVIEW done — REVIEW: OK + REVIEW-PR: READY + CI green`.

> ⛔ **Do not merge this PR.** It stays ready, with the CI green, for manual approval.

```bash
EPIC_PR_URL=$(gh pr list --repo $OWNER_REPO --head "$EPIC_BRANCH" --json url --jq '.[0].url')
gh issue comment $ISSUE_NUM --repo $OWNER_REPO \
  --body "Implementation complete. Integration PR opened: $EPIC_PR_URL"
```

---
