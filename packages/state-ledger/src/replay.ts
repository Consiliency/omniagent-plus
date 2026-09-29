import {
  type AgentSession,
  type RouteDecision,
  type RuntimeApprovalRequest,
  type RuntimeApprovalResponse,
  type RuntimeEvidenceRef,
  type RuntimeEvent,
  type SessionHistory,
  type StateLedgerEntry,
  type TurnHandle,
  type UiControlSnapshot,
  uiControlSnapshotSchema,
} from "@consiliency/runtime-provider";

import type { AuditLedger } from "./audit-ledger.js";
import { nowIsoString } from "./schema.js";
import { completeSnapshotRecords, readLedgerSnapshot } from "./ledger-snapshot.js";

export interface SessionReplay {
  readonly session?: AgentSession;
  readonly turns: TurnHandle[];
  readonly history: SessionHistory;
  readonly routeDecisions: RouteDecision[];
  readonly approvalRequests: RuntimeApprovalRequest[];
  readonly approvalResponses: RuntimeApprovalResponse[];
  readonly evidenceRefs: RuntimeEvidenceRef[];
}

const terminalTurnStates = new Set([
  "cancelled",
  "timed_out",
  "completed",
  "failed",
]);

function sortBySequence<T extends { readonly sequence: number }>(records: T[]): T[] {
  return records.slice().sort((left, right) => left.sequence - right.sequence);
}

function latestByKey<TRecord extends StateLedgerEntry>(
  records: TRecord[],
  keyFor: (record: TRecord) => string,
): TRecord[] {
  const latest = new Map<string, TRecord>();

  for (const record of sortBySequence(records)) {
    latest.set(keyFor(record), record);
  }

  return [...latest.values()];
}

function latestEventByKey(
  events: RuntimeEvent[],
  keyFor: (event: RuntimeEvent) => string,
): Map<string, RuntimeEvent> {
  const latest = new Map<string, RuntimeEvent>();

  for (const event of events) {
    latest.set(keyFor(event), event);
  }

  return latest;
}

async function readStateLedgerRecords(rootDir: string): Promise<StateLedgerEntry[]> {
  return completeSnapshotRecords(await readLedgerSnapshot(rootDir));
}

function sessionRootId(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
): string {
  if (session.rootSessionId) {
    return session.rootSessionId;
  }

  const seen = new Set<string>();
  let current: AgentSession | undefined = session;
  while (current?.parentSessionId) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    current = sessionsById.get(current.parentSessionId);
  }

  return current?.id ?? session.id;
}

function sessionDepth(
  session: AgentSession,
  sessionsById: Map<string, AgentSession>,
): number {
  const seen = new Set<string>();
  let depth = 0;
  let current: AgentSession | undefined = session;

  while (current?.parentSessionId) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    depth += 1;
    current = sessionsById.get(current.parentSessionId);
  }

  return depth;
}

function buildEmptyUiControlSnapshot(): UiControlSnapshot {
  return uiControlSnapshotSchema.parse({
    schema: "ui.control.snapshot.v0.1",
    interfaceFreezeGate: "IF-0-UI-12",
    redactionPosture: "metadata_only",
    generatedAt: nowIsoString(),
    sessions: [],
    sessionTree: [],
    activeTurns: [],
    routeDecisions: [],
    approvals: [],
    cooldowns: [],
    worktreeLeases: [],
    handoffs: [],
    limitClassifications: [],
    evidenceRefs: [],
  });
}

