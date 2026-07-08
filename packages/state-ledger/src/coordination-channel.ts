import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  coordinationMessageSchema,
  toContractTimestamp,
  type CoordinationMessage,
  type CoordinationMessageType,
  type ConsiliencyLeaseScope,
} from "@omniagent-plus/core-contracts";

import { getStateLedgerPaths, nowIsoString, readJsonFile, writeJsonAtomic } from "./schema.js";
import { withFilesystemLock } from "./append-only-store.js";

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

export interface CoordinationMessageQuery {
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
  readonly messages: CoordinationMessage[];
}

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

function buildMessage(input: CoordinationMessageInput): CoordinationMessage {
  const createdAt = toContractTimestamp(input.now ?? nowIsoString());
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

  constructor(options: { readonly rootDir: string }) {
    const paths = getStateLedgerPaths(options.rootDir);
    this.inboxPath = `${paths.coordinationDir}/coordination-inbox.json`;
    this.lockPath = join(paths.locksDir, "coordination.lock");
  }

  async send(message: CoordinationMessageInput): Promise<CoordinationMessageReceipt> {
    return withFilesystemLock(this.lockPath, async () => {
      const built = buildMessage(message);
      const state = await this.readState(built.created_at);
      state.messages.push(built);
      await this.writeState(state, built.created_at);
      return {
        messageId: built.message_id,
        createdAt: built.created_at,
      };
    });
  }

  async list(query: CoordinationMessageQuery = {}): Promise<readonly CoordinationMessage[]> {
    const state = await this.readState(nowIsoString());
    return state.messages
      .filter((message) => query.type === undefined || message.type === query.type)
      .filter((message) => scopeMatches(message, query.scope))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  private async readState(now: string): Promise<LocalCoordinationInboxState> {
    const existing = await readJsonFile<LocalCoordinationInboxState>(this.inboxPath);
    if (existing?.schema === "consiliency.local_coordination_inbox.v0.1") {
      return {
        ...existing,
        messages: [...existing.messages],
      };
    }
    return emptyState(now);
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
