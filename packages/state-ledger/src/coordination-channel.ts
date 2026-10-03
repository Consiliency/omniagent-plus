import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  coordinationMessageSchema,
  assertMetadataSafe,
  toContractTimestamp,
  type CoordinationMessage,
  type CoordinationMessageType,
  type ConsiliencyLeaseScope,
} from "@consiliency/runtime-provider";

import { getStateLedgerPaths, readJsonFile, writeJsonAtomic } from "./schema.js";
import { withFilesystemLock } from "./append-only-store.js";
import { z } from "zod";

export type BackendFailureCause = "authentication" | "permission" | "timeout" | "transport" | "validation" | "malformed-response" | "unavailable" | "capacity";
export class CoordinationBackendError extends Error {
  constructor(readonly failureCause: BackendFailureCause) {
    super("Coordination backend " + failureCause + ".");
    this.name = "CoordinationBackendError";
  }
}
export interface CoordinationPage {
  readonly limit?: number;
  readonly cursor?: { readonly timestamp: string; readonly id: string };
}
export function validateCoordinationPage(query: CoordinationPage): { limit: number; cursor?: { timestamp: string; id: string } } {
  const parsed = z.object({ limit: z.number().int().min(1).max(500).default(100),
    cursor: z.object({ timestamp: z.string().datetime({ offset: true }), id: z.string().min(1) }).strict().optional(),
  }).parse({ limit: query.limit, cursor: query.cursor });
  return { ...parsed, cursor: parsed.cursor && { ...parsed.cursor, timestamp: toContractTimestamp(parsed.cursor.timestamp) } };
}
export function compareCoordinationTuple(a: { timestamp: string; id: string }, b: { timestamp: string; id: string }): number {
  return a.timestamp.localeCompare(b.timestamp) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
}
export function coordinationFailureCause(error: unknown): BackendFailureCause {
  if (error instanceof CoordinationBackendError) return error.failureCause;
  if (error instanceof z.ZodError || error instanceof TypeError && /URL/i.test(error.message)) return "validation";
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
    if (value.status === 401 || value.code === "PGRST301" || value.code === "PGRST302") return "authentication";
    if (value.status === 403 || value.code === "42501") return "permission";
    if (typeof value.code === "string" && /^(22|23)/.test(value.code)) return "validation";
    if (value.code === "P0001" && typeof value.message === "string" && /capacity/i.test(value.message)) return "capacity";
    if (value.code === "57014" || value.code === "55P03" || value.name === "AbortError" || value.name === "TimeoutError" || typeof value.message === "string" && /AbortError|TimeoutError|timed out/i.test(value.message)) return "timeout";
  }
  return "transport";
}

export interface CoordinationMessageInput {
  readonly type: CoordinationMessageType;
  readonly sender: string;
  readonly scope: ConsiliencyLeaseScope;
  readonly targetHolder?: string;
  readonly leaseId?: string;
  readonly handoffPacketId?: string;
  readonly body?: Record<string, unknown>;
  readonly now?: string;
}

export interface CoordinationMessageReceipt {
  readonly messageId: string;
  readonly createdAt: string;
}

export interface CoordinationMessageQuery extends CoordinationPage {
  readonly scope?: ConsiliencyLeaseScope;
  readonly type?: CoordinationMessageType;
}