function buildUiControlSnapshot(records: StateLedgerEntry[]): UiControlSnapshot {
  if (records.length === 0) {
    return buildEmptyUiControlSnapshot();
  }

  const sortedRecords = sortBySequence(records);
  const sessionRecords = latestByKey(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "session" }> =>
        record.kind === "session",
    ),
    (record) => (record.payload as AgentSession).id,
  );
  const turnRecords = latestByKey(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "turn" }> =>
        record.kind === "turn",
    ),
    (record) => {
      const turn = record.payload as TurnHandle;
      return JSON.stringify([turn.sessionId, turn.turnId]);
    },
  );
  const routeDecisionRecords = sortedRecords.filter(
    (record): record is Extract<StateLedgerEntry, { kind: "route_decision" }> =>
      record.kind === "route_decision",
  );
  const approvalRequestRecords = sortBySequence(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "approval_request" }> =>
        record.kind === "approval_request",
    ),
  );
  const approvalResponseRecords = latestByKey(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "approval_response" }> =>
        record.kind === "approval_response",
    ),
    (record) => JSON.stringify([record.sessionId, record.turnId, (record.payload as RuntimeApprovalResponse).approvalRequestId]),
  );
  const cooldownRecords = latestByKey(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "provider_cooldown" }> =>
        record.kind === "provider_cooldown",
    ),
    (record) => String(record.payload.provider),
  );
  const worktreeLeaseRecords = latestByKey(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "worktree_lease" }> =>
        record.kind === "worktree_lease",
    ),
    (record) => String(record.payload.id),
  );
  const limitClassificationRecords = sortBySequence(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "limit_classification" }> =>
        record.kind === "limit_classification",
    ),
  );
  const evidenceRefRecords = sortBySequence(
    sortedRecords.filter(
      (record): record is Extract<StateLedgerEntry, { kind: "evidence_ref" }> =>
        record.kind === "evidence_ref",
    ),
  );
  const runtimeEvents = sortedRecords
    .filter(
      (record): record is Extract<StateLedgerEntry, { kind: "runtime_event" }> =>
        record.kind === "runtime_event",
    )
    .map((record) => record.payload as RuntimeEvent);
  const runtimeEventsBySession = latestEventByKey(
    runtimeEvents,
    (event) => event.sessionId,
  );
  const runtimeEventsByTurn = latestEventByKey(
    runtimeEvents.filter((event) => event.turnId !== undefined),
    (event) => JSON.stringify([event.sessionId, event.turnId]),
  );
  const eventCountBySession = new Map<string, number>();
  for (const event of runtimeEvents) {
    eventCountBySession.set(
      event.sessionId,
      (eventCountBySession.get(event.sessionId) ?? 0) + 1,
    );
  }
  const evidenceCountBySession = new Map<string, number>();
  for (const record of evidenceRefRecords) {
    if (record.sessionId === undefined) {
      continue;
    }
    evidenceCountBySession.set(
      record.sessionId,
      (evidenceCountBySession.get(record.sessionId) ?? 0) + 1,
    );
  }
  const approvalResponsesById = new Map(
    approvalResponseRecords.map((record) => [
      JSON.stringify([record.sessionId, record.turnId, (record.payload as RuntimeApprovalResponse).approvalRequestId]),
      record.payload as RuntimeApprovalResponse,
    ]),
  );
  const pendingApprovalByTurn = new Map<string, RuntimeApprovalRequest>();
  const pendingApprovalCountBySession = new Map<string, number>();
  for (const record of approvalRequestRecords) {
    const request = record.payload as RuntimeApprovalRequest;
    if (approvalResponsesById.has(JSON.stringify([request.sessionId, request.turnId, request.approvalRequestId]))) {
      continue;
    }
    pendingApprovalByTurn.set(JSON.stringify([request.sessionId, request.turnId]), request);
    pendingApprovalCountBySession.set(
      request.sessionId,
      (pendingApprovalCountBySession.get(request.sessionId) ?? 0) + 1,
    );
  }
  const activeTurnCountBySession = new Map<string, number>();
  for (const record of turnRecords) {
    const turn = record.payload as TurnHandle;
    if (terminalTurnStates.has(turn.state)) {
      continue;
    }
    activeTurnCountBySession.set(
      turn.sessionId,
      (activeTurnCountBySession.get(turn.sessionId) ?? 0) + 1,
    );
  }
  const sessionsById = new Map(
    sessionRecords.map((record) => {
      const session = record.payload as AgentSession;
      return [session.id, session] as const;
    }),
  );
  const sessions = sessionRecords
    .map((record) => {
      const session = record.payload as AgentSession;
      const lastEvent = runtimeEventsBySession.get(session.id);
      return {
        sessionId: session.id,
        runtime: session.runtime,
        targetHarness: session.targetHarness,
        targetProvider: session.targetProvider,
        identityProfileId: session.identityProfileId,
        title: session.title,
        state: session.state,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        parentSessionId: session.parentSessionId,
        rootSessionId: session.rootSessionId,
        activeTurnCount: activeTurnCountBySession.get(session.id) ?? 0,
        pendingApprovalCount: pendingApprovalCountBySession.get(session.id) ?? 0,
        eventCount: eventCountBySession.get(session.id) ?? 0,
        evidenceRefCount: evidenceCountBySession.get(session.id) ?? 0,
        handoffPacketId: session.handoffPacket?.packetId,
        worktreeLeaseId: session.worktree?.id,
        lastEventType: lastEvent?.type,
        lastEventAt: lastEvent?.occurredAt,
      };
    })
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.sessionId.localeCompare(right.sessionId),
    );
  const sessionTree = sessions
    .map((summary) => {
      const session = sessionsById.get(summary.sessionId);
      if (session === undefined) {
        throw new Error(`Missing session payload for ${summary.sessionId}.`);
      }
      return {
        sessionId: summary.sessionId,
        parentSessionId: summary.parentSessionId,
        rootSessionId: sessionRootId(session, sessionsById),
        depth: sessionDepth(session, sessionsById),
        title: summary.title,
        state: summary.state,
        childSessionIds: sessions
          .filter((candidate) => candidate.parentSessionId === summary.sessionId)
          .map((candidate) => candidate.sessionId)
          .sort((left, right) => left.localeCompare(right)),
        activeTurnCount: summary.activeTurnCount,
        pendingApprovalCount: summary.pendingApprovalCount,
        handoffPacketId: summary.handoffPacketId,
      };
    })
    .sort((left, right) =>
      left.depth - right.depth || left.sessionId.localeCompare(right.sessionId),
    );
  const activeTurns = turnRecords
    .map((record) => record.payload as TurnHandle)
    .filter((turn) => !terminalTurnStates.has(turn.state))
    .map((turn) => {
      const lastEvent = runtimeEventsByTurn.get(JSON.stringify([turn.sessionId, turn.turnId]));
      return {
        sessionId: turn.sessionId,
        turnId: turn.turnId,
        state: turn.state,
        createdAt: turn.createdAt,
        updatedAt: turn.updatedAt,
        eventCursor: turn.eventCursor,
        lastEventType: lastEvent?.type,
        lastEventAt: lastEvent?.occurredAt,
        pendingApprovalRequestId: pendingApprovalByTurn.get(
          JSON.stringify([turn.sessionId, turn.turnId]),
        )?.approvalRequestId,
      };
    })
    .sort((left, right) =>
      left.sessionId.localeCompare(right.sessionId) || left.turnId.localeCompare(right.turnId),
    );
  const routeDecisions = routeDecisionRecords
    .map((record) => {
      const decision = record.payload as RouteDecision;
      return {
        taskId: decision.taskId,
        selectedProvider: decision.selectedProvider,
        selectedHarness: decision.selectedHarness,
        selectedIdentityProfileId: decision.selectedIdentityProfileId,
        preferredProvider: decision.preferredProvider,
        preferredHarness: decision.preferredHarness,
        fallbackUsed: decision.fallbackUsed,
        fallbackReason: decision.fallbackReason,
        capabilityFit: decision.capabilityFit,
        providerHealth: decision.providerHealth,
        currentCapacity: decision.currentCapacity,
        contextPortability: decision.contextPortability,
        portabilityScore: decision.portabilityScore,
        activeTurnTarget: decision.activeTurnTarget,
        routeReason: decision.routeReason,
        cooldownReason: decision.cooldownState?.reason,
        cooldownResetAt: decision.cooldownState?.resetAt,
        sameProviderAccountSwitch: decision.cooldownState?.sameProviderAccountSwitch,
        launchAction: decision.launchGate?.action,
        launchReason: decision.launchGate?.reason,
        evidenceRefs: decision.evidenceRefs,
      };
    })
    .sort((left, right) => left.taskId.localeCompare(right.taskId));
  const approvals = approvalRequestRecords
    .map((record) => {
      const request = record.payload as RuntimeApprovalRequest;
      const response = approvalResponsesById.get(JSON.stringify([request.sessionId, request.turnId, request.approvalRequestId]));
      return {
        approvalRequestId: request.approvalRequestId,
        toolCallId: request.toolCallId,
        sessionId: request.sessionId,
        turnId: request.turnId,
        requestedAction: request.requestedAction,
        risk: request.risk,
        allowedApprovers: request.allowedApprovers,
        expiresAt: request.expiresAt,
        status: response?.decision ?? "pending",
        decidedBy: response?.decidedBy,
        decidedAt: response?.decidedAt,
        reason: response?.reason,
      };
    })
    .sort((left, right) =>
      left.sessionId.localeCompare(right.sessionId)
      || left.turnId.localeCompare(right.turnId)
      || left.approvalRequestId.localeCompare(right.approvalRequestId),
    );
  const cooldowns = cooldownRecords
    .map((record) => ({
      provider: record.payload.provider,
      active: record.payload.active,
      reason: record.payload.reason,
      observedAt: record.payload.observedAt,
      resetAt: record.payload.resetAt,
      source: record.payload.source,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
  const worktreeLeases = worktreeLeaseRecords
    .map((record) => ({
      id: record.payload.id,
      repoId: record.payload.repoId,
      path: record.payload.path,
      branchName: record.payload.branchName,
      mode: record.payload.mode,
      dirtyState: record.payload.dirtyState,
      holderHost: record.payload.holder.host,
      holderProcessId: record.payload.holder.processId,
      sessionId: record.payload.holder.sessionId,
      turnId: record.payload.holder.turnId,
      acquiredAt: record.payload.acquiredAt,
      renewedAt: record.payload.renewedAt,
      expiresAt: record.payload.expiresAt,
      release: record.payload.release,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const handoffs = sessions
    .map((summary) => {
      const session = sessionsById.get(summary.sessionId);
      const handoff = session?.handoffPacket;
      if (handoff === undefined) {
        return undefined;
      }

      return {
        packetId: handoff.packetId,
        sessionId: summary.sessionId,
        sourceHarnesses: handoff.sourceHarnesses,
        targetHarness: handoff.targetHarness,
        targetProvider: handoff.targetProvider,
        reason: handoff.reason,
        currentStatus: handoff.currentStatus,
        objective: handoff.objective,
        branch: handoff.workspace?.branch,
        worktreePath: handoff.workspace?.worktreePath,
        changedFileCount: handoff.evidence.changedFiles?.length ?? 0,
        inspectedFileCount: handoff.evidence.inspectedFiles?.length ?? 0,
        commandCount: handoff.evidence.commandsRun?.length ?? 0,
        testCount: handoff.evidence.testResults?.length ?? 0,
        riskCount: handoff.risks?.length ?? 0,
        openQuestionCount: handoff.openQuestions?.length ?? 0,
        nextRecommendedAction: handoff.nextRecommendedAction,
      };
    })
    .filter((handoff): handoff is NonNullable<typeof handoff> => handoff !== undefined)
    .sort((left, right) => left.packetId.localeCompare(right.packetId));
  const limitClassifications = limitClassificationRecords
    .map((record) => {
      const classification = record.payload;
      return {
        type: classification.type,
        scope: classification.scope,
        confidence: classification.confidence,
        provider: classification.provider,
        harness: classification.harness,
        identityProfileId: classification.identityProfileId,
        sessionId: classification.sessionId,
        retryAfterSeconds: classification.retryAfterSeconds,
        resetAt: classification.resetAt,
        statusCode: classification.rawSignal.statusCode,
        exitCode: classification.rawSignal.exitCode,
        retrySameSession: classification.routingAction.retrySameSession,
        reduceConcurrency: classification.routingAction.reduceConcurrency,
        routeNewWorkElsewhere: classification.routingAction.routeNewWorkElsewhere,
        migrateExistingPortableWork: classification.routingAction.migrateExistingPortableWork,
        requireManualReview: classification.routingAction.requireManualReview,
        sameProviderAccountSwitch: classification.routingAction.sameProviderAccountSwitch,
        notes: classification.notes,
      };
    })
    .sort((left, right) =>
      (left.provider ?? left.sessionId ?? left.type).localeCompare(
        right.provider ?? right.sessionId ?? right.type,
      ),
    );
  const evidenceRefs = evidenceRefRecords.map((record) => record.payload);

  return uiControlSnapshotSchema.parse({
    schema: "ui.control.snapshot.v0.1",
    interfaceFreezeGate: "IF-0-UI-12",
    redactionPosture: "metadata_only",
    generatedAt: sortedRecords.at(-1)?.recordedAt ?? nowIsoString(),
    sessions,
    sessionTree,
    activeTurns,
    routeDecisions,
    approvals,
    cooldowns,
    worktreeLeases,
    handoffs,
    limitClassifications,
    evidenceRefs,
  });
}

function historyFromRecords(records: StateLedgerEntry[], sessionId: string): SessionHistory {
  const events = records.filter((record) => record.kind === "runtime_event" && record.sessionId === sessionId)
    .map((record) => record.payload as RuntimeEvent);
  return {
    sessionId, events,
    nextCursor: events.length === 0 ? undefined : events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1,
  };
}

export async function replaySessionHistory(ledger: AuditLedger, sessionId: string): Promise<SessionHistory> {
  return historyFromRecords(await ledger.listRecords(), sessionId);
}

export async function replayRouteDecisions(ledger: AuditLedger, taskId?: string): Promise<RouteDecision[]> {
  return (await ledger.listRecords({ kind: "route_decision", taskId })).map((record) => record.payload as RouteDecision);
}

export async function replaySession(ledger: AuditLedger, sessionId: string): Promise<SessionReplay> {
  const allRecords = await ledger.listRecords();
  const records = allRecords.filter((record) => record.sessionId === sessionId);
  const taskIds = new Set(records.flatMap((record) => record.taskId ? [record.taskId] : []));
  return {
    session: records.filter((record) => record.kind === "session").at(-1)?.payload as AgentSession | undefined,
    turns: latestByKey(records.filter((record) => record.kind === "turn"), (record) => JSON.stringify([record.sessionId, record.turnId]))
      .map((record) => record.payload as TurnHandle),
    history: historyFromRecords(records, sessionId),
    routeDecisions: allRecords.filter((record) => record.kind === "route_decision"
      && (record.sessionId === sessionId || (record.sessionId === undefined && record.taskId !== undefined && taskIds.has(record.taskId))))
      .map((record) => record.payload as RouteDecision),
    approvalRequests: latestByKey(records.filter((record) => record.kind === "approval_request"),
      (record) => JSON.stringify([record.sessionId, record.turnId, (record.payload as RuntimeApprovalRequest).approvalRequestId]))
      .map((record) => record.payload as RuntimeApprovalRequest),
    approvalResponses: latestByKey(records.filter((record) => record.kind === "approval_response"),
      (record) => JSON.stringify([record.sessionId, record.turnId, (record.payload as RuntimeApprovalResponse).approvalRequestId]))
      .map((record) => record.payload as RuntimeApprovalResponse),
    evidenceRefs: records.filter((record) => record.kind === "evidence_ref").map((record) => record.payload as RuntimeEvidenceRef),
  };
}

export async function replayUiControlSnapshot(
  ledger: AuditLedger,
): Promise<UiControlSnapshot> {
  return buildUiControlSnapshot(await ledger.listRecords());
}

export async function replayUiControlSnapshotFromStateRoot(
  rootDir: string,
): Promise<UiControlSnapshot> {
  return buildUiControlSnapshot(await readStateLedgerRecords(rootDir));
}
