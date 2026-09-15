import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../tests/helpers/guard-process.ts";

/** @type {readonly [string, string][]} */
export const PUBLIC_PACKAGES = [
  ["@consiliency/runtime-provider", "packages/core-contracts"],
  ["@consiliency/pipeline-provider-adapter", "packages/governed-pipeline-adapter"],
  ["@consiliency/omnigent-transport", "packages/omnigent-transport"],
];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function sourceIdentity(eventName, event, githubSha) {
  const tested = eventName === "pull_request" ? event.pull_request?.head?.sha : githubSha;
  if (!["pull_request", "push", "release", "workflow_dispatch"].includes(eventName) || !/^[a-f0-9]{40}$/.test(tested ?? "") || !/^[a-f0-9]{40}$/.test(githubSha ?? "")) throw new Error("Invalid source event identity");
  return { tested_source_sha: tested, github_sha: githubSha, pr_head_sha: event.pull_request?.head?.sha ?? null, pr_base_sha: event.pull_request?.base?.sha ?? null };
}
export async function checkoutInputs(root) {
  try { await runProcess("git", ["diff", "--quiet", "HEAD", "--"], { cwd: root }); }
  catch { throw new Error("Dirty tracked verification inputs"); }
  // Ignore only known generated roots, not .gitignore rules that could hide new source.
  const untracked = await runProcess("git", ["ls-files", "--others", "-z", "--exclude=/node_modules/", "--exclude=/packages/*/node_modules/", "--exclude=/packages/*/dist/", "--exclude=/dist/", "--exclude=/.phase-loop/"], { cwd: root });
  if (untracked) throw new Error("Untracked verification inputs");
  return { source_sha: await runProcess("git", ["rev-parse", "HEAD"], { cwd: root }), lockfile_sha256: sha256(readFileSync(resolve(root, "pnpm-lock.yaml"))), package_manifest_sha256: Object.fromEntries(PUBLIC_PACKAGES.map(([name, dir]) => [name, sha256(readFileSync(resolve(root, dir, "package.json")))])) };
}
export async function assertUnchangedInputs(root, expected, inputs = checkoutInputs) {
  if (JSON.stringify(await inputs(root)) !== JSON.stringify(expected)) throw new Error("Verification inputs changed during gate");
}
export async function verifyArtifacts(manifestPath, expectedDigest, root = process.cwd(), expectedSource) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? "")) throw new Error("Independent manifest digest required");
  const bytes = readFileSync(manifestPath);
  if (sha256(bytes) !== expectedDigest) throw new Error("Independent manifest digest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  const inputs = await checkoutInputs(root);
  if (manifest.schema !== "guard-artifacts.v1" || manifest.source_sha !== inputs.source_sha || manifest.identity?.tested_source_sha !== inputs.source_sha || (expectedSource && expectedSource !== inputs.source_sha) || manifest.lockfile_sha256 !== inputs.lockfile_sha256 || JSON.stringify(manifest.package_manifest_sha256) !== JSON.stringify(inputs.package_manifest_sha256)) throw new Error("Artifact source/input mismatch");
  if (manifest.packages?.length !== PUBLIC_PACKAGES.length) throw new Error("Unexpected package count");
  for (const [index, [name, dir]] of PUBLIC_PACKAGES.entries()) {
    const entry = manifest.packages[index];
    const pkg = JSON.parse(readFileSync(resolve(root, dir, "package.json"), "utf8"));
    if (entry.name !== name || pkg.name !== name || pkg.private === true || entry.version !== pkg.version || typeof entry.tarball !== "string" || basename(entry.tarball) !== entry.tarball || !entry.tarball.endsWith(".tgz")) throw new Error("Unexpected/private artifact identity");
    const path = resolve(dirname(manifestPath), entry.tarball);
    if (dirname(realpathSync(path)) !== realpathSync(dirname(manifestPath)) || sha256(readFileSync(path)) !== entry.sha256) throw new Error("Tarball digest/path mismatch");
    const packed = JSON.parse(await runProcess("tar", ["-xOf", path, "package/package.json"]));
    if (packed.name !== name || packed.version !== pkg.version || packed.private === true) throw new Error("Packed package identity mismatch");
  }
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [manifest, digest, selected] = process.argv.slice(2);
    if (!manifest || !digest) throw new Error("Manifest path and independent digest required");
    const verified = await verifyArtifacts(manifest, digest);
    if (selected) {
      const entry = verified.packages.find((entry) => entry.name === selected);
      if (!entry) throw new Error("Unknown publication identity");
      console.log([entry.name, entry.version, resolve(dirname(manifest), entry.tarball)].join("\n"));
    } else console.log("Verified artifact identities and digests");
  } catch (error) { console.error(error instanceof Error ? error.message : "Artifact failure"); process.exitCode = 1; }
}
