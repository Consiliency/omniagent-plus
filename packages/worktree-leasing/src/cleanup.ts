import { resolve } from "node:path";
import type { WorktreeLease } from "@consiliency/runtime-provider";
import { inspectWorktreeDirtyState, readGitBranch, removeGitWorktree, readGitWorktreeRegistration, verifyGitWorktreeRepository } from "./git.js";
import { checkProcessLiveness, getCurrentHostIdentity } from "./process-liveness.js";
import { readPathIdentity, samePathIdentity, type WorktreeLeaseManager } from "./lease-manager.js";
import { WorktreeLeasingError, type CleanupLeaseOptions, type CleanupResult } from "./types.js";

export async function cleanupLeasedWorktree(
  manager: WorktreeLeaseManager, lease: WorktreeLease,
  options: CleanupLeaseOptions & { readonly repoRoot?: string; readonly worktreePath?: string },
): Promise<CleanupResult> {
  const blocked = (reason: string): CleanupResult => ({
    deleted: false, reason, metadataOnlyEvidence: { leaseId: lease.id, repoId: lease.repoId, branchName: lease.branchName },
  });
  try {
    return await manager.withCleanup(lease, async (record, controls) => {
      const current = record.lease;
      if (current.fencingToken !== options.activeFencingToken) return blocked("fencing_token_mismatch");
      if (current.mode === "read_only" && options.allowReadOnlyCleanup !== true) return blocked("read_only_reviewer");
      if (options.dirtyState === "unknown") return blocked("unknown_dirty_state");
      if (options.dirtyState === "dirty") return blocked("dirty_worktree");
      if (options.processLiveness?.state === "alive") return blocked("active_process");
      if (options.processLiveness?.state === "different_host") return blocked("different_host");
      if (options.processLiveness?.state === "unknown") return blocked("unknown_process");
      if (options.branchMatches === false) return blocked("branch_diverged");
      if (!options.holder || options.holder.processId !== current.holder.processId || options.holder.host !== current.holder.host
        || options.holder.sessionId !== current.holder.sessionId || options.holder.turnId !== current.holder.turnId) return blocked("holder_mismatch");
      if (options.currentHost !== getCurrentHostIdentity()) return blocked("different_host");
      if (options.worktreePath !== undefined && resolve(options.worktreePath) !== resolve(current.path)
        || options.repoRoot !== undefined && resolve(options.repoRoot) !== resolve(record.repoRoot ?? "")) return blocked("path_override");
      const live = checkProcessLiveness({ processId: current.holder.processId, holderHost: current.holder.host });
      const identity = await readPathIdentity(resolve(current.path));
      if (!record.repoRoot) return blocked("repo_root_unproven");
      const registration = await readGitWorktreeRegistration(record.repoRoot, resolve(current.path));
      if (registration && registration.branchName !== current.branchName) return blocked("branch_diverged");
      const now = options.now ?? new Date().toISOString();
      if (!identity) {
        if (live.state !== "missing" && options.holder.processId !== process.pid) return blocked(live.state === "alive" ? "active_process" : "unknown_process");
        await controls.release(now);
        return { deleted: false, reconciled: true, reason: "absent_path_reconciled",
          metadataOnlyEvidence: { leaseId: current.id, deleted: false, reconciled: true } };
      }
      if (live.state !== "missing") return blocked(live.state === "alive" ? "active_process" : live.state === "different_host" ? "different_host" : "unknown_process");
      try { await controls.validatePath(); }
      catch (error) { if (error instanceof WorktreeLeasingError) return blocked(error.code); throw error; }
      if (!record.pathIdentity || !samePathIdentity(record.pathIdentity, identity)) return blocked("path_identity_unproven");
      if (!registration || !await verifyGitWorktreeRepository(record.repoRoot, identity.path)) return blocked("unregistered_worktree");
      const dirty = await inspectWorktreeDirtyState(identity.path);
      if (dirty !== "clean") return blocked(dirty === "dirty" ? "dirty_worktree" : "unknown_dirty_state");
      if (await readGitBranch(identity.path) !== current.branchName) return blocked("branch_diverged");
      const checked = await readPathIdentity(identity.path);
      if (!checked || !samePathIdentity(identity, checked)) return blocked("path_identity_changed");
      await controls.stageRemoval(identity, now);
      let deleted = false;
      try {
        const finalRegistration = await readGitWorktreeRegistration(record.repoRoot, identity.path);
        const finalLiveness = checkProcessLiveness({ processId: current.holder.processId, holderHost: current.holder.host });
        if (finalRegistration?.branchName !== current.branchName || finalLiveness.state !== "missing"
          || await inspectWorktreeDirtyState(identity.path) !== "clean" || await readGitBranch(identity.path) !== current.branchName
          || !await verifyGitWorktreeRepository(record.repoRoot, identity.path)) throw new WorktreeLeasingError("cleanup_recheck_failed", "Cleanup authority changed before removal.");
        const finalIdentity = await readPathIdentity(identity.path);
        if (!finalIdentity || !samePathIdentity(identity, finalIdentity)) throw new WorktreeLeasingError("path_identity_changed", "Cleanup path identity changed.");
        await removeGitWorktree(record.repoRoot, identity.path);
        deleted = true;
        await controls.markRemovalDone();
        await controls.release(now);
      } catch {
        return { deleted, releaseIncomplete: true, reason: deleted ? "cleanup_release_incomplete" : "cleanup_effect_uncertain",
          metadataOnlyEvidence: { leaseId: current.id, deleted, releaseIncomplete: true } };
      }
      return { deleted: true, reason: "cleanup_complete", metadataOnlyEvidence: { leaseId: current.id, worktreePath: identity.path, metadataOnly: true } };
    });
  } catch (error) {
    if (error instanceof WorktreeLeasingError) return blocked(error.code);
    if (error instanceof Error && "code" in error && ["EACCES", "EPERM"].includes(String(error.code))) return blocked("path_permission_unknown");
    throw error;
  }
}
