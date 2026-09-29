import { z } from "zod";

import { handoffReasonSchema, handoffStatusSchema } from "./handoff-packet.js";
import {
  DEFAULT_UNTRUSTED_TEXT_MAX_BYTES,
  redactUntrustedText,
  sanitizeMetadataPath,
  sanitizeMetadataText,
  sanitizeWorkspacePath,
  opaqueExportPath,
} from "./redaction.js";
import {
  agentSessionStateSchema,
  harnessIdSchema,
  providerFamilyIdSchema,
  runtimeIdSchema,
  turnStateSchema,
} from "./schemas.js";
import { worktreeLeaseReleaseSchema } from "./worktree.js";

export const uiReadModelInterfaceFreezeGate = "IF-0-UI-12";

function issueMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function metadataTextSchema(label: string) {
  return z.string().transform((value, context) => {
    try {
      return sanitizeMetadataText(value, label);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issueMessage(error, `${label} is invalid.`),
      });
      return z.NEVER;
    }
  });
}

function metadataPathSchema(label: string) {
  return z.string().transform((value, context) => {
    try {
      return sanitizeMetadataPath(value);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issueMessage(error, `${label} is invalid.`),
      });
      return z.NEVER;
    }
  });
}

function workspacePathSchema(label: string) {
  return z.string().transform((value, context) => {
    try {
      return opaqueExportPath(sanitizeWorkspacePath(value, label));
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issueMessage(error, `${label} is invalid.`),
      });
      return z.NEVER;
    }
  });
}

function evidenceExcerptSchema(label: string) {
  return z.string().transform((value, context) => {
    try {
      return redactUntrustedText(value, {
        label,
        reason: "ui_evidence_excerpt",
        maxBytes: DEFAULT_UNTRUSTED_TEXT_MAX_BYTES,
      }).content;
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issueMessage(error, `${label} is invalid.`),
      });
      return z.NEVER;
    }
  });
}

export const uiEvidenceRefSchema = z.object({
  kind: z.enum(["file", "log", "command", "test", "diff"]),
  label: metadataTextSchema("evidence label"),
  path: metadataPathSchema("evidence path").optional(),
  excerpt: evidenceExcerptSchema("evidence excerpt").optional(),
});

export const uiSessionSummarySchema = z.object({
  sessionId: metadataTextSchema("session id"),
  runtime: runtimeIdSchema,
  targetHarness: harnessIdSchema,
  targetProvider: providerFamilyIdSchema.optional(),
  identityProfileId: metadataTextSchema("identity profile id").optional(),
  title: metadataTextSchema("session title"),
  state: agentSessionStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  parentSessionId: metadataTextSchema("parent session id").optional(),
  rootSessionId: metadataTextSchema("root session id").optional(),
  activeTurnCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  evidenceRefCount: z.number().int().nonnegative(),
  handoffPacketId: metadataTextSchema("handoff packet id").optional(),
  worktreeLeaseId: metadataTextSchema("worktree lease id").optional(),
  lastEventType: metadataTextSchema("last event type").optional(),
  lastEventAt: z.string().datetime({ offset: true }).optional(),
});

export const uiSessionTreeNodeSchema = z.object({
  sessionId: metadataTextSchema("tree session id"),
  parentSessionId: metadataTextSchema("tree parent session id").optional(),
  rootSessionId: metadataTextSchema("tree root session id"),
  depth: z.number().int().nonnegative(),
  title: metadataTextSchema("tree title"),
  state: agentSessionStateSchema,
  childSessionIds: z.array(metadataTextSchema("child session id")),
  activeTurnCount: z.number().int().nonnegative(),
  pendingApprovalCount: z.number().int().nonnegative(),
  handoffPacketId: metadataTextSchema("tree handoff packet id").optional(),
});

export const uiActiveTurnSummarySchema = z.object({
  sessionId: metadataTextSchema("active turn session id"),
  turnId: metadataTextSchema("active turn id"),
  state: turnStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  eventCursor: z.number().int().nonnegative().optional(),
  lastEventType: metadataTextSchema("active turn event type").optional(),
  lastEventAt: z.string().datetime({ offset: true }).optional(),
  pendingApprovalRequestId: metadataTextSchema("pending approval request id").optional(),
});

