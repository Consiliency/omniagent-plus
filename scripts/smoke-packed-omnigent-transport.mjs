#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(repoRoot, "packages/omnigent-transport");
const scratch = mkdtempSync(join(tmpdir(), "omnigent-transport-pack-"));
const consumer = join(scratch, "consumer");

try {
  execFileSync("pnpm", ["pack", "--pack-destination", scratch], {
    cwd: packageDir,
    stdio: "pipe",
  });
  const tarballName = readdirSync(scratch).find((name) => name.endsWith(".tgz"));
  if (tarballName === undefined) {
    throw new Error("pnpm pack produced no tarball");
  }

  execFileSync(
    "npm",
    ["install", "--prefix", consumer, join(scratch, tarballName), "--ignore-scripts"],
    { stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { snapshotFromHealth } from "@consiliency/omnigent-transport";
const snapshot = snapshotFromHealth({
  activeSessions: 0,
  available: true,
  backend: "omnigent-http",
  runtime: "omnigent",
  sessionStateDrift: [],
});
if (snapshot.version !== "0.5.1") throw new Error("unexpected fixture version");`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  console.log("packed Omnigent transport smoke: OK");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
