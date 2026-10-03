import { nowIsoString } from "@omniagent-plus/state-ledger";

import type { WorktreeLease } from "@consiliency/runtime-provider";

import type { WorktreeLeaseManager } from "./lease-manager.js";
import { inspectWorktreeDirtyState, readGitBranch, readGitWorktreeRegistration, verifyGitWorktreeRepository } from "./git.js";
import { checkProcessLiveness, getCurrentHostIdentity } from "./process-liveness.js";
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

  if (inspection.processLiveness.state === "unknown") return blockedDecision(inspection.lease, "unknown_process", { sameHost: inspection.processLiveness.sameHost });

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

  if (!decision.reusable) return decision;
  return manager.withCleanup(inspection.lease, async (record, controls) => {
    if (inspection.currentHost !== getCurrentHostIdentity() || !record.repoRoot) return blockedDecision(record.lease, "different_host", { sameHost: false });
    const registration = await readGitWorktreeRegistration(record.repoRoot, record.lease.path);
    const verified = registration?.branchName === record.lease.branchName && await verifyGitWorktreeRepository(record.repoRoot, record.lease.path);
    const actual = evaluateStaleLeaseRecovery({ ...inspection, lease: record.lease,
      processLiveness: checkProcessLiveness({ processId: record.lease.holder.processId, holderHost: record.lease.holder.host }),
      dirtyState: await inspectWorktreeDirtyState(record.lease.path),
      branchMatches: verified && await readGitBranch(record.lease.path) === record.lease.branchName,
      ledgerEvidencePresent: await controls.ledgerEvidence(),
    });
    if (actual.reusable) await controls.release(inspection.now ?? nowIsoString());
    return actual;
  });
}
