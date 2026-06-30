import { nowIsoString } from "@omniagent-plus/state-ledger";

import type { WorktreeLease } from "@omniagent-plus/core-contracts";

import type { WorktreeLeaseManager } from "./lease-manager.js";
import type {
  StaleRecoveryDecision,
  StaleRecoveryInspection,
} from "./types.js";

function blockedDecision(
  lease: WorktreeLease,
  reason: string,
  details: Record<string, string | boolean>,
): StaleRecoveryDecision {
  return {
    reusable: false,
    cleanupAllowed: false,
    reason,
    metadataOnlyEvidence: {
      leaseId: lease.id,
      branchName: lease.branchName,
      repoId: lease.repoId,
      ...details,
    },
  };
}

export function evaluateStaleLeaseRecovery(
  inspection: StaleRecoveryInspection,
): StaleRecoveryDecision {
  if (!inspection.ledgerEvidencePresent) {
    return blockedDecision(inspection.lease, "missing_ledger_evidence", {
      ledgerEvidencePresent: false,
    });
  }

  if (Date.parse(inspection.lease.expiresAt) > Date.parse(inspection.now)) {
    return blockedDecision(inspection.lease, "lease_not_expired", {
      expired: false,
    });
  }

  if (inspection.processLiveness.state === "alive") {
    return blockedDecision(inspection.lease, "active_process", {
      holderHost: inspection.lease.holder.host,
      sameHost: inspection.processLiveness.sameHost,
    });
  }

  if (inspection.processLiveness.state === "different_host") {
    return blockedDecision(inspection.lease, "different_host", {
      holderHost: inspection.lease.holder.host,
      currentHost: inspection.currentHost,
    });
  }

  if (inspection.dirtyState !== "clean" || inspection.lease.dirtyState !== "clean") {
    return blockedDecision(inspection.lease, "dirty_worktree", {
      dirtyState: inspection.dirtyState,
    });
  }

  if (!inspection.branchMatches) {
    return blockedDecision(inspection.lease, "branch_diverged", {
      branchMatches: false,
    });
  }

  return {
    reusable: true,
    cleanupAllowed: true,
    reason: "stale_recovery_allowed",
    metadataOnlyEvidence: {
      leaseId: inspection.lease.id,
      branchName: inspection.lease.branchName,
      repoId: inspection.lease.repoId,
      currentHost: inspection.currentHost,
      recoveredAt: inspection.now,
    },
  };
}

export async function recoverStaleLease(
  manager: WorktreeLeaseManager,
  inspection: StaleRecoveryInspection,
): Promise<StaleRecoveryDecision> {
  const decision = evaluateStaleLeaseRecovery(inspection);

  if (decision.reusable) {
    await manager.releaseLease(inspection.lease, {
      now: inspection.now ?? nowIsoString(),
    });
  }

  return decision;
}
