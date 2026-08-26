import { describe, expect, it } from "vitest";

import {
  loadOmnigentCapabilityMatrix,
  loadOmnigentCliSurface,
  loadOmnigentFakeServerScenarios,
  loadOmnigentHttpSurface,
  loadOmnigentSourceMetadata,
  loadOmnigentV011WireContract,
  loadOmnigentV010WireContract,
  loadOmnigentV09WireContract,
} from "./contract-fixtures.js";
import { mapHttpFailure } from "./failure-mapper.js";
import { FakeOmnigentServer } from "./fake-omnigent-server.js";
import { OmnigentHttpError } from "./http-client.js";
import { omnigentStreamEventTypes } from "./types.js";

describe("official Omnigent v0.11 conformance", () => {
  it("freezes the release authority without broadening neutral capabilities", () => {
    const source = loadOmnigentSourceMetadata();
    const http = loadOmnigentHttpSurface();
    const cli = loadOmnigentCliSurface();
    const capabilities = loadOmnigentCapabilityMatrix();
    const wire = loadOmnigentV011WireContract();
    const historicalV010Wire = loadOmnigentV010WireContract();
    const historicalV09Wire = loadOmnigentV09WireContract();

    expect(source.freeze_target).toEqual(
      expect.objectContaining({
        commit: "496b7b13f6af3ed5330b957df408fc91290b6307",
        package_version: "0.11.0",
        requires_python: ">=3.12",
        tag: "v0.11.0",
      }),
    );
    expect(wire.authority).toEqual(
      expect.objectContaining({
        commit: source.freeze_target.commit,
        tag: source.freeze_target.tag,
      }),
    );
    expect(historicalV010Wire.authority).toEqual(
      expect.objectContaining({
        commit: "40755dd8dddb07e1eb6e4055d1d9936e184ceb9b",
        tag: "v0.10.0",
      }),
    );
    expect(historicalV09Wire.authority).toEqual(
      expect.objectContaining({
        commit: "cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2",
        tag: "v0.9.0",
      }),
    );
    expect(source.preflight_confirmation).toEqual(
      expect.objectContaining({
        added_paths: [],
        added_schemas: [
          "BackgroundTaskInfo",
          "FailedResponseObject",
          "SessionPermissionModeEvent",
          "SessionTitleEvent",
        ],
        changed_schemas: [
          "FailedEvent",
          "ServerStreamEvent",
          "SessionModelEvent",
          "SessionProjectSummary",
          "SessionResponse",
          "SessionStatusEvent",
          "SessionUsage",
          "UpdateSessionRequest",
        ],
        newer_stable_release: false,
        official_release_event_count: 54,
        openapi_operation_count: 100,
        openapi_path_count: 72,
        openapi_schema_count: 143,
        removed_paths: [],
        removed_schemas: [],
      }),
    );
    expect(http.openapi_delta).toEqual(
      expect.objectContaining({
        operation_count: 100,
        path_count: 72,
        schema_count: 143,
      }),
    );

    expect(wire.child_page.data.map(({ task_summary }) => task_summary)).toEqual([
      "Inspect the tagged v0.11 transport contract.",
      null,
    ]);
    expect(http.child_session_public_surface).toEqual(
      expect.objectContaining({
        create_under_parent: false,
        read_only_fields: [
          "routed_model",
          "routing_decision_id",
          "task_summary",
        ],
      }),
    );
    expect(http.structured_error_contract).toEqual(
      expect.objectContaining({
        body_type: "unknown",
        excluded_from_classification: [
          "title",
          "cause",
          "remediation",
          "unknown_additive_fields",
        ],
        pass_through: "lossless",
      }),
    );

    for (const fixture of [
      wire.structured_error,
      wire.structured_policy_error,
    ]) {
      const error = new OmnigentHttpError({
        body: fixture.body,
        headers: { ...fixture.headers },
        method: "POST",
        path: "/v1/sessions/session-123/events",
        statusCode: fixture.status_code,
      });
      const mapped = mapHttpFailure(error);

      expect(mapped.failure.category).toBe(fixture.expected_failure.category);
      expect(mapped.failure.retryable).toBe(fixture.expected_failure.retryable);
      expect(mapped.limitClassification?.type).toBe(
        fixture.expected_failure.limit_type,
      );
      expect(error.body).toBe(fixture.body);
    }

    expect(omnigentStreamEventTypes).toHaveLength(54);
    expect(omnigentStreamEventTypes).toContain("session.permission_mode");
    expect(omnigentStreamEventTypes).toContain("session.title");
    expect(wire.session_response.background_tasks).toEqual([
      expect.objectContaining({ id: "shell-1", status: "running" }),
    ]);
    expect(wire.sse_frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "session.permission_mode" }),
        expect.objectContaining({ type: "session.title" }),
        expect.objectContaining({
          response: expect.objectContaining({ status: "failed" }),
          type: "response.failed",
        }),
      ]),
    );
    expect(
      wire.sse_frames.filter(
        (frame) =>
          typeof frame === "object" &&
          frame !== null &&
          "type" in frame &&
          frame.type === "response.output_text.delta",
      ),
    ).toHaveLength(2);
    expect(wire.item_only_sse_frames).toEqual([
      expect.objectContaining({ type: "response.created" }),
      expect.objectContaining({ type: "response.output_item.done" }),
      expect.objectContaining({ type: "response.completed" }),
    ]);
    expect(wire.acknowledgements).toContainEqual({ queued: false });

    expect(cli.documented_commands).toContain("omnigent server --background");
    expect(cli.non_provider_required_commands).toEqual(
      expect.arrayContaining([
        "omnigent start",
        "omnigent host --background",
      ]),
    );
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
    expect(capabilities.observed_non_capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "bundle_root_isolation",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "shared_editor_approval",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "usage_and_admin_surfaces",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "session_metadata_events",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "permission_mode_mutation",
          provider_capability: false,
        }),
      ]),
    );
    expect(source.security_posture).toEqual(
      expect.objectContaining({
        transport_enforces_bundle_isolation: false,
        v0_10_bundle_root_isolation: true,
      }),
    );
    expect(source.approval_posture).toEqual(
      expect.objectContaining({
        consiliency_authority_granted: false,
        shared_editors_can_approve: true,
      }),
    );
    for (const forbidden of [
      "approval",
      "authority",
      "lease",
      "lock",
      "child_create",
      "route_decision",
    ]) {
      expect(capabilityNames).not.toContain(forbidden);
    }
    expect(
      http.optional_release_surfaces?.filter(
        ({ status }) => status === "observed_not_provider_required",
      ),
    ).toHaveLength(14);
  });

  it("preserves create, page, event, and SSE behavior", async () => {
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
          expect.objectContaining({ name: "v0_11_official_wire" }),
          expect.objectContaining({ name: "v0_10_official_wire" }),
          expect.objectContaining({ name: "v0_9_official_wire" }),
        ]),
      );
    } finally {
      await server.stop();
    }
  });
});
