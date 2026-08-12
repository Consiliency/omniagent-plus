import { describe, expect, it } from "vitest";

import { FakeOmnigentServer } from "./fake-omnigent-server.js";
import { createHybridProvider } from "./hybrid-provider.js";
import { OmnigentProcessManager } from "./process-manager.js";
import type { OmnigentCliSessionTransport, OmnigentSessionSnapshot } from "./types.js";

describe("hybrid provider", () => {
  it("starts the local server, then delegates transport calls to the HTTP provider", async () => {
    const server = await FakeOmnigentServer.start();
    const commandStarts: string[] = [];
    const serverTransitions: string[] = [];
    let running = false;
    const processManager = new OmnigentProcessManager({
      kill: () => undefined,
      spawn(command) {
        commandStarts.push(command.join(" "));
        return {
          command,
          pid: 55,
          processGroupId: 55,
        };
      },
    });

    const cliTransport: OmnigentCliSessionTransport = {
      async createSession() {
        throw new Error("not used");
      },
      async sendTurn() {
        throw new Error("not used");
      },
      async readHistory() {
        return [];
      },
      async streamEvents() {
        return [];
      },
      async cancelTurn(handle) {
        return handle;
      },
      async closeSession() {
        return;
      },
      async getSessionInfo() {
        return {
          session: {
            backend: "omnigent-http",
            createdAt: "2026-06-30T00:00:00.000Z",
            id: "unused",
            items: [],
            status: "idle",
            title: "unused",
            updatedAt: "2026-06-30T00:00:00.000Z",
          } satisfies OmnigentSessionSnapshot,
          state: "idle",
        };
      },
      async health() {
        return {
          activeSessions: 0,
          available: running,
          backend: "omnigent-cli",
          runtime: "omnigent",
          sessionStateDrift: [],
        };
      },
      async serverStatus() {
        serverTransitions.push("status");
        return { running };
      },
      async serverStart() {
        running = true;
        serverTransitions.push("start");
        return { running: true };
      },
      async serverStop() {
        running = false;
        serverTransitions.push("stop");
      },
    };

    try {
      const provider = createHybridProvider({
        baseUrl: server.baseUrl,
        cliTransport,
        processManager,
        stopServerOnClose: true,
      });
      const session = await provider.createSession({
        agentSpec: { kind: "named_agent", value: "agent-hybrid" },
        idempotencyKey: "hybrid-session",
        runtime: "omnigent",
        targetHarness: "codex",
        title: "Hybrid provider",
      });
      await provider.closeSession(session.id);

      expect(commandStarts).toEqual(["omnigent server --background"]);
      expect(serverTransitions).toEqual(["status", "start", "stop"]);
      expect(processManager.status().running).toBe(false);
    } finally {
      await server.stop();
    }
  });
});
