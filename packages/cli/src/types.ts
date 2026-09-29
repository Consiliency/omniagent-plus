import {
  consiliencyLeaseSchema,
  coordinationMessageSchema,
  identityProfileStatusSchema,
  limitClassificationSchema,
  redactedConfigValueSchema,
  routeDecisionSchema,
  uiControlSnapshotSchema,
  opaqueExportPath,
} from "@consiliency/runtime-provider";
import { z } from "zod";

export const cliCommandKeys = [
  "health",
  "sessions list",
  "sessions show",
  "control snapshot",
  "identities list",
  "identities preflight",
  "worktrees list",
  "worktrees cleanup",
  "coordination leases list",
  "coordination leases acquire",
  "coordination leases renew",
  "coordination leases release",
  "coordination inbox send",
  "coordination inbox list",
  "classify-limit",
  "route-task",
] as const;
export type CliCommandKey = (typeof cliCommandKeys)[number];
export const cliCommandKeySchema = z.enum(cliCommandKeys);

export interface CliCommandInfo {
  readonly key: CliCommandKey;
  readonly description: string;
}

export interface CliContext {
  readonly repoRoot: string;
  readonly stateRoot: string;
  readonly profilesDir: string;
  readonly availableCommands: readonly CliCommandInfo[];
}

export const persistedRecordSchema = z.object({
  recordId: z.string().min(1),
  sequence: z.number().int().positive(),
});

const exportedPathSchema = z.string().min(1).transform(opaqueExportPath);

const stateLedgerPathsSchema = z.object({
  rootDir: exportedPathSchema,
  ledgerPath: exportedPathSchema,
  manifestPath: exportedPathSchema,
  coordinationDir: exportedPathSchema,
});

export const healthResultSchema = z.object({
  schema: z.literal("cli.health.result.v0.1"),
  interfaceFreezeGate: z.literal("IF-0-CLI-11"),
  redactionPosture: z.literal("metadata_only"),
  releaseSurfaceDecision: z.literal("no_doc_delta"),
  defaultProfilesDir: exportedPathSchema,
  defaultStateRoot: exportedPathSchema,
  stateStorePresent: z.boolean(),
  stateLedgerPaths: stateLedgerPathsSchema,
  commands: z.array(cliCommandKeySchema).min(1),
});

const sessionListItemSchema = z.object({
  id: z.string().min(1),
  runtime: z.string().min(1),
  targetHarness: z.string().min(1),
  targetProvider: z.string().min(1).optional(),
  identityProfileId: z.string().min(1).optional(),
  title: z.string().min(1),
  state: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  repoRoot: exportedPathSchema.optional(),
  turnCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  approvalRequestCount: z.number().int().nonnegative(),
  approvalResponseCount: z.number().int().nonnegative(),
  evidenceRefCount: z.number().int().nonnegative(),
});

export const sessionsListResultSchema = z.object({
  schema: z.literal("cli.sessions.list.result.v0.1"),
  count: z.number().int().nonnegative(),
  sessions: z.array(sessionListItemSchema),
});

const turnSummarySchema = z.object({
  turnId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  state: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  eventCursor: z.number().int().nonnegative().optional(),
});

const runtimeEventSummarySchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  turnId: z.string().min(1).optional(),
  terminal: z.boolean(),
  redaction: z.string().min(1),
});

export const sessionsShowResultSchema = z.object({
  schema: z.literal("cli.sessions.show.result.v0.1"),
  session: sessionListItemSchema.omit({
    approvalRequestCount: true,
    approvalResponseCount: true,
    evidenceRefCount: true,
  }),
  turns: z.array(turnSummarySchema),
  history: z.object({
    eventCount: z.number().int().nonnegative(),
    nextCursor: z.number().int().nonnegative().optional(),
    events: z.array(runtimeEventSummarySchema),
  }),
  approvalRequestCount: z.number().int().nonnegative(),
  approvalResponseCount: z.number().int().nonnegative(),
  evidenceRefCount: z.number().int().nonnegative(),
});

export const controlSnapshotResultSchema = z.object({
  schema: z.literal("cli.control.snapshot.result.v0.1"),
  interfaceFreezeGate: z.literal("IF-0-UI-12"),
  readOnly: z.literal(true),
  stateStorePresent: z.boolean(),
  snapshot: uiControlSnapshotSchema,
});

const identityListItemSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  harness: z.string().min(1),
  kind: z.enum(["development", "shared", "production"]),
  authMode: z.string().min(1),
  isolation: z.string().min(1),
  envAllowlist: z.array(z.string().min(1)),
  redactedEnv: z.record(z.string(), redactedConfigValueSchema),
  secretRefCount: z.number().int().nonnegative(),
  authVolumeConfigured: z.boolean(),
  homeDirConfigured: z.boolean(),
  processOwnerConfigured: z.boolean(),
  toolPolicyConfigured: z.boolean(),
  networkPolicy: z.string().min(1).optional(),
  maxOpenSessions: z.number().int().nonnegative(),
  maxActiveTurns: z.number().int().nonnegative(),
  tags: z.array(z.string().min(1)),
});

export const identitiesListResultSchema = z.object({
  schema: z.literal("cli.identities.list.result.v0.1"),
  count: z.number().int().nonnegative(),
  profiles: z.array(identityListItemSchema),
});

