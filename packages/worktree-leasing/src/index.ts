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
export {
  assertLeaseStoreGranted,
  createLeaseFromAcquireRequest,
  leaseScopesOverlap,
  LocalLeaseStore,
  normalizeLeaseScope,
} from "./lease-store.js";
export { WorktreeLeaseManager } from "./lease-manager.js";
export { FilesystemLockBackend } from "./locks.js";
export {
  createSupabaseLeaseStore,
  createSupabaseLeaseStoreFromEnv,
  queryScopeForRepo,
  SupabaseLeaseStore,
} from "./supabase-lease-store.js";
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
  LeaseAcquireRequest,
  LeaseAcquireResult,
  LeaseQuery,
  LeaseReleaseResult,
  LeaseRenewResult,
  LeaseSnapshot,
  LeaseStore,
} from "./lease-store.js";
export type { SupabaseLeaseRpcClient } from "./supabase-lease-store.js";
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
  LeasePageOptions,
  LeaseReclamationIntent,
  PathIdentity,
  PendingLeaseMutation,
  ProcessLivenessResult,
  RenewWorktreeLeaseOptions,
  SequentialContinuationEvidence,
  StaleRecoveryDecision,
  StaleRecoveryInspection,
  StoredLeaseRecord,
  WorktreeLeaseAcquisition,
  WorktreeLeaseRegistry,
  WorktreeLeaseManagerOptions,
  WorktreePlacement,
  WorktreePlacementOptions,
} from "./types.js";
