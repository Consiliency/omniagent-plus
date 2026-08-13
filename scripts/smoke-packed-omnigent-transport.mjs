#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  const installedPackage = JSON.parse(
    readFileSync(
      join(
        consumer,
        "node_modules",
        "@consiliency",
        "omnigent-transport",
        "package.json",
      ),
      "utf8",
    ),
  );
  if (installedPackage.version !== "0.5.0") {
    throw new Error("unexpected packed package version");
  }
  execFileSync(
    "npm",
    [
      "install",
      "--prefix",
      consumer,
      "--save-dev",
      "--ignore-scripts",
      "typescript@5.9.3",
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {
  loadOmnigentV09WireContract,
  snapshotFromHealth,
} from "@consiliency/omnigent-transport";
const snapshot = snapshotFromHealth({
  activeSessions: 0,
  available: true,
  backend: "omnigent-http",
  runtime: "omnigent",
  sessionStateDrift: [],
});
const wire = loadOmnigentV09WireContract();
if (snapshot.version !== "0.9.0") throw new Error("unexpected fixture version");
if (snapshot.gitSha !== "cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2") {
  throw new Error("unexpected fixture git sha");
}
if (wire.authority.tag !== "v0.9.0") throw new Error("unexpected wire authority");`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  writeFileSync(
    join(consumer, "type-smoke.ts"),
    `import type {
  OmnigentHttpClientOptions,
  OmnigentNativeModelOption,
  OmnigentNativeReasoningEffortOption,
  OmnigentProcessSignal,
  OmnigentSessionSnapshot,
  OmnigentConversationItem,
} from "@consiliency/omnigent-transport";

const httpOptions = {
  allowQueuedTurns: false,
  baseUrl: "http://127.0.0.1:4010",
  withExclusiveSessionLease: async (_sessionId, operation) => operation(),
} satisfies OmnigentHttpClientOptions;
const signal: OmnigentProcessSignal = "SIGTERM";
const reasoning: OmnigentNativeReasoningEffortOption = {
  reasoningEffort: "medium",
};
const model: OmnigentNativeModelOption = {
  id: "gpt-5.6-codex",
  supportedReasoningEfforts: [reasoning],
};
const snapshot = {
  agentId: "agent-session-1",
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
const item = {
  created_at: 1780272000,
  data: { content: [], role: "assistant" },
  id: "item-1",
  response_id: "response-1",
  status: "completed",
  type: "message",
} satisfies OmnigentConversationItem;
void snapshot;
void item;
void httpOptions;
void signal;
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        skipLibCheck: false,
        strict: true,
        types: [],
      },
      files: ["type-smoke.ts"],
    }),
  );
  execFileSync(
    join(
      consumer,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsc.cmd" : "tsc",
    ),
    ["--noEmit", "--project", join(consumer, "tsconfig.json")],
    { cwd: consumer, stdio: "pipe" },
  );
  console.log("packed Omnigent transport smoke: OK");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