const identityEnvironmentSummarySchema = z.object({
  schema: z.literal("cli.identity.environment_summary.v0.1"),
  profileId: z.string().min(1),
  kind: z.enum(["development", "shared", "production"]),
  isolation: z.string().min(1),
  launchEnvKeys: z.array(z.string().min(1)),
  envAllowlist: z.array(z.string().min(1)),
  redactedEnv: z.record(z.string(), redactedConfigValueSchema),
  secretRefCount: z.number().int().nonnegative(),
  authVolumeConfigured: z.boolean(),
  homeDirConfigured: z.boolean(),
  processOwnerConfigured: z.boolean(),
  toolPolicyConfigured: z.boolean(),
  networkPolicy: z.string().min(1).optional(),
});

export const identitiesPreflightResultSchema = z.object({
  schema: z.literal("cli.identities.preflight.result.v0.1"),
  profileId: z.string().min(1),
  readiness: z.enum(["ready", "cooldown", "degraded", "blocked", "needs_auth"]),
  allowed: z.boolean(),
  diagnostics: z.object({
    code: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()),
  }),
  environment: identityEnvironmentSummarySchema,
  status: identityProfileStatusSchema,
  persistedRecord: persistedRecordSchema,
});

const worktreeLeaseSummarySchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  path: exportedPathSchema,
  branchName: z.string().min(1),
  mode: z.enum(["exclusive_write", "read_only", "sequential_continue"]),
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  holderHost: z.string().min(1),
  holderProcessId: z.number().int().nonnegative(),
  sessionId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  acquiredAt: z.string().datetime({ offset: true }),
  renewedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
});

export const worktreesListResultSchema = z.object({
  schema: z.literal("cli.worktrees.list.result.v0.1"),
  count: z.number().int().nonnegative(),
  leases: z.array(worktreeLeaseSummarySchema),
});

const cleanupEvidenceSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

export const worktreesCleanupResultSchema = z.object({
  schema: z.literal("cli.worktrees.cleanup.result.v0.1"),
  leaseId: z.string().min(1),
  deleted: z.boolean(),
  reason: z.string().min(1),
  metadataOnlyEvidence: cleanupEvidenceSchema,
});

export const coordinationBackendSchema = z.enum(["local", "supabase"]);

const coordinationLeaseSummarySchema = consiliencyLeaseSchema.extend({
  expires_at: z.string().datetime({ offset: true }),
});

export const coordinationLeasesListResultSchema = z.object({
  schema: z.literal("cli.coordination.leases.list.result.v0.1"),
  backend: coordinationBackendSchema,
  count: z.number().int().nonnegative(),
  leases: z.array(coordinationLeaseSummarySchema),
});

export const coordinationLeasesAcquireResultSchema = z.object({
  schema: z.literal("cli.coordination.leases.acquire.result.v0.1"),
  backend: coordinationBackendSchema,
  granted: z.boolean(),
  lease: coordinationLeaseSummarySchema.optional(),
  conflict: coordinationLeaseSummarySchema.optional(),
  failure: z.string().min(1).optional(),
});

export const coordinationLeasesRenewResultSchema = z.object({
  schema: z.literal("cli.coordination.leases.renew.result.v0.1"),
  backend: coordinationBackendSchema,
  renewed: z.boolean(),
  lease: coordinationLeaseSummarySchema.optional(),
  failure: z.string().min(1).optional(),
});

export const coordinationLeasesReleaseResultSchema = z.object({
  schema: z.literal("cli.coordination.leases.release.result.v0.1"),
  backend: coordinationBackendSchema,
  released: z.boolean(),
  failure: z.string().min(1).optional(),
});

export const coordinationInboxSendResultSchema = z.object({
  schema: z.literal("cli.coordination.inbox.send.result.v0.1"),
  backend: coordinationBackendSchema,
  messageId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
});

export const coordinationInboxListResultSchema = z.object({
  schema: z.literal("cli.coordination.inbox.list.result.v0.1"),
  backend: coordinationBackendSchema,
  count: z.number().int().nonnegative(),
  messages: z.array(coordinationMessageSchema),
});

const recordModeSchema = z.enum(["dry_run", "recorded"]);

export const classifyLimitResultSchema = z.object({
  schema: z.literal("cli.classify-limit.result.v0.1"),
  recordMode: recordModeSchema,
  classification: limitClassificationSchema,
  persistedRecord: persistedRecordSchema.optional(),
});

const candidateSummarySchema = z.object({
  profileId: z.string().min(1),
  provider: z.string().min(1),
  harness: z.string().min(1),
  available: z.boolean(),
  currentCapacity: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1)),
});

const portabilitySummarySchema = z.object({
  score: z.number().min(0).max(1),
  level: z.enum(["low", "medium", "high"]),
  migrateAcrossProviders: z.boolean(),
  reasons: z.array(z.string().min(1)),
});

export const routeTaskResultSchema = z.object({
  schema: z.literal("cli.route-task.result.v0.1"),
  recordMode: recordModeSchema,
  candidate: candidateSummarySchema,
  portability: portabilitySummarySchema,
  routeDecision: routeDecisionSchema,
  persistedRecord: persistedRecordSchema.optional(),
});

export const commandResultSchema = z.discriminatedUnion("schema", [
  healthResultSchema,
  sessionsListResultSchema,
  sessionsShowResultSchema,
  controlSnapshotResultSchema,
  identitiesListResultSchema,
  identitiesPreflightResultSchema,
  worktreesListResultSchema,
  worktreesCleanupResultSchema,
  coordinationLeasesListResultSchema,
  coordinationLeasesAcquireResultSchema,
  coordinationLeasesRenewResultSchema,
  coordinationLeasesReleaseResultSchema,
  coordinationInboxSendResultSchema,
  coordinationInboxListResultSchema,
  classifyLimitResultSchema,
  routeTaskResultSchema,
]);

export type CliCommandResult = z.infer<typeof commandResultSchema>;
