import type { AgentSession, RuntimeEvent } from "@consiliency/runtime-provider";
import { AuditLedger, replaySession } from "@omniagent-plus/state-ledger";

import { createCliError } from "../errors.js";
import type {
  ParsedCliRequest,
  ParsedSessionsListRequest,
  ParsedSessionsShowRequest,
} from "../args.js";
import {
  sessionsListResultSchema,
  sessionsShowResultSchema,
} from "../types.js";

function sessionSummary(
  session: AgentSession,
  records: Awaited<ReturnType<AuditLedger["listSessionRecords"]>>,
) {
  return {
    id: session.id,
    runtime: session.runtime,
    targetHarness: session.targetHarness,
    targetProvider: session.targetProvider,
    identityProfileId: session.identityProfileId,
    title: session.title,
    state: session.state,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    repoRoot: session.repoRoot,
    turnCount: new Set(records.filter((record) => record.kind === "turn").map((record) => record.turnId)).size,
    eventCount: records.filter((record) => record.kind === "runtime_event").length,
    approvalRequestCount: records.filter((record) => record.kind === "approval_request").length,
    approvalResponseCount: records.filter((record) => record.kind === "approval_response").length,
    evidenceRefCount: records.filter((record) => record.kind === "evidence_ref").length,
  };
}

async function runSessionsList(
  request: ParsedSessionsListRequest,
) {
  const ledger = await AuditLedger.open({
    rootDir: request.stateRoot,
    readOnly: true,
  });
  const records = await ledger.listRecords();
  const latest = new Map<string, AgentSession>();
  for (const record of records) if (record.kind === "session") latest.set(record.payload.id, record.payload);
  const sorted = [...latest.values()].sort((left, right) => left.id.localeCompare(right.id));
  const limited = request.limit === undefined ? sorted : sorted.slice(0, request.limit);
  const results = limited.map((session) => sessionSummary(session, records.filter((record) => record.sessionId === session.id)));

  return sessionsListResultSchema.parse({
    schema: "cli.sessions.list.result.v0.1",
    count: results.length,
    sessions: results,
  });
}

async function runSessionsShow(
  request: ParsedSessionsShowRequest,
) {
  const ledger = await AuditLedger.open({
    rootDir: request.stateRoot,
    readOnly: true,
  });
  const replay = await replaySession(ledger, request.sessionId);
  const session = replay.session;
  if (session === undefined) {
    throw createCliError("missing_record", `Session ${request.sessionId} was not found.`, { sessionId: request.sessionId });
  }
  const summary = {
    id: session.id, runtime: session.runtime, targetHarness: session.targetHarness,
    targetProvider: session.targetProvider, identityProfileId: session.identityProfileId,
    title: session.title, state: session.state, createdAt: session.createdAt, updatedAt: session.updatedAt,
    repoRoot: session.repoRoot, turnCount: replay.turns.length, eventCount: replay.history.events.length,
    approvalRequestCount: replay.approvalRequests.length, approvalResponseCount: replay.approvalResponses.length,
    evidenceRefCount: replay.evidenceRefs.length,
  };
  const turns = replay.turns.map((turn) => ({
    turnId: turn.turnId, idempotencyKey: turn.idempotencyKey, state: turn.state,
    createdAt: turn.createdAt, updatedAt: turn.updatedAt, eventCursor: turn.eventCursor,
  }));
  const history = replay.history;
  const events = history.events.map((event: RuntimeEvent) => ({
    sequence: event.sequence,
    type: event.type,
    occurredAt: event.occurredAt,
    turnId: event.turnId,
    terminal: event.terminal,
    redaction: event.redaction,
  }));

  const {
    approvalRequestCount,
    approvalResponseCount,
    evidenceRefCount,
    ...sessionWithoutCounts
  } = summary;

  return sessionsShowResultSchema.parse({
    schema: "cli.sessions.show.result.v0.1",
    session: sessionWithoutCounts,
    turns,
    history: {
      eventCount: events.length,
      nextCursor: history.nextCursor,
      events,
    },
    approvalRequestCount,
    approvalResponseCount,
    evidenceRefCount,
  });
}

export async function runSessionsCommand(
  request: ParsedCliRequest,
) {
  switch (request.command) {
    case "sessions list":
      return runSessionsList(request);
    case "sessions show":
      return runSessionsShow(request);
    default:
      throw createCliError("internal_failure", "sessions command dispatch received an unexpected request.");
  }
}
