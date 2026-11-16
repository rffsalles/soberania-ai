#!/usr/bin/env node
// Computes a branch slug from an issue title.
//
// Usage: node .claude/skills/github-pm/scripts/branch-slug.mjs <issue> <owner/repo> [--max <n>]
//        node .claude/skills/github-pm/scripts/branch-slug.mjs --text "<free text>" [--max <n>]
//   --max: slug length cap (default 40; the epic SETUP uses 30).
//   --text: slugs the given text instead of reading an issue title (free mode, no issue).
//
// Exists because, inside a worktree, the Bash guard refuses `node -e '...' "$TITLE"`
// (an interpreter with an operand computed at run time). Here the only operands are the
// issue and the repository; the title comes from `gh` through execFileSync, with no shell.
//
// Output: the slug on stdout, no trailing newline. Exit 1 with a message on stderr when
// `gh` fails or the slug comes out empty.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Combining marks range (U+0300 to U+036F), built in code: a Write/Edit would decode a
// `\u` escape and store the raw characters in the file.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`,
  "g",
);

/**
 * Transliterates accents before lower-casing, then replaces the rest with `-`.
 * @param {string} title
 * @param {number} [max]
 * @returns {string}
 */
export function slugify(title, max = 40) {
  return title
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, max)
    .replace(/^-+|-+$/g, "");
}

/** @param {string} message */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** @param {string[]} argv */
function main(argv) {
  const [issue, repo] = argv;
  const maxIndex = argv.indexOf("--max");
  const max = maxIndex === -1 ? 40 : Number(argv[maxIndex + 1]);
  const textIndex = argv.indexOf("--text");
  if (textIndex !== -1) {
    const text = argv[textIndex + 1] ?? "";
    const slug = Number.isInteger(max) && max >= 1 ? slugify(text, max) : "";
    if (!slug) fail("The text has no letter or digit (or --max is invalid), so there is no slug.");
    process.stdout.write(slug);
    return;
  }
  if (!issue || !repo || !Number.isInteger(max) || max < 1) {
    fail("Usage: branch-slug.mjs <issue> <owner/repo> [--max <n>] | --text <text> [--max <n>]");
  }
  let title = "";
  try {
    title = execFileSync(
      "gh",
      ["issue", "view", issue, "--repo", repo, "--json", "title", "--jq", ".title"],
      { encoding: "utf8", windowsHide: true },
    );
  } catch {
    fail(`Could not read the title of issue ${issue} in ${repo} with gh.`);
  }
  const slug = slugify(title, max);
  if (!slug) fail(`Issue ${issue} has no slug (the title has no letter or digit).`);
  process.stdout.write(slug);
}

// realpath on both sides: argv[1] may be a symlink or junction to this file.
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}
