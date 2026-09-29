import { z } from "zod";

import {
  DEFAULT_METADATA_TEXT_MAX_BYTES,
  DEFAULT_UNTRUSTED_TEXT_MAX_BYTES,
  redactedTextSchema,
  redactUntrustedText,
  sanitizeMetadataPath,
  sanitizeMetadataText,
  sanitizeWorkspacePath,
  type RedactedText,
  metadataSchemaCheck,
  opaqueExportPath,
} from "./redaction.js";
import { worktreeLeaseRefSchema, type WorktreeLeaseRef } from "./worktree.js";

const defaultMaxListItems = 12;
const defaultMaxChangedPaths = 32;

export const handoffReasons = [
  "manual_handoff",
  "provider_rate_limit",
  "provider_usage_cap",
  "provider_outage",
  "session_continuation",
  "review",
  "debug",
  "failover",
  "routing_policy",
] as const;
export type HandoffReason = (typeof handoffReasons)[number];

export const handoffStatuses = [
  "not_started",
  "in_progress",
  "blocked",
  "complete",
  "failed",
  "unknown",
] as const;
export type HandoffStatus = (typeof handoffStatuses)[number];

export const rawHistorySpeakers = [
  "system",
  "developer",
  "operator",
  "user",
  "assistant",
  "tool",
  "unknown",
] as const;
export type RawHistorySpeaker = (typeof rawHistorySpeakers)[number];

export interface CommandEvidence {
  readonly command: string;
  readonly exitCode: number;
  readonly summary: string;
  readonly output?: RedactedText;
}

export interface TestEvidence {
  readonly name: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly summary?: string;
  readonly details?: RedactedText;
}

export interface DiffEvidence {
  readonly path: string;
  readonly summary: string;
  readonly excerpt?: RedactedText;
}

export interface LogEvidence {
  readonly path: string;
  readonly summary: string;
  readonly excerpt?: RedactedText;
}

export interface PriorAgentSummaryEvidence {
  readonly label: string;
  readonly summary: string;
  readonly excerpt: RedactedText;
}

export interface RawHistoryEvidence {
  readonly speaker: RawHistorySpeaker;
  readonly occurredAt?: string;
  readonly excerpt: RedactedText;
}

export interface HandoffDiffSummary {
  readonly dirtyState: "clean" | "dirty" | "unknown";
  readonly changedPaths: string[];
  readonly fileCount: number;
  readonly additions: number;
  readonly deletions: number;
  readonly truncated: boolean;
}

export interface HandoffContextPolicy {
  readonly rawHistoryAllowed: boolean;
  readonly rawHistoryMaxItems?: number;
  readonly mayEditFiles: boolean;
  readonly mayRunCommands: boolean;
  readonly mayUseNetwork: boolean;
  readonly maySwitchProvider: boolean;
  readonly maxMetadataItems?: number;
  readonly maxEvidenceExcerptBytes?: number;
}

export interface HandoffPacket {
  readonly schema: "handoff_packet.v0.1";
  readonly packetId: string;
  readonly createdAt: string;
  readonly sourceSessionIds: string[];
  readonly sourceHarnesses: string[];
  readonly targetHarness?: string;
  readonly targetProvider?: string;
  readonly reason: HandoffReason;
  readonly objective: string;
  readonly currentStatus: HandoffStatus;
  readonly taskContract?: {
    readonly must?: string[];
    readonly mustNot?: string[];
    readonly acceptanceCriteria?: string[];
    readonly constraints?: string[];
  };
  readonly workspace?: {
    readonly repoRoot?: string;
    readonly branch?: string;
    readonly worktreePath?: string;
    readonly baseRef?: string;
    readonly diffRef?: string;
  };
  readonly facts?: string[];
  readonly evidence: {
    readonly worktreeLease?: WorktreeLeaseRef;
    readonly diffSummary?: HandoffDiffSummary;
    readonly changedFiles?: string[];
    readonly inspectedFiles?: string[];
    readonly commandsRun?: CommandEvidence[];
    readonly testResults?: TestEvidence[];
    readonly diffs?: DiffEvidence[];
    readonly logs?: LogEvidence[];
    readonly priorAgentSummaries?: PriorAgentSummaryEvidence[];
    readonly rawHistory?: RawHistoryEvidence[];
    readonly rawHistoryOmittedCount?: number;
  };
  readonly decisions?: string[];
  readonly assumptions?: string[];
  readonly failedAttempts?: string[];
  readonly risks?: string[];
  readonly openQuestions?: string[];
  readonly nextRecommendedAction?: string;
  readonly contextPolicy: HandoffContextPolicy;
  readonly requiredOutput?: {
    readonly schema?: string;
    readonly instructions?: string;
  };
}

