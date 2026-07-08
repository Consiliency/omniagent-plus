import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LocalLeaseStore,
  leaseScopesOverlap,
  normalizeLeaseScope,
} from "./lease-store.js";
import { SupabaseLeaseStore, type SupabaseLeaseRpcClient } from "./supabase-lease-store.js";

const holderA = "display:100:session-a";
const holderB = "claw:200:session-b";

function request(holder: string, selector: string[], mode: "soft" | "hard" = "hard") {
  return {
    holder,
    ttlSeconds: 60,
    mode,
    scope: {
      granularity: "path-set" as const,
      selector,
    },
    phase: "CS-2.2",
    now: "2026-07-08T21:00:00Z",
  };
}

function writeLocalLeaseAcquireChildScript(rootDir: string): string {
  const scriptPath = join(rootDir, "local-lease-acquire-child.ts");
  writeFileSync(
    scriptPath,
    `
    import { LocalLeaseStore } from ${JSON.stringify(new URL("./lease-store.ts", import.meta.url).href)};

    const store = new LocalLeaseStore({ rootDir: process.env.STATE_ROOT });
    const result = await store.acquire({
      holder: process.env.HOLDER,
      ttlSeconds: 60,
      mode: "hard",
      scope: {
        granularity: "path-set",
        selector: JSON.parse(process.env.SELECTOR),
      },
      phase: "CS-2.2",
      now: "2026-07-08T21:00:00Z",
    });
    console.log(JSON.stringify(result));
  `,
    "utf8",
  );
  return scriptPath;
}

async function acquireFromChild(
  scriptPath: string,
  stateRoot: string,
  holder: string,
  selector: readonly string[],
) {
  const child = spawn("pnpm", ["exec", "vite-node", "--script", scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STATE_ROOT: stateRoot,
      HOLDER: holder,
      SELECTOR: JSON.stringify(selector),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) {
    throw new Error(`local lease child exited ${code}: ${stderr}`);
  }
  return JSON.parse(stdout.trim()) as {
    readonly granted: boolean;
    readonly failure?: string;
  };
}

describe("lease store scope overlap", () => {
  it("detects repo, ancestor, descendant, and symbol overlap", () => {
    expect(leaseScopesOverlap(
      { granularity: "repo", selector: ["omniagent-plus"] },
      { granularity: "path-set", selector: ["packages/cli"] },
    )).toBe(true);
    expect(leaseScopesOverlap(
      { granularity: "path-set", selector: ["packages"] },
      { granularity: "path-set", selector: ["packages/cli/src"] },
    )).toBe(true);
    expect(leaseScopesOverlap(
      { granularity: "symbol", selector: ["LeaseStore.acquire"] },
      { granularity: "symbol", selector: ["LeaseStore.release"] },
    )).toBe(false);
    expect(normalizeLeaseScope({
      granularity: "path-set",
      selector: ["packages/cli/", "packages/cli"],
    }).selector).toEqual(["packages/cli"]);
  });
});

describe("local lease store conformance", () => {
  it("rejects overlapping hard acquires but permits non-overlap and soft intent", async () => {
    const store = new LocalLeaseStore({
      rootDir: await mkdtemp(join(tmpdir(), "lease-store-")),
    });
    const first = await store.acquire(request(holderA, ["packages"]));
    const second = await store.acquire(request(holderB, ["packages/cli"]));
    const third = await store.acquire(request(holderB, ["docs"]));
    const soft = await store.acquire(request(holderB, ["packages/cli"], "soft"));

    expect(first.granted).toBe(true);
    expect(second).toMatchObject({ granted: false, failure: "conflict" });
    expect(third.granted).toBe(true);
    expect(soft.granted).toBe(true);
  });

  it("renews, rejects non-holder release, expires, and allows reacquire", async () => {
    const store = new LocalLeaseStore({
      rootDir: await mkdtemp(join(tmpdir(), "lease-store-")),
    });
    const acquired = await store.acquire(request(holderA, ["packages"]));
    expect(acquired.lease).toBeDefined();

    const renewed = await store.renew(acquired.lease!.lease_id, holderA, {
      now: "2026-07-08T21:00:30Z",
    });
    const rejectedRelease = await store.release(acquired.lease!.lease_id, holderB, {
      now: "2026-07-08T21:00:31Z",
    });
    const expired = await store.expire("2026-07-08T21:01:31Z");
    const reacquired = await store.acquire({
      ...request(holderB, ["packages"]),
      now: "2026-07-08T21:01:32Z",
    });

    expect(renewed.renewed).toBe(true);
    expect(rejectedRelease).toMatchObject({ released: false, failure: "not-holder" });
    expect(expired).toBe(1);
    expect(reacquired.granted).toBe(true);
  });

  it("serializes cross-process hard acquire attempts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-store-race-"));
    const stateRoot = join(rootDir, "state");
    const scriptPath = writeLocalLeaseAcquireChildScript(rootDir);
    const results = await Promise.all([
      acquireFromChild(scriptPath, stateRoot, holderA, ["packages"]),
      acquireFromChild(scriptPath, stateRoot, holderB, ["packages/cli"]),
    ]);

    expect(results.filter((result) => result.granted)).toHaveLength(1);
    expect(results.filter((result) => result.failure === "conflict")).toHaveLength(1);
  });

  it("keeps local read-check-write mutations behind the filesystem lock", () => {
    const source = readFileSync(new URL("./lease-store.ts", import.meta.url), "utf8");

    expect(source).toContain("withFilesystemLock(this.lockPath");
    expect(source).toContain('join(paths.locksDir, "coordination.lock")');
  });
});

