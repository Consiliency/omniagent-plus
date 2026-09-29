import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "./audit-ledger.js";
import { getStateLedgerPaths } from "./schema.js";
import { applyRetentionPolicy } from "./retention.js";
import { replayUiControlSnapshot } from "./replay.js";

async function createLedger() {
  const rootDir = await mkdtemp(join(tmpdir(), "state-ledger-retain-"));
  return {
    rootDir,
    ledger: await AuditLedger.open({ rootDir }),
  };
}

describe("retention", () => {
  it("prunes expired closed-session events while retaining session metadata", async () => {
    const { ledger } = await createLedger();
    const timestamp = "2026-06-30T00:00:00Z";
    await ledger.store.appendRecord({ kind: "session", sessionId: "closed", recordedAt: timestamp,
      payload: { id: "closed", runtime: "omnigent", targetHarness: "codex", title: "safe", state: "closed", createdAt: timestamp, updatedAt: timestamp } });
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      await ledger.store.appendRecord({ kind: "runtime_event", sessionId: "closed", recordedAt: timestamp,
        payload: { schema: "runtime_event.v0.1", eventId: `event-${sequence}`, sequence, sessionId: "closed",
          type: "runtime.heartbeat", payload: { cursor: sequence }, occurredAt: timestamp, redaction: "metadata_only", terminal: false } });
    }
    const result = await applyRetentionPolicy(ledger, { pruneKinds: ["runtime_event"], maxAgeMs: 60_000 }, new Date("2026-06-30T01:00:00Z"));
    expect(result.keptRecords.map((record) => record.kind)).toEqual(["session"]);
    expect(result.prunedRecords).toHaveLength(3);
  });

  it("keeps colon-containing approval scopes distinct during replay and retention", async () => {
    const { ledger } = await createLedger();
    const timestamp = "2026-06-30T00:00:00Z";
    for (const [sessionId, turnId, approvalRequestId] of [["a:b", "c", "d"], ["a", "b", "c:d"]]) {
      await ledger.store.appendRecord({ kind: "session", sessionId, recordedAt: timestamp,
        payload: { id: sessionId!, runtime: "omnigent", targetHarness: "codex", title: "safe", state: "closed", createdAt: timestamp, updatedAt: timestamp } });
      await ledger.store.appendRecord({ kind: "approval_request", sessionId, turnId, recordedAt: timestamp,
        payload: { sessionId: sessionId!, turnId: turnId!, approvalRequestId: approvalRequestId!, requestedAction: "safe", risk: "low", allowedApprovers: ["operator"] } });
    }
    await ledger.store.appendRecord({ kind: "approval_response", sessionId: "a", turnId: "b", recordedAt: timestamp,
      payload: { approvalRequestId: "c:d", decision: "approved", decidedAt: timestamp } });
    const snapshot = await replayUiControlSnapshot(ledger);
    expect(snapshot.approvals.find((approval) => approval.sessionId === "a:b")?.status).toBe("pending");
    expect(snapshot.approvals.find((approval) => approval.sessionId === "a")?.status).toBe("approved");
    const result = await applyRetentionPolicy(ledger, { maxAgeMs: 60_000 }, new Date("2026-06-30T01:00:00Z"));
    expect(result.keptRecords.map((record) => record.sessionId)).toEqual(["a:b", "a:b"]);
    expect(result.prunedRecords).toHaveLength(3);
  });

  it("preserves active, pending and live-lease dependencies while pruning expired terminal history", async () => {
    const { ledger, rootDir } = await createLedger();
    const timestamp = "2026-06-30T00:00:00Z";
    const session = { id: "parent", runtime: "omnigent" as const, targetHarness: "codex" as const,
      title: "safe", state: "closed" as const, createdAt: timestamp, updatedAt: timestamp };
    for (const payload of [session, { ...session, id: "child", parentSessionId: "parent", state: "idle" as const },
      { ...session, id: "expired" }, { ...session, id: "pending" }, { ...session, id: "leased" }]) {
      await ledger.store.appendRecord({ kind: "session", sessionId: payload.id, payload, recordedAt: timestamp });
    }
    await ledger.store.appendRecord({ kind: "approval_request", sessionId: "pending", turnId: "pending-turn", recordedAt: timestamp,
      payload: { approvalRequestId: "approval", sessionId: "pending", turnId: "pending-turn", requestedAction: "safe", risk: "low", allowedApprovers: ["operator"] } });
    await ledger.store.appendRecord({ kind: "worktree_lease", recordedAt: timestamp,
      payload: { id: "live-lease", fencingToken: "fence", repoId: "repo", path: "/tmp/worktree", branchName: "feature", mode: "exclusive_write",
        holder: { processId: 1, host: "test", sessionId: "leased" }, acquiredAt: timestamp, renewedAt: timestamp,
        expiresAt: "2026-06-30T02:00:00Z", dirtyState: "clean" } });
    const result = await applyRetentionPolicy(ledger, { maxAgeMs: 60_000 }, new Date("2026-06-30T01:00:00Z"));
    expect(result.prunedRecords.map((record) => record.sessionId)).toEqual(["expired"]);
    expect(result.keptRecords.filter((record) => record.kind === "session").map((record) => record.payload.id))
      .toEqual(["parent", "child", "pending", "leased"]);
    const reopened = await AuditLedger.open({ rootDir });
    expect((await reopened.appendEvidenceRef({ kind: "log", label: "after retention" })).sequence).toBe(8);
  });

  it("computes protection inside the compaction snapshot", async () => {
    const { ledger } = await createLedger();
    const compact = ledger.store.compactRecords.bind(ledger.store);
    ledger.store.compactRecords = async (predicate) => {
      await ledger.store.appendRecord({ kind: "session", sessionId: "arrived", recordedAt: "2026-06-30T00:00:00Z",
        payload: { id: "arrived", runtime: "omnigent", targetHarness: "codex", title: "safe", state: "idle",
          createdAt: "2026-06-30T00:00:00Z", updatedAt: "2026-06-30T00:00:00Z" } });
      return compact(predicate);
    };
    const result = await applyRetentionPolicy(ledger, { maxAgeMs: 1 }, new Date("2026-06-30T01:00:00Z"));
    expect(result.keptRecords.map((record) => record.sessionId)).toEqual(["arrived"]);
  });
  it("prunes expired records and refreshes indexes", async () => {
    const { rootDir, ledger } = await createLedger();
    await ledger.appendSession({
      id: "session-1",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Retention test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.store.appendRecord({
      kind: "provider_cooldown",
      payload: {
        schema: "provider_family_cooldown.v0.1",
        provider: "openai",
        scope: "provider_family",
        active: true,
        reason: "old cap",
        observedAt: "2026-06-30T00:00:00.000Z",
        source: "manual",
      },
      recordedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.store.appendRecord({
      kind: "provider_cooldown",
      payload: {
        schema: "provider_family_cooldown.v0.1",
        provider: "openai",
        scope: "provider_family",
        active: true,
        reason: "new cap",
        observedAt: "2026-06-30T00:05:00.000Z",
        source: "manual",
      },
      recordedAt: "2026-06-30T00:05:00.000Z",
    });

    const result = await applyRetentionPolicy(
      ledger,
      {
        pruneKinds: ["provider_cooldown"],
        maxAgeMs: 60_000,
        keepLatestPerKind: 1,
      },
      new Date("2026-06-30T00:06:00.000Z"),
    );

    const kindIndex = JSON.parse(
      await readFile(getStateLedgerPaths(rootDir).kindIndexPath, "utf8"),
    ) as { byKind: Record<string, number[]> };

    expect(result.prunedRecords).toHaveLength(1);
    expect(result.keptRecords.map((record) => record.kind)).toContain("session");
    expect(kindIndex.byKind.provider_cooldown).toHaveLength(1);
  });
});
