import { consiliencyLeaseSchema, type ConsiliencyLeaseScope } from "@consiliency/runtime-provider";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CoordinationBackendError, coordinationFailureCause, validateCoordinationPage } from "@omniagent-plus/state-ledger";

import type {
  LeaseAcquireRequest,
  LeaseAcquireResult,
  LeaseQuery,
  LeaseReleaseResult,
  LeaseRenewResult,
  LeaseSnapshot,
  LeaseStore,
} from "./lease-store.js";
import { createLeaseFromAcquireRequest, normalizeLeaseScope } from "./lease-store.js";

type RpcResult<T> = {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
  readonly status?: number;
};
const failure = z.enum(["conflict", "not-holder", "not-found", "expired", "backend-unavailable"]);
const acquireSchema = z.discriminatedUnion("granted", [
  z.object({ granted: z.literal(true), lease: consiliencyLeaseSchema }),
  z.object({ granted: z.literal(false), failure, conflict: consiliencyLeaseSchema.optional() }),
]);
const renewSchema = z.discriminatedUnion("renewed", [
  z.object({ renewed: z.literal(true), lease: consiliencyLeaseSchema }),
  z.object({ renewed: z.literal(false), failure }),
]);
const releaseSchema = z.object({ released: z.boolean(), failure: failure.optional() }).superRefine((result, ctx) => {
  if (!result.released && !result.failure) ctx.addIssue({ code: "custom", message: "Missing release refusal." });
});

export interface SupabaseLeaseRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<RpcResult<unknown>>;
}

async function rpcOrUnavailable<T>(
  client: SupabaseLeaseRpcClient,
  fn: string,
  args: Record<string, unknown>,
  decode: (value: unknown) => T,
): Promise<T> {
  try {
    const response = await client.rpc(fn, args);
    if (response.error) throw new CoordinationBackendError(coordinationFailureCause({ ...response.error, status: response.status }));
    if (response.data === null || response.data === undefined || response.error !== null) throw new CoordinationBackendError("malformed-response");
    try { return decode(response.data); }
    catch { throw new CoordinationBackendError("malformed-response"); }
  } catch (error) {
    throw new CoordinationBackendError(coordinationFailureCause(error));
  }
}

export class SupabaseLeaseStore implements LeaseStore {
  private readonly client: SupabaseLeaseRpcClient;

  constructor(client: SupabaseLeaseRpcClient) {
    this.client = client;
  }

  async acquire(request: LeaseAcquireRequest): Promise<LeaseAcquireResult> {
    const lease = createLeaseFromAcquireRequest({
      ...request,
      scope: normalizeLeaseScope(request.scope),
    });
    try {
      return await rpcOrUnavailable<LeaseAcquireResult>(
        this.client,
        "coordination_acquire_lease",
        {
          request: {
            leaseId: lease.lease_id,
            holder: lease.holder,
            ttlSeconds: lease.ttl_seconds,
            mode: lease.mode,
            scope: lease.scope,
            phase: lease.phase,
            now: lease.acquired_at,
          },
        },
        (value) => acquireSchema.parse(value),
      );
    } catch (error) {
      return {
        granted: false,
        failure: "backend-unavailable",
        cause: coordinationFailureCause(error),
      };
    }
  }

  async renew(
    leaseId: string,
    holder: string,
    options: { readonly ttlSeconds?: number; readonly now?: string } = {},
  ): Promise<LeaseRenewResult> {
    try {
      return await rpcOrUnavailable<LeaseRenewResult>(
        this.client,
        "coordination_renew_lease",
        {
          request: {
            lease_id: leaseId,
            holder,
            ttl_seconds: options.ttlSeconds,
            now: options.now,
          },
        },
        (value) => renewSchema.parse(value),
      );
    } catch (error) {
      return { renewed: false, failure: "backend-unavailable", cause: coordinationFailureCause(error) };
    }
  }

  async release(
    leaseId: string,
    holder: string,
    options: { readonly now?: string } = {},
  ): Promise<LeaseReleaseResult> {
    try {
      return await rpcOrUnavailable<LeaseReleaseResult>(
        this.client,
        "coordination_release_lease",
        {
          request: {
            lease_id: leaseId,
            holder,
            now: options.now,
          },
        },
        (value) => releaseSchema.parse(value),
      );
    } catch (error) {
      return { released: false, failure: "backend-unavailable", cause: coordinationFailureCause(error) };
    }
  }

  async query(query: LeaseQuery = {}): Promise<LeaseSnapshot> {
    const page = validateCoordinationPage(query);
    if (query.mode !== undefined) z.enum(["soft", "hard"]).parse(query.mode);
    return rpcOrUnavailable<LeaseSnapshot>(
      this.client,
      "coordination_query_leases",
      {
        request: {
          lease_id: query.leaseId,
          scope: query.scope === undefined ? undefined : normalizeLeaseScope(query.scope),
          include_expired: query.includeExpired,
          now: query.now,
          mode: query.mode,
          limit: page.limit,
          cursor: page.cursor,
        },
      },
      (value) => z.object({ leases: z.array(consiliencyLeaseSchema) }).parse(value),
    );
  }

  async expire(now?: string): Promise<number> {
    const response = await rpcOrUnavailable<{ readonly expired: number }>(
      this.client,
      "coordination_expire_leases",
      now === undefined ? {} : { now_at: now },
      (value) => z.object({ expired: z.number().int().nonnegative() }).parse(value),
    );
    return response.expired;
  }
}

export function createSupabaseLeaseStore(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch?: typeof globalThis.fetch;
}): SupabaseLeaseStore {
  if (!options.url?.trim() || !options.serviceRoleKey?.trim()) throw new CoordinationBackendError("unavailable");
  try {
    const client: SupabaseClient = createClient(
    options.url,
    options.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { fetch: options.fetch },
    },
  );
    return new SupabaseLeaseStore(client);
  } catch { throw new CoordinationBackendError("validation"); }
}

export function createSupabaseLeaseStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseLeaseStore | undefined {
  const url = env.OMNIAGENT_COORDINATION_SUPABASE_URL;
  const serviceRoleKey = env.OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    return undefined;
  }
  return createSupabaseLeaseStore({ url, serviceRoleKey });
}

export function queryScopeForRepo(repoId: string): ConsiliencyLeaseScope {
  return {
    granularity: "repo",
    selector: [repoId],
  };
}
