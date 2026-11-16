#!/usr/bin/env node
/**
 * SessionStart + SubagentStart hook: injects the graphify code-lookup rule.
 *
 * Inert until graphify-out/graph.json exists. Skips review subagents
 * (agent_type "review-*" or "implementation-reviewer"). When the graph is
 * older than the last commit (or graphify-out/needs_update exists) it spawns
 * the detached build runner to refresh it. Always exits 0 (fail open).
 *
 * @module hooks/graphify-session-ctx
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseHookEvent, readStdinRaw } from "./hook-io.mjs";
import { startBuild } from "./graphify-spawn.mjs";

const BASE_TEXT =
  "Code lookup: this project has a graphify knowledge graph. Before grepping or reading many files to locate code or trace a flow, run `graphify query|explain|path` via plain Bash; then read only what it points to. Skip it when the exact path is known. TRUNCATED → `--budget <n>` or narrow the question. Never run `graphify update .`, `graphify .`, `graphify install` or `graphify extract` (git hooks rebuild the graph).";
const CONTEXT_MODE_TEXT =
  " context-mode `ctx_*` is only for large output; keep graphify, git and rtk on plain Bash.";

/**
 * @param {string} file
 * @returns {any | null}
 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * True when the context-mode plugin is installed or enabled.
 * @param {string} root
 * @returns {boolean}
 */
function hasContextMode(root) {
  try {
    const installed = fs.readFileSync(
      path.join(os.homedir(), ".claude", "plugins", "installed_plugins.json"),
      "utf8",
    );
    if (installed.includes("context-mode")) return true;
  } catch {
    // no installed_plugins.json: fall through to settings
  }
  const files = [
    path.join(root, ".claude", "settings.json"),
    path.join(root, ".claude", "settings.local.json"),
    path.join(os.homedir(), ".claude", "settings.json"),
  ];
  for (const f of files) {
    const enabled = readJson(f)?.enabledPlugins;
    if (enabled && typeof enabled === "object") {
      if (Object.keys(enabled).some((k) => k.includes("context-mode") && enabled[k])) return true;
    }
  }
  return false;
}

/**
 * True when graph.json predates the last commit, or needs_update exists.
 * @param {string} root
 * @param {string} graph
 * @returns {boolean}
 */
function isStale(root, graph) {
  if (fs.existsSync(path.join(root, "graphify-out", "needs_update"))) return true;
  try {
    const r = spawnSync("git", ["log", "-1", "--format=%ct"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    const commitSec = Number.parseInt((r.stdout ?? "").trim(), 10);
    if (r.status !== 0 || !Number.isFinite(commitSec)) return false;
    return fs.statSync(graph).mtimeMs / 1000 < commitSec;
  } catch {
    return false;
  }
}

function main() {
  const event = parseHookEvent(readStdinRaw());
  if (!event) return;
  const name = event.hook_event_name;
  if (name !== "SessionStart" && name !== "SubagentStart") return;
  if (name === "SubagentStart") {
    const t = typeof event.agent_type === "string" ? event.agent_type : "";
    if (t.startsWith("review-") || t === "implementation-reviewer") return;
  }

  const root =
    (typeof event.cwd === "string" && event.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const graph = path.join(root, "graphify-out", "graph.json");
  if (!fs.existsSync(graph)) return;

  if (isStale(root, graph)) {
    startBuild(
      root,
      path.join(path.dirname(fileURLToPath(import.meta.url)), "graphify-build-runner.mjs"),
    );
  }

  const text = BASE_TEXT + (hasContextMode(root) ? CONTEXT_MODE_TEXT : "");
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: name, additionalContext: text } }),
  );
}

try {
  main();
} catch {
  // fail open
}
process.exit(0);