export const uiRouteDecisionSummarySchema = z.object({
  taskId: metadataTextSchema("route task id"),
  selectedProvider: metadataTextSchema("selected provider"),
  selectedHarness: metadataTextSchema("selected harness"),
  selectedIdentityProfileId: metadataTextSchema("selected identity profile id").optional(),
  preferredProvider: metadataTextSchema("preferred provider").optional(),
  preferredHarness: metadataTextSchema("preferred harness").optional(),
  fallbackUsed: z.boolean(),
  fallbackReason: metadataTextSchema("fallback reason").optional(),
  capabilityFit: z.number().min(0).max(1),
  providerHealth: z.number().min(0).max(1),
  currentCapacity: z.number().min(0).max(1),
  contextPortability: z.enum(["low", "medium", "high"]),
  portabilityScore: z.number().min(0).max(1).optional(),
  activeTurnTarget: z.number().int().nonnegative().optional(),
  routeReason: z.enum([
    "explicit_override",
    "capability_fit",
    "load_balance",
    "provider_cooldown",
    "usage_cap",
    "transient_failure",
    "manual",
  ]),
  cooldownReason: metadataTextSchema("cooldown reason").optional(),
  cooldownResetAt: z.string().datetime({ offset: true }).optional(),
  sameProviderAccountSwitch: z.enum([
    "forbidden",
    "manual_confirmation_required",
    "allowed_by_policy",
  ]).optional(),
  launchAction: z.enum([
    "allowed",
    "wait_for_reset",
    "manual_confirmation_required",
    "blocked",
  ]).optional(),
  launchReason: metadataTextSchema("launch reason").optional(),
  evidenceRefs: z.array(uiEvidenceRefSchema).optional(),
});

export const uiApprovalSummarySchema = z.object({
  approvalRequestId: metadataTextSchema("approval request id"),
  toolCallId: metadataTextSchema("approval tool call id").optional(),
  sessionId: metadataTextSchema("approval session id"),
  turnId: metadataTextSchema("approval turn id"),
  requestedAction: metadataTextSchema("approval requested action"),
  risk: z.enum(["low", "medium", "high"]),
  allowedApprovers: z.array(metadataTextSchema("allowed approver")).min(1),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["pending", "approved", "denied", "timed_out", "cancelled"]),
  decidedBy: metadataTextSchema("approval decided by").optional(),
  decidedAt: z.string().datetime({ offset: true }).optional(),
  reason: metadataTextSchema("approval reason").optional(),
});

export const uiCooldownSummarySchema = z.object({
  provider: providerFamilyIdSchema,
  active: z.boolean(),
  reason: metadataTextSchema("cooldown reason"),
  observedAt: z.string().datetime({ offset: true }),
  resetAt: z.string().datetime({ offset: true }).optional(),
  source: z.enum([
    "limit_classification",
    "manual",
    "transport_failure",
    "replay",
  ]),
});

export const uiWorktreeLeaseSummarySchema = z.object({
  id: metadataTextSchema("lease id"),
  repoId: metadataTextSchema("lease repo id"),
  path: workspacePathSchema("lease path"),
  branchName: metadataTextSchema("lease branch name"),
  mode: z.enum(["exclusive_write", "read_only", "sequential_continue"]),
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  holderHost: metadataTextSchema("lease holder host"),
  holderProcessId: z.number().int().nonnegative(),
  sessionId: metadataTextSchema("lease session id").optional(),
  turnId: metadataTextSchema("lease turn id").optional(),
  acquiredAt: z.string().datetime({ offset: true }),
  renewedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  release: worktreeLeaseReleaseSchema.optional(),
});

