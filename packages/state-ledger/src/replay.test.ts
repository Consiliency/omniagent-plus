import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "./audit-ledger.js";
import { replayRouteDecisions, replaySessionHistory } from "./replay.js";

describe("replay", () => {
  it("replays route decisions and runtime history without live Omnigent", async () => {
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "state-ledger-replay-")),
    });

    await ledger.appendSession({
      id: "session-1",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "Replay test",
      state: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    });
    await ledger.appendRuntimeEvent({
      schema: "runtime_event.v0.1",
      eventId: "event-1",
      sequence: 1,
      sessionId: "session-1",
      turnId: "turn-1",
      type: "runtime.turn.started",
      occurredAt: "2026-06-30T00:00:01.000Z",
      payload: {
        message: "start",
        state: "running",
      },
      redaction: "metadata_only",
      terminal: false,
    });
    await ledger.appendRuntimeEvent({
      schema: "runtime_event.v0.1",
      eventId: "event-2",
      sequence: 2,
      sessionId: "session-1",
      turnId: "turn-1",
      type: "runtime.turn.completed",
      occurredAt: "2026-06-30T00:00:02.000Z",
      payload: {
        outcome: "completed",
        outputSummary: "done",
      },
      redaction: "metadata_only",
      terminal: true,
    });
    await ledger.appendRouteDecision({
      schema: "route_decision.v0.1",
      taskId: "task-1",
      selectedProvider: "openai",
      selectedHarness: "codex",
      fallbackUsed: false,
      capabilityFit: 1,
      providerHealth: 0.9,
      currentCapacity: 0.7,
      contextPortability: "high",
      routeReason: "capability_fit",
      silentDowngrade: false,
    });

    const history = await replaySessionHistory(ledger, "session-1");
    const routes = await replayRouteDecisions(ledger, "task-1");

    expect(history.events.map((event) => event.type)).toEqual([
      "runtime.turn.started",
      "runtime.turn.completed",
    ]);
    expect(history.nextCursor).toBe(3);
    expect(routes[0]?.selectedHarness).toBe("codex");
  });
});