export interface CommandEvidenceInput {
  readonly command: string;
  readonly exitCode: number;
  readonly summary: string;
  readonly output?: string;
}

export interface TestEvidenceInput {
  readonly name: string;
  readonly status: TestEvidence["status"];
  readonly summary?: string;
  readonly details?: string;
}

export interface DiffEvidenceInput {
  readonly path: string;
  readonly summary: string;
  readonly excerpt?: string;
}

export interface LogEvidenceInput {
  readonly path: string;
  readonly summary: string;
  readonly excerpt?: string;
}

export interface PriorAgentSummaryInput {
  readonly label: string;
  readonly summary: string;
  readonly content: string;
}

export interface RawHistoryInput {
  readonly speaker: RawHistorySpeaker;
  readonly occurredAt?: string;
  readonly content: string;
}

export interface HandoffPacketInput {
  readonly schema?: "handoff_packet.v0.1";
  readonly packetId: string;
  readonly createdAt: string;
  readonly sourceSessionIds: string[];
  readonly sourceHarnesses: string[];
  readonly targetHarness?: string;
  readonly targetProvider?: string;
  readonly reason: HandoffReason;
  readonly objective: string;
  readonly currentStatus: HandoffStatus;
  readonly taskContract?: HandoffPacket["taskContract"];
  readonly workspace?: HandoffPacket["workspace"];
  readonly facts?: string[];
  readonly evidence: {
    readonly worktreeLease?: WorktreeLeaseRef;
    readonly diffSummary?: HandoffDiffSummary;
    readonly changedFiles?: string[];
    readonly inspectedFiles?: string[];
    readonly commandsRun?: CommandEvidenceInput[];
    readonly testResults?: TestEvidenceInput[];
    readonly diffs?: DiffEvidenceInput[];
    readonly logs?: LogEvidenceInput[];
    readonly priorAgentSummaries?: PriorAgentSummaryInput[];
    readonly rawHistory?: RawHistoryInput[];
  };
  readonly decisions?: string[];
  readonly assumptions?: string[];
  readonly failedAttempts?: string[];
  readonly risks?: string[];
  readonly openQuestions?: string[];
  readonly nextRecommendedAction?: string;
  readonly contextPolicy: HandoffContextPolicy;
  readonly requiredOutput?: HandoffPacket["requiredOutput"];
}

export const handoffReasonSchema = z.enum(handoffReasons);
export const handoffStatusSchema = z.enum(handoffStatuses);
export const rawHistorySpeakerSchema = z.enum(rawHistorySpeakers);

export const commandEvidenceSchema = z.object({
  command: z.string().min(1),
  exitCode: z.number().int(),
  summary: z.string().min(1),
  output: redactedTextSchema.optional(),
});

export const testEvidenceSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  summary: z.string().min(1).optional(),
  details: redactedTextSchema.optional(),
});

export const diffEvidenceSchema = z.object({
  path: z.string().min(1),
  summary: z.string().min(1),
  excerpt: redactedTextSchema.optional(),
});

export const logEvidenceSchema = z.object({
  path: z.string().min(1),
  summary: z.string().min(1),
  excerpt: redactedTextSchema.optional(),
});

export const priorAgentSummaryEvidenceSchema = z.object({
  label: z.string().min(1),
  summary: z.string().min(1),
  excerpt: redactedTextSchema,
});

export const rawHistoryEvidenceSchema = z.object({
  speaker: rawHistorySpeakerSchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
  excerpt: redactedTextSchema,
});

