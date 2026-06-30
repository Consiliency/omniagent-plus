export { evaluateBranchCollision } from "./branch-policy.js";
export { cleanupLeasedWorktree } from "./cleanup.js";
export { summarizeWorktreeDiff } from "./diff-summary.js";
export {
  ensureGitWorktree,
  inspectWorktreeDirtyState,
  readGitBranch,
  readGitHead,
  removeGitWorktree,
} from "./git.js";
export { renewLeaseHeartbeat } from "./heartbeat.js";
export { WorktreeLeaseManager } from "./lease-manager.js";
export { FilesystemLockBackend } from "./locks.js";
export {
  branchNameToSlug,
  resolveMountedWorkspacePlacement,
  validateBranchName,
} from "./mounted-workspace.js";
export {
  checkProcessLiveness,
  getCurrentHostIdentity,
} from "./process-liveness.js";
export {
  evaluateStaleLeaseRecovery,
  recoverStaleLease,
} from "./stale-recovery.js";
export {
  WorktreeLeasingError,
  worktreeInterfaceFreezeGate,
} from "./types.js";
export type {
  AcquireWorktreeLeaseOptions,
  BranchCollisionDecision,
  CleanupLeaseOptions,
  CleanupResult,
  DiffSummary,
  DurableLockMetadata,
  GitWorktreeResult,
  LockAttemptOptions,
  LockAttemptResult,
  LockHolderIdentity,
  ProcessLivenessResult,
  RenewWorktreeLeaseOptions,
  SequentialContinuationEvidence,
  StaleRecoveryDecision,
  StaleRecoveryInspection,
  StoredLeaseRecord,
  WorktreeLeaseAcquisition,
  WorktreeLeaseRegistry,
  WorktreePlacement,
  WorktreePlacementOptions,
} from "./types.js";
