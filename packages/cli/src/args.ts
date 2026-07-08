import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { parseArgs } from "node:util";

import { sanitizeWorkspacePath } from "@omniagent-plus/core-contracts";

import { createCliError } from "./errors.js";
import type { CliCommandKey } from "./types.js";

export type CoordinationBackend = "local" | "supabase";

type ParseConfigOptions = NonNullable<Parameters<typeof parseArgs>[0]>["options"];

export interface ParsedCliBase {
  readonly command: CliCommandKey;
  readonly json: boolean;
  readonly repoRoot: string;
  readonly stateRoot: string;
  readonly profilesDir: string;
}

export interface ParsedHealthRequest extends ParsedCliBase {
  readonly command: "health";
}

export interface ParsedSessionsListRequest extends ParsedCliBase {
  readonly command: "sessions list";
  readonly limit?: number;
}

export interface ParsedSessionsShowRequest extends ParsedCliBase {
  readonly command: "sessions show";
  readonly sessionId: string;
}

export interface ParsedControlSnapshotRequest extends ParsedCliBase {
  readonly command: "control snapshot";
}

export interface ParsedIdentitiesListRequest extends ParsedCliBase {
  readonly command: "identities list";
}

export interface ParsedIdentitiesPreflightRequest extends ParsedCliBase {
  readonly command: "identities preflight";
  readonly profileId: string;
  readonly authAvailable?: boolean;
  readonly activeSessions?: number;
  readonly activeTurns?: number;
  readonly blockedReason?: string;
}

export interface ParsedWorktreesListRequest extends ParsedCliBase {
  readonly command: "worktrees list";
}

export interface ParsedWorktreesCleanupRequest extends ParsedCliBase {
  readonly command: "worktrees cleanup";
  readonly leaseId: string;
  readonly currentHost?: string;
  readonly allowReadOnlyCleanup: boolean;
}

export interface ParsedCoordinationLeasesListRequest extends ParsedCliBase {
  readonly command: "coordination leases list";
  readonly backend: CoordinationBackend;
  readonly scope?: string;
}

export interface ParsedCoordinationLeasesAcquireRequest extends ParsedCliBase {
  readonly command: "coordination leases acquire";
  readonly backend: CoordinationBackend;
  readonly holder: string;
  readonly scope: string;
  readonly mode: "soft" | "hard";
  readonly ttlSeconds: number;
  readonly phase: string;
  readonly leaseId?: string;
}

export interface ParsedCoordinationLeasesRenewRequest extends ParsedCliBase {
  readonly command: "coordination leases renew";
  readonly backend: CoordinationBackend;
  readonly leaseId: string;
  readonly holder: string;
  readonly ttlSeconds?: number;
}

export interface ParsedCoordinationLeasesReleaseRequest extends ParsedCliBase {
  readonly command: "coordination leases release";
  readonly backend: CoordinationBackend;
  readonly leaseId: string;
  readonly holder: string;
}

export interface ParsedCoordinationInboxSendRequest extends ParsedCliBase {
  readonly command: "coordination inbox send";
  readonly backend: CoordinationBackend;
  readonly type: "request-yield" | "announce-intent" | "handoff" | "done";
  readonly sender: string;
  readonly scope: string;
  readonly targetHolder?: string;
  readonly leaseId?: string;
  readonly handoffPacketId?: string;
}

export interface ParsedCoordinationInboxListRequest extends ParsedCliBase {
  readonly command: "coordination inbox list";
  readonly backend: CoordinationBackend;
  readonly scope?: string;
  readonly type?: "request-yield" | "announce-intent" | "handoff" | "done";
}

export interface ParsedClassifyLimitRequest extends ParsedCliBase {
  readonly command: "classify-limit";
  readonly provider?: string;
  readonly harness?: string;
  readonly statusCode?: number;
  readonly exitCode?: number;
  readonly bodyText?: string;
  readonly stderrText?: string;
  readonly stdoutText?: string;
  readonly headers: Record<string, string>;
  readonly sessionId?: string;
  readonly identityProfileId?: string;
  readonly taskId?: string;
  readonly record: boolean;
}