describe("Supabase lease store RPC mapping", () => {
  it("uses RPC acquire so hard-mode atomicity lives in the database transaction", async () => {
    const calls: string[] = [];
    const client: SupabaseLeaseRpcClient = {
      async rpc(fn, args) {
        calls.push(`${fn}:${JSON.stringify(args)}`);
        return {
          data: {
            granted: true,
            lease: {
              schema: "consiliency.lease.v1",
              lease_id: "lease:rpc",
              holder: holderA,
              acquired_at: "2026-07-08T21:00:00Z",
              ttl_seconds: 60,
              heartbeat_at: "2026-07-08T21:00:00Z",
              mode: "hard",
              scope: { granularity: "path-set", selector: ["packages"] },
              phase: "CS-2.2",
            },
          },
          error: null,
        };
      },
    };
    const store = new SupabaseLeaseStore(client);
    const result = await store.acquire(request(holderA, ["packages/", "packages"]));

    expect(result.granted).toBe(true);
    expect(calls[0]).toContain("coordination_acquire_lease");
    expect(calls[0]).toContain('"selector":["packages"]');
  });

  it("passes explicit expiry time with the Supabase RPC parameter name", async () => {
    const calls: string[] = [];
    const client: SupabaseLeaseRpcClient = {
      async rpc(fn, args) {
        calls.push(`${fn}:${JSON.stringify(args)}`);
        return {
          data: { expired: 0 },
          error: null,
        };
      },
    };
    const store = new SupabaseLeaseStore(client);

    await store.expire("2026-07-08T21:02:00Z");

    expect(calls[0]).toContain("coordination_expire_leases");
    expect(calls[0]).toContain('"now_at":"2026-07-08T21:02:00Z"');
  });

  it("keeps Supabase hard lease arbitration serialized in the migration", () => {
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20260708215513_coordination_leases.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'))");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.coordination_acquire_lease(jsonb)");
    expect(migration).toContain("grant execute on function public.coordination_acquire_lease(jsonb) to service_role");
    expect(migration).toContain("alter table public.coordination_current_leases enable row level security");
    expect(migration).toContain("coalesce((request->>'now')::timestamptz, now()) < heartbeat_at");
    expect(migration).toContain("rtrim(left_value, '/') = rtrim(right_value, '/')");
  });
});
