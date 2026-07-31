import { describe, expect, it } from "vitest";

import {
  omnigentCapabilityStatuses,
  omnigentMcpServerStartupStatuses,
  omnigentProviderModes,
  omnigentResponseStatuses,
  omnigentSessionStatuses,
  omnigentStreamEventTypes,
  type OmnigentHarnessCatalogResponse,
  type OmnigentHttpClientOptions,
  type OmnigentNativeModelOption,
  type OmnigentRawEvent,
  type OmnigentSessionSnapshot,
} from "./types.js";

describe("transport types", () => {
  it("freezes the provider modes, capability states, and stream events", () => {
    const httpOptions: OmnigentHttpClientOptions = {
      baseUrl: "http://127.0.0.1:4010",
    };
    const rawEvent: OmnigentRawEvent = {
      id: "item-1",
      type: "response.output_text.delta",
      sessionId: "session-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      delta: "hello",
      itemId: "item-1",
    };
    const snapshot: OmnigentSessionSnapshot = {
      id: "session-1",
      title: "transport test",
      status: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      backend: "omnigent-http",
      active_response_id: "response-1",
      background_task_count: 1,
      mcp_startup: {
        "safe-server": { error: null, status: "ready" },
      },
      parent_session_id: "session-parent",
      project_id: "project-1",
      model_options: [
        {
          defaultReasoningEffort: "medium",
          displayName: "Codex",
          id: "gpt-5.6-codex",
          isDefault: true,
          model: "gpt-5.6-codex",
          supportedReasoningEfforts: [
            {
              description: "Balanced reasoning",
              reasoningEffort: "medium",
            },
          ],
        },
      ],
      items: [{ id: "item-1", event: rawEvent }],
      viewer_last_seen: 1_780_000_000,
      viewer_unread: false,
    };
    const harnessCatalog: OmnigentHarnessCatalogResponse = {
      local: [{ name: "codex", public_session_override: false }],
    };
    const modelOption: OmnigentNativeModelOption | undefined =
      snapshot.model_options?.[0];
    const camelSnapshot: OmnigentSessionSnapshot = {
      backend: "omnigent-http",
      createdAt: "2026-06-30T00:00:00.000Z",
      id: "session-camel",
      items: [],
      modelOptions: snapshot.model_options,
      projectId: "project-camel",
      status: "idle",
      title: "camel aliases",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    const reasoningEvent: OmnigentRawEvent = {
      id: "reasoning-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      reasoning_effort: "medium",
      sessionId: "session-1",
      type: "session.reasoning_effort",
    };
    const mcpStartupEvent: OmnigentRawEvent = {
      id: "mcp-startup-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      servers: {
        "safe-server": { error: null, status: "starting" },
      },
      sessionId: "session-1",
      type: "session.mcp_startup",
    };
    const policyDeniedEvent: OmnigentRawEvent = {
      id: "policy-denied-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      phase: "tool_call",
      reason: "metadata_only_policy_denied",
      sessionId: "session-1",
      type: "response.policy_denied",
    };
    const browserActionEvent: OmnigentRawEvent = {
      action: "snapshot",
      action_id: "baction_metadata_only",
      args: {},
      id: "browser-action-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      sessionId: "session-1",
      type: "browser.action_request",
    };
    const toolOutputDeltaEvent: OmnigentRawEvent = {
      call_id: "call_metadata_only",
      delta: "metadata-only tool output",
      id: "tool-output-delta-1",
      occurredAt: "2026-06-30T00:00:00.000Z",
      sessionId: "session-1",
      type: "response.function_call_output.delta",
    };

    expect(httpOptions.baseUrl).toContain("127.0.0.1");
    expect(omnigentProviderModes).toEqual(["http", "cli", "hybrid"]);
    expect(omnigentCapabilityStatuses).toContain("emulated");
    expect(omnigentSessionStatuses).toEqual([
      "idle",
      "launching",
      "running",
      "waiting",
      "failed",
    ]);
    expect(omnigentResponseStatuses).toEqual([
      "queued",
      "in_progress",
      "completed",
      "failed",
      "incomplete",
      "cancelled",
    ]);
    expect(omnigentMcpServerStartupStatuses).toEqual([
      "starting",
      "ready",
      "failed",
      "cancelled",
    ]);
    expect(omnigentStreamEventTypes).toContain("response.output_text.delta");
    expect(omnigentStreamEventTypes).toContain("response.reasoning_text.delta");
    expect(omnigentStreamEventTypes).toContain("response.elicitation_request");
    expect(omnigentStreamEventTypes).toContain("session.usage");
    expect(omnigentStreamEventTypes).toContain("session.heartbeat");
    expect(omnigentStreamEventTypes).toContain("session.mcp_startup");
    expect(omnigentStreamEventTypes).toContain("response.policy_denied");
    expect(omnigentStreamEventTypes).toContain("browser.action_request");
    expect(omnigentStreamEventTypes).toContain(
      "response.function_call_output.delta",
    );
    expect(omnigentStreamEventTypes).toHaveLength(52);
    expect(snapshot.items[0]?.event.delta).toBe("hello");
    expect(snapshot.active_response_id).toBe("response-1");
    expect(snapshot.background_task_count).toBe(1);
    expect(camelSnapshot.modelOptions?.[0]?.id).toBe("gpt-5.6-codex");
    expect(camelSnapshot.projectId).toBe("project-camel");
    expect(harnessCatalog.local?.[0]?.name).toBe("codex");
    expect(reasoningEvent.reasoning_effort).toBe("medium");
    expect(snapshot.mcp_startup?.["safe-server"]?.status).toBe("ready");
    expect(snapshot.parent_session_id).toBe("session-parent");
    expect(snapshot.project_id).toBe("project-1");
    expect(modelOption?.supportedReasoningEfforts?.[0]?.reasoningEffort).toBe(
      "medium",
    );
    expect(mcpStartupEvent.servers?.["safe-server"]?.status).toBe("starting");
    expect(policyDeniedEvent.phase).toBe("tool_call");
    expect(browserActionEvent.action_id).toBe("baction_metadata_only");
    expect(toolOutputDeltaEvent.call_id).toBe("call_metadata_only");
  });
});
