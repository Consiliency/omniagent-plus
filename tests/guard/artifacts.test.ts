import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { checkoutInputs, PUBLIC_PACKAGES, sha256, sourceIdentity, verifyArtifacts } from "../../scripts/verify-publish-artifacts.mjs";
import { packVerified } from "../../scripts/pack-verified-packages.mjs";
import { cleanEnvironment, runProcess } from "../helpers/guard-process.js";

let base: string;
let sourceRoot: string;
let original: string;
let digest: string;
async function commit(root: string) {
  await runProcess("git", ["add", "."], { cwd: root });
  await runProcess("git", ["-c", "user.name=GUARD fixture", "-c", "user.email=guard@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture"], { cwd: root });
}
beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "guard-artifact-base-"));
  sourceRoot = join(base, "source");
  mkdirSync(sourceRoot);
  for (const file of ["scripts/publish-package-if-needed.sh", "scripts/verify-publish-artifacts.mjs", "tests/helpers/guard-process.ts", "pnpm-lock.yaml"]) {
    mkdirSync(dirname(join(sourceRoot, file)), { recursive: true });
    cpSync(file, join(sourceRoot, file));
  }
  writeFileSync(join(sourceRoot, "package.json"), JSON.stringify({ private: true, type: "module", packageManager: "pnpm@11.1.1" }));
  for (const [name, dir] of PUBLIC_PACKAGES) {
    const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    mkdirSync(join(sourceRoot, dir, "src"), { recursive: true });
    writeFileSync(join(sourceRoot, dir, "package.json"), JSON.stringify({ name, version, files: ["src"] }));
    writeFileSync(join(sourceRoot, dir, "src/index.ts"), "export const value = 1;\n");
  }
  await runProcess("git", ["init", "--initial-branch=main"], { cwd: sourceRoot });
  await commit(sourceRoot);
  const inputs = await checkoutInputs(sourceRoot);
  const entries: { name: string; version: string; tarball: string; sha256: string }[] = [];
  for (const [index, [name, dir]] of PUBLIC_PACKAGES.entries()) {
    const pkg = JSON.parse(readFileSync(join(sourceRoot, dir, "package.json"), "utf8"));
    const scratch = join(base, `scratch-${index}`);
    mkdirSync(join(scratch, "package"), { recursive: true });
    writeFileSync(join(scratch, "package/package.json"), JSON.stringify({ name, version: pkg.version }));
    const tarball = `package-${index}.tgz`;
    await runProcess("tar", ["-czf", join(base, tarball), "-C", scratch, "package"]);
    entries.push({ name, version: pkg.version, tarball, sha256: sha256(readFileSync(join(base, tarball))) });
  }
  original = JSON.stringify({ schema: "guard-artifacts.v1", ...inputs, identity: { tested_source_sha: inputs.source_sha }, packages: entries });
  digest = sha256(original);
  writeFileSync(join(base, "manifest.json"), original);
}, 15_000);
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

async function helper(mode: string) {
  const dir = mkdtempSync(join(tmpdir(), "guard-artifact-control-"));
  cpSync(base, dir, { recursive: true });
  const root = join(dir, "source");
  const manifestPath = join(dir, "manifest.json");
  const manifest = JSON.parse(original);
  let expected = digest;
  const log = join(dir, "npm-log.jsonl");
  const stub = join(dir, "npm-stub");
  writeFileSync(stub, `#!/usr/bin/env node
const fs=require('node:fs');fs.appendFileSync(process.env.NPM_LOG,JSON.stringify(process.argv.slice(2))+'\\n');
if(process.argv[2]==='view'){if(process.env.NPM_RESULT==='exists'){console.log('"0.2.0"');process.exit(0);}console.log(JSON.stringify({error:{code:process.env.NPM_RESULT==='error'?'E503':process.env.NPM_RESULT==='conflict'?'E403':'E404',summary:'message mentions E404 Not Found'}}));process.exit(1);}
if(process.argv[2]!=='publish')process.exit(9);
`, { mode: 0o700 });
  if (mode === "tarball" || mode === "pair") {
    writeFileSync(join(dir, manifest.packages[0].tarball), "tampered");
    if (mode === "pair") manifest.packages[0].sha256 = sha256("tampered");
  }
  if (mode === "source") manifest.source_sha = "f".repeat(40);
  if (mode === "lockfile") manifest.lockfile_sha256 = "f".repeat(64);
  if (mode === "package") manifest.package_manifest_sha256[PUBLIC_PACKAGES[0]![0]] = "f".repeat(64);
  if (mode === "identity") manifest.packages[0].name = "@private/unexpected";
  if (["dirty-source", "staged-source", "untracked-source", "ignored-source"].includes(mode)) {
    const file = `packages/core-contracts/src/${mode.endsWith("tracked-source") || mode === "ignored-source" ? "extra.ts" : "index.ts"}`;
    writeFileSync(join(root, file), "export const changed = true;\n");
    if (mode === "staged-source") await runProcess("git", ["add", file], { cwd: root });
    if (mode === "ignored-source") writeFileSync(join(root, ".git/info/exclude"), file + "\n");
  }
  if (mode !== "tarball") {
    writeFileSync(manifestPath, JSON.stringify(manifest));
    if (["source", "lockfile", "package", "identity"].includes(mode)) expected = sha256(JSON.stringify(manifest));
  }
  const legacy = mode.startsWith("legacy-");
  const legacyDir = join(dir, "quoted ' package");
  if (legacy) { mkdirSync(legacyDir); writeFileSync(join(legacyDir, "package.json"), JSON.stringify({ name: PUBLIC_PACKAGES[0]![0], version: "0.2.0" })); }
  const args = legacy ? ["scripts/publish-package-if-needed.sh", legacyDir] : ["scripts/publish-package-if-needed.sh", "--verified-artifact", manifestPath, PUBLIC_PACKAGES[0]![0]];
  if (!legacy && mode !== "missing") args.push("--expected-manifest-sha256", expected);
  try {
    const operation = runProcess("bash", args, { cwd: root, env: { ...cleanEnvironment(), NPM_CLI: stub, NPM_LOG: log, NPM_RESULT: mode.endsWith("exists") ? "exists" : mode.endsWith("conflict") ? "conflict" : mode.endsWith("registry") ? "error" : "missing", NPM_PUBLISH_DRY_RUN: "1" }, timeout: 15_000 });
    if (["valid", "exists", "legacy-exists"].includes(mode)) await operation; else await expect(operation).rejects.toThrow();
    let calls: string[][] = [];
    try { calls = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]); } catch { /* no registry call is the required rejection result */ }
    if (mode === "valid") {
      expect(calls.map((call) => call[0])).toEqual(["view", "publish"]);
      expect(calls[1]).toEqual(["publish", join(dir, manifest.packages[0].tarball), "--access", "public", "--dry-run"]);
      expect(sha256(readFileSync(calls[1]![1]!))).toBe(manifest.packages[0].sha256);
    } else if (["exists", "registry", "conflict", "legacy-conflict", "legacy-registry", "legacy-exists"].includes(mode)) expect(calls.map((call) => call[0])).toEqual(["view"]);
    else expect(calls).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
