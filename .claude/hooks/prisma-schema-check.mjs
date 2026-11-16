#!/usr/bin/env node
/**
 * PostToolUse hook: after an edit to prisma/schema.prisma, run
 * `prisma validate` then `prisma format`. Invalid schema -> exit 2 with the
 * error on stderr (fed back to the model). Infra failure -> fail-open.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readStdinRaw, parseHookEvent } from "./hook-io.mjs";

const event = parseHookEvent(readStdinRaw());
const file = event?.tool_input?.file_path ?? event?.tool_input?.path;
const normalized = typeof file === "string" ? file.replaceAll("\\", "/") : "";
if (!normalized.endsWith("prisma/schema.prisma")) process.exit(0);

const cwdArg = typeof event.cwd === "string" && event.cwd ? event.cwd : "";
const projectDir = cwdArg || process.env.CLAUDE_PROJECT_DIR || process.cwd();

function prisma(args) {
  // npx is a .cmd shim on Windows: needs a shell there (args are fixed literals).
  return spawnSync("npx", ["prisma", ...args], {
    cwd: path.resolve(projectDir),
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    shell: process.platform === "win32",
  });
}

const validate = prisma(["validate"]);
// error set = spawn failure/timeout/signal -> infra, not a schema problem
if (validate.error || validate.signal || validate.status === null) process.exit(0);
if (validate.status !== 0) {
  const msg = `${validate.stderr}\n${validate.stdout}`.trim();
  process.stderr.write(`prisma validate falhou em ${normalized}:\n${msg}\n`);
  process.exit(2);
}

prisma(["format"]); // best-effort; result ignored

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        "Schema válido. Rode `npm run prisma:generate` e reinicie o `next dev` antes de testar.",
    },
  }),
);
process.exit(0);
