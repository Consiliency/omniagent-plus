import { describe, expect, it } from "vitest";

import { OmnigentProcessManager } from "./process-manager.js";

describe("process manager", () => {
  it("tracks process groups, heartbeats, and timeout cleanup", async () => {
    let now = Date.parse("2026-06-30T00:00:00.000Z");
    const kills: Array<{ processGroupId: number; signal: NodeJS.Signals }> = [];
    const manager = new OmnigentProcessManager({
      heartbeatTimeoutMs: 5_000,
      kill(processGroupId, signal) {
        kills.push({ processGroupId, signal });
      },
      now: () => now,
      spawn(command) {
        return {
          command,
          pid: 42,
          processGroupId: 42,
        };
      },
    });

    await manager.ensureRunning(["omnigent", "server", "--background"]);
    manager.heartbeat();
    now += 10_000;
    const cleaned = await manager.enforceTimeoutCleanup();

    expect(cleaned).toBe(true);
    expect(kills).toEqual([{ processGroupId: 42, signal: "SIGTERM" }]);
    expect(manager.status().running).toBe(false);
  });

  it("stops the owned process group when the parent process disappears", async () => {
    const manager = new OmnigentProcessManager({
      isParentAlive: () => false,
      kill: () => undefined,
      parentPid: 999,
      spawn(command) {
        return {
          command,
          pid: 77,
          processGroupId: 77,
        };
      },
    });

    await manager.ensureRunning(["omnigent", "server", "--background"]);
    const cleaned = await manager.enforceParentDeathCleanup();

    expect(cleaned).toBe(true);
    expect(manager.status().running).toBe(false);
  });
});
