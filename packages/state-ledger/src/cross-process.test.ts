import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface CrossProcessFixture {
  readonly cooldown: {
    readonly schema: "provider_family_cooldown.v0.1";
    readonly provider: "openai";
    readonly scope: "provider_family";
    readonly active: true;
    readonly reason: string;
    readonly observedAt: string;
    readonly resetAt: string;
    readonly source: "limit_classification";
  };
  readonly leaseRequest: {
    readonly repoId: string;
    readonly repoRoot: string;
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
}

function readFixture(rootDir: string): CrossProcessFixture {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../fixtures/state-ledger/cross-process/coordination-input.json", import.meta.url),
      "utf8",
    ),
  ) as CrossProcessFixture;

  return {
    ...fixture,
    leaseRequest: {
      ...fixture.leaseRequest,
      repoRoot: rootDir,
    },
  };
}

function runChild(
  rootDir: string,
  action: string,
  payload: unknown,
): Record<string, unknown> {
  const scriptPath = join(rootDir, "coordination-child.ts");
  writeFileSync(
    scriptPath,
    `
    import { CoordinationStore } from ${JSON.stringify(new URL("./coordination.ts", import.meta.url).href)};
    const store = await CoordinationStore.open({ rootDir: process.env.STATE_LEDGER_ROOT });
    const payload = JSON.parse(process.env.STATE_LEDGER_PAYLOAD);
    let result;
    if (process.env.STATE_LEDGER_ACTION === "setCooldown") {
      result = await store.setProviderCooldown(payload);
    } else if (process.env.STATE_LEDGER_ACTION === "getCooldown") {
      result = await store.getProviderCooldown(payload.provider);
    } else if (process.env.STATE_LEDGER_ACTION === "acquireLease") {
      result = await store.acquireExclusiveLease(payload.request, payload.holder, payload.options ?? {});
    } else {
      throw new Error("Unknown action");
    }
    console.log(JSON.stringify(result));
  `,
    "utf8",
  );
  const child = spawnSync(
    "pnpm",
    ["exec", "vite-node", "--script", scriptPath],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_LEDGER_ROOT: rootDir,
        STATE_LEDGER_ACTION: action,
        STATE_LEDGER_PAYLOAD: JSON.stringify(payload),
      },
      encoding: "utf8",
    },
  );

  if (child.status !== 0) {
    throw new Error(child.stderr || child.stdout || `child exited ${child.status}`);
  }

  return JSON.parse(child.stdout.trim()) as Record<string, unknown>;
}

describe("cross-process coordination", () => {
  it("shares cooldowns and prevents duplicate exclusive leases across Node processes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "state-ledger-xproc-"));
    const fixture = readFixture(rootDir);

    runChild(rootDir, "setCooldown", fixture.cooldown);
    const cooldown = runChild(rootDir, "getCooldown", {
      provider: fixture.cooldown.provider,
    });
    const firstLease = runChild(rootDir, "acquireLease", {
      request: fixture.leaseRequest,
      holder: fixture.holder,
      options: {
        leasePath: join(rootDir, "worktree-a"),
      },
    });
    const secondLease = runChild(rootDir, "acquireLease", {
      request: fixture.leaseRequest,
      holder: {
        ...fixture.holder,
        processId: 99999,
      },
      options: {
        leasePath: join(rootDir, "worktree-b"),
      },
    });

    expect(cooldown).toMatchObject({
      provider: "openai",
      active: true,
    });
    expect(firstLease.acquired).toBe(true);
    expect(secondLease.acquired).toBe(false);
    expect(secondLease.existingLease).toBeTruthy();
  });
});
