import { describe, expect, it } from "vitest";

import { CliError } from "./errors.js";
import { parseCliArgs } from "./args.js";

describe("argument parsing", () => {
  it("parses global state-root/json flags for health", () => {
    const parsed = parseCliArgs([
      "--json",
      "--state-root",
      "./tmp/state",
      "health",
    ]);

    expect(parsed.command).toBe("health");
    expect(parsed.json).toBe(true);
    expect(parsed.stateRoot.endsWith("/tmp/state")).toBe(true);
  });

  it("parses session and route identifiers for subcommands", () => {
    const session = parseCliArgs(["sessions", "show", "session-1"]);
    const coordination = parseCliArgs([
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
    ]);
    const route = parseCliArgs([
      "route-task",
      "--task-id",
      "task-1",
      "--record",
      "--allow-cross-provider-migration",
      "--coordination-scope",
      "path-set:packages/cli",
      "--coordination-holder",
      "holder-a",
    ]);

    if (session.command !== "sessions show") {
      throw new Error("Expected a sessions show request.");
    }
    if (route.command !== "route-task") {
      throw new Error("Expected a route-task request.");
    }
    if (coordination.command !== "coordination leases acquire") {
      throw new Error("Expected a coordination acquire request.");
    }

    expect(session.command).toBe("sessions show");
    expect(session.sessionId).toBe("session-1");
    expect(coordination.scope).toBe("path-set:packages/cli");
    expect(coordination.ttlSeconds).toBe(120);
    expect(route.command).toBe("route-task");
    expect(route.taskId).toBe("task-1");
    expect(route.record).toBe(true);
    expect(route.coordinationMode).toBe("hard");
  });

  it("uses OMNIAGENT_COORDINATION_BACKEND when backend flags are omitted", () => {
    const previous = process.env.OMNIAGENT_COORDINATION_BACKEND;
    process.env.OMNIAGENT_COORDINATION_BACKEND = "supabase";
    try {
      const coordination = parseCliArgs([
        "coordination",
        "leases",
        "list",
      ]);
      const route = parseCliArgs([
        "route-task",
        "--task-id",
        "task-1",
      ]);

      if (coordination.command !== "coordination leases list") {
        throw new Error("Expected a coordination list request.");
      }
      if (route.command !== "route-task") {
        throw new Error("Expected a route-task request.");
      }
      expect(coordination.backend).toBe("supabase");
      expect(route.coordinationBackend).toBe("supabase");
    } finally {
      if (previous === undefined) {
        delete process.env.OMNIAGENT_COORDINATION_BACKEND;
      } else {
        process.env.OMNIAGENT_COORDINATION_BACKEND = previous;
      }
    }
  });

  it("rejects malformed commandlines with typed argument errors", () => {
    expect(() => parseCliArgs(["route-task"])).toThrow(CliError);
  });
});
