import { mkdtemp } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildHandoffPacket, createWorktreeLeaseRelease, projectMetadataExport } from "@consiliency/runtime-provider";

import { AuditLedger } from "./audit-ledger.js";
import {
  replayRouteDecisions,
  replaySession,
  replaySessionHistory,
  replayUiControlSnapshot,
  replayUiControlSnapshotFromStateRoot,
} from "./replay.js";

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/ui/projections/${name}`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

async function seedUiLedger(rootDir: string): Promise<AuditLedger> {
  const ledger = await AuditLedger.open({ rootDir });
  const handoff = buildHandoffPacket({
    packetId: "packet-1",
    createdAt: "2026-06-30T00:08:00.000Z",
    sourceSessionIds: ["session-parent"],
    sourceHarnesses: ["codex"],
    targetHarness: "claude-code",
    targetProvider: "openai",
    reason: "session_continuation",
    objective: "Continue the child control read-model review.",
    currentStatus: "in_progress",
    workspace: {
      branch: "feature/ui",
      worktreePath: "/mnt/workspace/worktrees/omniagent-plus-feature-ui",
    },
    evidence: {
      changedFiles: ["docs/ui-read-model.md"],
      inspectedFiles: ["packages/state-ledger/src/replay.ts", "packages/cli/src/commands/control.ts"],
      commandsRun: [
        {
          command: "pnpm --filter @omniagent-plus/cli test -- --run packages/cli/src/control.test.ts",
          exitCode: 0,
          summary: "CLI control snapshot test passed.",
        },
      ],
      testResults: [
        {
          name: "control snapshot",
          status: "passed",
          summary: "Read-only snapshot output matched the fixture.",
        },
      ],
    },
    risks: ["Keep the CLI snapshot read-only for missing state roots."],
    openQuestions: ["Should the browser UI paginate long audit feeds?"],
    nextRecommendedAction: "Confirm the read-only CLI snapshot output.",
    contextPolicy: {
      rawHistoryAllowed: false,
      mayEditFiles: true,
      mayRunCommands: true,
      mayUseNetwork: false,
      maySwitchProvider: false,
    },
  });

  await ledger.appendSession({
    id: "session-parent",
    runtime: "omnigent",
    targetHarness: "codex",
    targetProvider: "openai",
    identityProfileId: "profile-openai-primary",
    title: "Control snapshot parent",
    state: "blocked_on_approval",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:06:00.000Z",
    worktree: {
      id: "lease-1",
      path: "/mnt/workspace/worktrees/omniagent-plus-feature-ui",
      branchName: "feature/ui",
      mode: "exclusive_write",
    },
  });
  await ledger.appendTurn({
    sessionId: "session-parent",
    turnId: "turn-parent-1",
    idempotencyKey: "turn-parent-1",
    state: "blocked_on_tool_approval",
    createdAt: "2026-06-30T00:01:00.000Z",
    updatedAt: "2026-06-30T00:03:00.000Z",
    eventCursor: 2,
  });
  await ledger.appendRuntimeEvent({
    schema: "runtime_event.v0.1",
    eventId: "event-parent-1",
    sequence: 1,
    sessionId: "session-parent",
    turnId: "turn-parent-1",
    type: "runtime.turn.started",
    occurredAt: "2026-06-30T00:02:00.000Z",
    payload: {
      message: "Review the UI read model",
      state: "running",
    },
    redaction: "metadata_only",
    terminal: false,
  });
  await ledger.appendApprovalRequest({
    approvalRequestId: "approval-1",
    toolCallId: "tool-1",
    sessionId: "session-parent",
    turnId: "turn-parent-1",
    requestedAction: "review control snapshot docs",
    risk: "medium",
    allowedApprovers: ["operator"],
  });
  await ledger.appendRuntimeEvent({
    schema: "runtime_event.v0.1",
    eventId: "event-parent-2",
    sequence: 2,
    sessionId: "session-parent",
    turnId: "turn-parent-1",
    type: "runtime.approval.request",
    occurredAt: "2026-06-30T00:03:00.000Z",
    payload: {
      request: {
        approvalRequestId: "approval-1",
        toolCallId: "tool-1",
        sessionId: "session-parent",
        turnId: "turn-parent-1",
        requestedAction: "review control snapshot docs",
        risk: "medium",
        allowedApprovers: ["operator"],
      },
    },
    redaction: "metadata_only",
    terminal: false,
  });
  await ledger.appendRouteDecision({
    schema: "route_decision.v0.1",
    taskId: "task-parent",
    selectedProvider: "openai",
    selectedHarness: "codex",
    selectedIdentityProfileId: "profile-openai-primary",
    preferredProvider: "openai",
    preferredHarness: "codex",
    fallbackUsed: false,
    capabilityFit: 1,
    providerHealth: 0.95,
    currentCapacity: 0.45,
    preferredTarget: {
      provider: "openai",
      harness: "codex",
      identityProfileId: "profile-openai-primary",
    },
    contextPortability: "high",
    portabilityScore: 0.88,
    activeTurnTarget: 2,
    cooldownState: {
      providerFamilyBlocked: true,
      identityBlocked: false,
      reason: "provider family cooldown",
      resetAt: "2026-06-30T00:10:00.000Z",
      sameProviderAccountSwitch: "forbidden",
    },
    launchGate: {
      action: "wait_for_reset",
      reason: "cooldown is still active",
      routeDecisionPersisted: true,
      labelsMatch: true,
      manualConfirmationProvided: false,
    },
    routeReason: "capability_fit",
    silentDowngrade: false,
    evidenceRefs: [
      {
        kind: "log",
        label: "phase verification",
        path: ".phase-loop/runs/ui/verification.log",
        excerpt: "Redacted verification summary only.",
      },
    ],
  });
  await ledger.appendProviderCooldown({
    schema: "provider_family_cooldown.v0.1",
    provider: "openai",
    scope: "provider_family",
    active: true,
    reason: "rate limit",
    observedAt: "2026-06-30T00:05:00.000Z",
    resetAt: "2026-06-30T00:10:00.000Z",
    source: "limit_classification",
  });
  await ledger.appendWorktreeLease({
    id: "lease-1",
    fencingToken: "token-1",
    repoId: "ViperJuice/omniagent-plus",
    path: "/mnt/workspace/worktrees/omniagent-plus-feature-ui",
    branchName: "feature/ui",
    mode: "exclusive_write",
    holder: {
      processId: 4242,
      host: "display",
      sessionId: "session-parent",
      turnId: "turn-parent-1",
    },
    acquiredAt: "2026-06-30T00:05:00.000Z",
    renewedAt: "2026-06-30T00:05:30.000Z",
    expiresAt: "2026-06-30T00:15:30.000Z",
    dirtyState: "clean",
  });
  await ledger.appendLimitClassification({
    schema: "limit_classification.v0.1",
    type: "burst_rate_limit",
    scope: "provider_family",
    confidence: 0.99,
    provider: "openai",
    harness: "codex",
    identityProfileId: "profile-openai-primary",
    sessionId: "session-parent",
    retryAfterSeconds: 300,
    resetAt: "2026-06-30T00:10:00.000Z",
    rawSignal: {
      statusCode: 429,
    },
    routingAction: {
      retrySameSession: false,
      reduceConcurrency: true,
      routeNewWorkElsewhere: true,
      migrateExistingPortableWork: true,
      requireManualReview: false,
      sameProviderAccountSwitch: "forbidden",
    },
    notes: ["Cooldown metadata is visible without raw payloads."],
  });
  await ledger.appendEvidenceRef(
    {
      kind: "log",
      label: "phase verification",
      path: ".phase-loop/runs/ui/verification.log",
      excerpt: "Redacted verification summary only.",
    },
    {
      sessionId: "session-parent",
      turnId: "turn-parent-1",
      taskId: "task-parent",
    },
  );
  await ledger.appendSession({
    id: "session-child",
    runtime: "omnigent",
    targetHarness: "codex",
    targetProvider: "openai",
    title: "Control snapshot child",
    state: "idle",
    createdAt: "2026-06-30T00:04:00.000Z",
    updatedAt: "2026-06-30T00:09:00.000Z",
    parentSessionId: "session-parent",
    rootSessionId: "session-parent",
    handoffPacket: handoff,
  });
  await ledger.appendTurn({
    sessionId: "session-child",
    turnId: "turn-child-1",
    idempotencyKey: "turn-child-1",
    state: "completed",
    createdAt: "2026-06-30T00:07:00.000Z",
    updatedAt: "2026-06-30T00:09:00.000Z",
    eventCursor: 1,
  });
  await ledger.appendRuntimeEvent({
    schema: "runtime_event.v0.1",
    eventId: "event-child-1",
    sequence: 1,
    sessionId: "session-child",
    turnId: "turn-child-1",
    type: "runtime.turn.completed",
    occurredAt: "2026-06-30T00:09:00.000Z",
    payload: {
      outcome: "completed",
      outputSummary: "Child review completed.",
    },
    redaction: "metadata_only",
    terminal: true,
  });

  return ledger;
}

describe("replay", () => {
  it("keeps the latest release authoritative with recovery attribution", async () => {
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-release-replay-")) });
    const lease = { id: "lease", fencingToken: "fence", repoId: "repo", path: "/home/synthetic/worktree", branchName: "feature",
      mode: "exclusive_write" as const, holder: { processId: 1, host: "test" }, acquiredAt: "2026-06-30T00:00:00Z",
      renewedAt: "2026-06-30T00:00:00Z", expiresAt: "2026-06-30T02:00:00Z", dirtyState: "clean" as const };
    await ledger.appendWorktreeLease(lease);
    const release = createWorktreeLeaseRelease(lease, { cause: "recovery", actor: "test-operator", releasedAt: "2026-06-30T01:00:00Z" });
    await ledger.appendWorktreeLease(release);
    const snapshot = await replayUiControlSnapshot(ledger);
    expect(snapshot.worktreeLeases).toHaveLength(1);
    expect(snapshot.worktreeLeases[0]?.expiresAt).toBe(release.expiresAt);
    expect(snapshot.worktreeLeases[0]?.release?.cause).toBe("recovery");
    expect(JSON.stringify(snapshot)).not.toContain("/home/synthetic");
  });
  it("selects latest scoped states from one snapshot in ledger order", async () => {
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-scoped-replay-")) });
    const session = { id: "scoped", runtime: "omnigent" as const, targetHarness: "codex" as const,
      title: "old", state: "idle" as const, createdAt: "2026-06-30T00:00:00Z", updatedAt: "2026-06-30T00:00:00Z" };
    await ledger.appendSession(session);
    await ledger.appendSession({ ...session, title: "latest", state: "closed" });
    const turn = { sessionId: session.id, turnId: "turn", idempotencyKey: "turn", state: "running" as const,
      createdAt: session.createdAt, updatedAt: session.updatedAt };
    await ledger.appendTurn(turn);
    await ledger.appendTurn({ ...turn, state: "completed" });
    for (const [index, sequence] of [10, 1].entries()) {
      await ledger.appendRuntimeEvent({ schema: "runtime_event.v0.1", eventId: `event-${index}`,
        sequence, sessionId: session.id, turnId: `turn-${index}`, occurredAt: `2026-06-30T00:00:0${index}Z`,
        type: "runtime.turn.started", payload: { message: `message-${index}`, state: "running" },
        redaction: "metadata_only", terminal: false });
    }
    const decision = { schema: "route_decision.v0.1" as const, taskId: "z-scoped", selectedProvider: "openai" as const,
      selectedHarness: "codex" as const, fallbackUsed: false, capabilityFit: 1, providerHealth: 1,
      currentCapacity: 1, contextPortability: "high" as const, routeReason: "capability_fit" as const, silentDowngrade: false as const };
    await ledger.store.appendRecord({ kind: "route_decision", sessionId: session.id, taskId: decision.taskId, payload: decision });
    await ledger.store.appendRecord({ kind: "route_decision", sessionId: "foreign-session", taskId: decision.taskId,
      payload: { ...decision, selectedProvider: "anthropic", selectedHarness: "claude" } });
    await ledger.appendRouteDecision({ ...decision, taskId: "a-other" });
    let snapshots = 0;
    const list = ledger.listRecords.bind(ledger);
    ledger.listRecords = async (...args) => { snapshots += 1; return list(...args); };
    const result = await replaySession(ledger, session.id);
    expect(snapshots).toBe(1);
    expect(result.session?.title).toBe("latest");
    expect(result.turns.map((item) => item.state)).toEqual(["completed"]);
    expect(result.history.events.map((event) => event.eventId)).toEqual(["event-0", "event-1"]);
    expect(result.routeDecisions.map((route) => route.taskId)).toEqual(["z-scoped"]);
    expect(result.routeDecisions[0]?.selectedProvider).toBe("openai");
    expect((await replayRouteDecisions(ledger)).map((route) => route.taskId)).toEqual(["z-scoped", "z-scoped", "a-other"]);
    expect((await replayUiControlSnapshot(ledger)).sessions[0]?.lastEventType).toBe("runtime.turn.started");
    expect((await replayUiControlSnapshot(ledger)).sessions[0]?.lastEventAt).toBe("2026-06-30T00:00:01Z");
  });
  it("replays route decisions and runtime history without live Omnigent", async () => {
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-replay-")),
    });

    await ledger.appendSession({
      id: "session-1",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Replay test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.appendRuntimeEvent({
      schema: "runtime_event.v0.1",
      eventId: "event-1",
      sequence: 1,
      sessionId: "session-1",
      turnId: "turn-1",
      type: "runtime.turn.started",
      occurredAt: "2026-06-30T00:00:01.000Z",
      payload: {
        message: "start",
        state: "running",
      },
      redaction: "metadata_only",
      terminal: false,
    });
    await ledger.appendRuntimeEvent({
      schema: "runtime_event.v0.1",
      eventId: "event-2",
      sequence: 2,
      sessionId: "session-1",
      turnId: "turn-1",
      type: "runtime.turn.completed",
      occurredAt: "2026-06-30T00:00:02.000Z",
      payload: {
        outcome: "completed",
        outputSummary: "done",
      },
      redaction: "metadata_only",
      terminal: true,
    });
    await ledger.appendRouteDecision({
      schema: "route_decision.v0.1",
      taskId: "task-1",
      selectedProvider: "openai",
      selectedHarness: "codex",
      fallbackUsed: false,
      capabilityFit: 1,
      providerHealth: 0.9,
      currentCapacity: 0.7,
      contextPortability: "high",
      routeReason: "capability_fit",
      silentDowngrade: false,
    });

    const history = await replaySessionHistory(ledger, "session-1");
    const routes = await replayRouteDecisions(ledger, "task-1");

    expect(history.events.map((event) => event.type)).toEqual([
      "runtime.turn.started",
      "runtime.turn.completed",
    ]);
    expect(history.nextCursor).toBe(3);
    expect(routes[0]?.selectedHarness).toBe("codex");
  });

  it("builds the UI control snapshot from durable ledger records and matches the read-only replay", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "state-ledger-ui-"));
    const ledger = await seedUiLedger(rootDir);

    const snapshot = await replayUiControlSnapshot(ledger);
    const readOnlySnapshot = await replayUiControlSnapshotFromStateRoot(rootDir);
    const fixture = readFixture<Record<string, unknown>>("control-snapshot.json");

    expect(snapshot).toEqual(readOnlySnapshot);
    expect(snapshot).toMatchObject(projectMetadataExport(fixture) as object);
    expect(snapshot.handoffs[0]?.packetId).toBe("packet-1");
    expect(snapshot.activeTurns[0]?.pendingApprovalRequestId).toBe("approval-1");
  });

  it("rejects unsafe evidence content when projecting UI-facing snapshots", async () => {
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-ui-redaction-")),
    });

    await ledger.appendSession({
      id: "session-secret",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Secret projection test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await expect(ledger.appendEvidenceRef(
      {
        kind: "log",
        label: "unsafe evidence",
        excerpt: "HOME=/tmp/secret-value",
      },
      {
        sessionId: "session-secret",
      },
    )).rejects.toThrow(/environment dump/);
  });
});
