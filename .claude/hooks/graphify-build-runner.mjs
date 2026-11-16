#!/usr/bin/env node
/**
 * Background graphify build runner: `node graphify-build-runner.mjs <projectRoot>`.
 *
 * Runs an incremental, AST-only extract (no API key needed). The caller
 * claims `graphify-out/.build.lock` (see graphify-spawn.mjs) before spawning
 * this runner; the runner always releases it, and removes graphify-out when
 * no graph.json exists. A failed build leaves a stamp so hooks do not respawn
 * the runner in a storm (for example when graphify is not installed).
 *
 * Cross-platform plain Node; always exits 0.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { graphifyEnv, releaseBuildLock, setBuildFailure } from "./graphify-spawn.mjs";

const root = process.argv[2] || process.cwd();

let ok = false;
try {
  const r = spawnSync("graphify", ["extract", ".", "--code-only", "--allow-dedup-shrink"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
    env: graphifyEnv(),
  });
  ok = !r.error && r.status === 0 && fs.existsSync(path.join(root, "graphify-out", "graph.json"));
} catch {
  // ok stays false
}
setBuildFailure(root, !ok);
releaseBuildLock(root);
process.exit(0);
