import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COMMAND_REGISTRY } from "./command-registry.js";
import { executeCli } from "./runtime.js";
import { LocalCoordinationChannel } from "@omniagent-plus/state-ledger";
import { LocalLeaseStore } from "@omniagent-plus/worktree-leasing";

describe("coordination commands", () => {
  it("forwards list cursors for three same-second messages and leases", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-coord-page-"));
    const store = new LocalLeaseStore({ rootDir: stateRoot });
    const channel = new LocalCoordinationChannel({ rootDir: stateRoot });
    const scope = { granularity: "path-set" as const, selector: ["packages/cli"] };
    for (const id of ["c", "b", "a"]) {
      await store.acquire({ leaseId: id, holder: "a", mode: "soft", ttlSeconds: 3600, scope, phase: "COORD" });
      await channel.send({ type: "done", sender: "a", scope });
    }
    for (const action of ["leases", "inbox"]) {
      let cursor: { timestamp: string; id: string } | undefined;
      const visited: string[] = [];
      for (let n = 0; n < 3; n += 1) {
        const result = await executeCli(["coordination", action, "list", "--state-root", stateRoot, "--limit", "1", ...(cursor ? ["--cursor", JSON.stringify(cursor)] : []), "--json"], COMMAND_REGISTRY);
        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(result.stdout).result;
        expect(payload.count).toBe(1);
        const row = (payload.leases ?? payload.messages)[0];
        const id = row.lease_id ?? row.message_id;
        visited.push(id);
        cursor = { timestamp: row.acquired_at ?? row.created_at, id };
      }
      expect(new Set(visited).size).toBe(3);
    }
  });
  it("reports missing and invalid backend configuration with bounded causes", async () => {
    for (const hostEnv of [{}, { OMNIAGENT_COORDINATION_SUPABASE_URL: "invalid", OMNIAGENT_COORDINATION_SUPABASE_SERVICE_ROLE_KEY: "synthetic-private" }]) {
      const result = await executeCli(["coordination", "leases", "list", "--backend", "supabase", "--json"], COMMAND_REGISTRY, { hostEnv });
      expect(result.exitCode).toBe(7);
      expect(result.stderr).toMatch(/unavailable|validation/);
      expect(result.stderr).not.toContain("synthetic-private");
    }
  });
  it("acquires and lists local coordination leases", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-coordination-"));
    const acquired = await executeCli(
      [
        "coordination",
        "leases",
        "acquire",
        "--holder",
        "holder-a",
        "--scope",
        "path-set:packages/cli",
        "--mode",
        "hard",
        "--ttl-seconds",
        "120",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const listed = await executeCli(
      [
        "coordination",
        "leases",
        "list",
        "--scope",
        "path-set:packages/cli",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const acquireEnvelope = JSON.parse(acquired.stdout) as {
      readonly result: {
        readonly granted: boolean;
        readonly lease: { readonly holder: string };
      };
    };
    const listEnvelope = JSON.parse(listed.stdout) as {
      readonly result: {
        readonly count: number;
      };
    };

    expect(acquired.exitCode).toBe(0);
    expect(acquireEnvelope.result.granted).toBe(true);
    expect(acquireEnvelope.result.lease.holder).toBe("holder-a");
    expect(listed.exitCode).toBe(0);
    expect(listEnvelope.result.count).toBe(1);
  });

  it("keeps inbox messages separate from lease state", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-coordination-"));
    await executeCli(
      [
        "coordination",
        "leases",
        "acquire",
        "--holder",
        "holder-a",
        "--scope",
        "path-set:packages/cli",
        "--mode",
        "hard",
        "--ttl-seconds",
        "120",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const sent = await executeCli(
      [
        "coordination",
        "inbox",
        "send",
        "--type",
        "request-yield",
        "--sender",
        "holder-b",
        "--scope",
        "path-set:packages/cli",
        "--target-holder",
        "holder-a",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const messages = await executeCli(
      [
        "coordination",
        "inbox",
        "list",
        "--scope",
        "path-set:packages/cli",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const leases = await executeCli(
      [
        "coordination",
        "leases",
        "list",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const messageEnvelope = JSON.parse(messages.stdout) as {
      readonly result: {
        readonly count: number;
      };
    };
    const leaseEnvelope = JSON.parse(leases.stdout) as {
      readonly result: {
        readonly count: number;
      };
    };

    expect(sent.exitCode).toBe(0);
    expect(messages.exitCode).toBe(0);
    expect(messageEnvelope.result.count).toBe(1);
    expect(leaseEnvelope.result.count).toBe(1);
  });

  it("does not acquire coordination leases during route-task dry-run", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-coordination-"));
    const routed = await executeCli(
      [
        "route-task",
        "--task-id",
        "task-coordination-preview",
        "--coordination-scope",
        "path-set:packages/cli",
        "--coordination-holder",
        "holder-a",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const leases = await executeCli(
      [
        "coordination",
        "leases",
        "list",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const routeEnvelope = JSON.parse(routed.stdout) as {
      readonly result: {
        readonly routeDecision: {
          readonly leaseArbitration?: {
            readonly status: string;
          };
        };
      };
    };
    const leaseEnvelope = JSON.parse(leases.stdout) as {
      readonly result: {
        readonly count: number;
      };
    };

    expect(routed.exitCode).toBe(0);
    expect(routeEnvelope.result.routeDecision.leaseArbitration?.status).toBe("not_requested");
    expect(leaseEnvelope.result.count).toBe(0);
  });

  it("blocks route-task before launch when a hard coordination lease conflicts", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-coordination-"));
    await executeCli(
      [
        "coordination",
        "leases",
        "acquire",
        "--holder",
        "holder-a",
        "--scope",
        "path-set:packages/cli",
        "--mode",
        "hard",
        "--ttl-seconds",
        "120",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );

    const blocked = await executeCli(
      [
        "route-task",
        "--task-id",
        "task-coordination-block",
        "--coordination-scope",
        "path-set:packages/cli/src",
        "--coordination-holder",
        "holder-b",
        "--coordination-request-yield",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const envelope = JSON.parse(blocked.stderr) as {
      readonly error: {
        readonly category: string;
        readonly details?: {
          readonly result?: {
            readonly routeDecision?: {
              readonly leaseArbitration?: {
                readonly status: string;
              };
            };
          };
        };
      };
    };

    expect(blocked.exitCode).toBe(7);
    expect(envelope.error.category).toBe("route_block");
    expect(envelope.error.details?.result?.routeDecision?.leaseArbitration?.status).toBe(
      "blocked_hard_conflict",
    );

    const messages = await executeCli(
      [
        "coordination",
        "inbox",
        "list",
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const messageEnvelope = JSON.parse(messages.stdout) as {
      readonly result: {
        readonly count: number;
      };
    };
    expect(messageEnvelope.result.count).toBe(0);
  });
});
