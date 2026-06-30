import {
  stateLedgerRecordKinds,
} from "@omniagent-plus/core-contracts";
import type {
  StateLedgerEntry,
  StateLedgerRecordKind,
} from "@omniagent-plus/core-contracts";

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
  const records = await ledger.store.listRecords();
  const protectedSequences = new Set<number>();

  if (keepLatestPerKind > 0) {
    for (const kind of pruneKinds) {
      const newest = records
        .filter((record) => record.kind === kind)
        .sort((left, right) => right.sequence - left.sequence)
        .slice(0, keepLatestPerKind);
      for (const record of newest) {
        protectedSequences.add(record.sequence);
      }
    }
  }

  const result = await ledger.store.compactRecords((record) => {
    if (!pruneKinds.has(record.kind)) {
      return true;
    }
    if (protectedSequences.has(record.sequence)) {
      return true;
    }
    if (cutoff === undefined) {
      return true;
    }
    return Date.parse(record.recordedAt) >= cutoff;
  });

  return {
    keptRecords: result.keptRecords,
    prunedRecords: result.prunedRecords,
  };
}
