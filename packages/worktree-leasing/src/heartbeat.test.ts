import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renewLeaseHeartbeat, WorktreeLeaseManager } from "./index.js";

interface LeaseFixture {
  readonly exclusiveWrite: {
    readonly request: {
      readonly repoId: string;
      readonly repoRoot: string;
      readonly baseRef: string;
      readonly branchName: string;
      readonly taskId: string;
      readonly mode: "exclusive_write";
      readonly requestedTtlSeconds: number;
    };
    readonly holder: {
      readonly processId: number;
      readonly host: string;
      readonly sessionId: string;
      readonly turnId: string;
    };
  };
}

function readFixture(): LeaseFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/leases/lease-cases.json", import.meta.url),
      "utf8",
    ),
  ) as LeaseFixture;
}

describe("heartbeat", () => {
  it("renews leases without changing the fencing token and blocks theft while the heartbeat is active", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-heartbeat-"));
    const manager = await WorktreeLeaseManager.open({
      rootDir,
    });

    const acquired = await manager.acquireLease(fixture.exclusiveWrite.request, {
      holder: fixture.exclusiveWrite.holder,
      leasePath: join(rootDir, "worktree-a"),
      dirtyState: "clean",
      now: "2026-06-30T00:00:00.000Z",
      ttlSeconds: 60,
    });
    const renewed = await renewLeaseHeartbeat(manager, acquired.lease!, {
      now: "2026-06-30T00:00:30.000Z",
      ttlSeconds: 60,
    });

    expect(renewed.fencingToken).toBe(acquired.lease?.fencingToken);
    expect(renewed.renewedAt).toBe("2026-06-30T00:00:30.000Z");
    expect(renewed.expiresAt).toBe("2026-06-30T00:01:30.000Z");

    const stolen = await manager.acquireLease(fixture.exclusiveWrite.request, {
      holder: {
        ...fixture.exclusiveWrite.holder,
        processId: 7000,
      },
      leasePath: join(rootDir, "worktree-b"),
      dirtyState: "clean",
      now: "2026-06-30T00:01:05.000Z",
    });

    expect(stolen.acquired).toBe(false);
    expect(stolen.existingLease?.fencingToken).toBe(renewed.fencingToken);
  });
});
