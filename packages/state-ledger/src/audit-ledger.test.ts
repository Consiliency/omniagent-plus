import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
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
} from "@omniagent-plus/core-contracts";

import { AuditLedger } from "./audit-ledger.js";

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
