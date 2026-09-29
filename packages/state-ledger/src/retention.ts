import {
  stateLedgerRecordKinds,
} from "@consiliency/runtime-provider";
import type {
  StateLedgerEntry,
  StateLedgerRecordKind,
} from "@consiliency/runtime-provider";

import type { AuditLedger } from "./audit-ledger.js";

export interface RetentionPolicy {
  readonly pruneKinds?: StateLedgerRecordKind[];
  readonly maxAgeMs?: number;
  readonly keepLatestPerKind?: number;
}

export interface RetentionResult {
  readonly keptRecords: StateLedgerEntry[];
  readonly prunedRecords: StateLedgerEntry[];
}

export async function applyRetentionPolicy(
  ledger: AuditLedger,
  policy: RetentionPolicy,
  now = new Date(),
): Promise<RetentionResult> {
  const pruneKinds = new Set(policy.pruneKinds ?? stateLedgerRecordKinds);
  const keepLatestPerKind = policy.keepLatestPerKind ?? 0;
  const cutoff =
    policy.maxAgeMs === undefined ? undefined : now.getTime() - policy.maxAgeMs;
  let protectedSequences: Set<number> | undefined;
  const result = await ledger.store.compactRecords((record, snapshot) => {
    protectedSequences ??= retentionClosure(snapshot, pruneKinds, keepLatestPerKind, cutoff, now.getTime());
    return protectedSequences.has(record.sequence);
  });

  return {
    keptRecords: result.keptRecords,
    prunedRecords: result.prunedRecords,
  };
}

function entityKey(record: StateLedgerEntry): string {
  switch (record.kind) {
    case "session": return `session:${record.payload.id}`;
    case "turn": return `turn:${record.payload.sessionId}:${record.payload.turnId}`;
    case "worktree_lease": return `lease:${record.payload.id}`;
    case "approval_request": return `request:${record.payload.sessionId}:${record.payload.turnId}:${record.payload.approvalRequestId}`;
    case "approval_response": return `response:${record.sessionId}:${record.turnId}:${record.payload.approvalRequestId}`;
    case "provider_cooldown": return `cooldown:${record.payload.provider}`;
    case "identity_profile_status": return `identity:${record.payload.profileId}`;
    default: return `record:${record.recordId}`;
  }
}

function retentionClosure(
  records: readonly StateLedgerEntry[], pruneKinds: Set<StateLedgerRecordKind>,
  keepLatestPerKind: number, cutoff: number | undefined, now: number,
): Set<number> {
  const latest = new Map<string, StateLedgerEntry>();
  for (const record of records) latest.set(entityKey(record), record);
  const keep = new Set(records.filter((record) => !pruneKinds.has(record.kind)
    || cutoff === undefined || Date.parse(record.recordedAt) >= cutoff).map((record) => record.sequence));
  for (const kind of pruneKinds) {
    for (const record of records.filter((record) => record.kind === kind).slice(-keepLatestPerKind || records.length)) {
      if (keepLatestPerKind > 0) keep.add(record.sequence);
    }
  }
  const sessions = new Set<string>();
  const turns = new Set<string>();
  const leases = new Set<string>();
  const tasks = new Set<string>();
  const requests = new Set<string>();
  for (const record of latest.values()) {
    if (record.kind === "session" && !["closed", "failed"].includes(record.payload.state)) sessions.add(record.payload.id);
    if (record.kind === "turn" && !["cancelled", "timed_out", "completed", "failed"].includes(record.payload.state)) {
      turns.add(`${record.payload.sessionId}:${record.payload.turnId}`);
      sessions.add(record.payload.sessionId);
    }
    if (record.kind === "worktree_lease" && Date.parse(record.payload.expiresAt) > now) {
      leases.add(record.payload.id);
      if (record.payload.holder.sessionId) sessions.add(record.payload.holder.sessionId);
      if (record.payload.holder.turnId) turns.add(`${record.payload.holder.sessionId}:${record.payload.holder.turnId}`);
    }
    if (record.kind === "approval_request") {
      const key = `${record.payload.sessionId}:${record.payload.turnId}:${record.payload.approvalRequestId}`;
      if (!latest.has(`response:${key}`)) {
        requests.add(key);
        sessions.add(record.payload.sessionId);
        turns.add(`${record.payload.sessionId}:${record.payload.turnId}`);
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      const scopedSession = record.kind === "session" ? record.payload.id : record.sessionId;
      const turn = `${record.sessionId}:${record.turnId}`;
      if ((scopedSession && sessions.has(scopedSession)) || turns.has(turn)
        || (record.taskId && tasks.has(record.taskId))
        || (record.kind === "worktree_lease" && leases.has(record.payload.id))
        || (record.kind === "approval_request" && requests.has(`${record.payload.sessionId}:${record.payload.turnId}:${record.payload.approvalRequestId}`))) {
        if (!keep.has(record.sequence)) { keep.add(record.sequence); changed = true; }
      }
      if (!keep.has(record.sequence)) continue;
      const newest = latest.get(entityKey(record))!;
      if (!keep.has(newest.sequence)) { keep.add(newest.sequence); changed = true; }
      const add = (set: Set<string>, value: string | undefined) => {
        if (value && !set.has(value)) { set.add(value); changed = true; }
      };
      add(sessions, scopedSession);
      add(tasks, record.taskId);
      if (record.turnId) add(turns, turn);
      if (record.kind === "session") {
        add(sessions, record.payload.parentSessionId);
        add(sessions, record.payload.rootSessionId);
        add(leases, record.payload.worktree?.id);
        for (const source of record.payload.handoffPacket?.sourceSessionIds ?? []) add(sessions, source);
      }
      if (record.kind === "worktree_lease") {
        add(sessions, record.payload.holder.sessionId);
        if (record.payload.holder.turnId) add(turns, `${record.payload.holder.sessionId}:${record.payload.holder.turnId}`);
      }
      if (record.kind === "approval_response") add(requests, `${record.sessionId}:${record.turnId}:${record.payload.approvalRequestId}`);
    }
  }
  return keep;
}
