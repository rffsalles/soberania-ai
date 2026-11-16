#!/usr/bin/env node
/**
 * PreToolUse orientation guard for graphify. Delegates the decision to
 * graphify's own `hook-guard` (per-session nudge cap, freshness stamp, Grep
 * handling, out-of-project filtering) and forwards only a valid
 * `additionalContext`. Never emits a permission decision.
 *
 * Bash/Grep -> `graphify hook-guard search`; Read/Glob -> `hook-guard read`.
 * Inert when `graphify-out/graph.json` is absent: kicks one detached
 * bootstrap build (via graphify-build-runner.mjs) and stays silent.
 *
 * Wire under PreToolUse with matcher "Bash|Read|Glob|Grep". Fails open
 * (exit 0, no output) on ENOENT, timeout, non-zero exit or bad JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseHookEvent, readStdinRaw } from "./hook-io.mjs";
import { graphifyEnv, startBuild } from "./graphify-spawn.mjs";

const raw = readStdinRaw();
const event = parseHookEvent(raw);
if (event === null) process.exit(0);

const projectDir =
  (typeof event.cwd === "string" && event.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const outDir = path.join(projectDir, "graphify-out");

if (!fs.existsSync(path.join(outDir, "graph.json"))) {
  // lock + failure stamp live in startBuild: a burst of tool calls starts one build only
  startBuild(
    projectDir,
    path.join(path.dirname(fileURLToPath(import.meta.url)), "graphify-build-runner.mjs"),
  );
  process.exit(0);
}

const tool = String(event.tool_name ?? "");
const mode =
  tool === "Bash" || tool === "Grep" ? "search" : tool === "Read" || tool === "Glob" ? "read" : "";
if (!mode) process.exit(0);

const r = spawnSync("graphify", ["hook-guard", mode], {
  input: raw,
  cwd: projectDir,
  encoding: "utf8",
  timeout: 8000,
  windowsHide: true,
  env: { ...graphifyEnv(), CLAUDE_PROJECT_DIR: projectDir },
});
if (r.error || r.status !== 0 || !r.stdout) process.exit(0);

try {
  const ctx = JSON.parse(r.stdout)?.hookSpecificOutput?.additionalContext;
  if (typeof ctx === "string" && ctx) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: ctx },
      }),
    );
  }
} catch {
  // bad JSON from graphify: stay silent
}
process.exit(0);