export const handoffDiffSummarySchema = z.object({
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  changedPaths: z.array(z.string().min(1)),
  fileCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const handoffContextPolicySchema = z.object({
  rawHistoryAllowed: z.boolean(),
  rawHistoryMaxItems: z.number().int().positive().optional(),
  mayEditFiles: z.boolean(),
  mayRunCommands: z.boolean(),
  mayUseNetwork: z.boolean(),
  maySwitchProvider: z.boolean(),
  maxMetadataItems: z.number().int().positive().optional(),
  maxEvidenceExcerptBytes: z.number().int().positive().optional(),
});

export const handoffPacketSchema = z.object({
  schema: z.literal("handoff_packet.v0.1"),
  packetId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  sourceSessionIds: z.array(z.string().min(1)).min(1),
  sourceHarnesses: z.array(z.string().min(1)).min(1),
  targetHarness: z.string().min(1).optional(),
  targetProvider: z.string().min(1).optional(),
  reason: handoffReasonSchema,
  objective: z.string().min(1),
  currentStatus: handoffStatusSchema,
  taskContract: z
    .object({
      must: z.array(z.string().min(1)).optional(),
      mustNot: z.array(z.string().min(1)).optional(),
      acceptanceCriteria: z.array(z.string().min(1)).optional(),
      constraints: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  workspace: z
    .object({
      repoRoot: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      worktreePath: z.string().min(1).optional(),
      baseRef: z.string().min(1).optional(),
      diffRef: z.string().min(1).optional(),
    })
    .optional(),
  facts: z.array(z.string().min(1)).optional(),
  evidence: z.object({
    worktreeLease: worktreeLeaseRefSchema.optional(),
    diffSummary: handoffDiffSummarySchema.optional(),
    changedFiles: z.array(z.string().min(1)).optional(),
    inspectedFiles: z.array(z.string().min(1)).optional(),
    commandsRun: z.array(commandEvidenceSchema).optional(),
    testResults: z.array(testEvidenceSchema).optional(),
    diffs: z.array(diffEvidenceSchema).optional(),
    logs: z.array(logEvidenceSchema).optional(),
    priorAgentSummaries: z.array(priorAgentSummaryEvidenceSchema).optional(),
    rawHistory: z.array(rawHistoryEvidenceSchema).optional(),
    rawHistoryOmittedCount: z.number().int().nonnegative().optional(),
  }),
  decisions: z.array(z.string().min(1)).optional(),
  assumptions: z.array(z.string().min(1)).optional(),
  failedAttempts: z.array(z.string().min(1)).optional(),
  risks: z.array(z.string().min(1)).optional(),
  openQuestions: z.array(z.string().min(1)).optional(),
  nextRecommendedAction: z.string().min(1).optional(),
  contextPolicy: handoffContextPolicySchema,
  requiredOutput: z
    .object({
      schema: z.string().min(1).optional(),
      instructions: z.string().min(1).optional(),
    })
    .optional(),
}).transform((packet, context) => {
  try {
    const workspace = packet.workspace === undefined ? undefined : {
      ...packet.workspace,
      repoRoot: packet.workspace.repoRoot === undefined ? undefined : opaqueExportPath(sanitizeWorkspacePath(packet.workspace.repoRoot, "workspace root")),
      worktreePath: packet.workspace.worktreePath === undefined ? undefined : opaqueExportPath(sanitizeWorkspacePath(packet.workspace.worktreePath, "worktree path")),
    };
    const lease = packet.evidence.worktreeLease;
    const projected = { ...packet, workspace, evidence: { ...packet.evidence,
      worktreeLease: lease === undefined ? undefined : { ...lease,
        path: lease.path === undefined ? undefined : opaqueExportPath(sanitizeWorkspacePath(lease.path, "lease path")) },
    } };
    metadataSchemaCheck(projected, context);
    sanitizeMetadataText(packet.objective, "objective", 400);
    if (packet.nextRecommendedAction !== undefined) sanitizeMetadataText(packet.nextRecommendedAction, "next action", 400);
    for (const path of [...(packet.evidence.changedFiles ?? []), ...(packet.evidence.inspectedFiles ?? []),
      ...(packet.evidence.diffSummary?.changedPaths ?? []), ...(packet.evidence.diffs ?? []).map((item) => item.path),
      ...(packet.evidence.logs ?? []).map((item) => item.path)]) sanitizeMetadataPath(path);
    return projected;
  } catch (error) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Invalid handoff metadata." });
    return z.NEVER;
  }
});

function normalizeStringList(
  values: readonly string[] | undefined,
  label: string,
  maxItems: number,
  maxBytes = DEFAULT_METADATA_TEXT_MAX_BYTES,
): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    sanitizeMetadataText(value, `${label}[${index}]`, maxBytes),
  );
}

function normalizePathList(
  values: readonly string[] | undefined,
  label: string,
  maxItems: number,
): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values
    .slice(0, maxItems)
    .map((value, index) =>
      sanitizeMetadataPath(
        sanitizeMetadataText(value, `${label}[${index}]`, DEFAULT_METADATA_TEXT_MAX_BYTES),
      ),
    );
}

