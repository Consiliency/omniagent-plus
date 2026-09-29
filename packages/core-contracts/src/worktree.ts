import { z } from "zod";
import { metadataSchemaCheck, sanitizeMetadataText } from "./redaction.js";

export interface WorktreeLeaseRelease {
  readonly cause: "holder_release" | "reconciliation" | "recovery";
  readonly actor: string;
  readonly releasedAt: string;
}

export const worktreeLeaseReleaseSchema = z.object({
  cause: z.enum(["holder_release", "reconciliation", "recovery"]),
  actor: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 280, "Release actor exceeds metadata limit."),
  releasedAt: z.string().datetime({ offset: true }),
}).superRefine(metadataSchemaCheck);

export const worktreeLeaseModes = [
  "exclusive_write",
  "read_only",
  "sequential_continue",
] as const;
export type WorktreeLeaseMode = (typeof worktreeLeaseModes)[number];

export interface WorktreeLeaseRequest {
  readonly repoId: string;
  readonly repoRoot?: string;
  readonly baseRef?: string;
  readonly branchName: string;
  readonly taskId: string;
  readonly mode: WorktreeLeaseMode;
  readonly allowReuseExisting?: boolean;
  readonly requestedTtlSeconds?: number;
}

export interface WorktreeLeaseRef {
  readonly id: string;
  readonly path?: string;
  readonly branchName?: string;
  readonly mode?: WorktreeLeaseMode;
  readonly fencingToken?: string;
}

export interface WorktreeLease {
  readonly id: string;
  readonly fencingToken: string;
  readonly repoId: string;
  readonly path: string;
  readonly branchName: string;
  readonly mode: WorktreeLeaseMode;
  readonly holder: {
    readonly processId: number;
    readonly host: string;
    readonly sessionId?: string;
    readonly turnId?: string;
  };
  readonly acquiredAt: string;
  readonly renewedAt: string;
  readonly expiresAt: string;
  readonly dirtyState: "clean" | "dirty" | "unknown";
  readonly release?: WorktreeLeaseRelease;
}

export const worktreeLeaseRequestSchema = z.object({
  repoId: z.string().min(1),
  repoRoot: z.string().min(1).optional(),
  baseRef: z.string().min(1).optional(),
  branchName: z.string().min(1),
  taskId: z.string().min(1),
  mode: z.enum(worktreeLeaseModes),
  allowReuseExisting: z.boolean().optional(),
  requestedTtlSeconds: z.number().int().positive().optional(),
});

export const worktreeLeaseRefSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  mode: z.enum(worktreeLeaseModes).optional(),
  fencingToken: z.string().min(1).optional(),
});

export const worktreeLeaseSchema = z.object({
  id: z.string().min(1),
  fencingToken: z.string().min(1),
  repoId: z.string().min(1),
  path: z.string().min(1),
  branchName: z.string().min(1),
  mode: z.enum(worktreeLeaseModes),
  holder: z.object({
    processId: z.number().int().nonnegative(),
    host: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    turnId: z.string().min(1).optional(),
  }),
  acquiredAt: z.string().datetime({ offset: true }),
  renewedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  release: worktreeLeaseReleaseSchema.optional(),
}).superRefine((lease, context) => {
  if (lease.release !== undefined && (lease.expiresAt !== lease.release.releasedAt
    || lease.renewedAt !== lease.release.releasedAt || Date.parse(lease.release.releasedAt) < Date.parse(lease.acquiredAt))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Released lease timestamps must agree with provenance." });
  }
});

export function createWorktreeLeaseRelease(lease: WorktreeLease, release: WorktreeLeaseRelease): WorktreeLease {
  return worktreeLeaseSchema.parse({ ...lease,
    renewedAt: release.releasedAt, expiresAt: release.releasedAt,
    release: { ...release, actor: sanitizeMetadataText(release.actor, "release actor") },
  });
}
