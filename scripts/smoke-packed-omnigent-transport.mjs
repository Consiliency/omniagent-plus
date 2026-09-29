#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  const tarballSha256 = createHash("sha256")
    .update(readFileSync(join(scratch, tarballName)))
    .digest("hex");

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
  loadOmnigentV015WireContract,
  loadOmnigentV011WireContract,
  loadOmnigentV010WireContract,
  loadOmnigentV09WireContract,
  createHttpProvider,
  snapshotFromHealth,
} from "@consiliency/omnigent-transport";
const snapshot = snapshotFromHealth({
  activeSessions: 0,
  available: true,
  backend: "omnigent-http",
  runtime: "omnigent",
  sessionStateDrift: [],
});
const currentWire = loadOmnigentV015WireContract();
const historicalV012Wire = loadOmnigentV012WireContract();
const historicalV011Wire = loadOmnigentV011WireContract();
const historicalV010Wire = loadOmnigentV010WireContract();
const historicalV09Wire = loadOmnigentV09WireContract();
if (snapshot.version !== undefined || snapshot.gitSha !== undefined) {
  throw new Error("health-only snapshot claimed an unobserved runtime version");
}
if (
  currentWire.authority.tag !== "v0.15.0" ||
  currentWire.authority.commit !== "c8b9b85f822f2c9203ff995c10f3cc49d064bbe5" ||
  currentWire.release_event_types.length !== 55
) {
  throw new Error("unexpected current wire authority");
}
if (
  historicalV012Wire.child_page.data[0]?.task_summary !==
    "Inspect the tagged v0.12 transport contract." ||
  historicalV012Wire.child_page.data[1]?.task_summary !== null
) {
  throw new Error("unexpected v0.12 task summary fixture");
}
const currentDeltas = historicalV012Wire.sse_frames.filter(
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
  historicalV012Wire.observed_non_provider_requests.provider_serializes !== false ||
  historicalV012Wire.elicitation_resolution_samples.valid.length !== 5 ||
  historicalV012Wire.elicitation_resolution_samples.malformed.length !== 6
) {
  throw new Error("unexpected v0.12 metadata-only boundary fixture");
}
const session = {
  active_response_id: null, agent_id: "packed-agent", created_at: 1780272000,
  id: "packed-session", items: [], status: "idle", title: "Packed",
  updated_at: 1780272001,
};
const info = currentWire.samples.informational_error;
const message = currentWire.samples.durable_message;
let pages = 0;
const provider = createHttpProvider({
  baseUrl: "http://127.0.0.1:4010",
  sessionMutationFenceStore: { read: async () => ({ rejectedTurnIds: [] }), write: async () => {} },
  withExclusiveSessionLease: async (_id, operation) => operation(),
  fetch: async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") return new Response(JSON.stringify(session));
    if (url.pathname.endsWith("/stream")) return new Response(
      "data: " + JSON.stringify(currentWire.samples.sidechat) + "\\n\\n" +
      "data: " + JSON.stringify({ type: "response.output_text.delta", response_id: "response-message", message_id: "stream-message", delta: "Hello" }) + "\\n\\n",
      { headers: { "content-type": "text/event-stream" } },
    );
    if (url.pathname.endsWith("/items")) {
      pages += 1;
      if (url.searchParams.has("after") && pages === 2) {
        return new Response(JSON.stringify(currentWire.samples.stale_cursor_error), { status: 400 });
      }
      return new Response(JSON.stringify(url.searchParams.has("after")
        ? { data: [message], has_more: false, last_id: message.id }
        : { data: [info], has_more: true, last_id: info.id }));
    }
    return new Response(JSON.stringify(session));
  },
});
const created = await provider.createSession({
  agentSpec: { kind: "named_agent", value: session.agent_id },
  idempotencyKey: "packed-create", runtime: "omnigent",
  targetHarness: "codex", title: session.title,
});
const history = await provider.readHistory(created.id);
if (pages !== 4 || history.events.filter((event) => event.type === "runtime.text.delta").map((event) => event.payload.delta).join("") !== "Hello") {
  throw new Error("packed v0.15 history or cursor recovery failed");
}
const streamed = [];
for await (const event of provider.streamEvents(created.id, { afterSequence: history.nextCursor })) streamed.push(event);
if (streamed.some((event) => event.type === "runtime.text.delta") ||
    (await provider.getSessionInfo(created.id)).lastError !== undefined) {
  throw new Error("packed v0.15 passive or identity replay failed");
}
const previewSession = { ...session, id: "packed-preview" };
const previewProvider = createHttpProvider({
  baseUrl: "http://127.0.0.1:4010",
  sessionMutationFenceStore: { read: async () => ({ rejectedTurnIds: [] }), write: async () => {} },
  withExclusiveSessionLease: async (_id, operation) => operation(),
  fetch: async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") return new Response(JSON.stringify(previewSession));
    if (url.pathname.endsWith("/stream")) return new Response([
      { type: "response.output_text.delta", response_id: "response-message", message_id: "stream-message", delta: "Hello" },
      { type: "response.output_item.done", item: { ...message, content: [{ type: "output_text", text: "Hello world" }] } },
    ].map((event) => "data: " + JSON.stringify(event) + "\\n\\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
    if (url.pathname.endsWith("/items")) return new Response(JSON.stringify({ data: [], has_more: false, last_id: null }));
    return new Response(JSON.stringify(previewSession));
  },
});
const previewCreated = await previewProvider.createSession({
  agentSpec: { kind: "named_agent", value: previewSession.agent_id },
  idempotencyKey: "packed-preview-create", runtime: "omnigent",
  targetHarness: "codex", title: previewSession.title,
});
const previewEvents = [];
for await (const event of previewProvider.streamEvents(previewCreated.id)) previewEvents.push(event);
if (previewEvents.filter((event) => event.type === "runtime.text.delta").map((event) => event.payload.delta).join("") !== "Hello world") {
  throw new Error("packed v0.15 preview-first identity failed");
}
const exhaustedSession = { ...session, id: "packed-exhausted" };
let exhaustedReads = 0;
let streamAborted = false;
const exhaustedProvider = createHttpProvider({
  baseUrl: "http://127.0.0.1:4010",
  sessionMutationFenceStore: { read: async () => ({ rejectedTurnIds: [] }), write: async () => {} },
  withExclusiveSessionLease: async (_id, operation) => operation(),
  fetch: async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") return new Response(JSON.stringify(exhaustedSession));
    if (url.pathname.endsWith("/stream")) {
      init?.signal?.addEventListener("abort", () => { streamAborted = true; });
      return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/event-stream" } });
    }
    if (url.pathname.endsWith("/items")) {
      exhaustedReads += 1;
      return url.searchParams.has("after")
        ? new Response(JSON.stringify(currentWire.samples.stale_cursor_error), { status: 400 })
        : new Response(JSON.stringify({ data: [info], has_more: true, last_id: info.id }));
    }
    return new Response(JSON.stringify(exhaustedSession));
  },
});
const exhaustedCreated = await exhaustedProvider.createSession({
  agentSpec: { kind: "named_agent", value: exhaustedSession.agent_id },
  idempotencyKey: "packed-exhausted-create", runtime: "omnigent",
  targetHarness: "codex", title: exhaustedSession.title,
});
let exhaustedError;
try {
  for await (const _event of exhaustedProvider.streamEvents(exhaustedCreated.id)) {
    throw new Error("partial event leaked during stale-cursor exhaustion");
  }
} catch (error) {
  exhaustedError = error;
}
if (exhaustedError?.statusCode !== 400 || exhaustedReads !== 4 || !streamAborted) {
  throw new Error("packed v0.15 stale-cursor exhaustion failed");
}
`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  writeFileSync(
    join(consumer, "type-smoke.ts"),
    `import { loadOmnigentV015WireContract } from "@consiliency/omnigent-transport";
import type {
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
const latestWire = loadOmnigentV015WireContract();
const latestTag: "v0.15.0" = latestWire.authority.tag;
void snapshot;
void backgroundTask;
void child;
void item;
void latestTag;
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
  console.log(`packed Omnigent transport smoke: OK sha256=${tarballSha256}`);
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