export interface ParsedRouteTaskRequest extends ParsedCliBase {
  readonly command: "route-task";
  readonly taskId: string;
  readonly preferredProvider?: string;
  readonly preferredHarness?: string;
  readonly preferredIdentityProfileId?: string;
  readonly classificationTaskId?: string;
  readonly worktreeLeaseId?: string;
  readonly manualConfirmationProvided: boolean;
  readonly sessionContinuation: boolean;
  readonly handoffEvidence: boolean;
  readonly rawHistoryAttached: boolean;
  readonly localFilesystemDependency: boolean;
  readonly allowCrossProviderMigration?: boolean;
  readonly coordinationBackend: CoordinationBackend;
  readonly coordinationScope?: string;
  readonly coordinationHolder?: string;
  readonly coordinationMode: "soft" | "hard";
  readonly coordinationTtlSeconds: number;
  readonly coordinationRequestYield: boolean;
  readonly record: boolean;
}

export type ParsedCliRequest =
  | ParsedHealthRequest
  | ParsedSessionsListRequest
  | ParsedSessionsShowRequest
  | ParsedControlSnapshotRequest
  | ParsedIdentitiesListRequest
  | ParsedIdentitiesPreflightRequest
  | ParsedWorktreesListRequest
  | ParsedWorktreesCleanupRequest
  | ParsedCoordinationLeasesListRequest
  | ParsedCoordinationLeasesAcquireRequest
  | ParsedCoordinationLeasesRenewRequest
  | ParsedCoordinationLeasesReleaseRequest
  | ParsedCoordinationInboxSendRequest
  | ParsedCoordinationInboxListRequest
  | ParsedClassifyLimitRequest
  | ParsedRouteTaskRequest;

function findRepoRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}

function sanitizePath(value: string, label: string): string {
  return sanitizeWorkspacePath(resolve(value), label);
}

function parseInteger(
  value: string | undefined,
  label: string,
  {
    minimum,
  }: {
    readonly minimum: number;
  },
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < minimum) {
    throw createCliError("argument_error", `${label} must be an integer >= ${minimum}.`);
  }
  return parsed;
}

function parseCoordinationBackend(value: string | undefined): CoordinationBackend {
  const resolved = value ?? process.env.OMNIAGENT_COORDINATION_BACKEND;
  if (resolved === undefined || resolved === "local") {
    return "local";
  }
  if (resolved === "supabase") {
    return "supabase";
  }
  throw createCliError("argument_error", "backend must be local or supabase.");
}

function parseCoordinationMode(value: string | undefined): "soft" | "hard" {
  if (value === "soft" || value === "hard") {
    return value;
  }
  throw createCliError("argument_error", "mode must be soft or hard.");
}

function parseCoordinationMessageType(
  value: string | undefined,
): "request-yield" | "announce-intent" | "handoff" | "done" {
  if (
    value === "request-yield"
    || value === "announce-intent"
    || value === "handoff"
    || value === "done"
  ) {
    return value;
  }
  throw createCliError("argument_error", "type must be request-yield, announce-intent, handoff, or done.");
}

function pickRequiredIdentifier(
  optionValue: string | undefined,
  positionals: string[],
  label: string,
): string {
  const positional = positionals[0];
  if (optionValue && positional && optionValue !== positional) {
    throw createCliError(
      "argument_error",
      `${label} was provided twice with different values.`,
    );
  }
  const resolved = optionValue ?? positional;
  if (!resolved) {
    throw createCliError("argument_error", `${label} is required.`);
  }
  if (positionals.length > 1) {
    throw createCliError("argument_error", `Unexpected extra positional arguments for ${label}.`);
  }
  return resolved;
}

