import type { WorktreeLease, WorktreeLeaseRequest } from "@omniagent-plus/core-contracts";

import { validateBranchName } from "./mounted-workspace.js";
import type {
  BranchCollisionDecision,
  SequentialContinuationEvidence,
} from "./types.js";

export function evaluateBranchCollision(options: {
  readonly request: WorktreeLeaseRequest;
  readonly activeLeases: readonly WorktreeLease[];
  readonly previousSequentialCandidate?: SequentialContinuationEvidence;
}): BranchCollisionDecision {
  validateBranchName(options.request.branchName);

  const collisions = options.activeLeases.filter(
    (lease) =>
      lease.repoId === options.request.repoId &&
      lease.branchName === options.request.branchName,
  );

  if (collisions.length > 0) {
    return {
      allowed: false,
      reason: "branch_collision_active_lease",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
        collisionCount: collisions.length,
      },
    };
  }

  if (options.request.mode !== "sequential_continue") {
    return {
      allowed: true,
      reason: "no_branch_collision",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
      },
    };
  }

  if (options.request.allowReuseExisting !== true) {
    return {
      allowed: false,
      reason: "sequential_continue_requires_explicit_reuse",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
      },
    };
  }

  const candidate = options.previousSequentialCandidate;
  if (candidate === undefined) {
    return {
      allowed: false,
      reason: "missing_sequential_metadata",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
      },
    };
  }

  const matchesTask =
    candidate.taskId === options.request.taskId &&
    candidate.repoId === options.request.repoId &&
    candidate.branchName === options.request.branchName;
  if (!matchesTask) {
    return {
      allowed: false,
      reason: "sequential_task_mismatch",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
        taskId: options.request.taskId,
      },
    };
  }

  if (candidate.dirtyState !== "clean") {
    return {
      allowed: false,
      reason: "sequential_dirty_worktree",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
        path: candidate.path,
      },
    };
  }

  if (!candidate.branchHeadMatches) {
    return {
      allowed: false,
      reason: "sequential_branch_head_mismatch",
      metadataOnlyEvidence: {
        branchName: options.request.branchName,
        repoId: options.request.repoId,
        path: candidate.path,
      },
    };
  }

  return {
    allowed: true,
    reason: "sequential_continue_reuses_clean_worktree",
    reusePath: candidate.path,
    metadataOnlyEvidence: {
      branchName: options.request.branchName,
      repoId: options.request.repoId,
      path: candidate.path,
    },
  };
}
