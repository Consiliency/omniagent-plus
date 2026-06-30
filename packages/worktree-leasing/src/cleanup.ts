import { rm } from "node:fs/promises";

import type { WorktreeLease } from "@omniagent-plus/core-contracts";

import { removeGitWorktree } from "./git.js";
import { checkProcessLiveness } from "./process-liveness.js";
import type { WorktreeLeaseManager } from "./lease-manager.js";
import type { CleanupLeaseOptions, CleanupResult } from "./types.js";

function blockedCleanup(
  lease: WorktreeLease,
  reason: string,
  details: Record<string, string | boolean>,
): CleanupResult {
  return {
    deleted: false,
    reason,
    metadataOnlyEvidence: {
      leaseId: lease.id,
      branchName: lease.branchName,
      repoId: lease.repoId,
      ...details,
    },
  };
}

export async function cleanupLeasedWorktree(
  manager: WorktreeLeaseManager,
  lease: WorktreeLease,
  options: CleanupLeaseOptions & {
    readonly repoRoot?: string;
    readonly worktreePath?: string;
  },
): Promise<CleanupResult> {
  const record = await manager.getStoredLeaseRecord(lease.id);
  if (record === undefined || record.status !== "active") {
    return blockedCleanup(lease, "lease_not_active", {
      active: false,
    });
  }

  if (record.lease.fencingToken !== options.activeFencingToken) {
    return blockedCleanup(lease, "fencing_token_mismatch", {
      activeTokenMatches: false,
    });
  }

  if (lease.mode === "read_only" && options.allowReadOnlyCleanup !== true) {
    return blockedCleanup(lease, "read_only_reviewer", {
      mode: lease.mode,
    });
  }

  const dirtyState = options.dirtyState ?? record.lease.dirtyState;
  if (dirtyState === "unknown") {
    return blockedCleanup(lease, "unknown_dirty_state", {
      dirtyState,
    });
  }

  if (dirtyState === "dirty") {
    return blockedCleanup(lease, "dirty_worktree", {
      dirtyState,
    });
  }

  const processLiveness =
    options.processLiveness ??
    checkProcessLiveness({
      processId: record.lease.holder.processId,
      holderHost: record.lease.holder.host,
      currentHost: options.currentHost,
    });
  if (processLiveness.state === "alive") {
    return blockedCleanup(lease, "active_process", {
      holderHost: processLiveness.holderHost,
      currentHost: processLiveness.currentHost,
    });
  }

  if (processLiveness.state === "different_host") {
    return blockedCleanup(lease, "different_host", {
      holderHost: processLiveness.holderHost,
      currentHost: processLiveness.currentHost,
    });
  }

  if (options.branchMatches === false) {
    return blockedCleanup(lease, "branch_diverged", {
      branchMatches: false,
    });
  }

  if (options.repoRoot !== undefined) {
    await removeGitWorktree(options.repoRoot, options.worktreePath ?? lease.path);
  } else {
    await rm(options.worktreePath ?? lease.path, {
      recursive: true,
      force: true,
    });
  }

  await manager.releaseLease(lease, {
    now: options.now,
  });

  return {
    deleted: true,
    reason: "cleanup_complete",
    metadataOnlyEvidence: {
      leaseId: lease.id,
      branchName: lease.branchName,
      repoId: lease.repoId,
      worktreePath: options.worktreePath ?? lease.path,
      metadataOnly: true,
    },
  };
}
