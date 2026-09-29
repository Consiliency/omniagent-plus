import {
  runtimeEventSchema,
  projectMetadataExport,
  assertMetadataSafe,
  type AgentSession,
  type IdentityProfileStatus,
  type LimitClassification,
  type OmnigentCapabilitySnapshot,
  type ProviderFamilyCooldown,
  type RouteDecision,
  type RuntimeApprovalRequest,
  type RuntimeApprovalResponse,
  type RuntimeEvent,
  type RuntimeEvidenceRef,
  type StateLedgerEntry,
  type StateLedgerRecordKind,
  type TurnHandle,
  type WorktreeLease,
} from "@consiliency/runtime-provider";

import {
  AppendOnlyStore,
  type AppendOnlyStoreOptions,
  type RecordQuery,
} from "./append-only-store.js";

export class AuditLedger {
  readonly store: AppendOnlyStore;

  private constructor(store: AppendOnlyStore) {
    this.store = store;
  }

  static async open(options: AppendOnlyStoreOptions): Promise<AuditLedger> {
    return new AuditLedger(await AppendOnlyStore.open(options));
  }

  async appendSession(session: AgentSession): Promise<Extract<StateLedgerEntry, { kind: "session" }>> {
    assertMetadataSafe(session, { inertOnly: true });
    return this.store.appendRecord({
      kind: "session",
      payload: session,
      sessionId: session.id,
    });
  }

  async appendTurn(turn: TurnHandle): Promise<Extract<StateLedgerEntry, { kind: "turn" }>> {
    assertMetadataSafe(turn, { inertOnly: true });
    return this.store.appendRecord({
      kind: "turn",
      payload: turn,
      sessionId: turn.sessionId,
      turnId: turn.turnId,
    });
  }

  async appendRuntimeEvent(
    event: RuntimeEvent,
  ): Promise<Extract<StateLedgerEntry, { kind: "runtime_event" }>> {
    const parsed = runtimeEventSchema.parse(projectMetadataExport(event, { inertOnly: true })) as RuntimeEvent;
    if (parsed.type === "runtime.turn.started") {
      event = { ...parsed, redaction: "metadata_only", payload: { ...parsed.payload, message: "[runtime content omitted]" } };
    } else if (parsed.type === "runtime.text.delta") {
      event = { ...parsed, redaction: "metadata_only", payload: { delta: "[runtime content omitted]" } };
    } else if (["runtime.turn.completed", "runtime.turn.cancelled", "runtime.turn.failed", "runtime.tool.call", "runtime.tool.result"].includes(parsed.type)) {
      event = runtimeEventSchema.parse({ ...parsed, redaction: "metadata_only", payload: projectMetadataExport(parsed.payload) }) as RuntimeEvent;
    } else {
      event = { ...parsed, redaction: "metadata_only" };
    }
    return this.store.appendRecord({
      kind: "runtime_event",
      payload: event,
      sessionId: event.sessionId,
      turnId: event.turnId,
    });
  }

  async appendRouteDecision(
    decision: RouteDecision,
  ): Promise<Extract<StateLedgerEntry, { kind: "route_decision" }>> {
    assertMetadataSafe(decision, { inertOnly: true });
    return this.store.appendRecord({
      kind: "route_decision",
      payload: decision,
      taskId: decision.taskId,
    });
  }

  async appendLimitClassification(
    classification: LimitClassification,
    context: { taskId?: string } = {},
  ): Promise<Extract<StateLedgerEntry, { kind: "limit_classification" }>> {
    assertMetadataSafe(classification, { inertOnly: true });
    assertMetadataSafe(context, { inertOnly: true });
    return this.store.appendRecord({
      kind: "limit_classification",
      payload: classification,
      sessionId: classification.sessionId,
      taskId: context.taskId,
    });
  }

  async appendIdentityProfileStatus(
    status: IdentityProfileStatus,
  ): Promise<Extract<StateLedgerEntry, { kind: "identity_profile_status" }>> {
    return this.store.appendRecord({
      kind: "identity_profile_status",
      payload: status,
    });
  }

  async appendProviderCooldown(
    cooldown: ProviderFamilyCooldown,
  ): Promise<Extract<StateLedgerEntry, { kind: "provider_cooldown" }>> {
    return this.store.appendRecord({
      kind: "provider_cooldown",
      payload: cooldown,
    });
  }

  async appendWorktreeLease(
    lease: WorktreeLease,
  ): Promise<Extract<StateLedgerEntry, { kind: "worktree_lease" }>> {
    assertMetadataSafe(lease, { inertOnly: true });
    return this.store.appendRecord({
      kind: "worktree_lease",
      payload: lease,
      sessionId: lease.holder.sessionId,
      turnId: lease.holder.turnId,
    });
  }

  async appendApprovalRequest(
    request: RuntimeApprovalRequest,
  ): Promise<Extract<StateLedgerEntry, { kind: "approval_request" }>> {
    assertMetadataSafe(request, { inertOnly: true });
    return this.store.appendRecord({
      kind: "approval_request",
      payload: request,
      sessionId: request.sessionId,
      turnId: request.turnId,
    });
  }

  async appendApprovalResponse(
    response: RuntimeApprovalResponse,
    context: { sessionId: string; turnId: string },
  ): Promise<Extract<StateLedgerEntry, { kind: "approval_response" }>> {
    assertMetadataSafe(context, { inertOnly: true });
    return this.store.appendRecord({
      kind: "approval_response",
      payload: response,
      sessionId: context.sessionId,
      turnId: context.turnId,
    });
  }

  async appendCapabilitySnapshot(
    snapshot: OmnigentCapabilitySnapshot,
  ): Promise<Extract<StateLedgerEntry, { kind: "capability_snapshot" }>> {
    return this.store.appendRecord({
      kind: "capability_snapshot",
      payload: snapshot,
    });
  }

  async appendEvidenceRef(
    ref: RuntimeEvidenceRef,
    context: {
      sessionId?: string;
      turnId?: string;
      taskId?: string;
    } = {},
  ): Promise<Extract<StateLedgerEntry, { kind: "evidence_ref" }>> {
    assertMetadataSafe(context, { inertOnly: true });
    return this.store.appendRecord({
      kind: "evidence_ref",
      payload: ref,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskId: context.taskId,
    });
  }

  async listRecords(query: RecordQuery = {}): Promise<StateLedgerEntry[]> {
    return this.store.queryRecords(query);
  }

  async listRecordsByKind<TKind extends StateLedgerRecordKind>(
    kind: TKind,
  ): Promise<Array<Extract<StateLedgerEntry, { kind: TKind }>>> {
    return (await this.store.queryRecords({ kind })) as Array<
      Extract<StateLedgerEntry, { kind: TKind }>
    >;
  }

  async listSessionRecords(sessionId: string): Promise<StateLedgerEntry[]> {
    return this.store.queryRecords({ sessionId });
  }

  async listTaskRecords(taskId: string): Promise<StateLedgerEntry[]> {
    return this.store.queryRecords({ taskId });
  }
}
