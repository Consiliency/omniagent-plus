import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WorktreeLeaseManager } from "./index.js";

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

describe("lease manager", () => {
  it("rejects duplicate exclusive writers and preserves fencing, holder, ttl, and dirty-state metadata", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-manager-"));
    const manager = await WorktreeLeaseManager.open({
      rootDir,
    });

    const first = await manager.acquireLease(fixture.exclusiveWrite.request, {
      holder: fixture.exclusiveWrite.holder,
      leasePath: join(rootDir, "worktree-a"),
      dirtyState: "clean",
      now: "2026-06-30T00:00:00.000Z",
    });

    expect(first.acquired).toBe(true);
    expect(first.lease?.holder).toEqual(fixture.exclusiveWrite.holder);
    expect(
      Date.parse(first.lease!.expiresAt) - Date.parse(first.lease!.acquiredAt),
    ).toBe(120_000);

    const second = await manager.acquireLease(fixture.exclusiveWrite.request, {
      holder: {
        ...fixture.exclusiveWrite.holder,
        processId: 99999,
      },
      leasePath: join(rootDir, "worktree-b"),
      dirtyState: "clean",
      now: "2026-06-30T00:00:01.000Z",
    });

    expect(second.acquired).toBe(false);
    expect(second.existingLease?.id).toBe(first.lease?.id);

    const renewed = await manager.renewLease(first.lease!, {
      now: "2026-06-30T00:00:30.000Z",
      dirtyState: "dirty",
    });
    expect(renewed.dirtyState).toBe("dirty");
    expect(renewed.fencingToken).toBe(first.lease?.fencingToken);

    await manager.releaseLease(renewed, {
      now: "2026-06-30T00:01:00.000Z",
    });

    const reacquired = await manager.acquireLease(fixture.exclusiveWrite.request, {
      holder: fixture.exclusiveWrite.holder,
      leasePath: join(rootDir, "worktree-a"),
      dirtyState: "clean",
      now: "2026-06-30T00:01:01.000Z",
    });

    expect(reacquired.acquired).toBe(true);
    expect(reacquired.lease?.fencingToken).not.toBe(first.lease?.fencingToken);
  });
});
