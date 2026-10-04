import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  it("walks reverse-inserted UTC millisecond ties one at a time without duplicates", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-manager-pages-"));
    const manager = await WorktreeLeaseManager.open({ rootDir });
    const leases = [];
    for (let n = 0; n < 3; n += 1) leases.push((await manager.acquireLease({ ...fixture.exclusiveWrite.request, branchName: "page-" + n }, {
      holder: fixture.exclusiveWrite.holder, leasePath: join(rootDir, "tree-" + n), now: "2026-06-30T00:00:00.000Z",
    })).lease!);
    const registryPath = join(rootDir, "coordination", "worktree-lease-registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    const expected = leases.map((lease) => lease.id).sort();
    registry.records = Object.fromEntries([...expected].reverse().map((id, n) => [id, {
      ...registry.records[id], lease: { ...registry.records[id].lease,
        acquiredAt: ["2026-06-30T00:00:00.0001Z", "2026-06-29T20:00:00.0002-04:00", "2026-06-30T00:00:00.0009Z"][n] },
    }]));
    await writeFile(registryPath, JSON.stringify(registry));
    const readOnly = await WorktreeLeaseManager.open({ rootDir, readOnly: true });
    const walked = [];
    let cursor: { timestamp: string; id: string } | undefined;
    for (let n = 0; n < 4; n += 1) {
      const page = await readOnly.listActiveLeases({ limit: 1, cursor });
      if (!page.length) break;
      expect(page[0]!.acquiredAt).toBe("2026-06-30T00:00:00.000Z");
      walked.push(page[0]!.id);
      cursor = { timestamp: page[0]!.acquiredAt, id: page[0]!.id };
    }
    expect(walked).toEqual(expected);
  });
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
