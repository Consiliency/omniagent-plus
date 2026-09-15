import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { STAGES } from "../helpers/guard-stages.js";
import { verify, checkResults, LIVE_CASE } from "../../scripts/verify.mjs";
import type { createFixture, setupFixture } from "../../scripts/prepare-test-postgres.mjs";
import type { packVerified } from "../../scripts/pack-verified-packages.mjs";

it.each([...STAGES, "success"])("real gate stops after failing stage %s", async (failed) => {
  const calls: string[] = [];
  const root = mkdtempSync(join(tmpdir(), "guard-gate-"));
  const hit = (stage: string) => { calls.push(stage); if (stage === failed) throw new Error(stage); };
  const cleanup = vi.fn(async () => {});
  const run = async (_command: string, args: string[]) => {
    if (args[0] === "rev-parse") return "a".repeat(40);
    hit(args[0] === "install" ? "install" : args[0]?.includes("check-dependency") ? "boundaries" : args[0]?.includes("smoke-packed") ? "transport-smoke" : args[0]!);
    return "";
  };
  const create = async () => { hit("sql-setup"); return { cleanup, runDir: root } as unknown as Awaited<ReturnType<typeof createFixture>>; };
  const setup = async (f: Parameters<typeof setupFixture>[0]) => f;
  const suite = async () => { hit("root-suite"); return { passed: 1, skipped: 1 }; };
  const pack = async () => { hit("pack-and-manifest"); return { manifestPath: join(root, "manifest.json"), digest: "digest", packages: [{}, {}, { tarball: "transport.tgz" }] } as Awaited<ReturnType<typeof packVerified>>; };
  let checks = 0;
  const artifacts = async () => { if (++checks === 2) hit("artifact-check"); return {}; };
  try {
    const operation = verify({ root, run, create, setup, suite, pack, artifacts });
    if (failed === "success") { await operation; expect(calls).toEqual([...STAGES]); }
    else { await expect(operation).rejects.toThrow(failed); expect(calls).toEqual(STAGES.slice(0, STAGES.indexOf(failed as typeof STAGES[number]) + 1)); }
    if (calls.includes("root-suite")) expect(cleanup).toHaveBeenCalledOnce();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
function result() {
  const ids = JSON.parse(readFileSync("tests/guard/required-cases.json", "utf8")) as { setup: string[]; integration: string[] };
  return { testResults: [
    ...(["setup", "integration"] as const).map((partition) => ({ name: `tests/guard/fixture.${partition}.db.test.ts`, assertionResults: ids[partition].map((id) => ({ title: id, fullName: id, status: "passed" })) })),
    { name: "packages/omnigent-transport/src/live-omnigent-smoke.test.ts", assertionResults: [{ title: LIVE_CASE, fullName: LIVE_CASE, status: "pending" }] },
  ] };
}
it("fails the real gate when root DB collection is suppressed", async () => {
  const root = mkdtempSync(join(tmpdir(), "guard-suppressed-"));
  const report = result();
  report.testResults = report.testResults.slice(-1);
  const cleanup = vi.fn(async () => {});
  const run = async (_command: string, args: string[]) => {
    if (args[0] === "rev-parse") return "a".repeat(40);
    const output = args.find((arg) => arg.startsWith("--outputFile.json="));
    if (output) writeFileSync(output.slice("--outputFile.json=".length), JSON.stringify(report));
    return "";
  };
  const create = async () => ({ cleanup, runDir: root, port: 1234, clientPassword: "synthetic" }) as unknown as Awaited<ReturnType<typeof createFixture>>;
  const setup = async (f: Parameters<typeof setupFixture>[0]) => f;
  try {
    await expect(verify({ root, run, create, setup })).rejects.toThrow("Required case");
    expect(cleanup).toHaveBeenCalledOnce();
  }
  finally { rmSync(root, { recursive: true, force: true }); }
});
it("requires exact command IDs and the exact full-root skip set", () => {
  expect(checkResults(result(), "verify")).toEqual({ passed: 11, skipped: 1 });
  for (const mutation of ["drop", "rename", "skip", "todo"]) {
    const report = result();
    const test = report.testResults[0]!.assertionResults[0]!;
    if (mutation === "drop") report.testResults.shift();
    else if (mutation === "rename") test.title = "changed";
    else test.status = mutation === "skip" ? "pending" : "todo";
    expect(() => checkResults(report, "verify")).toThrow();
  }
  const focused = result();
  focused.testResults = focused.testResults.slice(1, 2);
  expect(checkResults(focused, "test:integration")).toEqual({ passed: 2, skipped: 0 });
});
