import {
  cleanupLeasedWorktree,
  getCurrentHostIdentity,
  WorktreeLeaseManager,
  type CleanupResult,
} from "@omniagent-plus/worktree-leasing";

import { createCliError } from "../errors.js";
import type {
  ParsedCliRequest,
  ParsedWorktreesCleanupRequest,
  ParsedWorktreesListRequest,
} from "../args.js";
import {
  worktreesCleanupResultSchema,
  worktreesListResultSchema,
} from "../types.js";

function summarizeLease(lease: Awaited<ReturnType<WorktreeLeaseManager["listActiveLeases"]>>[number]) {
  return {
    id: lease.id,
    repoId: lease.repoId,
    path: lease.path,
    branchName: lease.branchName,
    mode: lease.mode,
    dirtyState: lease.dirtyState,
    holderHost: lease.holder.host,
    holderProcessId: lease.holder.processId,
    sessionId: lease.holder.sessionId,
    turnId: lease.holder.turnId,
    acquiredAt: lease.acquiredAt,
    renewedAt: lease.renewedAt,
    expiresAt: lease.expiresAt,
  };
}

async function runWorktreesList(request: ParsedWorktreesListRequest) {
  const manager = await WorktreeLeaseManager.open({
    rootDir: request.stateRoot,
    readOnly: true,
  });
  const leases = await manager.listActiveLeases({ limit: request.limit, cursor: request.cursor });

  return worktreesListResultSchema.parse({
    schema: "cli.worktrees.list.result.v0.1",
    count: leases.length,
    leases: leases.map(summarizeLease),
  });
}

function cleanupPayload(
  leaseId: string,
  result: CleanupResult,
) {
  return worktreesCleanupResultSchema.parse({
    schema: "cli.worktrees.cleanup.result.v0.1",
    leaseId,
    deleted: result.deleted,
    reason: result.reason,
    metadataOnlyEvidence: result.metadataOnlyEvidence,
    reconciled: result.reconciled,
    releaseIncomplete: result.releaseIncomplete,
  });
}

async function runWorktreesCleanup(
  request: ParsedWorktreesCleanupRequest,
) {
  const manager = await WorktreeLeaseManager.open({
    rootDir: request.stateRoot,
    managedRoot: request.managedRoot,
  });
  const stored = await manager.getStoredLeaseRecord(request.leaseId);

  if (stored === undefined) {
    throw createCliError("missing_record", `Worktree lease ${request.leaseId} was not found.`, {
      leaseId: request.leaseId,
    });
  }

  const result = await cleanupLeasedWorktree(manager, stored.lease, {
    activeFencingToken: request.fencingToken,
    holder: { processId: request.holderProcessId, host: request.holderHost, sessionId: request.holderSessionId, turnId: request.holderTurnId },
    currentHost: request.currentHost ?? getCurrentHostIdentity(),
    repoRoot: stored.repoRoot,
    worktreePath: stored.lease.path,
    allowReadOnlyCleanup: request.allowReadOnlyCleanup,
  });
  const payload = cleanupPayload(request.leaseId, result);

  if ((!result.deleted && !result.reconciled) || result.releaseIncomplete) {
    throw createCliError("cleanup_block", `Worktree cleanup blocked: ${result.reason}.`, {
      result: payload,
    });
  }

  return payload;
}

export async function runWorktreesCommand(
  request: ParsedCliRequest,
) {
  switch (request.command) {
    case "worktrees list":
      return runWorktreesList(request);
    case "worktrees cleanup":
      return runWorktreesCleanup(request);
    default:
      throw createCliError("internal_failure", "worktrees command dispatch received an unexpected request.");
  }
}
