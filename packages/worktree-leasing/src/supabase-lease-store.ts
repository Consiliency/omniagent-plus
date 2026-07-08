import type { ConsiliencyLeaseScope } from "@omniagent-plus/core-contracts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  LeaseAcquireRequest,
  LeaseAcquireResult,
  LeaseQuery,
  LeaseReleaseResult,
  LeaseRenewResult,
  LeaseSnapshot,
  LeaseStore,
} from "./lease-store.js";
import { normalizeLeaseScope } from "./lease-store.js";

type RpcResult<T> = {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
};

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
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error !== null || data === null) {
    throw new Error(error?.message ?? `Supabase RPC ${fn} returned no data.`);
  }
  return data as T;
}

export class SupabaseLeaseStore implements LeaseStore {
  private readonly client: SupabaseLeaseRpcClient;

  constructor(client: SupabaseLeaseRpcClient) {
    this.client = client;
  }

  async acquire(request: LeaseAcquireRequest): Promise<LeaseAcquireResult> {
    try {
      return await rpcOrUnavailable<LeaseAcquireResult>(
        this.client,
        "coordination_acquire_lease",
        {
          request: {
            ...request,
            scope: normalizeLeaseScope(request.scope),
          },
        },
      );
    } catch {
      return {
        granted: false,
        failure: "backend-unavailable",
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
      );
    } catch {
      return { renewed: false, failure: "backend-unavailable" };
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
      );
    } catch {
      return { released: false, failure: "backend-unavailable" };
    }
  }

  async query(query: LeaseQuery = {}): Promise<LeaseSnapshot> {
    return rpcOrUnavailable<LeaseSnapshot>(
      this.client,
      "coordination_query_leases",
      {
        request: {
          lease_id: query.leaseId,
          scope: query.scope === undefined ? undefined : normalizeLeaseScope(query.scope),
          include_expired: query.includeExpired,
          now: query.now,
        },
      },
    );
  }

  async expire(now?: string): Promise<number> {
    const response = await rpcOrUnavailable<{ readonly expired: number }>(
      this.client,
      "coordination_expire_leases",
      now === undefined ? {} : { now_at: now },
    );
    return response.expired;
  }
}

export function createSupabaseLeaseStore(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): SupabaseLeaseStore {
  const client: SupabaseClient = createClient(
    options.url,
    options.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  return new SupabaseLeaseStore(client);
}

export function createSupabaseLeaseStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseLeaseStore | undefined {
  const url = env.OMNIAGENT_COORDINATION_SUPABASE_URL;
  const serviceRoleKey = env.OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || serviceRoleKey === undefined) {
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
