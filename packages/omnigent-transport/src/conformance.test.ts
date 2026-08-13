import { describe, expect, it } from "vitest";

import {
  loadOmnigentCapabilityMatrix,
  loadOmnigentCliSurface,
  loadOmnigentFakeServerScenarios,
  loadOmnigentHttpSurface,
  loadOmnigentSourceMetadata,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import { FakeOmnigentServer } from "./fake-omnigent-server.js";
import { omnigentStreamEventTypes } from "./types.js";

describe("official Omnigent v0.9 conformance", () => {
  it("freezes the release authority without broadening neutral capabilities", () => {
    const source = loadOmnigentSourceMetadata();
    const http = loadOmnigentHttpSurface();
    const cli = loadOmnigentCliSurface();
    const capabilities = loadOmnigentCapabilityMatrix();
    const wire = loadOmnigentV09WireContract();

    expect(source.freeze_target).toEqual(
      expect.objectContaining({
        commit: "cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2",
        package_version: "0.9.0",
        requires_python: ">=3.12",
        tag: "v0.9.0",
      }),
    );
    expect(wire.authority).toEqual(
      expect.objectContaining({
        commit: source.freeze_target.commit,
        tag: source.freeze_target.tag,
      }),
    );
    expect(http.openapi_delta).toEqual(
      expect.objectContaining({
        added_paths: [],
        added_schemas: [],
        operation_count: 97,
        removed_paths: [],
        removed_schemas: [],
      }),
    );
    expect(http.openapi_delta?.changed_schemas).toEqual([
      "ChildSessionSummary",
      "ImportSessionRequest",
      "RoutingDecisionData",
      "SessionResponse",
      "SessionStatusEvent",
      "UpdateSessionRequest",
    ]);
    const routingDecision = wire.conversation_items.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "routing_decision",
    ) as Record<string, unknown>;
    expect(routingDecision).toEqual(
      expect.objectContaining({
        applied: true,
        decision_id: "route-1",
        model: "model-routed",
        rationale: "Selected for the task.",
        scope: "turn",
      }),
    );
    expect(routingDecision).not.toHaveProperty("data");
    const snapshotItem = (
      wire.session_response as { items: Array<Record<string, unknown>> }
    ).items[0];
    expect(snapshotItem).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant" }),
      }),
    );
    expect(snapshotItem).not.toHaveProperty("role");
    expect(
      (wire.session_response as { pending_inputs: unknown[] }).pending_inputs,
    ).toEqual([
      {
        content: [{ text: "pending snapshot", type: "input_text" }],
        pending_id: "pending-snapshot-1",
      },
    ]);
    expect(wire.sse_frames).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          cleared_pending_id: "pending-1",
          item_id: "message-user",
        }),
        type: "session.input.consumed",
      }),
    );
    expect(wire.item_only_sse_frames).toEqual([
      expect.objectContaining({ type: "response.created" }),
      expect.objectContaining({
        item: expect.objectContaining({
          response_id: "response-item-only",
          role: "assistant",
          type: "message",
        }),
        type: "response.output_item.done",
      }),
      expect.objectContaining({ type: "response.completed" }),
    ]);
    expect(wire.acknowledgements).toContainEqual({ queued: false });
    expect(omnigentStreamEventTypes).toHaveLength(52);
    expect(cli.documented_commands).toContain("omnigent server --background");
    expect(cli.documented_commands).not.toContain("omnigent server start");
    expect(cli.deprecated_aliases).toContainEqual({
      command: "omnigent server start",
      production_usage: false,
      replacement: "omnigent server --background",
      visibility: "hidden",
      warning: true,
    });

    const capabilityNames = capabilities.capabilities.map(({ name }) => name);
    expect(capabilities.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "child_session", status: "blocked" }),
        expect.objectContaining({ name: "harness_override", status: "blocked" }),
      ]),
    );
    for (const forbidden of ["approval", "authority", "lease", "lock", "route_decision"]) {
      expect(capabilityNames).not.toContain(forbidden);
    }
  });

  it("serves exact tagged create, page, event, and SSE shapes", async () => {
    const server = await FakeOmnigentServer.start();
    try {
      const create = await fetch(`${server.baseUrl}/v1/sessions`, {
        body: JSON.stringify({
          agent_id: "agent-conformance",
          initial_items: [],
          title: "Conformance",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const snapshot = (await create.json()) as Record<string, unknown>;
      expect(snapshot).toEqual(
        expect.objectContaining({
          active_response_id: null,
          agent_id: "agent-conformance",
          created_at: expect.any(Number),
          id: expect.any(String),
          items: [],
          status: "idle",
          updated_at: expect.any(Number),
        }),
      );
      expect(snapshot).not.toHaveProperty("createdAt");
      expect(snapshot).not.toHaveProperty("backend");

      const list = (await (
        await fetch(`${server.baseUrl}/v1/sessions?limit=1000&order=asc`)
      ).json()) as Record<string, unknown>;
      expect(list).toEqual(
        expect.objectContaining({ data: expect.any(Array), has_more: false }),
      );
      expect(list.data).toEqual([
        expect.objectContaining({
          agent_id: "agent-conformance",
          updated_at: expect.any(Number),
        }),
      ]);

      const sessionId = String(snapshot.id);
      const turn = await fetch(`${server.baseUrl}/v1/sessions/${sessionId}/events`, {
        body: JSON.stringify({
          data: {
            content: [{ text: "hello", type: "input_text" }],
            role: "user",
          },
          type: "message",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(turn.status).toBe(202);
      expect(await turn.json()).toEqual({ item_id: "message-user-1", queued: true });

      const history = (await (
        await fetch(`${server.baseUrl}/v1/sessions/${sessionId}/items`)
      ).json()) as { data: Array<Record<string, unknown>> };
      expect(history.data[0]).toEqual(
        expect.objectContaining({
          content: [{ text: "hello", type: "input_text" }],
          role: "user",
        }),
      );
      expect(history.data[0]).not.toHaveProperty("data");

      const refreshedSnapshot = (await (
        await fetch(`${server.baseUrl}/v1/sessions/${sessionId}`)
      ).json()) as { items: Array<Record<string, unknown>> };
      expect(refreshedSnapshot.items[0]).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            content: [{ text: "hello", type: "input_text" }],
            role: "user",
          }),
        }),
      );
      expect(refreshedSnapshot.items[0]).not.toHaveProperty("role");

      const interrupt = await fetch(
        `${server.baseUrl}/v1/sessions/${sessionId}/events`,
        {
          body: JSON.stringify({ data: {}, type: "interrupt" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      expect(await interrupt.json()).toEqual({ queued: false });

      const rawStream = await (
        await fetch(`${server.baseUrl}/v1/sessions/${sessionId}/stream`)
      ).text();
      expect(rawStream).toContain('"type":"response.created"');
      expect(rawStream).toContain('"response":{"created_at"');
      expect(rawStream).not.toContain('"occurredAt"');
      expect(rawStream).not.toContain('"sessionId"');

      expect(loadOmnigentFakeServerScenarios().scenarios).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "v0_9_official_wire" }),
        ]),
      );
    } finally {
      await server.stop();
    }
  });
});
