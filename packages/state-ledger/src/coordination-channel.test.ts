import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalCoordinationChannel } from "./coordination-channel.js";
import {
  SupabaseCoordinationChannel,
  type SupabaseCoordinationRpcClient,
} from "./supabase-coordination-channel.js";

const scope = {
  granularity: "path-set" as const,
  selector: ["packages/state-ledger"],
};

describe("coordination channel", () => {
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
