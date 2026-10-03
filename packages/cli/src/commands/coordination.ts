import {
  consiliencyLeaseScopeSchema,
  expiresAtForLease,
  type ConsiliencyLease,
  type ConsiliencyLeaseScope,
} from "@consiliency/runtime-provider";
import {
  createSupabaseCoordinationChannelFromEnv,
  LocalCoordinationChannel,
  type CoordinationChannel,
} from "@omniagent-plus/state-ledger";
import {
  createSupabaseLeaseStoreFromEnv,
  LocalLeaseStore,
  type LeaseStore,
} from "@omniagent-plus/worktree-leasing";

import type {
  CoordinationBackend,
  ParsedCliRequest,
  ParsedCoordinationInboxListRequest,
  ParsedCoordinationInboxSendRequest,
  ParsedCoordinationLeasesAcquireRequest,
  ParsedCoordinationLeasesListRequest,
  ParsedCoordinationLeasesReleaseRequest,
  ParsedCoordinationLeasesRenewRequest,
} from "../args.js";
import { createCliError } from "../errors.js";
import {
  coordinationInboxListResultSchema,
  coordinationInboxSendResultSchema,
  coordinationLeasesAcquireResultSchema,
  coordinationLeasesListResultSchema,
  coordinationLeasesReleaseResultSchema,
  coordinationLeasesRenewResultSchema,
  type CliContext,
} from "../types.js";

export function parseCoordinationScope(value: string): ConsiliencyLeaseScope {
  const split = value.indexOf(":");
  if (split <= 0) {
    throw createCliError("argument_error", "scope must use granularity:selector.");
  }
  return consiliencyLeaseScopeSchema.parse({
    granularity: value.slice(0, split),
    selector: value.slice(split + 1).split(",").map((entry) => entry.trim()).filter(Boolean),
  });
}

function summarizeLease(lease: ConsiliencyLease) {
  return {
    ...lease,
    expires_at: expiresAtForLease(lease),
  };
}

function leaseStore(
  backend: CoordinationBackend,
  stateRoot: string,
  hostEnv?: Readonly<Record<string, string | undefined>>,
): LeaseStore {
  if (backend === "local") {
    return new LocalLeaseStore({ rootDir: stateRoot });
  }
  const store = createSupabaseLeaseStoreFromEnv(hostEnv);
  if (store === undefined) {
    throw createCliError(
      "route_block",
      "Supabase coordination backend is unavailable.",
      {
        cause: "unavailable",
        missingEnv: [
          "OMNIAGENT_COORDINATION_SUPABASE_URL",
          "OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY",
        ],
      },
    );
  }
  return store;
}

function channel(
  backend: CoordinationBackend,
  stateRoot: string,
  hostEnv?: Readonly<Record<string, string | undefined>>,
): CoordinationChannel {
  if (backend === "local") {
    return new LocalCoordinationChannel({ rootDir: stateRoot });
  }
  const supabaseChannel = createSupabaseCoordinationChannelFromEnv(hostEnv);
  if (supabaseChannel === undefined) {
    throw createCliError(
      "route_block",
      "Supabase coordination backend is unavailable.",
      {
        cause: "unavailable",
        missingEnv: [
          "OMNIAGENT_COORDINATION_SUPABASE_URL",
          "OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY",
        ],
      },
    );
  }
  return supabaseChannel;
}

async function runLeasesList(request: ParsedCoordinationLeasesListRequest, context?: CliContext) {
  const store = leaseStore(request.backend, request.stateRoot, context?.hostEnv);
  const snapshot = await store.query({
    scope: request.scope === undefined ? undefined : parseCoordinationScope(request.scope),
    limit: request.limit,
    cursor: request.cursor,
  });
  return coordinationLeasesListResultSchema.parse({
    schema: "cli.coordination.leases.list.result.v0.1",
    backend: request.backend,
    count: snapshot.leases.length,
    leases: snapshot.leases.map(summarizeLease),
  });
}