it.each(["valid", "exists", "registry", "conflict", "legacy-conflict", "legacy-registry", "legacy-exists", "missing", "tarball", "pair", "source", "lockfile", "package", "identity", "dirty-source", "staged-source", "untracked-source", "ignored-source"])("actual verified-artifact helper enforces %s control before npm effects", helper, 20_000);
it("checks independent expected source, not an artifact's claimed checkout", async () => {
  await expect(verifyArtifacts(join(base, "manifest.json"), digest, sourceRoot, "f".repeat(40))).rejects.toThrow("source/input");
});
it("admits generated output roots but never ignored source or nested lookalikes", async () => {
  const root = mkdtempSync(join(tmpdir(), "guard-source-control-"));
  cpSync(sourceRoot, root, { recursive: true });
  try {
    const originalInputs = await checkoutInputs(root);
    for (const file of [".phase-loop/guard/run/tests.json", "node_modules/generated.js", "packages/core-contracts/dist/index.js"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "generated");
    }
    expect(await checkoutInputs(root)).toEqual(originalInputs);
    const hidden = "packages/core-contracts/src/.phase-loop/extra.ts";
    mkdirSync(dirname(join(root, hidden)), { recursive: true });
    writeFileSync(join(root, hidden), "export const hidden = 1;");
    writeFileSync(join(root, ".git/info/exclude"), hidden + "\n");
    await expect(checkoutInputs(root)).rejects.toThrow("Untracked verification inputs");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it("rejects source mutations by a real pack lifecycle before emitting a manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-pack-mutation-"));
  const root = join(dir, "source");
  cpSync(sourceRoot, root, { recursive: true });
  try {
    const pkgPath = join(root, PUBLIC_PACKAGES[0]![1], "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.scripts = { prepack: `node -e "require('node:fs').appendFileSync('src/index.ts', '\\nexport const changed = true;')"` };
    writeFileSync(pkgPath, JSON.stringify(pkg));
    await commit(root);
    const inputs = await checkoutInputs(root);
    const destination = join(dir, "artifacts");
    await expect(packVerified(root, destination, { tested_source_sha: inputs.source_sha })).rejects.toThrow("Dirty tracked verification inputs");
    expect(readFileSync(join(root, PUBLIC_PACKAGES[0]![1], "src/index.ts"), "utf8")).toContain("changed");
    expect(existsSync(join(destination, "manifest.json"))).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 20_000);
it("freezes PR head separately from synthetic merge SHA and routes other events to github.sha", () => {
  const head = "a".repeat(40), merge = "b".repeat(40), baseSha = "c".repeat(40);
  const event = { pull_request: { head: { sha: head }, base: { sha: baseSha } } };
  expect(sourceIdentity("pull_request", event, merge)).toEqual({ tested_source_sha: head, github_sha: merge, pr_head_sha: head, pr_base_sha: baseSha });
  for (const name of ["push", "release", "workflow_dispatch"]) expect(sourceIdentity(name, {}, merge).tested_source_sha).toBe(merge);
  expect(() => sourceIdentity("pull_request_target", event, merge)).toThrow();
  expect(() => sourceIdentity("pull_request", { ref: "caller-branch" }, merge)).toThrow();
});
