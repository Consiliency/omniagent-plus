import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  CoordinationChannel,
  CoordinationMessageInput,
  CoordinationMessageQuery,
  CoordinationMessageReceipt,
} from "./coordination-channel.js";
import { assertMetadataSafe, projectMetadataExport, coordinationMessageSchema, type CoordinationMessage } from "@consiliency/runtime-provider";

type RpcResult<T> = {
  readonly data: T | null;
  readonly error: { readonly message: string; readonly code?: string } | null;
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
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error !== null || data === null) {
    throw new Error(error?.message ?? `Supabase RPC ${fn} returned no data.`);
  }
  return data as T;
}

export class SupabaseCoordinationChannel implements CoordinationChannel {
  private readonly client: SupabaseCoordinationRpcClient;

  constructor(client: SupabaseCoordinationRpcClient) {
    this.client = client;
  }

  async send(message: CoordinationMessageInput): Promise<CoordinationMessageReceipt> {
    assertMetadataSafe(message);
    return rpcOrThrow<CoordinationMessageReceipt>(
      this.client,
      "coordination_send_message",
      { message: projectMetadataExport(message, { inertOnly: true }) },
    );
  }

  async list(query: CoordinationMessageQuery = {}): Promise<readonly CoordinationMessage[]> {
    const response = await rpcOrThrow<{ readonly messages: CoordinationMessage[] }>(
      this.client,
      "coordination_list_messages",
      { query },
    );
    return response.messages.map((message) => coordinationMessageSchema.parse(message));
  }
}

export function createSupabaseCoordinationChannel(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): SupabaseCoordinationChannel {
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
  return new SupabaseCoordinationChannel(client);
}

export function createSupabaseCoordinationChannelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseCoordinationChannel | undefined {
  const url = env.OMNIAGENT_COORDINATION_SUPABASE_URL;
  const serviceRoleKey = env.OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || serviceRoleKey === undefined) {
    return undefined;
  }
  return createSupabaseCoordinationChannel({ url, serviceRoleKey });
}