function normalizeWorkspace(
  workspace: HandoffPacket["workspace"] | undefined,
): HandoffPacket["workspace"] | undefined {
  if (workspace === undefined) {
    return undefined;
  }

  return {
    repoRoot:
      workspace.repoRoot === undefined
        ? undefined
        : sanitizeWorkspacePath(workspace.repoRoot, "workspace.repoRoot"),
    branch:
      workspace.branch === undefined
        ? undefined
        : sanitizeMetadataText(workspace.branch, "workspace.branch"),
    worktreePath:
      workspace.worktreePath === undefined
        ? undefined
        : sanitizeWorkspacePath(workspace.worktreePath, "workspace.worktreePath"),
    baseRef:
      workspace.baseRef === undefined
        ? undefined
        : sanitizeMetadataText(workspace.baseRef, "workspace.baseRef"),
    diffRef:
      workspace.diffRef === undefined
        ? undefined
        : sanitizeMetadataText(workspace.diffRef, "workspace.diffRef"),
  };
}

function normalizeDiffSummary(
  diffSummary: HandoffDiffSummary | undefined,
  maxPaths: number,
): HandoffDiffSummary | undefined {
  if (diffSummary === undefined) {
    return undefined;
  }

  return handoffDiffSummarySchema.parse({
    ...diffSummary,
    changedPaths: normalizePathList(
      diffSummary.changedPaths,
      "evidence.diffSummary.changedPaths",
      maxPaths,
    ) ?? [],
  });
}

function normalizeWorktreeLease(
  worktreeLease: WorktreeLeaseRef | undefined,
): WorktreeLeaseRef | undefined {
  if (worktreeLease === undefined) {
    return undefined;
  }

  return worktreeLeaseRefSchema.parse({
    ...worktreeLease,
    id: sanitizeMetadataText(worktreeLease.id, "evidence.worktreeLease.id"),
    path:
      worktreeLease.path === undefined
        ? undefined
        : sanitizeWorkspacePath(worktreeLease.path, "evidence.worktreeLease.path"),
    branchName:
      worktreeLease.branchName === undefined
        ? undefined
        : sanitizeMetadataText(
            worktreeLease.branchName,
            "evidence.worktreeLease.branchName",
          ),
    fencingToken:
      worktreeLease.fencingToken === undefined
        ? undefined
        : sanitizeMetadataText(
            worktreeLease.fencingToken,
            "evidence.worktreeLease.fencingToken",
          ),
  });
}

function normalizeCommandEvidence(
  values: readonly CommandEvidenceInput[] | undefined,
  maxItems: number,
  maxEvidenceBytes: number,
): CommandEvidence[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    commandEvidenceSchema.parse({
      command: sanitizeMetadataText(
        value.command,
        `evidence.commandsRun[${index}].command`,
        320,
      ),
      exitCode: value.exitCode,
      summary: sanitizeMetadataText(
        value.summary,
        `evidence.commandsRun[${index}].summary`,
        320,
      ),
      output:
        value.output === undefined
          ? undefined
          : redactUntrustedText(value.output, {
              label: `evidence.commandsRun[${index}].output`,
              reason: "command_output_excerpt",
              maxBytes: maxEvidenceBytes,
            }),
    }),
  );
}

function normalizeTestEvidence(
  values: readonly TestEvidenceInput[] | undefined,
  maxItems: number,
  maxEvidenceBytes: number,
): TestEvidence[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    testEvidenceSchema.parse({
      name: sanitizeMetadataText(
        value.name,
        `evidence.testResults[${index}].name`,
      ),
      status: value.status,
      summary:
        value.summary === undefined
          ? undefined
          : sanitizeMetadataText(
              value.summary,
              `evidence.testResults[${index}].summary`,
              320,
            ),
      details:
        value.details === undefined
          ? undefined
          : redactUntrustedText(value.details, {
              label: `evidence.testResults[${index}].details`,
              reason: "test_detail_excerpt",
              maxBytes: maxEvidenceBytes,
            }),
    }),
  );
}