function assertNoPositionals(positionals: string[], command: string): void {
  if (positionals.length > 0) {
    throw createCliError(
      "argument_error",
      `Unexpected positional arguments for ${command}.`,
      {
        positionals,
      },
    );
  }
}

function parseHeaders(values: string[] | undefined): Record<string, string> {
  if (values === undefined) {
    return {};
  }

  return Object.fromEntries(
    values.map((value) => {
      const split = value.indexOf("=");
      if (split <= 0) {
        throw createCliError(
          "argument_error",
          "Headers must be passed as key=value pairs.",
        );
      }
      const key = value.slice(0, split).trim().toLowerCase();
      const headerValue = value.slice(split + 1).trim();
      if (!key || !headerValue) {
        throw createCliError(
          "argument_error",
          "Headers must be passed as key=value pairs.",
        );
      }
      return [key, headerValue] as const;
    }),
  );
}

function parseCommandArgs(
  args: string[],
  options: ParseConfigOptions,
): {
  readonly values: Record<string, string | boolean | string[] | undefined>;
  readonly positionals: string[];
} {
  try {
    const parsed = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    return {
      values: parsed.values as Record<string, string | boolean | string[] | undefined>,
      positionals: parsed.positionals,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      throw createCliError("argument_error", error.message);
    }
    throw error;
  }
}

function stripGlobalOptions(args: string[]): {
  readonly remaining: string[];
  readonly json: boolean;
  readonly stateRoot?: string;
  readonly profilesDir?: string;
} {
  const remaining: string[] = [];
  let json = false;
  let stateRoot: string | undefined;
  let profilesDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      break;
    }

    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--state-root") {
      const next = args[index + 1];
      if (next === undefined) {
        throw createCliError("argument_error", "--state-root requires a value.");
      }
      stateRoot = next;
      index += 1;
      continue;
    }
    if (token.startsWith("--state-root=")) {
      stateRoot = token.slice("--state-root=".length);
      continue;
    }
    if (token === "--profiles-dir") {
      const next = args[index + 1];
      if (next === undefined) {
        throw createCliError("argument_error", "--profiles-dir requires a value.");
      }
      profilesDir = next;
      index += 1;
      continue;
    }
    if (token.startsWith("--profiles-dir=")) {
      profilesDir = token.slice("--profiles-dir=".length);
      continue;
    }

    remaining.push(token);
  }

  return {
    remaining,
    json,
    stateRoot,
    profilesDir,
  };
}

function buildBase<TCommand extends CliCommandKey>(
  command: TCommand,
  cwd: string,
  globals: ReturnType<typeof stripGlobalOptions>,
): ParsedCliBase & { readonly command: TCommand } {
  const repoRoot = findRepoRoot(cwd);
  return {
    command,
    json: globals.json,
    repoRoot,
    stateRoot: sanitizePath(
      globals.stateRoot ?? join(repoRoot, ".omniagent-plus", "state"),
      "state root",
    ),
    profilesDir: sanitizePath(
      globals.profilesDir ?? join(repoRoot, "fixtures", "identity", "profiles"),
      "profiles dir",
    ),
  };
}

