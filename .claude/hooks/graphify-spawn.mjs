/**
 * Shared helpers for the graphify hooks: child environment, build lock,
 * failure stamp and the detached build runner spawn. Used by
 * graphify-orient.mjs, graphify-session-ctx.mjs, graphify-build-runner.mjs
 * and graphify-rebuild.mjs.
 *
 * Fire-and-forget: detached + unref so the calling hook never waits, errors
 * are swallowed so a plumbing failure can never break a hook.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** A build lock older than this is considered dead and is stolen. */
export const LOCK_TTL_MS = 30 * 60 * 1000;
/** After a failed build, hooks skip new builds for this long. */
export const FAIL_TTL_MS = 15 * 60 * 1000;

/**
 * Environment for any graphify child: deterministic hashing, and the dirs
 * where uv/pipx put the binary (absent from non-interactive PATHs) first.
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
export function graphifyEnv(base = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...base, PYTHONHASHSEED: "0" };
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const dirs = [path.join(os.homedir(), ".local", "bin")];
  if (process.platform === "win32") {
    if (env.APPDATA) dirs.push(path.join(env.APPDATA, "uv", "bin"));
    if (env.LOCALAPPDATA) dirs.push(path.join(env.LOCALAPPDATA, "uv", "bin"));
  }
  env[key] = [...dirs, env[key] ?? ""].join(path.delimiter);
  return env;
}

/**
 * Per-project failure stamp, outside graphify-out (which a failed build removes).
 * @param {string} root
 * @returns {string}
 */
export function failStampPath(root) {
  const h = createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 12);
  return path.join(os.homedir(), ".cache", `graphify-build-failed-${h}`);
}

/**
 * @param {string} root
 * @returns {boolean}
 */
export function isBuildFailureFresh(root) {
  try {
    return Date.now() - fs.statSync(failStampPath(root)).mtimeMs < FAIL_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {boolean} failed  true writes the stamp, false clears it
 */
export function setBuildFailure(root, failed) {
  try {
    const p = failStampPath(root);
    if (failed) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, String(Date.now()));
    } else {
      fs.rmSync(p, { force: true });
    }
  } catch {
    // best effort
  }
}

/**
 * Atomic build lock: `graphify-out/.build.lock` (mkdir). A stale lock is
 * stolen through an atomic rename, so only one stealer wins.
 * @param {string} root
 * @returns {boolean} true when this caller owns the lock
 */
export function claimBuildLock(root) {
  const out = path.join(root, "graphify-out");
  const lock = path.join(out, ".build.lock");
  try {
    fs.mkdirSync(out, { recursive: true });
    fs.mkdirSync(lock);
    return true;
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== "EEXIST") return false;
  }
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs < LOCK_TTL_MS) return false;
    const dead = `${lock}.stale-${process.pid}`;
    fs.renameSync(lock, dead);
    fs.rmSync(dead, { recursive: true, force: true });
    fs.mkdirSync(lock);
    return true;
  } catch {
    return false;
  }
}

/**
 * Releases the lock; drops graphify-out when no graph was produced.
 * @param {string} root
 */
export function releaseBuildLock(root) {
  const out = path.join(root, "graphify-out");
  try {
    fs.rmSync(path.join(out, ".build.lock"), { recursive: true, force: true });
    if (!fs.existsSync(path.join(out, "graph.json"))) {
      fs.rmSync(out, { recursive: true, force: true });
    }
  } catch {
    // best effort
  }
}

/**
 * @param {string} projectRoot  directory the build runs in
 * @param {string} runnerPath   absolute path to graphify-build-runner.mjs
 */
export function spawnBuildRunner(projectRoot, runnerPath) {
  try {
    const child = spawn(process.execPath, [runnerPath, projectRoot], {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // never block a hook on plumbing failures
  }
}

/**
 * Starts one background build unless a recent one failed or another hook
 * already holds the lock. Safe to call from a burst of parallel hooks.
 * @param {string} projectRoot
 * @param {string} runnerPath
 */
export function startBuild(projectRoot, runnerPath) {
  if (isBuildFailureFresh(projectRoot)) return;
  if (!claimBuildLock(projectRoot)) return;
  spawnBuildRunner(projectRoot, runnerPath);
}