export const uiHandoffSummarySchema = z.object({
  packetId: metadataTextSchema("handoff packet id"),
  sessionId: metadataTextSchema("handoff session id"),
  sourceHarnesses: z.array(metadataTextSchema("handoff source harness")).min(1),
  targetHarness: metadataTextSchema("handoff target harness").optional(),
  targetProvider: metadataTextSchema("handoff target provider").optional(),
  reason: handoffReasonSchema,
  currentStatus: handoffStatusSchema,
  objective: metadataTextSchema("handoff objective"),
  branch: metadataTextSchema("handoff branch").optional(),
  worktreePath: workspacePathSchema("handoff worktree path").optional(),
  changedFileCount: z.number().int().nonnegative(),
  inspectedFileCount: z.number().int().nonnegative(),
  commandCount: z.number().int().nonnegative(),
  testCount: z.number().int().nonnegative(),
  riskCount: z.number().int().nonnegative(),
  openQuestionCount: z.number().int().nonnegative(),
  nextRecommendedAction: metadataTextSchema("handoff next action").optional(),
});

export const uiLimitClassificationSummarySchema = z.object({
  type: z.enum([
    "none",
    "burst_rate_limit",
    "token_rate_limit",
    "concurrency_limit",
    "fixed_window_usage_cap",
    "monthly_spend_or_quota_cap",
    "acceleration_limit",
    "overload_or_transient",
    "auth_or_billing_problem",
    "abuse_or_policy_block",
    "unknown_limit",
  ]),
  scope: z.enum([
    "session",
    "identity_profile",
    "provider_family",
    "model",
    "project",
    "organization",
    "global",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  provider: metadataTextSchema("classification provider").optional(),
  harness: metadataTextSchema("classification harness").optional(),
  identityProfileId: metadataTextSchema("classification identity profile id").optional(),
  sessionId: metadataTextSchema("classification session id").optional(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  resetAt: z.string().datetime({ offset: true }).optional(),
  statusCode: z.number().int().nonnegative().optional(),
  exitCode: z.number().int().optional(),
  retrySameSession: z.boolean(),
  reduceConcurrency: z.boolean(),
  routeNewWorkElsewhere: z.boolean(),
  migrateExistingPortableWork: z.boolean(),
  requireManualReview: z.boolean(),
  sameProviderAccountSwitch: z.enum([
    "forbidden",
    "manual_confirmation_required",
    "allowed_by_policy",
  ]),
  notes: z.array(metadataTextSchema("classification note")).optional(),
});

export const uiControlSnapshotSchema = z.object({
  schema: z.literal("ui.control.snapshot.v0.1"),
  interfaceFreezeGate: z.literal(uiReadModelInterfaceFreezeGate),
  redactionPosture: z.literal("metadata_only"),
  generatedAt: z.string().datetime({ offset: true }),
  sessions: z.array(uiSessionSummarySchema),
  sessionTree: z.array(uiSessionTreeNodeSchema),
  activeTurns: z.array(uiActiveTurnSummarySchema),
  routeDecisions: z.array(uiRouteDecisionSummarySchema),
  approvals: z.array(uiApprovalSummarySchema),
  cooldowns: z.array(uiCooldownSummarySchema),
  worktreeLeases: z.array(uiWorktreeLeaseSummarySchema),
  handoffs: z.array(uiHandoffSummarySchema),
  limitClassifications: z.array(uiLimitClassificationSummarySchema),
  evidenceRefs: z.array(uiEvidenceRefSchema),
});

export type UiEvidenceRef = z.infer<typeof uiEvidenceRefSchema>;
export type UiSessionSummary = z.infer<typeof uiSessionSummarySchema>;
export type UiSessionTreeNode = z.infer<typeof uiSessionTreeNodeSchema>;
export type UiActiveTurnSummary = z.infer<typeof uiActiveTurnSummarySchema>;
export type UiRouteDecisionSummary = z.infer<typeof uiRouteDecisionSummarySchema>;
export type UiApprovalSummary = z.infer<typeof uiApprovalSummarySchema>;
export type UiCooldownSummary = z.infer<typeof uiCooldownSummarySchema>;
export type UiWorktreeLeaseSummary = z.infer<typeof uiWorktreeLeaseSummarySchema>;
export type UiHandoffSummary = z.infer<typeof uiHandoffSummarySchema>;
export type UiLimitClassificationSummary = z.infer<typeof uiLimitClassificationSummarySchema>;
export type UiControlSnapshot = z.infer<typeof uiControlSnapshotSchema>;
