import { coordinationFailureCause, type BackendFailureCause } from "@omniagent-plus/state-ledger";
import type {
  CoordinationMessageInput,
  CoordinationChannel,
} from "@omniagent-plus/state-ledger";
import type {
  LeaseAcquireRequest,
  LeaseStore,
} from "@omniagent-plus/worktree-leasing";
import { createLeaseFromAcquireRequest } from "@omniagent-plus/worktree-leasing";
import type { RouteDecisionLeaseArbitration } from "@consiliency/runtime-provider";

export interface LeaseArbitrationRequest extends LeaseAcquireRequest {
  readonly taskId: string;
  readonly sendYieldRequest?: boolean;
}

export interface LeaseArbitrationDecision {
  readonly routeDecision: RouteDecisionLeaseArbitration;
  readonly acquired: boolean;
  readonly launchAllowed: boolean;
  readonly inboxMessage?: CoordinationMessageInput;
  readonly cause?: BackendFailureCause;
  readonly notification?: { readonly sent: boolean; readonly cause?: BackendFailureCause };
}

export class LeaseArbiter {
  private readonly store: LeaseStore;

  private readonly channel?: CoordinationChannel;

  constructor(options: {
    readonly store: LeaseStore;
    readonly channel?: CoordinationChannel;
  }) {
    this.store = options.store;
    this.channel = options.channel;
  }

  async arbitrate(
    request: LeaseArbitrationRequest,
  ): Promise<LeaseArbitrationDecision> {
    const now = request.now;
    const lease = createLeaseFromAcquireRequest({ ...request, now });
    request = { leaseId: lease.lease_id, holder: lease.holder, ttlSeconds: lease.ttl_seconds,
      mode: lease.mode, scope: lease.scope, phase: lease.phase, now,
      taskId: request.taskId, sendYieldRequest: request.sendYieldRequest };
    let result;
    try { result = await this.store.acquire(request); }
    catch (error) { result = { granted: false as const, failure: "backend-unavailable" as const, cause: coordinationFailureCause(error) }; }

    if (result.granted && result.lease !== undefined) {
      return {
        acquired: true,
        launchAllowed: true,
        routeDecision: {
          status: "acquired",
          mode: result.lease.mode,
          leaseId: result.lease.lease_id,
          holder: result.lease.holder,
          scope: result.lease.scope,
        },
      };
    }

    if (result.failure === "backend-unavailable") {
      return {
        acquired: false,
        launchAllowed: request.mode === "soft",
        cause: result.cause ?? "unavailable",
        routeDecision: {
          status: "coordination_unavailable",
          mode: request.mode,
          holder: request.holder,
          scope: request.scope,
        },
      };
    }

    if (request.mode === "soft") {
      return {
        acquired: false,
        launchAllowed: true,
        routeDecision: {
          status: "soft_conflict",
          mode: "soft",
          conflictLeaseId: result.conflict?.lease_id,
          holder: request.holder,
          scope: request.scope,
        },
      };
    }

    const inboxMessage: CoordinationMessageInput | undefined =
      request.sendYieldRequest === true && result.conflict !== undefined
        ? {
            type: "request-yield",
            sender: request.holder,
            targetHolder: result.conflict.holder,
            leaseId: result.conflict.lease_id,
            scope: request.scope,
            body: {
              taskId: request.taskId,
              phase: request.phase,
            },
            now: request.now,
          }
        : undefined;
    let notification: LeaseArbitrationDecision["notification"];
    if (inboxMessage !== undefined) {
      if (this.channel === undefined) notification = { sent: false, cause: "unavailable" };
      else {
        try { await this.channel.send(inboxMessage); notification = { sent: true }; }
        catch (error) { notification = { sent: false, cause: coordinationFailureCause(error) }; }
      }
    }

    return {
      acquired: false,
      launchAllowed: false,
      inboxMessage,
      notification,
      routeDecision: {
        status: "blocked_hard_conflict",
        mode: "hard",
        conflictLeaseId: result.conflict?.lease_id,
        holder: request.holder,
        scope: request.scope,
      },
    };
  }
}
