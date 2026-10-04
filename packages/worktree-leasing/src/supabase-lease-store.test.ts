import { spawnOwned as spawn, waitExit, cleanupChild } from "../../../tests/helpers/guard-process.js";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LocalLeaseStore,
  leaseScopesOverlap,
  normalizeLeaseScope,
  createLeaseFromAcquireRequest,
} from "./lease-store.js";
import { SupabaseLeaseStore, createSupabaseLeaseStore, createSupabaseLeaseStoreFromEnv, type SupabaseLeaseRpcClient } from "./supabase-lease-store.js";

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
  try {
  const code = await waitExit(child);
  if (code !== 0) {
    throw new Error(`local lease child exited ${code}: ${stderr}`);
  }
  return JSON.parse(stdout.trim()) as {
    readonly granted: boolean;
    readonly failure?: string;
  };
  } finally { await cleanupChild(child); }
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
  it("rejects invalid mutations before creating state or a physical lock", async () => {
    const rootDir = join(await mkdtemp(join(tmpdir(), "lease-store-invalid-")), "absent");
    const store = new LocalLeaseStore({ rootDir });
    for (const patch of [{ holder: "" }, { ttlSeconds: 7201 }, { ttlSeconds: 1.5 }, { now: "invalid" }]) {
      await expect(store.acquire({ ...request(holderA, ["packages"]), ...patch })).rejects.toThrow();
    }
    await expect(store.renew("lease", holderA, { ttlSeconds: 7201 })).rejects.toThrow();
    await expect(store.renew("lease", "")).rejects.toThrow();
    await expect(store.release("lease", "")).rejects.toThrow();
    await expect(access(rootDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await store.acquire({ ...request(holderA, ["packages"]), ttlSeconds: 7200 })).granted).toBe(true);
  });
  it("walks tied leases, filters hard mode before pagination, and reads without creating a lock", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-store-page-"));
    const store = new LocalLeaseStore({ rootDir });
    await mkdir(join(rootDir, "coordination"));
    const leases = Object.fromEntries(Array.from({ length: 103 }, (_, index) => {
      const lease = createLeaseFromAcquireRequest({ ...request(holderA, ["packages"], index === 102 ? "hard" : "soft"), leaseId: index === 102 ? "lease:999" : "lease:" + String(101 - index).padStart(3, "0") });
      return [lease.lease_id, lease];
    }));
    const path = join(rootDir, "coordination", "consiliency-leases.json");
    await writeFile(path, JSON.stringify({ schema: "consiliency.local_lease_store.v0.1", updatedAt: request(holderA, []).now, leases, events: [] }));
    const before = await readFile(path);
    const query = { now: request(holderA, []).now, limit: 1 };
    const a = (await store.query(query)).leases[0]!;
    const b = (await store.query({ ...query, cursor: { timestamp: a.acquired_at, id: a.lease_id } })).leases[0]!;
    const c = (await store.query({ ...query, cursor: { timestamp: b.acquired_at, id: b.lease_id } })).leases[0]!;
    expect([a.lease_id, b.lease_id, c.lease_id]).toEqual(["lease:000", "lease:001", "lease:002"]);
    expect((await store.query({ ...query, mode: "hard" })).leases[0]?.mode).toBe("hard");
    const firstPage = (await store.query({ now: query.now })).leases;
    expect(firstPage).toHaveLength(100);
    expect(firstPage.every((lease) => lease.mode === "soft")).toBe(true);
    expect(await readFile(path)).toEqual(before);
    await expect(readFile(join(rootDir, "locks", "coordination.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.query({ limit: 0 })).rejects.toThrow();
  });
  it("supports prototype-named IDs and refuses corrupt state without overwriting it", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "lease-store-prototype-"));
    const store = new LocalLeaseStore({ rootDir });
    const acquired = await store.acquire({ ...request(holderA, ["packages"]), leaseId: "constructor" });
    expect(acquired.granted).toBe(true);
    const path = join(rootDir, "coordination", "consiliency-leases.json");
    const bytes = JSON.stringify({ schema: "consiliency.local_lease_store.v0.1", leases: {}, events: 7 });
    await writeFile(path, bytes);
    await expect(store.query()).rejects.toThrow();
    await expect(store.acquire(request(holderB, ["other"]))).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });
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

  it("rejects active lease id reuse across non-overlapping scopes", async () => {
    const store = new LocalLeaseStore({
      rootDir: await mkdtemp(join(tmpdir(), "lease-store-")),
    });
    const first = await store.acquire({
      ...request(holderA, ["packages"]),
      leaseId: "lease:fixed",
    });
    const second = await store.acquire({
      ...request(holderB, ["docs"]),
      leaseId: "lease:fixed",
    });
    const snapshot = await store.query({ now: "2026-07-08T21:00:30Z" });

    expect(first.granted).toBe(true);
    expect(second).toMatchObject({ granted: false, failure: "conflict" });
    expect(snapshot.leases).toHaveLength(1);
    expect(snapshot.leases[0]?.holder).toBe(holderA);
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

  it("filters expired leases in query without mutating local state", async () => {
    const store = new LocalLeaseStore({
      rootDir: await mkdtemp(join(tmpdir(), "lease-store-")),
    });
    await store.acquire({
      ...request(holderA, ["packages"]),
      ttlSeconds: 1,
    });

    const active = await store.query({ now: "2026-07-08T21:00:02Z" });
    const withExpired = await store.query({
      includeExpired: true,
      now: "2026-07-08T21:00:02Z",
    });

    expect(active.leases).toHaveLength(0);
    expect(withExpired.leases).toHaveLength(1);
    expect(withExpired.leases[0]?.holder).toBe(holderA);
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
  }, 20_000);

  it("keeps local read-check-write mutations behind the filesystem lock", () => {
    const source = readFileSync(new URL("./lease-store.ts", import.meta.url), "utf8");

    expect(source).toContain("withFilesystemLock(this.lockPath");
    expect(source).toContain('join(paths.locksDir, "coordination.lock")');
  });
});

