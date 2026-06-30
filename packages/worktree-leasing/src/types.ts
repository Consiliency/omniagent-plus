import type { WorktreeLease, WorktreeLeaseRequest } from "@omniagent-plus/core-contracts";

export const worktreeInterfaceFreezeGate = "IF-0-WORKTREE-7";

export type MetadataOnlyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[];

export type LockHolderIdentity = WorktreeLease["holder"];

export interface LockAttemptOptions {
  readonly ttlSeconds?: number;
  readonly retryMs?: number;
  readonly timeoutMs?: number;
  readonly now?: string;
}

export interface DurableLockMetadata {
  readonly resourceId: string;
  readonly fencingToken: string;
  readonly holder: LockHolderIdentity;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly lockPath: string;
}

export interface LockAttemptResult<T> {
  readonly acquired: boolean;
  readonly metadata?: DurableLockMetadata;
  readonly result?: T;
}

export interface SequentialContinuationEvidence {
  readonly taskId: string;
  readonly repoId: string;
  readonly branchName: string;
  readonly path: string;
  readonly dirtyState: WorktreeLease["dirtyState"];
  readonly branchHeadMatches: boolean;
}

export interface BranchCollisionDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly reusePath?: string;
  readonly metadataOnlyEvidence: Record<string, MetadataOnlyValue>;
}

export interface WorktreeLeaseAcquisition {
  readonly acquired: boolean;
  readonly lease?: WorktreeLease;
  readonly existingLease?: WorktreeLease;
  readonly collision?: BranchCollisionDecision;
}

export interface AcquireWorktreeLeaseOptions {
  readonly holder: LockHolderIdentity;
  readonly leasePath?: string;
  readonly dirtyState?: WorktreeLease["dirtyState"];
  readonly ttlSeconds?: number;
  readonly now?: string;
  readonly branchHead?: string;
  readonly repoRoot?: string;
}

export interface StoredLeaseRecord {
  readonly lease: WorktreeLease;
  readonly request: WorktreeLeaseRequest;
  readonly repoRoot?: string;
  readonly branchHead?: string;
  readonly status: "active" | "released";
  readonly releasedAt?: string;
  readonly updatedAt: string;
}

export interface WorktreeLeaseRegistry {
  schema: "worktree_lease_registry.v0.1";
  updatedAt: string;
  records: Record<string, StoredLeaseRecord>;
}

export interface RenewWorktreeLeaseOptions {
  readonly now?: string;
  readonly ttlSeconds?: number;
  readonly dirtyState?: WorktreeLease["dirtyState"];
  readonly branchHead?: string;
}

export interface WorktreePlacementOptions {
  readonly projectName: string;
  readonly branchName: string;
  readonly repoRoot: string;
  readonly workspaceMountRoot?: string;
  readonly workspaceMountExists?: boolean;
  readonly fallbackRoot?: string;
}

export interface WorktreePlacement {
  readonly path: string;
  readonly root: string;
  readonly usesMountedWorkspace: boolean;
  readonly projectSlug: string;
  readonly branchSlug: string;
}

export interface GitWorktreeResult {
  readonly path: string;
  readonly branchName: string;
  readonly head: string;
  readonly reused: boolean;
}

export interface DiffSummary {
  readonly branchName: string;
  readonly worktreePath: string;
  readonly dirtyState: WorktreeLease["dirtyState"];
  readonly changedPaths: string[];
  readonly fileCount: number;
  readonly additions: number;
  readonly deletions: number;
  readonly truncated: boolean;
}

export interface ProcessLivenessResult {
  readonly state: "alive" | "missing" | "different_host";
  readonly processId: number;
  readonly holderHost: string;
  readonly currentHost: string;
  readonly sameHost: boolean;
}

export interface StaleRecoveryInspection {
  readonly lease: WorktreeLease;
  readonly currentHost: string;
  readonly now: string;
  readonly processLiveness: ProcessLivenessResult;
  readonly dirtyState: WorktreeLease["dirtyState"];
  readonly branchMatches: boolean;
  readonly ledgerEvidencePresent: boolean;
}

export interface StaleRecoveryDecision {
  readonly reusable: boolean;
  readonly cleanupAllowed: boolean;
  readonly reason: string;
  readonly metadataOnlyEvidence: Record<string, MetadataOnlyValue>;
}

export interface CleanupLeaseOptions {
  readonly currentHost: string;
  readonly activeFencingToken: string;
  readonly processLiveness?: ProcessLivenessResult;
  readonly dirtyState?: WorktreeLease["dirtyState"];
  readonly branchMatches?: boolean;
  readonly allowReadOnlyCleanup?: boolean;
  readonly now?: string;
}

export interface CleanupResult {
  readonly deleted: boolean;
  readonly reason: string;
  readonly metadataOnlyEvidence: Record<string, MetadataOnlyValue>;
}

export class WorktreeLeasingError extends Error {
  readonly code: string;

  readonly metadata: Record<string, MetadataOnlyValue>;

  constructor(
    code: string,
    message: string,
    metadata: Record<string, MetadataOnlyValue> = {},
  ) {
    super(message);
    this.name = "WorktreeLeasingError";
    this.code = code;
    this.metadata = metadata;
  }
}
