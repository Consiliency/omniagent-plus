import { describe, expect, it } from "vitest";

import {
  createCliProvider,
  createCommandBackedCliTransport,
} from "./cli-client.js";
import type { OmnigentCliCommandRunner } from "./types.js";

async function collectAsync<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) {
    result.push(value);
  }
  return result;
}

describe("cli provider", () => {
  it("uses documented run, attach, resume, and server status commands", async () => {
    const commands: string[] = [];
    const runner: OmnigentCliCommandRunner = async (command, options) => {
      commands.push(command.join(" "));
      if (command[0] === "omnigent" && command[1] === "run") {
        return {
          command,
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            session: {
              backend: "omnigent-cli",
              createdAt: "2026-06-30T00:00:00.000Z",
              id: "session-cli",
              items: [],
              status: "idle",
              title: "CLI provider",
              updatedAt: "2026-06-30T00:00:00.000Z",
            },
          }),
        };
      }
      if (command[0] === "omnigent" && command[1] === "attach") {
        if (command[2] === "session-cli" && options?.input) {
          return {
            command,
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
              handle: {
                createdAt: "2026-06-30T00:00:01.000Z",
                idempotencyKey: "cli-turn",
                sessionId: "session-cli",
                state: "running",
                turnId: "turn-cli",
                updatedAt: "2026-06-30T00:00:01.000Z",
              },
            }),
          };
        }
        return {
          command,
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            rawEvents: [
              {
                id: "cli-session-created",
                itemId: "cli-session-created",
                occurredAt: "2026-06-30T00:00:00.000Z",
                sessionId: "session-cli",
                status: "launching",
                type: "session.created",
              },
              {
                id: "cli-1",
                itemId: "cli-1",
                message: "hello",
                occurredAt: "2026-06-30T00:00:01.000Z",
                sessionId: "session-cli",
                turnId: "turn-cli",
                type: "response.created",
              },
              {
                delta: "hello",
                id: "cli-2",
                itemId: "cli-2",
                occurredAt: "2026-06-30T00:00:02.000Z",
                sessionId: "session-cli",
                turnId: "turn-cli",
                type: "response.output_text.delta",
              },
              {
                id: "cli-3",
                itemId: "cli-3",
                occurredAt: "2026-06-30T00:00:03.000Z",
                outputText: "hello",
                sessionId: "session-cli",
                turnId: "turn-cli",
                type: "response.completed",
              },
            ],
          }),
        };
      }
      if (command[0] === "omnigent" && command[1] === "resume") {
        return {
          command,
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            history: [
              {
                event: {
                  id: "cli-history-session-created",
                  itemId: "cli-history-session-created",
                  occurredAt: "2026-06-30T00:00:00.000Z",
                  sessionId: "session-cli",
                  status: "launching",
                  type: "session.created",
                },
                id: "cli-history-session-created",
              },
              {
                event: {
                  id: "cli-history-1",
                  itemId: "cli-history-1",
                  message: "hello",
                  occurredAt: "2026-06-30T00:00:01.000Z",
                  sessionId: "session-cli",
                  turnId: "turn-cli",
                  type: "response.created",
                },
                id: "cli-history-1",
              },
            ],
            session: {
              backend: "omnigent-cli",
              createdAt: "2026-06-30T00:00:00.000Z",
              id: "session-cli",
              items: [],
              status: "idle",
              title: "CLI provider",
              updatedAt: "2026-06-30T00:00:03.000Z",
            },
            state: "idle",
          }),
        };
      }
      return {
        command,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({ running: true }),
      };
    };

    const provider = createCliProvider({
      commandRunner: runner,
    });
    const session = await provider.createSession({
      agentSpec: {
        kind: "named_agent",
        value: "demo-agent",
      },
      idempotencyKey: "cli-session",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "CLI provider",
    });
    await provider.sendTurn({
      idempotencyKey: "cli-turn",
      message: "hello",
      sessionId: session.id,
    });
    const history = await provider.readHistory(session.id);
    const streamed = await collectAsync(provider.streamEvents(session.id));
    const health = await provider.health();

    expect(commands).toEqual(
      expect.arrayContaining([
        "omnigent run demo-agent",
        "omnigent attach session-cli",
        "omnigent resume session-cli",
        "omnigent server status --json",
      ]),
    );
    expect(history.events.some((event) => event.type === "runtime.turn.started")).toBe(
      true,
    );
    expect(
      history.events.some((event) => event.type === "runtime.session.created"),
    ).toBe(true);
    expect(
      streamed.some((event) => event.type === "runtime.session.created"),
    ).toBe(true);
    expect(streamed.some((event) => event.type === "runtime.turn.completed")).toBe(
      true,
    );
    expect(health.backend).toBe("omnigent-cli");
  });

  it("uses the tagged background start and direct JSON status contract", async () => {
    const commands: string[] = [];
    let running = false;
    const transport = createCommandBackedCliTransport(async (command) => {
      commands.push(command.join(" "));
      if (command.join(" ") === "omnigent server --background") {
        running = true;
        return {
          command,
          exitCode: 0,
          stderr: "",
          stdout: "Started background server at http://127.0.0.1:6767\n",
        };
      }
      return {
        command,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          daemon_attached: false,
          live_sessions: running ? 1 : null,
          log_path: running ? "/tmp/omnigent.log" : null,
          pid: running ? 4242 : null,
          port: running ? 6767 : null,
          running,
          url: running ? "http://127.0.0.1:6767" : null,
        }),
      };
    });

    await expect(transport.serverStatus?.()).resolves.toEqual({
      baseUrl: undefined,
      pid: undefined,
      running: false,
    });
    await expect(transport.serverStart?.()).resolves.toEqual({
      baseUrl: "http://127.0.0.1:6767",
      pid: 4242,
      running: true,
    });
    await expect(transport.health()).resolves.toEqual(
      expect.objectContaining({
        available: true,
        backend: "omnigent-cli",
      }),
    );
    expect(commands).toEqual([
      "omnigent server status --json",
      "omnigent server --background",
      "omnigent server status --json",
      "omnigent server status --json",
    ]);
  });

  it("reports backend_capability_missing for cancel in CLI fallback mode", async () => {
    const provider = createCliProvider({
      commandRunner: async (command) => ({
        command,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          server: {
            running: true,
          },
          session: {
            backend: "omnigent-cli",
            createdAt: "2026-06-30T00:00:00.000Z",
            id: "session-cli-capability",
            items: [],
            status: "idle",
            title: "CLI provider",
            updatedAt: "2026-06-30T00:00:00.000Z",
          },
        }),
      }),
    });
    const session = await provider.createSession({
      idempotencyKey: "cli-capability",
      runtime: "omnigent",
      targetHarness: "codex",
      title: "CLI provider",
    });

    await expect(
      provider.cancelTurn({
        createdAt: "2026-06-30T00:00:00.000Z",
        idempotencyKey: "cli-turn",
        sessionId: session.id,
        state: "running",
        turnId: "turn-cli",
        updatedAt: "2026-06-30T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      category: "backend_capability_missing",
    });
  });
});
