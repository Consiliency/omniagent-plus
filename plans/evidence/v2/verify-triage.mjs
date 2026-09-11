import assert, { AssertionError } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
assert.ok(
  args.length === 0 || (args.length === 1 && args[0] === "--inventory-only"),
  "Usage: node plans/evidence/v2/verify-triage.mjs [--inventory-only]",
);

const audit = readFileSync("docs/code-review-2026-09-01.md", "utf8");
const matrix = readFileSync("plans/audit-remediation-disposition-20260905.md", "utf8");

function verifyInventory(source, candidate) {
  const ids = [...source.matchAll(/^\*\*((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) /gm)]
    .map((match) => match[1]).sort();
  const rows = [...candidate.matchAll(/^\| ((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \| ([RCQNIS]) \/ /gm)];
  assert.equal(ids.length, 55, "Historical finding inventory changed");
  assert.equal(new Set(ids).size, 55, "Duplicate historical finding");
  assert.deepEqual(rows.map((match) => match[1]).sort(), ids, "Finding membership drift");

  const expected = rows.filter((match) => /[NQ]/.test(match[2]))
    .map((match) => match[1]).sort();
  const caseRows = [...candidate.matchAll(/^\| ((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \| CASE-((?:SL|CC|TR|CO|CLI|WL|ID|HY)-\d+) \|/gm)];
  const cases = caseRows.map((match) => match[1]).sort();
  assert.deepEqual(cases, expected, "N/Q acceptance membership drift");
  for (const match of caseRows) assert.equal(match[1], match[2]);
  const crossCutting = [...candidate.matchAll(/^\| (3\.[1-4]) \| CASE-(3\.[1-4]) \|/gm)];
  assert.deepEqual(crossCutting.map((match) => match[1]).sort(), ["3.1", "3.2", "3.3", "3.4"]);
  for (const match of crossCutting) assert.equal(match[1], match[2]);
  return { findings: ids.length, nqCases: cases.length, crossCutting: crossCutting.length };
}

const inventory = verifyInventory(audit, matrix);
const invalidCandidates = [
  ["missing finding", matrix.replace(/^\| SL-1 \| C \/ B .*\n/m, "")],
  ["missing N/Q case", matrix.replace(/^\| SL-7 \| CASE-SL-7 .*\n/m, "")],
  ["missing cross-cutting case", matrix.replace(/^\| 3\.1 \| CASE-3\.1 .*\n/m, "")],
  ["duplicate N/Q case", `${matrix}\n| SL-7 | CASE-SL-7 | duplicate |\n`],
  ["duplicate cross-cutting case", `${matrix}\n| 3.1 | CASE-3.1 | duplicate |\n`],
  ["mismatched case ID", matrix.replace("| SL-7 | CASE-SL-7 |", "| SL-7 | CASE-WL-5 |")],
];
for (const [label, candidate] of invalidCandidates) {
  assert.notEqual(candidate, matrix, `Negative control did not change input: ${label}`);
  assert.throws(() => verifyInventory(audit, candidate), AssertionError, label);
}
console.log(JSON.stringify({ ...inventory, negativeControls: invalidCandidates.length }));

if (args.length === 0) {
  for (const [command, ...commandArgs] of [
    ["phase-loop", "validate-roadmap", "specs/phase-plans-v2.md"],
    ["git", "diff", "--check"],
    ["git", "diff", "--cached", "--check"],
  ]) {
    execFileSync(command, commandArgs, { stdio: "inherit" });
  }
}
console.log("TRIAGE structural verification passed; content review and phase acceptance remain separate.");