function normalizeDiffEvidence(
  values: readonly DiffEvidenceInput[] | undefined,
  maxItems: number,
  maxEvidenceBytes: number,
): DiffEvidence[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    diffEvidenceSchema.parse({
      path: sanitizeMetadataPath(
        sanitizeMetadataText(value.path, `evidence.diffs[${index}].path`),
      ),
      summary: sanitizeMetadataText(
        value.summary,
        `evidence.diffs[${index}].summary`,
        320,
      ),
      excerpt:
        value.excerpt === undefined
          ? undefined
          : redactUntrustedText(value.excerpt, {
              label: `evidence.diffs[${index}].excerpt`,
              reason: "diff_excerpt",
              maxBytes: maxEvidenceBytes,
            }),
    }),
  );
}

function normalizeLogEvidence(
  values: readonly LogEvidenceInput[] | undefined,
  maxItems: number,
  maxEvidenceBytes: number,
): LogEvidence[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    logEvidenceSchema.parse({
      path: sanitizeMetadataPath(
        sanitizeMetadataText(value.path, `evidence.logs[${index}].path`),
      ),
      summary: sanitizeMetadataText(
        value.summary,
        `evidence.logs[${index}].summary`,
        320,
      ),
      excerpt:
        value.excerpt === undefined
          ? undefined
          : redactUntrustedText(value.excerpt, {
              label: `evidence.logs[${index}].excerpt`,
              reason: "log_excerpt",
              maxBytes: maxEvidenceBytes,
            }),
    }),
  );
}

function normalizePriorAgentSummaries(
  values: readonly PriorAgentSummaryInput[] | undefined,
  maxItems: number,
  maxEvidenceBytes: number,
): PriorAgentSummaryEvidence[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  return values.slice(0, maxItems).map((value, index) =>
    priorAgentSummaryEvidenceSchema.parse({
      label: sanitizeMetadataText(
        value.label,
        `evidence.priorAgentSummaries[${index}].label`,
      ),
      summary: sanitizeMetadataText(
        value.summary,
        `evidence.priorAgentSummaries[${index}].summary`,
        320,
      ),
      excerpt: redactUntrustedText(value.content, {
        label: `evidence.priorAgentSummaries[${index}].content`,
        reason: "prior_agent_summary_excerpt",
        maxBytes: maxEvidenceBytes,
      }),
    }),
  );
}

function normalizeRawHistory(
  values: readonly RawHistoryInput[] | undefined,
  contextPolicy: HandoffContextPolicy,
): {
  readonly rawHistory: RawHistoryEvidence[] | undefined;
  readonly rawHistoryOmittedCount: number | undefined;
} {
  if (values === undefined || values.length === 0 || !contextPolicy.rawHistoryAllowed) {
    return {
      rawHistory: undefined,
      rawHistoryOmittedCount: undefined,
    };
  }

  const maxItems = contextPolicy.rawHistoryMaxItems ?? defaultMaxListItems;
  const maxEvidenceBytes =
    contextPolicy.maxEvidenceExcerptBytes ?? DEFAULT_UNTRUSTED_TEXT_MAX_BYTES;
  const selectedValues = values.slice(0, maxItems);

  return {
    rawHistory: selectedValues.map((value, index) =>
      rawHistoryEvidenceSchema.parse({
        speaker: value.speaker,
        occurredAt: value.occurredAt,
        excerpt: redactUntrustedText(value.content, {
          label: `evidence.rawHistory[${index}].content`,
          reason: "raw_history_excerpt",
          maxBytes: maxEvidenceBytes,
        }),
      }),
    ),
    rawHistoryOmittedCount:
      values.length > selectedValues.length
        ? values.length - selectedValues.length
        : undefined,
  };
}

export function validateHandoffContextPolicy(
  contextPolicy: HandoffContextPolicy,
): HandoffContextPolicy {
  return handoffContextPolicySchema.parse(contextPolicy);
}