export interface CoordinationChannel {
  send(message: CoordinationMessageInput): Promise<CoordinationMessageReceipt>;
  list(query?: CoordinationMessageQuery): Promise<readonly CoordinationMessage[]>;
  subscribe?(
    query: CoordinationMessageQuery,
    handler: (message: CoordinationMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
}

interface LocalCoordinationInboxState {
  readonly schema: "consiliency.local_coordination_inbox.v0.1";
  readonly updatedAt: string;
  messages: CoordinationMessage[];
}
const inboxSchema = z.object({ schema: z.literal("consiliency.local_coordination_inbox.v0.1"),
  updatedAt: z.string().datetime({ offset: true }), messages: z.array(coordinationMessageSchema),
}).strict();
const INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function emptyState(now: string): LocalCoordinationInboxState {
  return {
    schema: "consiliency.local_coordination_inbox.v0.1",
    updatedAt: now,
    messages: [],
  };
}

function selectorsIntersect(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.some((selector) => right.includes(selector));
}

function pathOverlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function scopeMatches(
  message: CoordinationMessage,
  scope: ConsiliencyLeaseScope | undefined,
): boolean {
  if (scope === undefined) {
    return true;
  }
  if (message.scope.granularity === "repo" || scope.granularity === "repo") {
    return true;
  }
  return (
    message.scope.granularity === scope.granularity
    && (
      message.scope.granularity === "path-set"
        ? message.scope.selector.some((leftSelector) =>
            scope.selector.some((rightSelector) => pathOverlaps(leftSelector, rightSelector)),
          )
        : selectorsIntersect(message.scope.selector, scope.selector)
    )
  );
}

function buildMessage(input: CoordinationMessageInput, now: string): CoordinationMessage {
  assertMetadataSafe(input, { inertOnly: true });
  assertMetadataSafe(input);
  input = JSON.parse(JSON.stringify(input)) as CoordinationMessageInput;
  const createdAt = toContractTimestamp(now);
  return coordinationMessageSchema.parse({
    schema: "consiliency.coordination_message.v1",
    message_id: `msg:${randomUUID()}`,
    type: input.type,
    sender: input.sender,
    created_at: createdAt,
    scope: input.scope,
    target_holder: input.targetHolder,
    lease_id: input.leaseId,
    handoff_packet_id: input.handoffPacketId,
    body: input.body,
  });
}

export class LocalCoordinationChannel implements CoordinationChannel {
  private readonly inboxPath: string;

  private readonly lockPath: string;
  private readonly clock: () => Date;

  constructor(options: { readonly rootDir: string; readonly clock?: () => Date }) {
    const paths = getStateLedgerPaths(options.rootDir);
    this.inboxPath = `${paths.coordinationDir}/coordination-inbox.json`;
    this.lockPath = join(paths.locksDir, "coordination.lock");
    this.clock = options.clock ?? (() => new Date());
  }

  async send(message: CoordinationMessageInput): Promise<CoordinationMessageReceipt> {
    assertMetadataSafe(message, { inertOnly: true });
    return withFilesystemLock(this.lockPath, async () => {
      assertMetadataSafe(message, { inertOnly: true });
      const now = toContractTimestamp(this.clock());
      const state = await this.readState(now);
      const built = buildMessage(message, now);
      state.messages = state.messages.map((entry) => ({ ...entry, created_at: Date.parse(entry.created_at) > Date.parse(now) ? now : toContractTimestamp(entry.created_at) }))
        .filter((entry) => Date.parse(entry.created_at) > Date.parse(now) - INBOX_TTL_MS);
      if (state.messages.length >= 10000) throw new CoordinationBackendError("capacity");
      state.messages.push(built);
      await this.writeState(state, now);
      return {
        messageId: built.message_id,
        createdAt: built.created_at,
      };
    });
  }

  async list(query: CoordinationMessageQuery = {}): Promise<readonly CoordinationMessage[]> {
    const page = validateCoordinationPage(query);
    const now = toContractTimestamp(this.clock());
    const state = await this.readState(now);
    return state.messages.map((message) => ({ ...message, created_at: toContractTimestamp(message.created_at) }))
      .filter((message) => Date.parse(message.created_at) > Date.parse(now) - INBOX_TTL_MS)
      .filter((message) => query.type === undefined || message.type === query.type)
      .filter((message) => scopeMatches(message, query.scope))
      .sort((left, right) => compareCoordinationTuple({ timestamp: left.created_at, id: left.message_id }, { timestamp: right.created_at, id: right.message_id }))
      .filter((message) => !page.cursor || compareCoordinationTuple({ timestamp: message.created_at, id: message.message_id }, page.cursor) > 0).slice(0, page.limit);
  }

  private async readState(now: string): Promise<LocalCoordinationInboxState> {
    const existing = await readJsonFile<unknown>(this.inboxPath);
    return existing === undefined ? emptyState(now) : inboxSchema.parse(existing);
  }

  private async writeState(
    state: LocalCoordinationInboxState,
    now: string,
  ): Promise<void> {
    await writeJsonAtomic(this.inboxPath, {
      ...state,
      updatedAt: now,
    });
  }
}
