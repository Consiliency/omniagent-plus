import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanEnvironment, runProcess, ProcessScope } from "../tests/helpers/guard-process.ts";
import { STAGES, runStages } from "../tests/helpers/guard-stages.ts";
import { createFixture, setupFixture, clientUrl } from "./prepare-test-postgres.mjs";
import { packVerified } from "./pack-verified-packages.mjs";
import { assertUnchangedInputs, checkoutInputs, sourceIdentity, verifyArtifacts } from "./verify-publish-artifacts.mjs";

export const LIVE_CASE = "live Omnigent smoke collects metadata_only live evidence only when explicitly enabled";
export function checkResults(report, command, root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(resolve(root, "tests/guard/required-cases.json"), "utf8"));
  const cases = report.testResults.flatMap((suite) => suite.assertionResults.map((test) => ({ ...test, file: suite.name })));
  if (!cases.length || cases.some((test) => test.status === "failed")) throw new Error("Empty or failed root suite");
  const skipped = cases.filter((test) => test.status !== "passed");
  const full = command === "verify" || command === "test";
  if (full ? skipped.length !== 1 || skipped[0].fullName !== LIVE_CASE || !skipped[0].file.endsWith("packages/omnigent-transport/src/live-omnigent-smoke.test.ts") : skipped.length !== 0) throw new Error("Unexpected skipped/todo cases");
  for (const partition of manifest.commands[command]) for (const id of manifest[partition]) {
    const matches = cases.filter((test) => test.title === id && test.file.endsWith(`.${partition}.db.test.ts`) && test.status === "passed");
    if (matches.length !== 1) throw new Error(`Required case missing/renamed/skipped: ${id}`);
  }
  return { passed: cases.filter((test) => test.status === "passed").length, skipped: skipped.length };
}
export function suiteEnvironment(fixture, source = process.env) {
  const env = cleanEnvironment(source);
  if (fixture) {
    env.GUARD_INTEGRATION_REQUIRED = "1";
    env.GUARD_TEST_DATABASE_URL = clientUrl(fixture);
    env.GUARD_FIXTURE_RUN_DIR = fixture.runDir;
  }
  return env;
}
export function summarizeTestFailures(report, root = process.cwd()) {
  return report.testResults.flatMap((suite) => {
    const candidate = relative(root, resolve(suite.name));
    const file = !candidate.startsWith("..") && !isAbsolute(candidate) && /^(packages|tests)\/[a-zA-Z0-9_./-]+\.test\.ts$/.test(candidate) ? candidate : "unrecognized-test-path";
    const failures = suite.assertionResults.flatMap((test, index) => test.status === "failed" ? [{ index, messages: test.failureMessages ?? [] }] : []);
    if (!failures.length && suite.status === "failed") failures.push({ index: null, messages: [suite.message ?? ""] });
    return failures.map(({ index, messages }) => ({ file, case_index: index, kind: /timed out|timeout/i.test(messages.join("\n")) ? "timeout" : /Cannot find module|Failed to (load|resolve)/i.test(messages.join("\n")) ? "module-resolution" : /AssertionError/.test(messages.join("\n")) ? "assertion" : "test-failure" }));
  });
}
export async function runSuite(command, fixture, runDir, run = runProcess) {
  const reportPath = resolve(runDir, "tests.json");
  const args = ["exec", "vitest", "run", "--config", "vitest.config.ts", "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`];
  if (command === "test:guard") args.push("tests/guard");
  if (command === "test:integration") args.push("--project=guard-db", "tests/guard/fixture.integration.db.test.ts");
  try { await run("pnpm", args, { env: suiteEnvironment(fixture), timeout: 900_000 }); }
  catch (error) {
    try {
      const failures = summarizeTestFailures(JSON.parse(readFileSync(reportPath, "utf8")));
      console.error(JSON.stringify({ command, status: "failed", failures }));
    } catch { console.error(JSON.stringify({ command, status: "failed", report: "unavailable" })); }
    throw error;
  }
  const counts = checkResults(JSON.parse(readFileSync(reportPath, "utf8")), command);
  console.log(JSON.stringify({ command, ...counts }));
  return counts;
}
export async function verify({ command = "verify", mode = "local", root = process.cwd(), run = runProcess, create = createFixture, setup = setupFixture, suite = runSuite, pack = packVerified, artifacts = verifyArtifacts, inputs = checkoutInputs, stageList = STAGES } = {}) {
  if (!["verify", "test", "test:guard", "test:integration"].includes(command)) throw new Error("Invalid GUARD command");
  const scope = new ProcessScope();
  return await scope.run(async () => {
  const runDir = resolve(root, ".phase-loop/guard", `${Date.now()}-${process.pid}`);
  let fixture;
  /** @type {Awaited<ReturnType<typeof packVerified>> | undefined} */
  let packed;
  try {
    mkdirSync(runDir, { recursive: true });
    if (command !== "verify") {
      if (command !== "test") { fixture = await create({ mode, root }); scope.addCleanup(fixture.cleanup); await setup(fixture); }
      const result = await suite(command, fixture, runDir, run);
      scope.check();
      return result;
    }
    if (process.env.GITHUB_ACTIONS === "true" && (!process.env.GITHUB_EVENT_PATH || !process.env.GITHUB_OUTPUT)) throw new Error("Missing workflow event/output binding");
    const verifiedInputs = await inputs(root);
    const source = process.env.GITHUB_ACTIONS === "true" ? sourceIdentity(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")), process.env.GITHUB_SHA) : { tested_source_sha: verifiedInputs.source_sha, github_sha: null, pr_head_sha: null, pr_base_sha: null };
    if (source.tested_source_sha !== verifiedInputs.source_sha) throw new Error("Tested source mismatch");
    await runStages(stageList, async (stage) => {
      scope.check();
      console.log(`GUARD stage: ${stage}`);
      if (stage === "install") await run("pnpm", ["install", "--frozen-lockfile"], { timeout: 300_000 });
      else if (["build", "lint", "typecheck"].includes(stage)) await run("pnpm", [stage], { timeout: 180_000 });
      else if (stage === "boundaries") await run(process.execPath, ["scripts/check-dependency-boundaries.mjs"], { timeout: 60_000 });
      else if (stage === "sql-setup") { fixture = await create({ mode, root }); scope.addCleanup(fixture.cleanup); await setup(fixture); }
      else if (stage === "root-suite") await suite(command, fixture, runDir, run);
      else if (stage === "pack-and-manifest") packed = await pack(root, resolve(runDir, "artifacts"), source);
      else if (stage === "transport-smoke") {
        if (!packed?.packages[2]) throw new Error("Missing retained transport artifact");
        await artifacts(packed.manifestPath, packed.digest, root, source.tested_source_sha);
        await run(process.execPath, ["scripts/smoke-packed-omnigent-transport.mjs", "--tarball", resolve(dirname(packed.manifestPath), packed.packages[2].tarball)], { timeout: 90_000 });
      } else if (stage === "artifact-check") {
        if (!packed) throw new Error("Missing retained artifacts");
        await artifacts(packed.manifestPath, packed.digest, root, source.tested_source_sha);
      }
      else throw new Error("Unknown gate stage");
      await assertUnchangedInputs(root, verifiedInputs, inputs);
    });
    scope.check();
    if (!packed) throw new Error("Required pack-and-manifest stage missing");
    if (process.env.GITHUB_ACTIONS === "true") writeFileSync(process.env.GITHUB_OUTPUT ?? "", `artifact_manifest_sha256=${packed.digest}\nartifact_path=${dirname(packed.manifestPath)}\ntested_source_sha=${source.tested_source_sha}\n`, { flag: "a" });
    return packed;
  } finally {
    await scope.close();
    if (fixture) console.log(`SQL metadata: ${resolve(fixture.runDir, "sql-setup.json")}`);
  }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command = "verify", flag, mode] = process.argv.slice(2);
    if (flag !== undefined && (flag !== "--fixture-mode" || !mode || process.argv.length !== 5)) throw new Error("Expected --fixture-mode local|github-service");
    await verify({ command, mode: mode ?? "local" });
  } catch (error) { console.error(error instanceof Error ? error.message : "Verification failed"); process.exitCode = 1; }
}
