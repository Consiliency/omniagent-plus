import type {
  AgentSession,
  RouteDecision,
  RuntimeApprovalRequest,
  RuntimeApprovalResponse,
  RuntimeEvidenceRef,
  RuntimeEvent,
  SessionHistory,
  TurnHandle,
} from "@omniagent-plus/core-contracts";

import type { AuditLedger } from "./audit-ledger.js";

export interface SessionReplay {
  readonly session?: AgentSession;
  readonly turns: TurnHandle[];
  readonly history: SessionHistory;
  readonly routeDecisions: RouteDecision[];
  readonly approvalRequests: RuntimeApprovalRequest[];
  readonly approvalResponses: RuntimeApprovalResponse[];
  readonly evidenceRefs: RuntimeEvidenceRef[];
}

export async function replaySessionHistory(
  ledger: AuditLedger,
  sessionId: string,
): Promise<SessionHistory> {
  const events = (await ledger.listRecords({
    kind: "runtime_event",
    sessionId,
  }))
    .map((record) => (record.payload as RuntimeEvent))
    .sort((left, right) => left.sequence - right.sequence);

  return {
    sessionId,
    events,
    nextCursor: events.length === 0 ? undefined : events.at(-1)!.sequence + 1,
  };
}

export async function replayRouteDecisions(
  ledger: AuditLedger,
  taskId?: string,
): Promise<RouteDecision[]> {
  return (await ledger.listRecords({
    kind: "route_decision",
    taskId,
  }))
    .map((record) => record.payload as RouteDecision)
    .sort((left, right) => left.taskId.localeCompare(right.taskId));
}

export async function replaySession(
  ledger: AuditLedger,
  sessionId: string,
): Promise<SessionReplay> {
  const records = await ledger.listSessionRecords(sessionId);

  return {
    session: records.find((record) => record.kind === "session")
      ?.payload as AgentSession | undefined,
    turns: records
      .filter((record) => record.kind === "turn")
      .map((record) => record.payload as TurnHandle),
    history: await replaySessionHistory(ledger, sessionId),
    routeDecisions: await replayRouteDecisions(ledger),
    approvalRequests: records
      .filter((record) => record.kind === "approval_request")
      .map((record) => record.payload as RuntimeApprovalRequest),
    approvalResponses: records
      .filter((record) => record.kind === "approval_response")
      .map((record) => record.payload as RuntimeApprovalResponse),
    evidenceRefs: records
      .filter((record) => record.kind === "evidence_ref")
      .map((record) => record.payload as RuntimeEvidenceRef),
  };
}