async function runLeasesAcquire(request: ParsedCoordinationLeasesAcquireRequest, context?: CliContext) {
  const store = leaseStore(request.backend, request.stateRoot, context?.hostEnv);
  const result = await store.acquire({
    leaseId: request.leaseId,
    holder: request.holder,
    ttlSeconds: request.ttlSeconds,
    mode: request.mode,
    scope: parseCoordinationScope(request.scope),
    phase: request.phase,
  });
  const payload = coordinationLeasesAcquireResultSchema.parse({
    schema: "cli.coordination.leases.acquire.result.v0.1",
    backend: request.backend,
    granted: result.granted,
    lease: result.lease === undefined ? undefined : summarizeLease(result.lease),
    conflict: result.conflict === undefined ? undefined : summarizeLease(result.conflict),
    failure: result.failure,
    cause: result.cause,
  });
  if (!result.granted && request.mode === "hard") {
    throw createCliError("route_block", `Lease acquire blocked: ${result.failure ?? "conflict"}.`, {
      result: payload,
    });
  }
  return payload;
}

async function runLeasesRenew(request: ParsedCoordinationLeasesRenewRequest, context?: CliContext) {
  const store = leaseStore(request.backend, request.stateRoot, context?.hostEnv);
  const result = await store.renew(request.leaseId, request.holder, {
    ttlSeconds: request.ttlSeconds,
  });
  return coordinationLeasesRenewResultSchema.parse({
    schema: "cli.coordination.leases.renew.result.v0.1",
    backend: request.backend,
    renewed: result.renewed,
    lease: result.lease === undefined ? undefined : summarizeLease(result.lease),
    failure: result.failure,
    cause: result.cause,
  });
}

async function runLeasesRelease(request: ParsedCoordinationLeasesReleaseRequest, context?: CliContext) {
  const store = leaseStore(request.backend, request.stateRoot, context?.hostEnv);
  const result = await store.release(request.leaseId, request.holder);
  return coordinationLeasesReleaseResultSchema.parse({
    schema: "cli.coordination.leases.release.result.v0.1",
    backend: request.backend,
    released: result.released,
    failure: result.failure,
    cause: result.cause,
  });
}

async function runInboxSend(request: ParsedCoordinationInboxSendRequest, context?: CliContext) {
  const inbox = channel(request.backend, request.stateRoot, context?.hostEnv);
  const receipt = await inbox.send({
    type: request.type,
    sender: request.sender,
    scope: parseCoordinationScope(request.scope),
    targetHolder: request.targetHolder,
    leaseId: request.leaseId,
    handoffPacketId: request.handoffPacketId,
  });
  return coordinationInboxSendResultSchema.parse({
    schema: "cli.coordination.inbox.send.result.v0.1",
    backend: request.backend,
    ...receipt,
  });
}

async function runInboxList(request: ParsedCoordinationInboxListRequest, context?: CliContext) {
  const inbox = channel(request.backend, request.stateRoot, context?.hostEnv);
  const messages = await inbox.list({
    scope: request.scope === undefined ? undefined : parseCoordinationScope(request.scope),
    type: request.type,
    limit: request.limit,
    cursor: request.cursor,
  });
  return coordinationInboxListResultSchema.parse({
    schema: "cli.coordination.inbox.list.result.v0.1",
    backend: request.backend,
    count: messages.length,
    messages,
  });
}

export async function runCoordinationCommand(request: ParsedCliRequest, context?: CliContext) {
  switch (request.command) {
    case "coordination leases list":
      return runLeasesList(request, context);
    case "coordination leases acquire":
      return runLeasesAcquire(request, context);
    case "coordination leases renew":
      return runLeasesRenew(request, context);
    case "coordination leases release":
      return runLeasesRelease(request, context);
    case "coordination inbox send":
      return runInboxSend(request, context);
    case "coordination inbox list":
      return runInboxList(request, context);
    default:
      throw createCliError("internal_failure", "coordination command dispatch received an unexpected request.");
  }
}