export function buildHandoffPacket(input: HandoffPacketInput): HandoffPacket {
  const contextPolicy = validateHandoffContextPolicy(input.contextPolicy);
  const maxItems = contextPolicy.maxMetadataItems ?? defaultMaxListItems;
  const maxEvidenceBytes =
    contextPolicy.maxEvidenceExcerptBytes ?? DEFAULT_UNTRUSTED_TEXT_MAX_BYTES;
  const rawHistory = normalizeRawHistory(input.evidence.rawHistory, contextPolicy);

  return handoffPacketSchema.parse({
    schema: input.schema ?? "handoff_packet.v0.1",
    packetId: sanitizeMetadataText(input.packetId, "packetId"),
    createdAt: input.createdAt,
    sourceSessionIds: normalizeStringList(
      input.sourceSessionIds,
      "sourceSessionIds",
      maxItems,
    ) ?? [],
    sourceHarnesses: normalizeStringList(
      input.sourceHarnesses,
      "sourceHarnesses",
      maxItems,
    ) ?? [],
    targetHarness:
      input.targetHarness === undefined
        ? undefined
        : sanitizeMetadataText(input.targetHarness, "targetHarness"),
    targetProvider:
      input.targetProvider === undefined
        ? undefined
        : sanitizeMetadataText(input.targetProvider, "targetProvider"),
    reason: input.reason,
    objective: sanitizeMetadataText(input.objective, "objective", 400),
    currentStatus: input.currentStatus,
    taskContract:
      input.taskContract === undefined
        ? undefined
        : {
            must: normalizeStringList(
              input.taskContract.must,
              "taskContract.must",
              maxItems,
            ),
            mustNot: normalizeStringList(
              input.taskContract.mustNot,
              "taskContract.mustNot",
              maxItems,
            ),
            acceptanceCriteria: normalizeStringList(
              input.taskContract.acceptanceCriteria,
              "taskContract.acceptanceCriteria",
              maxItems,
              320,
            ),
            constraints: normalizeStringList(
              input.taskContract.constraints,
              "taskContract.constraints",
              maxItems,
              320,
            ),
          },
    workspace: normalizeWorkspace(input.workspace),
    facts: normalizeStringList(input.facts, "facts", maxItems, 320),
    evidence: {
      worktreeLease: normalizeWorktreeLease(input.evidence.worktreeLease),
      diffSummary: normalizeDiffSummary(
        input.evidence.diffSummary,
        defaultMaxChangedPaths,
      ),
      changedFiles: normalizePathList(
        input.evidence.changedFiles,
        "evidence.changedFiles",
        defaultMaxChangedPaths,
      ),
      inspectedFiles: normalizePathList(
        input.evidence.inspectedFiles,
        "evidence.inspectedFiles",
        defaultMaxChangedPaths,
      ),
      commandsRun: normalizeCommandEvidence(
        input.evidence.commandsRun,
        maxItems,
        maxEvidenceBytes,
      ),
      testResults: normalizeTestEvidence(
        input.evidence.testResults,
        maxItems,
        maxEvidenceBytes,
      ),
      diffs: normalizeDiffEvidence(
        input.evidence.diffs,
        maxItems,
        maxEvidenceBytes,
      ),
      logs: normalizeLogEvidence(
        input.evidence.logs,
        maxItems,
        maxEvidenceBytes,
      ),
      priorAgentSummaries: normalizePriorAgentSummaries(
        input.evidence.priorAgentSummaries,
        maxItems,
        maxEvidenceBytes,
      ),
      rawHistory: rawHistory.rawHistory,
      rawHistoryOmittedCount: rawHistory.rawHistoryOmittedCount,
    },
    decisions: normalizeStringList(input.decisions, "decisions", maxItems, 320),
    assumptions: normalizeStringList(
      input.assumptions,
      "assumptions",
      maxItems,
      320,
    ),
    failedAttempts: normalizeStringList(
      input.failedAttempts,
      "failedAttempts",
      maxItems,
      320,
    ),
    risks: normalizeStringList(input.risks, "risks", maxItems, 320),
    openQuestions: normalizeStringList(
      input.openQuestions,
      "openQuestions",
      maxItems,
      320,
    ),
    nextRecommendedAction:
      input.nextRecommendedAction === undefined
        ? undefined
        : sanitizeMetadataText(
            input.nextRecommendedAction,
            "nextRecommendedAction",
            400,
          ),
    contextPolicy,
    requiredOutput:
      input.requiredOutput === undefined
        ? undefined
        : {
            schema:
              input.requiredOutput.schema === undefined
                ? undefined
                : sanitizeMetadataText(
                    input.requiredOutput.schema,
                    "requiredOutput.schema",
                  ),
            instructions:
              input.requiredOutput.instructions === undefined
                ? undefined
                : sanitizeMetadataText(
                    input.requiredOutput.instructions,
                    "requiredOutput.instructions",
                    400,
                  ),
          },
  });
}