describe("Supabase lease store RPC mapping", () => {
  it("rejects malformed holder, renewal and cursor inputs before an SDK request", async () => {
    let calls = 0;
    const store = createSupabaseLeaseStore({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async () => {
      calls += 1;
      return new Response("{}");
    } });
    for (const holder of ["", null, undefined, 42]) {
      await expect(store.renew("lease:a", holder as string)).rejects.toThrow();
      await expect(store.release("lease:a", holder as string)).rejects.toThrow();
    }
    await expect(store.release("", holderA)).rejects.toThrow();
    for (const ttlSeconds of [-1, 0, 1.5, 7201, NaN, Infinity]) await expect(store.renew("lease:a", holderA, { ttlSeconds })).rejects.toThrow();
    for (const cursor of [{}, { id: "lease:a" }, { timestamp: request(holderA, []).now }, { timestamp: null, id: "lease:a" }]) {
      await expect(store.query({ cursor: cursor as unknown as { timestamp: string; id: string } })).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });
  it("walks three installed-SDK cursor pages using returned timestamp and ID", async () => {
    const leases = ["lease:c", "lease:b", "lease:a"].map((leaseId) => createLeaseFromAcquireRequest({ ...request(holderA, [leaseId]), leaseId })).reverse();
    const cursors: unknown[] = [];
    const store = createSupabaseLeaseStore({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async (_input, init) => {
      const { request: query } = JSON.parse(String(init?.body));
      cursors.push(query.cursor);
      const page = leases.filter((lease) => !query.cursor || lease.lease_id > query.cursor.id).slice(0, query.limit);
      return new Response(JSON.stringify({ leases: page }), { headers: { "content-type": "application/json" } });
    } });
    const walked = [];
    let cursor: { timestamp: string; id: string } | undefined;
    for (let n = 0; n < 4; n += 1) {
      const page = (await store.query({ limit: 1, cursor })).leases;
      if (!page.length) break;
      walked.push(page[0]!.lease_id);
      cursor = { timestamp: page[0]!.acquired_at, id: page[0]!.lease_id };
    }
    expect(walked).toEqual(["lease:a", "lease:b", "lease:c"]);
    expect(cursors.slice(1)).toEqual(leases.map((lease) => ({ timestamp: lease.acquired_at, id: lease.lease_id })));
  });
  it("uses the installed SDK with an offline endpoint and validates its actual wire/results", async () => {
    const wires: Array<{ path: string; body: unknown }> = [];
    const expected = createLeaseFromAcquireRequest({ ...request(holderA, ["packages"]), leaseId: "lease:sdk" });
    const store = createSupabaseLeaseStore({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async (input, init) => {
      wires.push({ path: String(input), body: JSON.parse(String(init?.body)) });
      const fn = String(input).split("/").at(-1);
      const data = fn === "coordination_acquire_lease" ? { granted: true, lease: expected }
        : fn === "coordination_renew_lease" ? { renewed: true, lease: expected }
        : fn === "coordination_release_lease" ? { released: true }
        : fn === "coordination_expire_leases" ? { expired: 2 } : { leases: [expected] };
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    } });
    expect((await store.acquire({ ...request(holderA, ["packages/"]), leaseId: expected.lease_id })).lease).toEqual(expected);
    expect((await store.renew(expected.lease_id, holderA, { ttlSeconds: 60 })).renewed).toBe(true);
    expect((await store.release(expected.lease_id, holderA)).released).toBe(true);
    expect((await store.query({ mode: "hard", limit: 1, cursor: { timestamp: expected.acquired_at, id: "lease:a" } })).leases).toHaveLength(1);
    expect(await store.expire()).toBe(2);
    expect(wires[0]?.path).toContain("/rest/v1/rpc/coordination_acquire_lease");
    expect(wires[0]?.body).toMatchObject({ request: { leaseId: "lease:sdk", scope: { selector: ["packages"] } } });
    expect(wires[3]?.body).toMatchObject({ request: { mode: "hard", limit: 1, cursor: { timestamp: expected.acquired_at, id: "lease:a" } } });
  });
  it.each(["authentication", "permission", "timeout", "transport", "malformed-response"])("bounds the real SDK %s failure", async (cause) => {
    const store = createSupabaseLeaseStore({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async () => {
      if (cause === "timeout") throw new DOMException("synthetic-private-detail", "AbortError");
      if (cause === "transport") throw new TypeError("synthetic-private-detail");
      const data = cause === "malformed-response" ? { granted: true, lease: {} } : { code: cause === "authentication" ? "PGRST301" : "42501", message: "synthetic-private-detail" };
      return new Response(JSON.stringify(data), { status: cause === "malformed-response" ? 200 : cause === "authentication" ? 401 : 403, headers: { "content-type": "application/json" } });
    } });
    const result = await store.acquire(request(holderA, ["packages"]));
    expect(result).toMatchObject({ granted: false, failure: "backend-unavailable", cause });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-detail");
  });
  it("treats blank configuration as unavailable and invalid URLs as bounded validation failures", () => {
    expect(createSupabaseLeaseStoreFromEnv({ OMNIAGENT_COORDINATION_SUPABASE_URL: " ", OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY: " " })).toBeUndefined();
    expect(() => createSupabaseLeaseStore({ url: "bad synthetic url", serviceRoleKey: "synthetic-test-key" })).toThrow("Coordination backend validation.");
  });
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

  it("validates Supabase acquire requests before calling RPC", async () => {
    const calls: string[] = [];
    const client: SupabaseLeaseRpcClient = {
      async rpc(fn, args) {
        calls.push(`${fn}:${JSON.stringify(args)}`);
        return {
          data: null,
          error: null,
        };
      },
    };
    const store = new SupabaseLeaseStore(client);

    await expect(store.acquire({
      ...request(holderA, ["packages"]),
      leaseId: "Lease:INVALID",
    })).rejects.toThrow();
    expect(calls).toHaveLength(0);
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
    expect(migration.split("pg_advisory_xact_lock(hashtext('coordination_acquire_lease:v1'))")).toHaveLength(5);
    expect(migration).toContain("coordination_current_leases.lease_id = requested_lease_id");
    expect(migration).toContain("on conflict (lease_id) do update");
    expect(migration).toContain("lease_id text primary key check (lease_id ~ '^[a-z0-9][a-z0-9_.:-]*$')");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function public.coordination_acquire_lease(jsonb)");
    expect(migration).toContain("grant execute on function public.coordination_acquire_lease(jsonb) to service_role");
    expect(migration).toContain("alter table public.coordination_current_leases enable row level security");
    expect(migration).toContain("coalesce((request->>'now')::timestamptz, now()) < heartbeat_at");
    expect(migration).toContain("rtrim(left_value, '/') = rtrim(right_value, '/')");
    expect(migration).toContain("starts_with(rtrim(left_value, '/'), rtrim(right_value, '/') || '/')");
    expect(migration).not.toContain(" like rtrim");
  });
});
