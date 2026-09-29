import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  IdentityProfileStatus,
  LimitClassification,
  OmnigentCapabilitySnapshot,
  ProviderFamilyCooldown,
  RouteDecision,
  RuntimeApprovalRequest,
  RuntimeApprovalResponse,
  RuntimeEvent,
  RuntimeEvidenceRef,
  WorktreeLease,
  AgentSession,
  TurnHandle,
} from "@consiliency/runtime-provider";

import { AuditLedger } from "./audit-ledger.js";
import { replaySession } from "./replay.js";
import { readLedgerSnapshot } from "./ledger-snapshot.js";

interface AuditFixture {
  readonly session: AgentSession;
  readonly turn: TurnHandle;
  readonly runtimeEvent: RuntimeEvent;
  readonly routeDecision: RouteDecision;
  readonly limitClassification: LimitClassification;
  readonly identityProfileStatus: IdentityProfileStatus;
  readonly providerCooldown: ProviderFamilyCooldown;
  readonly worktreeLease: WorktreeLease;
  readonly approvalRequest: RuntimeApprovalRequest;
  readonly approvalResponse: RuntimeApprovalResponse;
  readonly capabilitySnapshot: OmnigentCapabilitySnapshot;
  readonly evidenceRef: RuntimeEvidenceRef;
}

function readFixture(): AuditFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/state-ledger/audit/ledger-inputs.json", import.meta.url),
      "utf8",
    ),
  ) as AuditFixture;
}

