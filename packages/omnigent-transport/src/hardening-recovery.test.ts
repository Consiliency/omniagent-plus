import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OmnigentProcessManager } from "./process-manager.js";

interface HardeningFixture {
  readonly timeoutCase: {
    readonly advanceMs: number;
    readonly command: string[];
    readonly heartbeatTimeoutMs: number;
    readonly processGroupId: number;
    readonly startedAt: string;
  };
  readonly parentDeathCase: {
    readonly command: string[];
    readonly parentPid: number;
    readonly processGroupId: number;
  };
}

function readFixture(): HardeningFixture {
  return JSON.parse(
    readFileSync(
      new URL("../../../fixtures/hardening/recovery/transport-process-cleanup.json", import.meta.url),
      "utf8",
    ),
  ) as HardeningFixture;
}

describe("hardening recovery", () => {
  it("cleans up timed-out Omnigent process groups after heartbeat expiry", async () => {
    const fixture = readFixture();
    let now = Date.parse(fixture.timeoutCase.startedAt);
    const killCalls: Array<{ processGroupId: number; signal: NodeJS.Signals }> = [];
    const spawnCalls: string[] = [];
    const manager = new OmnigentProcessManager({
      heartbeatTimeoutMs: fixture.timeoutCase.heartbeatTimeoutMs,
      kill(processGroupId, signal) {
        killCalls.push({ processGroupId, signal });
      },
      now: () => now,
      spawn(command) {
        spawnCalls.push(command.join(" "));
        return {
          command,
          pid: fixture.timeoutCase.processGroupId,
          processGroupId: fixture.timeoutCase.processGroupId,
        };
      },
    });

    const first = await manager.ensureRunning(fixture.timeoutCase.command);
    const second = await manager.ensureRunning(fixture.timeoutCase.command);
    manager.heartbeat();
    now += fixture.timeoutCase.advanceMs;
    const statusBeforeCleanup = manager.status();
    const cleaned = await manager.enforceTimeoutCleanup();

    expect(second).toBe(first);
    expect(spawnCalls).toEqual([fixture.timeoutCase.command.join(" ")]);
    expect(statusBeforeCleanup.running).toBe(true);
    expect(statusBeforeCleanup.timedOut).toBe(true);
    expect(cleaned).toBe(true);
    expect(killCalls).toEqual([
      {
        processGroupId: fixture.timeoutCase.processGroupId,
        signal: "SIGTERM",
      },
    ]);
    expect(manager.status().running).toBe(false);
  });

  it("cleans up the owned process group when the parent process disappears", async () => {
    const fixture = readFixture();
    const killCalls: Array<{ processGroupId: number; signal: NodeJS.Signals }> = [];
    const manager = new OmnigentProcessManager({
      isParentAlive: () => false,
      kill(processGroupId, signal) {
        killCalls.push({ processGroupId, signal });
      },
      parentPid: fixture.parentDeathCase.parentPid,
      spawn(command) {
        return {
          command,
          pid: fixture.parentDeathCase.processGroupId,
          processGroupId: fixture.parentDeathCase.processGroupId,
        };
      },
    });

    await manager.ensureRunning(fixture.parentDeathCase.command);
    const statusBeforeCleanup = manager.status();
    const cleaned = await manager.enforceParentDeathCleanup();

    expect(statusBeforeCleanup.running).toBe(true);
    expect(statusBeforeCleanup.parentAlive).toBe(false);
    expect(cleaned).toBe(true);
    expect(killCalls).toEqual([
      {
        processGroupId: fixture.parentDeathCase.processGroupId,
        signal: "SIGTERM",
      },
    ]);
    expect(manager.status().running).toBe(false);
  });
});
