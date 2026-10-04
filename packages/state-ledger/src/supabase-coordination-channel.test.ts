import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SupabaseCoordinationChannel, createSupabaseCoordinationChannel, createSupabaseCoordinationChannelFromEnv } from "./supabase-coordination-channel.js";

describe("Supabase coordination content boundary", () => {
  it("maps a committed capacity refusal through the installed SDK without leaking details", async () => {
    const channel = createSupabaseCoordinationChannel({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key",
      fetch: async () => new Response(JSON.stringify({ failure: "capacity" }), { headers: { "content-type": "application/json" } }) });
    await expect(channel.send({ type: "done", sender: "operator", scope: { granularity: "repo", selector: ["repo"] } })).rejects.toMatchObject({ failureCause: "capacity", message: "Coordination backend capacity." });
  });
  it("detaches query scope before lazy SDK serialization and walks returned cursor pages", async () => {
    const scope = { granularity: "repo" as const, selector: ["repo"] };
    const messages = ["msg:c", "msg:b", "msg:a"].map((message_id) => ({ schema: "consiliency.coordination_message.v1", message_id,
      type: "done", sender: "operator", scope: { ...scope, selector: ["repo"] }, created_at: "2026-10-03T00:00:00Z" })).reverse();
    const wires: Array<{ query: { scope: typeof scope; cursor?: { timestamp: string; id: string }; limit: number } }> = [];
    const channel = createSupabaseCoordinationChannel({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async (_input, init) => {
      const wire = JSON.parse(String(init?.body));
      wires.push(wire);
      return new Response(JSON.stringify({ messages: messages.filter((message) => !wire.query.cursor || message.message_id > wire.query.cursor.id).slice(0, wire.query.limit) }),
        { headers: { "content-type": "application/json" } });
    } });
    const pending = channel.list({ scope, limit: 1 });
    scope.selector[0] = "mutated";
    let page = await pending;
    const walked = [];
    while (page.length && walked.length < 4) {
      const message = page[0]!;
      walked.push(message.message_id);
      page = await channel.list({ limit: 1, cursor: { timestamp: message.created_at, id: message.message_id } });
    }
    expect(walked).toEqual(["msg:a", "msg:b", "msg:c"]);
    expect(wires[0]?.query.scope.selector).toEqual(["repo"]);
    expect(wires.slice(1).map((wire) => wire.query.cursor)).toEqual(messages.map((message) => ({ timestamp: message.created_at, id: message.message_id })));
    const before = wires.length;
    await expect(channel.list({ cursor: {} as { timestamp: string; id: string } })).rejects.toThrow();
    await expect(channel.list({ scope: { ...scope, selector: ["../unsafe"] } })).rejects.toThrow();
    expect(wires).toHaveLength(before);
  });
  it("maps detached bodies and cursor pages through the installed SDK's offline fetch endpoint", async () => {
    const wires: Array<{ path: string; body: unknown }> = [];
    const scope = { granularity: "repo" as const, selector: ["repo"] };
    const message = { schema: "consiliency.coordination_message.v1", message_id: "msg:a", type: "done", sender: "operator", scope, created_at: "2026-10-03T00:00:00Z" };
    const channel = createSupabaseCoordinationChannel({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async (input, init) => {
      wires.push({ path: String(input), body: JSON.parse(String(init?.body)) });
      const data = String(input).endsWith("coordination_send_message") ? { messageId: message.message_id, createdAt: message.created_at } : { messages: [message] };
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    } });
    const body = { nested: { safe: "original" } };
    const pending = channel.send({ type: "done", sender: "operator", scope, body });
    body.nested.safe = "changed";
    expect(await pending).toMatchObject({ messageId: "msg:a" });
    expect((wires[0]?.body as { message: { body: unknown } }).message.body).toEqual({ nested: { safe: "original" } });
    expect(await channel.list({ limit: 1, cursor: { timestamp: message.created_at, id: "msg:0" } })).toEqual([message]);
    expect(wires[1]?.path).toContain("/rest/v1/rpc/coordination_list_messages");
    expect(wires[1]?.body).toMatchObject({ query: { limit: 1, cursor: { timestamp: message.created_at, id: "msg:0" } } });
  });
  it.each(["authentication", "permission", "timeout", "transport", "malformed-response"])("bounds real SDK channel %s failures without retaining response details", async (cause) => {
    const channel = createSupabaseCoordinationChannel({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async () => {
      if (cause === "timeout") throw new DOMException("synthetic-private-detail", "AbortError");
      if (cause === "transport") throw new TypeError("synthetic-private-detail");
      return new Response(JSON.stringify(cause === "malformed-response" ? { messageId: 7 } : { code: cause === "authentication" ? "PGRST301" : "42501", message: "synthetic-private-detail" }),
        { status: cause === "malformed-response" ? 200 : cause === "authentication" ? 401 : 403, headers: { "content-type": "application/json" } });
    } });
    await expect(channel.send({ type: "done", sender: "operator", scope: { granularity: "repo", selector: ["repo"] } })).rejects.toMatchObject({ failureCause: cause, message: "Coordination backend " + cause + "." });
  });
  it("rejects malformed list envelopes and treats blank configuration as unavailable", async () => {
    const channel = createSupabaseCoordinationChannel({ url: "http://127.0.0.1:1", serviceRoleKey: "synthetic-test-key", fetch: async () => new Response(JSON.stringify({ messages: 7 }), { status: 200, headers: { "content-type": "application/json" } }) });
    await expect(channel.list()).rejects.toMatchObject({ failureCause: "malformed-response" });
    expect(createSupabaseCoordinationChannelFromEnv({ OMNIAGENT_COORDINATION_SUPABASE_URL: " ", OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY: " " })).toBeUndefined();
  });
  it("checks the corpus before sending RPC content and validates returned bodies", async () => {
    const corpus = JSON.parse(readFileSync(new URL("../../../fixtures/content-policy/corpus.json", import.meta.url), "utf8")) as { allowed: unknown[]; rejected: unknown[] };
    let calls = 0;
    let body: unknown = {};
    const channel = new SupabaseCoordinationChannel({ async rpc(fn) {
      calls += 1;
      return { error: null, data: fn === "coordination_send_message" ? { messageId: "message", createdAt: "2026-06-30T00:00:00Z" }
        : { messages: [{ schema: "consiliency.coordination_message.v1", message_id: "message", type: "done", sender: "operator",
          created_at: "2026-06-30T00:00:00Z", scope: { granularity: "repo", selector: ["repo"] }, body: { nested: body } }] } };
    } });
    for (const value of corpus.allowed) await channel.send({ type: "done", sender: "operator", scope: { granularity: "repo", selector: ["repo"] }, body: { nested: value } });
    const before = calls;
    for (const value of corpus.rejected) {
      await expect(channel.send({ type: "done", sender: "operator", scope: { granularity: "repo", selector: ["repo"] }, body: { nested: value } })).rejects.toThrow();
      body = value;
      await expect(channel.list()).rejects.toThrow();
    }
    expect(calls - before).toBe(corpus.rejected.length);
  });
});
