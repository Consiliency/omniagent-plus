import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { cleanupLeasedWorktree, WorktreeLeaseManager } from "./index.js";

interface RaceFixture {
  readonly branchName: string;
  readonly repoId: string;
  readonly taskId: string;
}

function readFixture(): RaceFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/worktree/races/race-cases.json", import.meta.url),
      "utf8",
    ),
  ) as RaceFixture;
}

function writeChildScript(rootDir: string): string {
  const scriptPath = join(rootDir, "race-child.ts");
  writeFileSync(
    scriptPath,
    `
    import { WorktreeLeaseManager } from ${JSON.stringify(new URL("./lease-manager.ts", import.meta.url).href)};

    const manager = await WorktreeLeaseManager.open({ rootDir: process.env.STATE_ROOT });
    const result = await manager.acquireLease(
      JSON.parse(process.env.LEASE_REQUEST),
      JSON.parse(process.env.LEASE_OPTIONS),
    );

    if (process.env.HOLD_OPEN === "1" && result.acquired) {
      console.log(JSON.stringify(result));
      await new Promise((resolve) => {
        process.stdin.once("data", () => resolve(undefined));
      });
      await manager.releaseLease(result.lease, { now: "2026-06-30T00:10:00.000Z" });
    } else {
      console.log(JSON.stringify(result));
    }
  `,
    "utf8",
  );

  return scriptPath;
}

describe("race proof", () => {
  it("prevents duplicate exclusive writers and blocks cleanup of active or dirty worktrees during a race", async () => {
    const fixture = readFixture();
    const rootDir = await mkdtemp(join(tmpdir(), "worktree-race-"));
    const stateRoot = join(rootDir, "ledger");
    const worktreePath = join(rootDir, "worktree");
    await mkdir(worktreePath, { recursive: true });
    const scriptPath = writeChildScript(rootDir);
    const request = {
      repoId: fixture.repoId,
      repoRoot: join(rootDir, "repo"),
      baseRef: "main",
      branchName: fixture.branchName,
      taskId: fixture.taskId,
      mode: "exclusive_write" as const,
      requestedTtlSeconds: 120,
    };
    const firstHolder = {
      processId: 7777,
      host: "display",
      sessionId: "session-race",
      turnId: "turn-race-1",
    };
    const firstChild = spawn(
      "pnpm",
      ["exec", "vite-node", "--script", scriptPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STATE_ROOT: stateRoot,
          LEASE_REQUEST: JSON.stringify(request),
          LEASE_OPTIONS: JSON.stringify({
            holder: firstHolder,
            leasePath: worktreePath,
            dirtyState: "clean",
            now: "2026-06-30T00:00:00.000Z",
          }),
          HOLD_OPEN: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const [readyBuffer] = (await once(firstChild.stdout, "data")) as [Buffer];
    const firstResult = JSON.parse(readyBuffer.toString("utf8").trim()) as {
      readonly acquired: boolean;
      readonly lease: {
        readonly id: string;
        readonly fencingToken: string;
        readonly holder: typeof firstHolder;
        readonly branchName: string;
        readonly repoId: string;
        readonly path: string;
        readonly mode: "exclusive_write";
        readonly acquiredAt: string;
        readonly renewedAt: string;
        readonly expiresAt: string;
        readonly dirtyState: "clean";
      };
    };
    const second = spawnSync(
      "pnpm",
      ["exec", "vite-node", "--script", scriptPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          STATE_ROOT: stateRoot,
          LEASE_REQUEST: JSON.stringify(request),
          LEASE_OPTIONS: JSON.stringify({
            holder: {
              ...firstHolder,
              processId: 8888,
            },
            leasePath: worktreePath,
            dirtyState: "clean",
            now: "2026-06-30T00:00:01.000Z",
          }),
          HOLD_OPEN: "0",
        },
        encoding: "utf8",
      },
    );

    expect(firstResult.acquired).toBe(true);
    const secondResult = JSON.parse(second.stdout.trim()) as {
      readonly acquired: boolean;
    };
    expect(secondResult.acquired).toBe(false);

    const manager = await WorktreeLeaseManager.open({
      rootDir: stateRoot,
    });
    const activeCleanup = await cleanupLeasedWorktree(manager, firstResult.lease, {
      activeFencingToken: firstResult.lease.fencingToken,
      currentHost: "display",
      processLiveness: {
        state: "alive",
        processId: firstResult.lease.holder.processId,
        holderHost: "display",
        currentHost: "display",
        sameHost: true,
      },
      worktreePath,
    });
    const dirtyCleanup = await cleanupLeasedWorktree(manager, firstResult.lease, {
      activeFencingToken: firstResult.lease.fencingToken,
      currentHost: "display",
      processLiveness: {
        state: "missing",
        processId: firstResult.lease.holder.processId,
        holderHost: "display",
        currentHost: "display",
        sameHost: true,
      },
      dirtyState: "dirty",
      worktreePath,
    });

    expect(activeCleanup.reason).toBe("active_process");
    expect(dirtyCleanup.reason).toBe("dirty_worktree");

    firstChild.stdin.end("\n");
    await once(firstChild, "exit");
  });
});
