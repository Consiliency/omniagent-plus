import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { STAGES } from "../helpers/guard-stages.js";
import { verify, checkResults, runSuite, summarizeTestFailures, LIVE_CASE } from "../../scripts/verify.mjs";
import type { createFixture, setupFixture } from "../../scripts/prepare-test-postgres.mjs";
import type { packVerified } from "../../scripts/pack-verified-packages.mjs";
import { cleanupChild, spawnOwned, waitExit, waitReady } from "../helpers/guard-process.js";

const inputs = async () => ({ source_sha: "a".repeat(40), lockfile_sha256: "b".repeat(64), package_manifest_sha256: {} });

it.each(["SIGINT", "SIGTERM"] as const)("quiesces nested build ownership on %s before launcher exit", async (signal) => {
  const root = mkdtempSync(join(tmpdir(), "guard-build-interrupt-"));
  const ready = join(root, "ready.json");
  const helper = new URL("../../tests/helpers/guard-process.ts", import.meta.url).href;
  const leaf = "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});console.log(process.pid);setInterval(()=>{},1000)";
  const middle = `import {ProcessScope,spawnOwned,waitReady,waitExit} from ${JSON.stringify(helper)};
const scope=new ProcessScope();await scope.run(async()=>{const child=spawnOwned(process.execPath,['-e',${JSON.stringify(leaf)}]);try{const pid=Number((await waitReady(child)).toString());console.log(JSON.stringify([process.pid,pid]));await waitExit(child,15000,scope.controller.signal);}finally{await scope.close();}}).catch(()=>{process.exitCode=1;});`;
  const worker = `import {writeFileSync} from 'node:fs';import {ProcessScope,spawnOwned,waitReady,waitExit} from ${JSON.stringify(helper)};
const scope=new ProcessScope();await scope.run(async()=>{const child=spawnOwned(process.execPath,['--input-type=module','-e',${JSON.stringify(middle)}]);try{const pids=JSON.parse((await waitReady(child)).toString());await new Promise(r=>setTimeout(r,100));writeFileSync(${JSON.stringify(ready)},JSON.stringify([process.pid,...pids]));await waitExit(child,15000,scope.controller.signal);}finally{await scope.close();}}).catch(()=>{process.exitCode=1;});`;
  const script = `import {verify} from ${JSON.stringify(new URL("../../scripts/verify.mjs", import.meta.url).href)};import {runProcess} from ${JSON.stringify(helper)};
try{await verify({root:${JSON.stringify(root)},inputs:async()=>({source_sha:'a'.repeat(40),lockfile_sha256:'b'.repeat(64),package_manifest_sha256:{}}),stageList:['build'],run:async()=>runProcess(process.execPath,['--input-type=module','-e',${JSON.stringify(worker)}])});}catch{process.exitCode=1;}`;
  const unrelated = spawnOwned(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"]);
  const launcher = spawnOwned(process.execPath, ["--input-type=module", "-e", script]);
  launcher.stdout.resume(); launcher.stderr.resume();
  try {
    await waitReady(unrelated);
    const deadline = Date.now() + 10_000;
    while (!existsSync(ready) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(existsSync(ready)).toBe(true);
    const pids = JSON.parse(readFileSync(ready, "utf8")) as number[];
    expect(pids).toHaveLength(3);
    process.kill(launcher.pid!, signal);
    // Observe launcher exit without the test parent's cleanup rescuing it.
    expect(await waitExit(launcher, 5_000)).toBe(1);
    for (const pid of pids) expect(existsSync(`/proc/${pid}/stat`) && !readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.startsWith("Z")).toBe(false);
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
  } finally { await cleanupChild(launcher); await cleanupChild(unrelated); rmSync(root, { recursive: true, force: true }); }
}, 20_000);

it("reports failure locations and categories without names, messages or external paths", () => {
  const report = { testResults: [
    { name: `${process.cwd()}/tests/guard/process.test.ts`, assertionResults: [{ status: "failed", fullName: "private-test-name", failureMessages: ["Test timed out: private-failure-value"] }] },
    { name: "/private/source.test.ts", status: "failed", assertionResults: [], message: "private-collection-error" },
  ] };
  const summary = summarizeTestFailures(report);
  expect(summary).toEqual([
    { file: "tests/guard/process.test.ts", case_index: 0, kind: "timeout" },
    { file: "unrecognized-test-path", case_index: null, kind: "test-failure" },
  ]);
  expect(JSON.stringify(summary)).not.toContain("private");
});
it("preserves child failure when its test report is missing or malformed", async () => {
  const root = mkdtempSync(join(tmpdir(), "guard-failure-report-"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const run = async () => { throw new Error("child failed"); };
    await expect(runSuite("test", undefined, root, run)).rejects.toThrow("child failed");
    writeFileSync(join(root, "tests.json"), "malformed-private-value");
    await expect(runSuite("test", undefined, root, run)).rejects.toThrow("child failed");
    expect(log.mock.calls).toHaveLength(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  } finally { log.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

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
    const operation = verify({ root, run, create, setup, suite, pack, artifacts, inputs });
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
    await expect(verify({ root, run, create, setup, inputs })).rejects.toThrow("Required case");
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
it("rejects dirty source before stages and changed source before the next stage", async () => {
  const root = mkdtempSync(join(tmpdir(), "guard-source-gate-"));
  const calls: string[] = [];
  let changed = false;
  const run = async (_command: string, args: string[]) => { calls.push(args[0]!); if (args[0] === "build") changed = true; return ""; };
  try {
    await expect(verify({ root, run, inputs: async () => { throw new Error("Dirty tracked verification inputs"); } })).rejects.toThrow("Dirty tracked");
    expect(calls).toEqual([]);
    await expect(verify({ root, run, inputs: async () => ({ ...await inputs(), source_sha: (changed ? "c" : "a").repeat(40) }) })).rejects.toThrow("inputs changed");
    expect(calls).toEqual(["install", "build"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
