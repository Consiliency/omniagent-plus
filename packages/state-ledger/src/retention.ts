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
  readonly protectedRecordIds?: readonly string[];
  readonly nonRootKinds?: readonly StateLedgerRecordKind[];
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
  let protectedSequences: Set<number> | undefined;
  const result = await ledger.store.compactRecords((record, snapshot) => {
    protectedSequences ??= selectRetentionSequences(snapshot, policy, now);
    return protectedSequences.has(record.sequence);
  });

  return {
    keptRecords: result.keptRecords,
    prunedRecords: result.prunedRecords,
  };
}

function entityKey(record: StateLedgerEntry): string {
  switch (record.kind) {
    case "session": return JSON.stringify(["session", record.payload.id]);
    case "turn": return JSON.stringify(["turn", record.payload.sessionId, record.payload.turnId]);
    case "worktree_lease": return JSON.stringify(["lease", record.payload.id]);
    case "approval_request": return JSON.stringify(["request", record.payload.sessionId, record.payload.turnId, record.payload.approvalRequestId]);
    case "approval_response": return JSON.stringify(["response", record.sessionId, record.turnId, record.payload.approvalRequestId]);
    case "provider_cooldown": return JSON.stringify(["cooldown", record.payload.provider]);
    case "identity_profile_status": return JSON.stringify(["identity", record.payload.profileId]);
    default: return JSON.stringify(["record", record.recordId]);
  }
}

export function selectRetentionSequences(
  records: readonly StateLedgerEntry[], policy: RetentionPolicy, at = new Date(),
): Set<number> {
  const pruneKinds = new Set(policy.pruneKinds ?? stateLedgerRecordKinds);
  const nonRoots = new Set(policy.nonRootKinds ?? []);
  const pins = new Set(policy.protectedRecordIds ?? []);
  const keepLatestPerKind = policy.keepLatestPerKind ?? 0;
  const now = at.getTime();
  const cutoff = policy.maxAgeMs === undefined ? undefined : now - policy.maxAgeMs;
  const latest = new Map<string, StateLedgerEntry>();
  for (const record of records) latest.set(entityKey(record), record);
  const keep = new Set(records.filter((record) => pins.has(record.recordId) || (!nonRoots.has(record.kind)
    && (!pruneKinds.has(record.kind) || cutoff === undefined || Date.parse(record.recordedAt) >= cutoff))).map((record) => record.sequence));
  for (const kind of pruneKinds) {
    if (nonRoots.has(kind)) continue;
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
    if (nonRoots.has(record.kind)) continue;
    if (record.kind === "session" && !["closed", "failed"].includes(record.payload.state)) sessions.add(record.payload.id);
    if (record.kind === "turn" && !["cancelled", "timed_out", "completed", "failed"].includes(record.payload.state)) {
      turns.add(JSON.stringify([record.payload.sessionId, record.payload.turnId]));
      sessions.add(record.payload.sessionId);
    }
    if (record.kind === "worktree_lease" && Date.parse(record.payload.expiresAt) > now) {
      leases.add(record.payload.id);
      if (record.payload.holder.sessionId) sessions.add(record.payload.holder.sessionId);
      if (record.payload.holder.turnId) turns.add(JSON.stringify([record.payload.holder.sessionId, record.payload.holder.turnId]));
    }
    if (record.kind === "approval_request") {
      const key = JSON.stringify([record.payload.sessionId, record.payload.turnId, record.payload.approvalRequestId]);
      if (!latest.has(JSON.stringify(["response", record.payload.sessionId, record.payload.turnId, record.payload.approvalRequestId]))) {
        requests.add(key);
        sessions.add(record.payload.sessionId);
        turns.add(JSON.stringify([record.payload.sessionId, record.payload.turnId]));
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      const scopedSession = record.kind === "session" ? record.payload.id : record.sessionId;
      const turn = JSON.stringify([record.sessionId, record.turnId]);
      const protectedHistory = !nonRoots.has(record.kind) && ((scopedSession && sessions.has(scopedSession)) || turns.has(turn)
        || (record.taskId && tasks.has(record.taskId))
        || (record.kind === "worktree_lease" && leases.has(record.payload.id))
        || (record.kind === "approval_request" && requests.has(JSON.stringify([record.payload.sessionId, record.payload.turnId, record.payload.approvalRequestId]))));
      if (protectedHistory) {
        if (!keep.has(record.sequence)) { keep.add(record.sequence); changed = true; }
      }
      if (!keep.has(record.sequence)) continue;
      const newest = latest.get(entityKey(record))!;
      if (!keep.has(newest.sequence)) { keep.add(newest.sequence); changed = true; }
      const add = (set: Set<string>, value: string | undefined) => {
        if (value && !set.has(value)) { set.add(value); changed = true; }
      };
      const reference = (...key: (string | undefined)[]) => {
        const dependency = latest.get(JSON.stringify(key));
        if (dependency && !keep.has(dependency.sequence)) { keep.add(dependency.sequence); changed = true; }
      };
      if (protectedHistory) add(tasks, record.taskId);
      if (scopedSession) reference("session", scopedSession);
      if (record.turnId) reference("turn", record.sessionId, record.turnId);
      if (record.kind === "session") {
        reference("session", record.payload.parentSessionId);
        reference("session", record.payload.rootSessionId);
        reference("lease", record.payload.worktree?.id);
        for (const source of record.payload.handoffPacket?.sourceSessionIds ?? []) reference("session", source);
      }
      if (record.kind === "worktree_lease") {
        reference("session", record.payload.holder.sessionId);
        if (record.payload.holder.turnId) reference("turn", record.payload.holder.sessionId, record.payload.holder.turnId);
      }
      if (record.kind === "approval_response") reference("request", record.sessionId, record.turnId, record.payload.approvalRequestId);
      if (record.kind === "approval_request") reference("response", record.payload.sessionId, record.payload.turnId, record.payload.approvalRequestId);
    }
  }
  return keep;
}
