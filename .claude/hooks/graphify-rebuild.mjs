#!/usr/bin/env node
/**
 * Git-hook rebuild runner for the graphify knowledge graph.
 *
 * Invoked by the project's git hook manager (lefthook, Husky, pre-commit,
 * simple-git-hooks or a plain git hook) as:
 *   node .claude/hooks/graphify-rebuild.mjs <hook-name> [git hook args...]
 * Runs `graphify extract . --code-only --allow-dedup-shrink` detached so git
 * never waits. Always exits 0 (fail-open). Not a Claude Code hook: it reads no
 * stdin and prints nothing to stdout.
 *
 * Skips: rebase/merge/cherry-pick in progress, linked worktrees,
 * GRAPHIFY_SKIP_HOOK=1, no graph yet, post-checkout that is not a branch
 * switch, and commits that touch only graphify-out/.
 *
 * Test seam: GRAPHIFY_REBUILD_DRY_RUN=1 logs the command instead of spawning.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { graphifyEnv } from "./graphify-spawn.mjs";

const EXTRACT_ARGS = ["extract", ".", "--code-only", "--allow-dedup-shrink"];

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  return r.status === 0 ? (r.stdout ?? "").trim() : "";
}

/**
 * @param {string} p
 * @returns {string}
 */
function real(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Decides whether a rebuild must be skipped.
 * @param {string} cwd - repository working directory
 * @param {string} hook - git hook name
 * @param {string[]} hookArgs - arguments git passed to the hook
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null} skip reason, or null to run
 */
export function skipReason(cwd, hook, hookArgs, env) {
  if (env.GRAPHIFY_SKIP_HOOK === "1") return "GRAPHIFY_SKIP_HOOK=1";

  // post-checkout: only branch switches (flag "1"). pre-commit exposes it via env.
  if (hook === "post-checkout") {
    const flag = env.PRE_COMMIT_CHECKOUT_TYPE ?? hookArgs[2];
    if (flag !== "1") return "post-checkout is not a branch switch";
  }

  const gitDir = git(cwd, ["rev-parse", "--git-dir"]);
  if (!gitDir) return "not a git repository";
  const absGitDir = path.resolve(cwd, gitDir);
  const common = git(cwd, ["rev-parse", "--git-common-dir"]);
  if (common && real(absGitDir) !== real(path.resolve(cwd, common))) return "linked worktree";

  for (const f of ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"]) {
    if (fs.existsSync(path.join(absGitDir, f))) return `${f} in progress`;
  }

  // A build in progress holds graphify-out/ without a graph.json: skip it too.
  if (!fs.existsSync(path.join(cwd, "graphify-out", "graph.json"))) return "no graph yet";

  if (hook === "post-commit") {
    const changed = git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "HEAD"])
      .split(/\r?\n/)
      .filter(Boolean);
    if (changed.length > 0 && changed.every((f) => f.startsWith("graphify-out/"))) {
      return "only graphify-out changed";
    }
  }
  return null;
}

/**
 * @param {string} line
 * @returns {void}
 */
function log(line) {
  try {
    const dir = path.join(os.homedir(), ".cache");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "graphify-rebuild.log"),
      `${new Date().toISOString()} ${line}\n`,
    );
  } catch {
    // logging is best effort
  }
}

/**
 * @param {string[]} argv - hook name followed by git hook args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @returns {void}
 */
export function run(argv, cwd, env) {
  const [hook = "unknown", ...hookArgs] = argv;
  const reason = skipReason(cwd, hook, hookArgs, env);
  if (reason) {
    log(`${hook}: skip (${reason})`);
    return;
  }
  if (env.GRAPHIFY_REBUILD_DRY_RUN === "1") {
    log(`${hook}: dry-run graphify ${EXTRACT_ARGS.join(" ")}`);
    return;
  }
  /** @type {number | "ignore"} */
  let fd = "ignore";
  try {
    fd = fs.openSync(path.join(os.homedir(), ".cache", "graphify-rebuild.log"), "a");
  } catch {
    // keep stdio ignored
  }
  log(`${hook}: run graphify ${EXTRACT_ARGS.join(" ")}`);
  const child = spawn("graphify", EXTRACT_ARGS, {
    cwd,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
    env: graphifyEnv(env),
  });
  child.on("error", () => {});
  child.unref();
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  try {
    run(process.argv.slice(2), process.cwd(), process.env);
  } catch {
    // never block git on hook plumbing failures
  }
  process.exit(0);
}
