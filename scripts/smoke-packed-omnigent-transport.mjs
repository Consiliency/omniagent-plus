#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packageDir = join(repoRoot, "packages/omnigent-transport");
const scratch = mkdtempSync(join(tmpdir(), "omnigent-transport-pack-"));
const consumer = join(scratch, "consumer");

try {
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
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
if (snapshot.version !== "0.7.0") throw new Error("unexpected fixture version");
if (snapshot.gitSha !== "35519fb04743f66b30cac8a40695d5d72fa163ea") {
  throw new Error("unexpected fixture git sha");
}`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  writeFileSync(
    join(consumer, "type-smoke.ts"),
    `import type {
  OmnigentNativeModelOption,
  OmnigentNativeReasoningEffortOption,
  OmnigentSessionSnapshot,
} from "@consiliency/omnigent-transport";

const reasoning: OmnigentNativeReasoningEffortOption = {
  reasoningEffort: "medium",
};
const model: OmnigentNativeModelOption = {
  id: "gpt-5.6-codex",
  supportedReasoningEfforts: [reasoning],
};
const snapshot = {
  backend: "omnigent-http",
  createdAt: "2026-07-30T00:00:00.000Z",
  id: "session-1",
  items: [],
  modelOptions: [model],
  projectId: "project-1",
  status: "idle",
  title: "packed type smoke",
  updatedAt: "2026-07-30T00:00:00.000Z",
} satisfies OmnigentSessionSnapshot;
const snakeSnapshot = {
  backend: "omnigent-http",
  createdAt: "2026-07-30T00:00:00.000Z",
  id: "session-snake",
  items: [],
  model_options: [model],
  project_id: "project-snake",
  status: "idle",
  title: "packed snake-case type smoke",
  updatedAt: "2026-07-30T00:00:00.000Z",
} satisfies OmnigentSessionSnapshot;
void snapshot;
void snakeSnapshot;
`,
  );
  execFileSync(
    "pnpm",
    [
      "--dir",
      repoRoot,
      "exec",
      "tsc",
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      join(consumer, "type-smoke.ts"),
    ],
    { stdio: "pipe" },
  );
  console.log("packed Omnigent transport smoke: OK");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
