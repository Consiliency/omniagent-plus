import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalCoordinationChannel } from "@omniagent-plus/state-ledger";
import { LocalLeaseStore } from "@omniagent-plus/worktree-leasing";
import { describe, expect, it } from "vitest";

import { LeaseArbiter } from "./lease-arbiter.js";

const scope = {
  granularity: "path-set" as const,
  selector: ["packages/coordinator"],
};

describe("lease arbiter", () => {
  it("preserves hard refusal when its advisory notification fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-arbiter-notification-"));
    const store = new LocalLeaseStore({ rootDir });
    await store.acquire({ holder: "a", ttlSeconds: 60, mode: "hard", scope, phase: "COORD" });
    const arbiter = new LeaseArbiter({ store, channel: { send: async () => { throw { status: 403 }; }, list: async () => [] } });
    const decision = await arbiter.arbitrate({ taskId: "t", holder: "b", ttlSeconds: 60, mode: "hard", scope, phase: "COORD", sendYieldRequest: true });
    expect(decision.launchAllowed).toBe(false);
    expect(decision.routeDecision.status).toBe("blocked_hard_conflict");
    expect(decision.notification).toEqual({ sent: false, cause: "permission" });
    expect((await store.query()).leases[0]?.holder).toBe("a");
  });
  it("acquires a hard lease and returns route metadata", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-arbiter-"));
    const arbiter = new LeaseArbiter({
      store: new LocalLeaseStore({ rootDir }),
    });

    const decision = await arbiter.arbitrate({
      taskId: "task-1",
      holder: "holder-a",
      ttlSeconds: 60,
      mode: "hard",
      scope,
      phase: "CS-2.2",
      now: "2026-07-08T21:00:00Z",
    });

    expect(decision.launchAllowed).toBe(true);
    expect(decision.routeDecision).toMatchObject({
      status: "acquired",
      mode: "hard",
    });
  });

  it("blocks hard conflicts and sends request-yield without releasing the lease", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-arbiter-"));
    const store = new LocalLeaseStore({ rootDir });
    const channel = new LocalCoordinationChannel({ rootDir });
    await store.acquire({
      holder: "holder-a",
      ttlSeconds: 60,
      mode: "hard",
      scope,
      phase: "CS-2.2",
      now: "2026-07-08T21:00:00Z",
    });
    const arbiter = new LeaseArbiter({ store, channel });

    const decision = await arbiter.arbitrate({
      taskId: "task-2",
      holder: "holder-b",
      ttlSeconds: 60,
      mode: "hard",
      scope,
      phase: "CS-2.2",
      sendYieldRequest: true,
      now: "2026-07-08T21:00:05Z",
    });
    const messages = await channel.list({ type: "request-yield" });
    const leases = await store.query({ scope, now: "2026-07-08T21:00:06Z" });

    expect(decision.launchAllowed).toBe(false);
    expect(decision.routeDecision.status).toBe("blocked_hard_conflict");
    expect(messages).toHaveLength(1);
    expect(leases.leases).toHaveLength(1);
    expect(leases.leases[0]?.holder).toBe("holder-a");
  });
});
