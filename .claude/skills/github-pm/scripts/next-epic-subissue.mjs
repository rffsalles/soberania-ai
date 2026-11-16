#!/usr/bin/env node
// Picks the next runnable sub-issue of an epic for /pm:issue-work-in-loop.
// Uses the gh CLI and JSON parsing in Node (no python3, like the other scripts in this folder).
//
// Eligible = OPEN, in the same repository as the epic, and with ALL native `blockedBy`
// issues CLOSED (a blocker in another repository counts too). Among the eligible ones,
// the first in epic order (`subIssues.nodes`). A sub-issue of another repository is never
// processed: its `number` alone would collide with an issue of the local repository.
//
// Usage: node next-epic-subissue.mjs <EPIC_NUMBER> <OWNER/REPO>
//
// Exit codes (stdout only on 0; messages go to stderr):
//   0  eligible: stdout is {"number":N,"title":"..."}
//   1  GitHub query failed: never treat as "none open"
//   2  invalid usage
//   3  the eligible issue is a manual task (label `manual`): stop the loop
//   4  open sub-issues exist, none eligible: waiting for blockers
//   5  no OPEN sub-issue: FINALIZATION (at INIT: empty graph or only CLOSED)
//   6  the epic has a sub-issue of another repository: not runnable
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      subIssues(first:100){
        nodes{
          number title state url
          repository{ nameWithOwner }
          labels(first:100){ nodes{ name } }
          blockedBy(first:50){ nodes{ number state repository{ nameWithOwner } } }
        }
      }
    }
  }
}`;

/** @typedef {{ number: number, state: string, repository: { nameWithOwner: string } }} IssueRef */
/** @typedef {IssueRef & { title: string, url: string, labels: { nodes: Array<{ name: string }> }, blockedBy: { nodes: IssueRef[] } }} SubIssue */

/** @param {IssueRef} issue */
const ref = (issue) => `${issue.repository.nameWithOwner}#${issue.number}`;

/** @param {SubIssue} issue */
const openBlockers = (issue) =>
  issue.blockedBy.nodes.filter((blocker) => blocker.state !== "CLOSED");

/** @param {SubIssue} issue */
const isManual = (issue) =>
  issue.labels.nodes.some((label) => label.name.toLowerCase() === "manual");

/**
 * @param {number} code
 * @param {string} message
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function fail(code, message) {
  return { code, stdout: "", stderr: `${message}\n` };
}

/**
 * @param {string} epicNumber
 * @param {string} ownerRepo
 * @returns {SubIssue[]}
 */
function fetchSubIssues(epicNumber, ownerRepo) {
  const [owner = "", name = ""] = ownerRepo.split("/");
  const out = execFileSync(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${epicNumber}`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const issue = JSON.parse(out).data.repository.issue;
  if (!issue) {
    throw new Error(`epic #${epicNumber} not found in ${ownerRepo}`);
  }
  return issue.subIssues.nodes;
}

/**
 * Pure selection: maps the sub-issues of an epic to an exit code plus stdout/stderr.
 * @param {SubIssue[]} subIssues
 * @param {string} epicNumber
 * @param {string} ownerRepo
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function select(subIssues, epicNumber, ownerRepo) {
  const foreign = subIssues.filter(
    (issue) => issue.repository.nameWithOwner.toLowerCase() !== ownerRepo.toLowerCase(),
  );
  if (foreign.length > 0) {
    return fail(
      6,
      `EPIC STOP — child of another repository in epic #${epicNumber}: ${foreign.map(ref).join(", ")}.\n` +
        "A runnable epic cannot have a child of another repo; move it to the umbrella issue (an umbrella does not run in the loop).",
    );
  }

  // No sort: `subIssues.nodes` already comes in the native epic order.
  const open = subIssues.filter((issue) => issue.state === "OPEN");
  if (open.length === 0) {
    const graph =
      subIssues.length === 0
        ? "empty graph, no native sub-issue"
        : `${subIssues.length} sub-issue(s), all CLOSED`;
    return fail(5, `Epic #${epicNumber}: no OPEN sub-issue (${graph}).`);
  }

  const eligible = open.filter((issue) => openBlockers(issue).length === 0);
  if (eligible.length === 0) {
    const waiting = open.map(
      (issue) =>
        `  #${issue.number} ${issue.title} — waiting for ${openBlockers(issue).map(ref).join(", ")}`,
    );
    return fail(
      4,
      [
        `EPIC STOP — waiting for blockers (epic #${epicNumber}); no open sub-issue is released:`,
        ...waiting,
      ].join("\n"),
    );
  }

  const [next] = eligible;
  if (next && isManual(next)) {
    return fail(
      3,
      `EPIC STOP — manual task #${next.number} ${next.title} (${next.url}).\n` +
        `Run the manual task outside the loop as the issue body says, close the issue, then run /pm:issue-work-in-loop ${epicNumber} --epic again.`,
    );
  }

  if (!next) return fail(1, "internal error: no eligible sub-issue");
  return {
    code: 0,
    stdout: `${JSON.stringify({ number: next.number, title: next.title })}\n`,
    stderr: "",
  };
}

/** @param {string[]} argv */
function main(argv) {
  const [epicNumber = "", ownerRepo = ""] = argv;
  if (!/^\d+$/.test(epicNumber) || !/^[^/\s]+\/[^/\s]+$/.test(ownerRepo)) {
    return fail(2, "Usage: node next-epic-subissue.mjs <EPIC_NUMBER> <OWNER/REPO>");
  }
  try {
    return select(fetchSubIssues(epicNumber, ownerRepo), epicNumber, ownerRepo);
  } catch (err) {
    const detail = /** @type {{ stderr?: string, message?: string }} */ (err);
    return fail(
      1,
      `failed to query the sub-issues of epic #${epicNumber}: ${detail.stderr || detail.message}`,
    );
  }
}

// realpath on both sides: argv[1] may be a symlink or junction to this file.
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
) {
  const result = main(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
