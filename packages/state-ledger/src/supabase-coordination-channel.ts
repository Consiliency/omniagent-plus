import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  CoordinationChannel,
  CoordinationMessageInput,
  CoordinationMessageQuery,
  CoordinationMessageReceipt,
} from "./coordination-channel.js";
import { assertMetadataSafe, projectMetadataExport, coordinationMessageSchema, consiliencyLeaseScopeSchema, coordinationMessageTypes, type CoordinationMessage } from "@consiliency/runtime-provider";
import { z } from "zod";
import { CoordinationBackendError, coordinationFailureCause, validateCoordinationPage } from "./coordination-channel.js";

type RpcResult<T> = {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
  readonly status?: number;
};

export interface SupabaseCoordinationRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<RpcResult<unknown>>;
}

async function rpcOrThrow<T>(
  client: SupabaseCoordinationRpcClient,
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

export class SupabaseCoordinationChannel implements CoordinationChannel {
  private readonly client: SupabaseCoordinationRpcClient;

  constructor(client: SupabaseCoordinationRpcClient) {
    this.client = client;
  }

  async send(message: CoordinationMessageInput): Promise<CoordinationMessageReceipt> {
    assertMetadataSafe(message);
    const response = await rpcOrThrow<CoordinationMessageReceipt | { failure: "capacity" }>(
      this.client,
      "coordination_send_message",
      { message: projectMetadataExport(message, { inertOnly: true }) },
      (value) => z.union([z.object({ messageId: z.string().min(1), createdAt: z.string().datetime({ offset: true }) }),
        z.object({ failure: z.literal("capacity") }).strict()]).parse(value),
    );
    if ("failure" in response) throw new CoordinationBackendError(response.failure);
    return response;
  }

  async list(query: CoordinationMessageQuery = {}): Promise<readonly CoordinationMessage[]> {
    assertMetadataSafe(query, { inertOnly: true });
    const page = validateCoordinationPage(query);
    const scope = query.scope === undefined ? undefined : consiliencyLeaseScopeSchema.parse(query.scope);
    const type = query.type === undefined ? undefined : z.enum(coordinationMessageTypes).parse(query.type);
    const response = await rpcOrThrow<{ readonly messages: CoordinationMessage[] }>(
      this.client,
      "coordination_list_messages",
      { query: { scope, type, ...page } },
      (value) => z.object({ messages: z.array(coordinationMessageSchema) }).parse(value),
    );
    return response.messages.map((message) => coordinationMessageSchema.parse(message));
  }
}

export function createSupabaseCoordinationChannel(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch?: typeof globalThis.fetch;
}): SupabaseCoordinationChannel {
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
    return new SupabaseCoordinationChannel(client);
  } catch { throw new CoordinationBackendError("validation"); }
}

export function createSupabaseCoordinationChannelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseCoordinationChannel | undefined {
  const url = env.OMNIAGENT_COORDINATION_SUPABASE_URL;
  const serviceRoleKey = env.OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    return undefined;
  }
  return createSupabaseCoordinationChannel({ url, serviceRoleKey });
}
