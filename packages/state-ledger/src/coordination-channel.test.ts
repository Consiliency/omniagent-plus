import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { LocalCoordinationChannel, type CoordinationMessageInput } from "./coordination-channel.js";
import {
  SupabaseCoordinationChannel,
  type SupabaseCoordinationRpcClient,
} from "./supabase-coordination-channel.js";

const scope = {
  granularity: "path-set" as const,
  selector: ["packages/state-ledger"],
};

describe("coordination channel", () => {
  it("refuses malformed sends before local state creation and detaches valid scope before waiting", async () => {
    const rootDir = join(await mkdtemp(join(tmpdir(), "coord-input-validation-")), "absent");
    const channel = new LocalCoordinationChannel({ rootDir });
    for (const patch of [{ sender: "" }, { scope: { ...scope, selector: [] } }, { leaseId: "" }, { targetHolder: "" }, { handoffPacketId: "" }, { body: null }, { type: "invalid" }]) {
      await expect(channel.send({ type: "done", sender: "operator", scope, ...patch } as CoordinationMessageInput)).rejects.toThrow();
      await expect(access(rootDir)).rejects.toMatchObject({ code: "ENOENT" });
    }
    const input = { type: "done" as const, sender: "operator", scope: { ...scope, selector: ["original"] }, body: { nested: "original" } };
    const pending = channel.send(input);
    input.scope.selector[0] = "changed";
    input.body.nested = "changed";
    await pending;
    expect((await channel.list())[0]).toMatchObject({ scope: { selector: ["original"] }, body: { nested: "original" } });
  });
  it("persists legacy future-clock normalization even when a full inbox refuses admission", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-inbox-future-full-"));
    let now = new Date("2026-10-03T00:00:00Z");
    const channel = new LocalCoordinationChannel({ rootDir, clock: () => now });
    await mkdir(join(rootDir, "coordination"));
    const path = join(rootDir, "coordination", "coordination-inbox.json");
    const messages = Array.from({ length: 10000 }, (_, n) => ({ schema: "consiliency.coordination_message.v1", message_id: "future-" + n,
      type: "done", sender: "operator", scope, created_at: "2099-01-01T00:00:00Z" }));
    await writeFile(path, JSON.stringify({ schema: "consiliency.local_coordination_inbox.v0.1", updatedAt: now.toISOString(), messages }));
    await expect(channel.send({ type: "done", sender: "operator", scope })).rejects.toMatchObject({ failureCause: "capacity" });
    const normalized = JSON.parse(await readFile(path, "utf8"));
    expect(normalized.messages.map((entry: { message_id: string }) => entry.message_id)).toEqual(messages.map((entry) => entry.message_id));
    expect(normalized.messages.every((entry: { created_at: string }) => entry.created_at === "2026-10-03T00:00:00Z")).toBe(true);
    now = new Date("2026-10-11T00:00:00Z");
    expect(await channel.list()).toEqual([]);
    await channel.send({ type: "done", sender: "operator", scope });
    expect(await channel.list()).toHaveLength(1);
  }, 30_000);
  it("uses its injected clock and walks same-second messages in bytewise ID order", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-inbox-page-"));
    const now = new Date("2026-10-03T00:00:00Z");
    const channel = new LocalCoordinationChannel({ rootDir, clock: () => now });
    const receipt = await channel.send({ type: "done", sender: "operator", scope, now: "2099-01-01T00:00:00Z" });
    expect(receipt.createdAt).toBe(now.toISOString().replace(".000Z", "Z"));
    const path = join(rootDir, "coordination", "coordination-inbox.json");
    await writeFile(path, JSON.stringify({ schema: "consiliency.local_coordination_inbox.v0.1", updatedAt: receipt.createdAt,
      messages: ["é", "z", "a"].map((id) => ({ schema: "consiliency.coordination_message.v1", message_id: id, type: "done", sender: "operator", scope,
        created_at: id === "a" ? "2026-10-03T00:00:00.999Z" : "2026-10-03T00:00:00.001Z" })),
    }));
    const before = await readFile(path);
    const first = (await channel.list({ limit: 1 }))[0]!;
    const second = (await channel.list({ limit: 1, cursor: { timestamp: first.created_at, id: first.message_id } }))[0]!;
    const third = (await channel.list({ limit: 1, cursor: { timestamp: second.created_at, id: second.message_id } }))[0]!;
    expect([first.message_id, second.message_id, third.message_id]).toEqual(["a", "z", "é"]);
    expect(await readFile(path)).toEqual(before);
    await expect(channel.list({ limit: 501 })).rejects.toThrow();
  });

  it("preserves full retained inboxes, prunes expiry before capacity, and serializes the 9999 boundary", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-inbox-capacity-"));
    let now = new Date("2026-10-03T00:00:00Z");
    const channel = new LocalCoordinationChannel({ rootDir, clock: () => now });
    await mkdir(join(rootDir, "coordination"));
    const path = join(rootDir, "coordination", "coordination-inbox.json");
    await writeFile(path, JSON.stringify({ schema: "consiliency.local_coordination_inbox.v0.1", updatedAt: now.toISOString(),
      messages: Array.from({ length: 9999 }, (_, n) => ({ schema: "consiliency.coordination_message.v1", message_id: "message-" + n,
        type: "done", sender: "operator", scope, created_at: now.toISOString() })),
    }));
    const send = () => channel.send({ type: "done", sender: "operator", scope });
    const boundary = await Promise.allSettled([send(), send()]);
    expect(boundary.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(boundary.filter((result) => result.status === "rejected")).toHaveLength(1);
    const full = await readFile(path);
    await expect(send()).rejects.toMatchObject({ failureCause: "capacity" });
    expect(await readFile(path)).toEqual(full);
    expect(await channel.list()).toHaveLength(100);
    now = new Date("2026-10-11T00:00:00Z");
    expect(await channel.list()).toEqual([]);
    expect(await readFile(path)).toEqual(full);
    await send();
    expect(await channel.list()).toHaveLength(1);
    expect(JSON.parse(await readFile(path, "utf8")).messages).toHaveLength(1);
  }, 30_000);

  it.each(["wrong-version", "malformed"])("preserves %s inbox bytes and refuses reads and writes", async (kind) => {
    const rootDir = await mkdtemp(join(tmpdir(), "coord-inbox-corruption-"));
    await mkdir(join(rootDir, "coordination"));
    const path = join(rootDir, "coordination", "coordination-inbox.json");
    const bytes = JSON.stringify({ schema: kind === "wrong-version" ? "consiliency.local_coordination_inbox.v99" : "consiliency.local_coordination_inbox.v0.1", messages: 7 });
    await writeFile(path, bytes);
    const channel = new LocalCoordinationChannel({ rootDir });
    await expect(channel.list()).rejects.toThrow();
    await expect(channel.send({ type: "done", sender: "operator", scope })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  });
  it("detaches local fields before lock acquisition and nested aliases before inbox reads", async () => {
    const local = new LocalCoordinationChannel({ rootDir: await mkdtemp(join(tmpdir(), "data-coordination-pending-")) });
    await local.send({ type: "done", sender: "original", scope });
    let invoked = 0;
    const input = { type: "done" as const, sender: "operator", scope };
    const pending = local.send(input);
    Object.defineProperty(input, "sender", { get() { invoked += 1; return "operator"; } });
    await pending;
    const nested = { safe: "original" };
    const internals = local as unknown as { readState: (now: string) => Promise<unknown> };
    const readState = internals.readState.bind(local);
    const spy = vi.spyOn(internals, "readState").mockImplementation(async (now) => {
      const state = await readState(now);
      Object.defineProperty(nested, "toJSON", { value() { invoked += 1; return { password: "synthetic-private-value" }; } });
      return state;
    });
    const receipt = await local.send({ type: "done", sender: "operator", scope, body: { nested } });
    spy.mockRestore();
    expect(invoked).toBe(0);
    const messages = await local.list();
    expect(messages.map((message) => message.sender).sort()).toEqual(["operator", "operator", "original"]);
    expect(messages.find((message) => message.message_id === receipt.messageId)?.body).toEqual({ nested: { safe: "original" } });
    expect(JSON.stringify(messages)).not.toContain("synthetic-private-value");
  });

  it("detaches RPC payloads before asynchronous serialization", async () => {
    let serialized = "";
    let invoked = 0;
    const remote = new SupabaseCoordinationChannel({ async rpc(_fn, args) {
      await Promise.resolve();
      serialized = JSON.stringify(args);
      return { data: { messageId: "message", createdAt: "2026-06-30T00:00:00Z" }, error: null };
    } });
    const nested = { safe: "original" };
    const pending = remote.send({ type: "done", sender: "operator", scope, body: { nested } });
    nested.safe = "changed";
    Object.defineProperty(nested, "toJSON", { value() { invoked += 1; return { password: "synthetic-private-value" }; } });
    await pending;
    expect(invoked).toBe(0);
    expect(JSON.parse(serialized).message.body.nested).toEqual({ safe: "original" });
  });

  it("rejects retained nonfinite numbers and undefined array values at both boundaries", async () => {
    const local = new LocalCoordinationChannel({ rootDir: await mkdtemp(join(tmpdir(), "data-coordination-numbers-")) });
    let calls = 0;
    const remote = new SupabaseCoordinationChannel({ async rpc() { calls += 1; return { data: {}, error: null }; } });
    const rawJSON = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;
    for (const nested of [NaN, Infinity, -Infinity, [undefined], ...(rawJSON ? [rawJSON("123")] : [])]) {
      for (const channel of [local, remote]) await expect(channel.send({ type: "done", sender: "operator", scope, body: { nested } })).rejects.toThrow(/non json metadata/);
    }
    expect(calls).toBe(0);
    expect(await local.list()).toEqual([]);
  });
  it("rejects boxed body and sender values before local persistence or RPC export", async () => {
    const local = new LocalCoordinationChannel({ rootDir: await mkdtemp(join(tmpdir(), "data-coordination-boxed-")) });
    let calls = 0;
    let invoked = 0;
    const remote = new SupabaseCoordinationChannel({ async rpc() { calls += 1; return { data: {}, error: null }; } });
    for (const primitive of ["safe", 1]) {
      for (const prototype of [Object.prototype, null]) {
        for (const coercion of [Symbol.toPrimitive, Symbol.toStringTag]) {
          const value = Object(primitive) as object;
          Object.setPrototypeOf(value, prototype);
          Object.defineProperty(value, coercion, { value: coercion === Symbol.toPrimitive
            ? () => { invoked += 1; return "synthetic-private-value"; } : "synthetic-private-value" });
          for (const channel of [local, remote]) {
            await expect(channel.send({ type: "done", sender: "operator", scope, body: { nested: value } })).rejects.toThrow(/non json metadata/);
            await expect(channel.send({ type: "done", sender: value as unknown as string, scope })).rejects.toThrow(/non json metadata/);
          }
        }
      }
    }
    expect(invoked).toBe(0);
    expect(calls).toBe(0);
    expect(await local.list()).toEqual([]);
  });
  it("checks coordination input before reading known getters or proxies", async () => {
    const local = new LocalCoordinationChannel({ rootDir: await mkdtemp(join(tmpdir(), "data-coordination-getter-")) });
    let invoked = 0;
    let calls = 0;
    const remote = new SupabaseCoordinationChannel({ async rpc() { calls += 1; return { data: {}, error: null }; } });
    const getter = () => { invoked += 1; return "operator"; };
    const input = { type: "done" as const, sender: "operator", scope };
    for (const channel of [local, remote]) {
      await expect(channel.send(Object.defineProperty({ ...input }, "sender", { get: getter }))).rejects.toThrow(/non json metadata/);
      await expect(channel.send(new Proxy(input, { get: getter }))).rejects.toThrow(/non json metadata/);
    }
    expect(invoked).toBe(0);
    expect(calls).toBe(0);
    expect(await local.list()).toEqual([]);
  });
  it("applies the shared corpus to local retained coordination bodies", async () => {
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    const channel = new LocalCoordinationChannel({ rootDir: await mkdtemp(join(tmpdir(), "data-coordination-corpus-")) });
    for (const value of corpus.allowed) await channel.send({ type: "done", sender: "operator", scope, body: { nested: value } });
    for (const value of corpus.rejected) await expect(channel.send({ type: "done", sender: "operator", scope, body: { nested: value } })).rejects.toThrow();
    expect(await channel.list()).toHaveLength(corpus.allowed.length);
  });
  it("records messages without mutating lease state", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coordination-channel-"));
    const channel = new LocalCoordinationChannel({ rootDir });

    await channel.send({
      type: "request-yield",
      sender: "holder-b",
      targetHolder: "holder-a",
      leaseId: "lease:holder-a",
      scope,
      body: { reason: "parallel work detected" },
      now: "2026-07-08T21:00:05Z",
    });

    const messages = await channel.list({ scope });
    const doneMessages = await channel.list({ type: "done" });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "request-yield",
      sender: "holder-b",
    });
    expect(doneMessages).toHaveLength(0);
  });

  it("matches ancestor and descendant path scopes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "coordination-channel-"));
    const channel = new LocalCoordinationChannel({ rootDir });

    await channel.send({
      type: "announce-intent",
      sender: "holder-a",
      scope: {
        granularity: "path-set",
        selector: ["packages"],
      },
    });

    const messages = await channel.list({
      scope: {
        granularity: "path-set",
        selector: ["packages/state-ledger/src"],
      },
    });

    expect(messages).toHaveLength(1);
  });

  it("keeps local inbox writes behind the coordination filesystem lock", () => {
    const source = readFileSync(new URL("./coordination-channel.ts", import.meta.url), "utf8");

    expect(source).toContain("withFilesystemLock(this.lockPath");
    expect(source).toContain('join(paths.locksDir, "coordination.lock")');
  });

  it("maps send/list to Supabase RPC calls", async () => {
    const calls: string[] = [];
    const client: SupabaseCoordinationRpcClient = {
      async rpc(fn, args) {
        calls.push(`${fn}:${JSON.stringify(args)}`);
        return {
          data: fn === "coordination_send_message"
            ? { messageId: "msg:1", createdAt: "2026-07-08T21:00:00Z" }
            : { messages: [] },
          error: null,
        };
      },
    };
    const channel = new SupabaseCoordinationChannel(client);

    await channel.send({
      type: "announce-intent",
      sender: "holder-a",
      scope,
    });
    await channel.list({ scope });

    expect(calls[0]).toContain("coordination_send_message");
    expect(calls[1]).toContain("coordination_list_messages");
  });
});