describe("audit ledger", () => {
  it("checkpoints normalized session and task IDs that match object prototype names", async () => {
    const fixture = readFixture();
    for (const id of ["constructor", "__proto__", "toString"]) {
      const rootDir = await mkdtemp(join(tmpdir(), "data-index-identity-"));
      const ledger = await AuditLedger.open({ rootDir });
      await ledger.store.appendRecord({ kind: "session", payload: { ...fixture.session, id } });
      await ledger.store.appendRecord({ kind: "route_decision", payload: { ...fixture.routeDecision, taskId: id } });
      const reopened = await AuditLedger.open({ rootDir });
      expect(await reopened.listSessionRecords(id)).toHaveLength(1);
      expect(await reopened.listTaskRecords(id)).toHaveLength(1);
      await reopened.store.compactRecords(() => true);
      const checkpoint = await AuditLedger.open({ rootDir });
      expect(await checkpoint.listRecords()).toHaveLength(2);
      const sessions = JSON.parse(await readFile(checkpoint.store.paths.sessionIndexPath, "utf8")) as { bySession: Record<string, number[]> };
      const tasks = JSON.parse(await readFile(checkpoint.store.paths.taskIndexPath, "utf8")) as { byTask: Record<string, number[]> };
      expect(Object.hasOwn(sessions.bySession, id)).toBe(true);
      expect(sessions.bySession[id]).toEqual([1]);
      expect(tasks.byTask[id]).toEqual([2]);
    }
  });

  it("normalizes omitted generic record scope on append and historical readonly reads", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "data-generic-scope-"));
    const ledger = await AuditLedger.open({ rootDir });
    const inputs = [
      { kind: "session" as const, payload: fixture.session },
      { kind: "turn" as const, payload: fixture.turn },
      { kind: "runtime_event" as const, payload: fixture.runtimeEvent },
      { kind: "approval_request" as const, payload: fixture.approvalRequest },
      { kind: "worktree_lease" as const, payload: fixture.worktreeLease },
      { kind: "limit_classification" as const, payload: fixture.limitClassification },
      { kind: "route_decision" as const, payload: fixture.routeDecision },
    ];
    for (const input of inputs) await ledger.store.appendRecord(input);
    const records = await ledger.listRecords();
    expect(records.slice(0, 6).every((record) => record.sessionId === fixture.session.id)).toBe(true);
    expect(records.filter((record) => ["turn", "runtime_event", "approval_request", "worktree_lease"].includes(record.kind))
      .every((record) => record.turnId === fixture.turn.turnId)).toBe(true);
    expect(records[6]?.taskId).toBe(fixture.routeDecision.taskId);
    const raw = records.map(({ sessionId: _session, turnId: _turn, taskId: _task, ...record }) => `${JSON.stringify(record)}\n`).join("");
    await writeFile(ledger.store.paths.ledgerPath, raw);
    const readonly = await AuditLedger.open({ rootDir, readOnly: true });
    expect(await readonly.listSessionRecords(fixture.session.id)).toHaveLength(6);
    expect(await readonly.listTaskRecords(fixture.routeDecision.taskId)).toHaveLength(1);
    const replay = await replaySession(readonly, fixture.session.id);
    expect(replay.session?.id).toBe(fixture.session.id);
    expect(replay.turns).toHaveLength(1);
    expect(replay.history.events).toHaveLength(1);
    expect((await readLedgerSnapshot(rootDir)).records).toEqual(records);
    expect(await readFile(ledger.store.paths.ledgerPath, "utf8")).toBe(raw);
  });

  it("rejects conflicting envelope scope before append and preserves historical conflicts", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "data-conflicting-scope-"));
    const ledger = await AuditLedger.open({ rootDir });
    const record = await ledger.store.appendRecord({ kind: "turn", payload: fixture.turn });
    const before = await readFile(ledger.store.paths.ledgerPath, "utf8");
    await expect(ledger.store.appendRecord({ kind: "turn", payload: fixture.turn, sessionId: "foreign" })).rejects.toThrow(/scope conflicts/);
    await expect(ledger.store.appendRecord({ kind: "turn", payload: fixture.turn, turnId: "foreign" })).rejects.toThrow(/scope conflicts/);
    await expect(ledger.store.appendRecord({ kind: "route_decision", payload: fixture.routeDecision, taskId: "foreign" })).rejects.toThrow(/scope conflicts/);
    expect(await readFile(ledger.store.paths.ledgerPath, "utf8")).toBe(before);
    for (const newline of ["", "\n"]) {
      const raw = `${JSON.stringify({ ...record, sessionId: "foreign" })}${newline}`;
      await writeFile(ledger.store.paths.ledgerPath, raw);
      await expect(readLedgerSnapshot(rootDir)).rejects.toMatchObject({ code: "ledger_corruption" });
      await expect(AuditLedger.open({ rootDir })).rejects.toMatchObject({ code: "ledger_corruption" });
      expect(await readFile(ledger.store.paths.ledgerPath, "utf8")).toBe(raw);
    }
  });

  it("validates operational paths without disallowing ordinary home workspaces", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-operational-path-")) });
    const worktree = { id: fixture.worktreeLease.id, path: fixture.worktreeLease.path,
      branchName: fixture.worktreeLease.branchName, mode: fixture.worktreeLease.mode };
    await ledger.appendSession({ ...fixture.session, repoRoot: "/home/synthetic/project" });
    await ledger.appendSession({ ...fixture.session, worktree });
    for (const path of ["Bearer synthetic-token-123456", "state/.recovery/marker.tail", "password=synthetic-private-value"]) {
      await expect(ledger.appendSession({ ...fixture.session, repoRoot: path })).rejects.toThrow(/workspace path/);
      await expect(ledger.appendSession({ ...fixture.session, worktree: { ...worktree, path } })).rejects.toThrow(/workspace path/);
      await expect(ledger.appendWorktreeLease({ ...fixture.worktreeLease, path })).rejects.toThrow(/workspace path/);
    }
    expect(await ledger.listRecords()).toHaveLength(2);
  });

  it("projects terminal runtime prose while preserving the source event", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-terminal-content-")) });
    const base = { ...fixture.runtimeEvent, redaction: "content_allowed" as const, terminal: true };
    const completed: RuntimeEvent = { ...base, type: "runtime.turn.completed", payload: { outcome: "completed", outputSummary: "Edited /home/synthetic/project/file.ts" } };
    const cancelled: RuntimeEvent = { ...base, eventId: "cancelled", type: "runtime.turn.cancelled", payload: { outcome: "cancelled", reason: "token=synthetic-private-value" } };
    await ledger.appendRuntimeEvent(completed);
    await ledger.appendRuntimeEvent(cancelled);
    expect(completed.payload.outputSummary).toContain("/home/synthetic");
    const persisted = JSON.stringify(await ledger.listRecords());
    expect(persisted).not.toContain("/home/synthetic");
    expect(persisted).not.toContain("synthetic-private-value");
    expect(persisted).toContain("[redacted]");
  });

  it("projects runtime tool bodies only at persistence and rejects unsafe direct writes", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-tool-content-")) });
    const argumentsRedacted = { cwd: "/home/synthetic/project", password: "synthetic-private-value" };
    const outputRedacted = "const token = await getToken();\n/home/synthetic/project/file.ts";
    const base = { ...fixture.runtimeEvent, redaction: "content_allowed" as const, terminal: false };
    const call: RuntimeEvent = { ...base, eventId: "call", type: "runtime.tool.call", payload: { toolCall: {
      toolCallId: "tool", sessionId: base.sessionId, turnId: base.turnId!, toolName: "read", argumentsRedacted, approvalRequired: false,
    } } };
    const result: RuntimeEvent = { ...base, eventId: "result", type: "runtime.tool.result", payload: { toolCallId: "tool", outputRedacted } };
    for (const event of [call, result]) {
      await expect(ledger.store.appendRecord({ kind: "runtime_event", payload: { ...event, redaction: "metadata_only" } })).rejects.toThrow();
      await ledger.appendRuntimeEvent(event);
    }
    expect(call.payload.toolCall.argumentsRedacted).toEqual(argumentsRedacted);
    expect(result.payload.outputRedacted).toBe(outputRedacted);
    const records = await ledger.listRecords();
    const persisted = JSON.stringify(records);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.kind === "runtime_event" && record.payload.redaction === "metadata_only")).toBe(true);
    expect(persisted).not.toContain("/home/synthetic");
    expect(persisted).not.toContain("synthetic-private-value");
    expect(persisted).not.toContain("getToken");
  });

  it("never invokes tool serialization hooks at direct or projected durable boundaries", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-tool-hooks-")) });
    let invoked = 0;
    const hook = () => { invoked += 1; return { password: "synthetic-private-value" }; };
    const values = [{ toJSON: hook }, Object.defineProperty({}, "toJSON", { value: hook }),
      Object.create({ toJSON: hook }) as unknown,
      Object.defineProperty({}, "text", { enumerable: true, get: hook }),
      Object.defineProperty([], "0", { enumerable: true, get: hook }), Object.assign([], { toJSON: hook }), { nested: hook }];
    for (const [index, body] of values.entries()) {
      const call: RuntimeEvent = { ...fixture.runtimeEvent, eventId: `call-${index}`, redaction: "metadata_only", terminal: false,
        type: "runtime.tool.call", payload: { toolCall: { toolCallId: "tool", sessionId: fixture.session.id, turnId: fixture.turn.turnId,
          toolName: "read", argumentsRedacted: body, approvalRequired: false } } };
      const result: RuntimeEvent = { ...fixture.runtimeEvent, eventId: `result-${index}`, redaction: "metadata_only", terminal: false,
        type: "runtime.tool.result", payload: { toolCallId: "tool", outputRedacted: body } };
      for (const event of [call, result]) {
        await expect(ledger.store.appendRecord({ kind: "runtime_event", payload: event })).rejects.toThrow(/non json metadata/);
        await ledger.appendRuntimeEvent(event);
      }
    }
    expect(invoked).toBe(0);
    const raw = await readFile(ledger.store.paths.ledgerPath, "utf8");
    expect(raw).not.toContain("synthetic-private-value");
    expect(raw).not.toContain("toJSON");
    expect(await (await AuditLedger.open({ rootDir: ledger.store.paths.rootDir })).listRecords()).toHaveLength(values.length * 2);
  });

  it("projects authorized runtime content before metadata-only persistence", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({ rootDir: await mkdtemp(join(tmpdir(), "data-runtime-content-")) });
    const event: RuntimeEvent = { schema: "runtime_event.v0.1", eventId: "content", sequence: 1,
      sessionId: fixture.session.id, turnId: fixture.turn.turnId, occurredAt: fixture.session.createdAt,
      type: "runtime.turn.started", payload: { message: "Bearer synthetic-token-123456", state: "running" }, redaction: "content_allowed", terminal: false };
    await ledger.appendRuntimeEvent(event);
    expect(JSON.stringify(await ledger.listRecords())).not.toContain("synthetic-token-123456");
    expect(event.payload.message).toContain("synthetic-token-123456");
    expect((await ledger.listRecordsByKind("runtime_event"))[0]?.payload.redaction).toBe("metadata_only");
    for (const raw of [event, { ...event, redaction: "metadata_only" as const, payload: { message: "Ordinary private conversation", state: "running" } },
      { ...event, type: "runtime.text.delta" as const, redaction: "metadata_only" as const, payload: { delta: "Ordinary private conversation" } }]) {
      await expect(ledger.store.appendRecord({ kind: "runtime_event", payload: raw as RuntimeEvent }))
        .rejects.toThrow(/content must be omitted/);
    }
    expect(await ledger.listRecords()).toHaveLength(1);
  });
  it("persists and queries the required durable record families", async () => {
    const fixture = readFixture();
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-audit-")),
    });

    await ledger.appendSession(fixture.session);
    await ledger.appendTurn(fixture.turn);
    await ledger.appendRuntimeEvent(fixture.runtimeEvent);
    await ledger.appendRouteDecision(fixture.routeDecision);
    await ledger.appendLimitClassification(fixture.limitClassification, {
      taskId: fixture.routeDecision.taskId,
    });
    await ledger.appendIdentityProfileStatus(fixture.identityProfileStatus);
    await ledger.appendProviderCooldown(fixture.providerCooldown);
    await ledger.appendWorktreeLease(fixture.worktreeLease);
    await ledger.appendApprovalRequest(fixture.approvalRequest);
    await ledger.appendApprovalResponse(fixture.approvalResponse, {
      sessionId: fixture.session.id,
      turnId: fixture.turn.turnId,
    });
    await ledger.appendCapabilitySnapshot(fixture.capabilitySnapshot);
    await ledger.appendEvidenceRef(fixture.evidenceRef, {
      sessionId: fixture.session.id,
      turnId: fixture.turn.turnId,
      taskId: fixture.routeDecision.taskId,
    });

    const sessionRecords = await ledger.listSessionRecords(fixture.session.id);
    const taskRecords = await ledger.listTaskRecords(fixture.routeDecision.taskId);
    const cooldowns = await ledger.listRecordsByKind("provider_cooldown");

    expect(sessionRecords.map((record) => record.kind)).toEqual(
      expect.arrayContaining([
        "session",
        "turn",
        "runtime_event",
        "approval_request",
        "approval_response",
        "worktree_lease",
        "evidence_ref",
      ]),
    );
    expect(taskRecords.map((record) => record.kind)).toEqual(
      expect.arrayContaining(["route_decision", "limit_classification", "evidence_ref"]),
    );
    expect(cooldowns[0]?.payload.reason).toBe("usage cap");
  });
});
