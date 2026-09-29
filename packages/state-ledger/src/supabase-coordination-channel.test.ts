import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SupabaseCoordinationChannel } from "./supabase-coordination-channel.js";

describe("Supabase coordination content boundary", () => {
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
