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
  if (installedPackage.version !== "0.7.0") {
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
  loadOmnigentV012WireContract,
  loadOmnigentV011WireContract,
  loadOmnigentV010WireContract,
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
const currentWire = loadOmnigentV012WireContract();
const historicalV011Wire = loadOmnigentV011WireContract();
const historicalV010Wire = loadOmnigentV010WireContract();
const historicalV09Wire = loadOmnigentV09WireContract();
if (snapshot.version !== "0.12.0") throw new Error("unexpected fixture version");
if (snapshot.gitSha !== "f04b0354fb5344c1ea8b92795ceb6760a9ad7595") {
  throw new Error("unexpected fixture git sha");
}
if (
  currentWire.authority.tag !== "v0.12.0" ||
  currentWire.authority.commit !== "f04b0354fb5344c1ea8b92795ceb6760a9ad7595"
) {
  throw new Error("unexpected current wire authority");
}
if (
  currentWire.child_page.data[0]?.task_summary !==
    "Inspect the tagged v0.12 transport contract." ||
  currentWire.child_page.data[1]?.task_summary !== null
) {
  throw new Error("unexpected v0.12 task summary fixture");
}
const currentDeltas = currentWire.sse_frames.filter(
  (frame) => frame.type === "response.output_text.delta",
);
if (currentDeltas.length !== 2) {
  throw new Error("unexpected v0.12 lossless SSE regression fixture");
}
if (
  historicalV011Wire.authority.tag !== "v0.11.0" ||
  historicalV011Wire.authority.commit !== "496b7b13f6af3ed5330b957df408fc91290b6307" ||
  historicalV010Wire.authority.tag !== "v0.10.0" ||
  historicalV010Wire.authority.commit !== "40755dd8dddb07e1eb6e4055d1d9936e184ceb9b" ||
  historicalV09Wire.authority.tag !== "v0.9.0" ||
  historicalV09Wire.authority.commit !== "cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2" ||
  !historicalV09Wire.sse_frames.some((frame) => frame.type === "response.completed")
) {
  throw new Error("unexpected historical v0.9 wire fixture");
}
if (
  currentWire.observed_non_provider_requests.provider_serializes !== false ||
  currentWire.elicitation_resolution_samples.valid.length !== 5 ||
  currentWire.elicitation_resolution_samples.malformed.length !== 6
) {
  throw new Error("unexpected v0.12 metadata-only boundary fixture");
}`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  writeFileSync(
    join(consumer, "type-smoke.ts"),
    `import type {
  OmnigentBackgroundTaskInfo,
  OmnigentHttpClientOptions,
  OmnigentNativeModelOption,
  OmnigentNativeReasoningEffortOption,
  OmnigentProcessSignal,
  OmnigentSessionSnapshot,
  OmnigentChildSessionSummary,
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
const backgroundTask = {
  command: "sleep 120",
  id: "shell-1",
  status: "running",
} satisfies OmnigentBackgroundTaskInfo;
const child = {
  agent_id: "agent-child-1",
  busy: false,
  created_at: 1780272010,
  current_task_status: "completed",
  id: "child-1",
  parent_session_id: "session-1",
  task_summary: "Inspect the tagged v0.10 transport contract.",
  title: "Child",
  updated_at: 1780272011,
} satisfies OmnigentChildSessionSummary;
const item = {
  created_at: 1780272000,
  data: { content: [], role: "assistant" },
  id: "item-1",
  response_id: "response-1",
  status: "completed",
  type: "message",
} satisfies OmnigentConversationItem;
void snapshot;
void backgroundTask;
void child;
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