export function parseCliArgs(
  argv: string[],
  cwd = process.cwd(),
): ParsedCliRequest {
  const globals = stripGlobalOptions(argv);
  const [first, second, ...rest] = globals.remaining;

  if (first === undefined) {
    throw createCliError("argument_error", "A command is required.");
  }

  if (first === "health") {
    const base = buildBase("health", cwd, globals);
    const parsed = parseCommandArgs(rest, {});
    assertNoPositionals(parsed.positionals, "health");
    return base;
  }

  if (first === "sessions" && (second === "list" || second === "show")) {
    if (second === "list") {
      const base = buildBase("sessions list", cwd, globals);
      const parsed = parseCommandArgs(rest, {
        limit: { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "sessions list");
      return {
        ...base,
        limit: parseInteger(parsed.values.limit as string | undefined, "limit", {
          minimum: 1,
        }),
      };
    }

    const base = buildBase("sessions show", cwd, globals);
    const parsed = parseCommandArgs(rest, {
      "session-id": { type: "string" },
    });
    return {
      ...base,
      sessionId: pickRequiredIdentifier(
        parsed.values["session-id"] as string | undefined,
        parsed.positionals,
        "session-id",
      ),
    };
  }

  if (first === "control" && second === "snapshot") {
    const base = buildBase("control snapshot", cwd, globals);
    const parsed = parseCommandArgs(rest, {});
    assertNoPositionals(parsed.positionals, "control snapshot");
    return base;
  }

  if (
    first === "identities"
    && (second === "list" || second === "preflight")
  ) {
    if (second === "list") {
      const base = buildBase("identities list", cwd, globals);
      const parsed = parseCommandArgs(rest, {});
      assertNoPositionals(parsed.positionals, "identities list");
      return base;
    }

    const base = buildBase("identities preflight", cwd, globals);
    const parsed = parseCommandArgs(rest, {
      "profile-id": { type: "string" },
      "auth-available": { type: "boolean" },
      "auth-unavailable": { type: "boolean" },
      "active-sessions": { type: "string" },
      "active-turns": { type: "string" },
      "blocked-reason": { type: "string" },
    });
    const authAvailable =
      parsed.values["auth-available"] === true
        ? true
        : parsed.values["auth-unavailable"] === true
          ? false
          : undefined;

    if (
      parsed.values["auth-available"] === true
      && parsed.values["auth-unavailable"] === true
    ) {
      throw createCliError(
        "argument_error",
        "Choose either --auth-available or --auth-unavailable.",
      );
    }

    return {
      ...base,
      profileId: pickRequiredIdentifier(
        parsed.values["profile-id"] as string | undefined,
        parsed.positionals,
        "profile-id",
      ),
      authAvailable,
      activeSessions: parseInteger(
        parsed.values["active-sessions"] as string | undefined,
        "active-sessions",
        {
          minimum: 0,
        },
      ),
      activeTurns: parseInteger(
        parsed.values["active-turns"] as string | undefined,
        "active-turns",
        {
          minimum: 0,
        },
      ),
      blockedReason: parsed.values["blocked-reason"] as string | undefined,
    };
  }

  if (
    first === "worktrees"
    && (second === "list" || second === "cleanup")
  ) {
    if (second === "list") {
      const base = buildBase("worktrees list", cwd, globals);
      const parsed = parseCommandArgs(rest, {});
      assertNoPositionals(parsed.positionals, "worktrees list");
      return base;
    }

    const base = buildBase("worktrees cleanup", cwd, globals);
    const parsed = parseCommandArgs(rest, {
      "lease-id": { type: "string" },
      "current-host": { type: "string" },
      "allow-read-only-cleanup": { type: "boolean" },
    });
    return {
      ...base,
      leaseId: pickRequiredIdentifier(
        parsed.values["lease-id"] as string | undefined,
        parsed.positionals,
        "lease-id",
      ),
      currentHost: parsed.values["current-host"] as string | undefined,
      allowReadOnlyCleanup:
        parsed.values["allow-read-only-cleanup"] === true,
    };
  }

  if (first === "coordination" && second === "leases") {
    const [action, ...actionRest] = rest;
    if (action === "list") {
      const base = buildBase("coordination leases list", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        scope: { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination leases list");
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        scope: parsed.values.scope as string | undefined,
      };
    }
    if (action === "acquire") {
      const base = buildBase("coordination leases acquire", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        holder: { type: "string" },
        scope: { type: "string" },
        mode: { type: "string" },
        "ttl-seconds": { type: "string" },
        phase: { type: "string" },
        "lease-id": { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination leases acquire");
      if (!parsed.values.holder || !parsed.values.scope || !parsed.values["ttl-seconds"]) {
        throw createCliError("argument_error", "holder, scope, and ttl-seconds are required.");
      }
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        holder: parsed.values.holder as string,
        scope: parsed.values.scope as string,
        mode: parseCoordinationMode(parsed.values.mode as string | undefined),
        ttlSeconds: parseInteger(
          parsed.values["ttl-seconds"] as string | undefined,
          "ttl-seconds",
          { minimum: 1 },
        )!,
        phase: (parsed.values.phase as string | undefined) ?? "CS-2.2",
        leaseId: parsed.values["lease-id"] as string | undefined,
      };
    }
    if (action === "renew") {
      const base = buildBase("coordination leases renew", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        "lease-id": { type: "string" },
        holder: { type: "string" },
        "ttl-seconds": { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination leases renew");
      if (!parsed.values["lease-id"] || !parsed.values.holder) {
        throw createCliError("argument_error", "lease-id and holder are required.");
      }
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        leaseId: parsed.values["lease-id"] as string,
        holder: parsed.values.holder as string,
        ttlSeconds: parseInteger(
          parsed.values["ttl-seconds"] as string | undefined,
          "ttl-seconds",
          { minimum: 1 },
        ),
      };
    }
    if (action === "release") {
      const base = buildBase("coordination leases release", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        "lease-id": { type: "string" },
        holder: { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination leases release");
      if (!parsed.values["lease-id"] || !parsed.values.holder) {
        throw createCliError("argument_error", "lease-id and holder are required.");
      }
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        leaseId: parsed.values["lease-id"] as string,
        holder: parsed.values.holder as string,
      };
    }
  }

  if (first === "coordination" && second === "inbox") {
    const [action, ...actionRest] = rest;
    if (action === "send") {
      const base = buildBase("coordination inbox send", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        type: { type: "string" },
        sender: { type: "string" },
        scope: { type: "string" },
        "target-holder": { type: "string" },
        "lease-id": { type: "string" },
        "handoff-packet-id": { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination inbox send");
      if (!parsed.values.type || !parsed.values.sender || !parsed.values.scope) {
        throw createCliError("argument_error", "type, sender, and scope are required.");
      }
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        type: parseCoordinationMessageType(parsed.values.type as string | undefined),
        sender: parsed.values.sender as string,
        scope: parsed.values.scope as string,
        targetHolder: parsed.values["target-holder"] as string | undefined,
        leaseId: parsed.values["lease-id"] as string | undefined,
        handoffPacketId: parsed.values["handoff-packet-id"] as string | undefined,
      };
    }
    if (action === "list") {
      const base = buildBase("coordination inbox list", cwd, globals);
      const parsed = parseCommandArgs(actionRest, {
        backend: { type: "string" },
        type: { type: "string" },
        scope: { type: "string" },
      });
      assertNoPositionals(parsed.positionals, "coordination inbox list");
      return {
        ...base,
        backend: parseCoordinationBackend(parsed.values.backend as string | undefined),
        type:
          parsed.values.type === undefined
            ? undefined
            : parseCoordinationMessageType(parsed.values.type as string | undefined),
        scope: parsed.values.scope as string | undefined,
      };
    }
  }

  if (first === "classify-limit") {
    const base = buildBase("classify-limit", cwd, globals);
    const parsed = parseCommandArgs([second, ...rest].filter(Boolean) as string[], {
      provider: { type: "string" },
      harness: { type: "string" },
      "status-code": { type: "string" },
      "exit-code": { type: "string" },
      "body-text": { type: "string" },
      "stderr-text": { type: "string" },
      "stdout-text": { type: "string" },
      header: { type: "string", multiple: true },
      "session-id": { type: "string" },
      "identity-profile-id": { type: "string" },
      "task-id": { type: "string" },
      record: { type: "boolean" },
    });
    assertNoPositionals(parsed.positionals, "classify-limit");
    return {
      ...base,
      provider: parsed.values.provider as string | undefined,
      harness: parsed.values.harness as string | undefined,
      statusCode: parseInteger(
        parsed.values["status-code"] as string | undefined,
        "status-code",
        {
          minimum: 0,
        },
      ),
      exitCode: parseInteger(
        parsed.values["exit-code"] as string | undefined,
        "exit-code",
        {
          minimum: 0,
        },
      ),
      bodyText: parsed.values["body-text"] as string | undefined,
      stderrText: parsed.values["stderr-text"] as string | undefined,
      stdoutText: parsed.values["stdout-text"] as string | undefined,
      headers: parseHeaders(parsed.values.header as string[] | undefined),
      sessionId: parsed.values["session-id"] as string | undefined,
      identityProfileId:
        parsed.values["identity-profile-id"] as string | undefined,
      taskId: parsed.values["task-id"] as string | undefined,
      record: parsed.values.record === true,
    };
  }

  if (first === "route-task") {
    const base = buildBase("route-task", cwd, globals);
    const parsed = parseCommandArgs([second, ...rest].filter(Boolean) as string[], {
      "task-id": { type: "string" },
      "preferred-provider": { type: "string" },
      "preferred-harness": { type: "string" },
      "preferred-identity-profile-id": { type: "string" },
      "classification-task-id": { type: "string" },
      "worktree-lease-id": { type: "string" },
      "manual-confirmation": { type: "boolean" },
      "session-continuation": { type: "boolean" },
      "handoff-evidence": { type: "boolean" },
      "raw-history-attached": { type: "boolean" },
      "local-filesystem-dependency": { type: "boolean" },
      "allow-cross-provider-migration": { type: "boolean" },
      "coordination-backend": { type: "string" },
      "coordination-scope": { type: "string" },
      "coordination-holder": { type: "string" },
      "coordination-mode": { type: "string" },
      "coordination-ttl-seconds": { type: "string" },
      "coordination-request-yield": { type: "boolean" },
      record: { type: "boolean" },
    });
    assertNoPositionals(parsed.positionals, "route-task");
    const taskId = parsed.values["task-id"] as string | undefined;
    if (!taskId) {
      throw createCliError("argument_error", "task-id is required.");
    }
    return {
      ...base,
      taskId,
      preferredProvider:
        parsed.values["preferred-provider"] as string | undefined,
      preferredHarness:
        parsed.values["preferred-harness"] as string | undefined,
      preferredIdentityProfileId:
        parsed.values["preferred-identity-profile-id"] as string | undefined,
      classificationTaskId:
        parsed.values["classification-task-id"] as string | undefined,
      worktreeLeaseId:
        parsed.values["worktree-lease-id"] as string | undefined,
      manualConfirmationProvided:
        parsed.values["manual-confirmation"] === true,
      sessionContinuation:
        parsed.values["session-continuation"] === true,
      handoffEvidence: parsed.values["handoff-evidence"] === true,
      rawHistoryAttached:
        parsed.values["raw-history-attached"] === true,
      localFilesystemDependency:
        parsed.values["local-filesystem-dependency"] === true,
      allowCrossProviderMigration:
        parsed.values["allow-cross-provider-migration"] === true
          ? true
          : undefined,
      coordinationBackend: parseCoordinationBackend(
        parsed.values["coordination-backend"] as string | undefined,
      ),
      coordinationScope:
        parsed.values["coordination-scope"] as string | undefined,
      coordinationHolder:
        parsed.values["coordination-holder"] as string | undefined,
      coordinationMode:
        parsed.values["coordination-mode"] === undefined
          ? "hard"
          : parseCoordinationMode(parsed.values["coordination-mode"] as string | undefined),
      coordinationTtlSeconds:
        parseInteger(
          parsed.values["coordination-ttl-seconds"] as string | undefined,
          "coordination-ttl-seconds",
          { minimum: 1 },
        ) ?? 300,
      coordinationRequestYield:
        parsed.values["coordination-request-yield"] === true,
      record: parsed.values.record === true,
    };
  }

  throw createCliError("argument_error", `Unknown command: ${first}${second ? ` ${second}` : ""}.`);
}
