#!/usr/bin/env node
/**
 * PreToolUse guard: block edits to package-lock.json and to already-committed
 * prisma/migrations/<dir>/migration.sql. New (untracked) migrations pass.
 * Exit 2 blocks. Any infra failure -> allow (fail-open).
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readStdinRaw, parseHookEvent } from "./hook-io.mjs";

const event = parseHookEvent(readStdinRaw());
const file = event?.tool_input?.file_path ?? event?.tool_input?.path;
if (typeof file !== "string" || !file) process.exit(0);

const p = file.replaceAll("\\", "/");
let reason = "";
if (/(^|\/)package-lock\.json$/.test(p)) reason = "lockfile: use npm install";
else if (/(^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/.test(p))
  reason = "migration já commitada: crie uma nova migration";
if (!reason) process.exit(0);

const cwdArg = typeof event.cwd === "string" && event.cwd ? event.cwd : "";
const projectDir = path.resolve(cwdArg || process.env.CLAUDE_PROJECT_DIR || process.cwd());
const r = spawnSync("git", ["ls-files", "--error-unmatch", path.resolve(projectDir, file)], {
  cwd: projectDir,
  stdio: "ignore",
  timeout: 10_000,
  windowsHide: true,
});
// status 0 = tracked. Non-zero/error = untracked, outside repo or git missing -> allow.
if (r.status === 0) {
  process.stderr.write(`protect-generated: bloqueado (${reason}).\n`);
  process.exit(2);
}
process.exit(0);
