import { describe, expect, it } from "vitest";

import {
  omnigentCapabilityStatuses,
  omnigentMcpServerStartupStatuses,
  omnigentProviderModes,
  omnigentResponseStatuses,
  omnigentSessionEventStatuses,
  omnigentSessionStatuses,
  omnigentStreamEventTypes,
  type OmnigentHarnessCatalogResponse,
  type OmnigentChildSessionSummary,
  type OmnigentHttpClientOptions,
  type OmnigentNativeModelOption,
  type OmnigentRawEvent,
  type OmnigentSessionSnapshot,
} from "./types.js";

describe("transport types", () => {
  it("freezes the provider modes, capability states, and stream events", () => {
    const httpOptions: OmnigentHttpClientOptions = {
      allowQueuedTurns: true,
      baseUrl: "http://127.0.0.1:4010",
      sessionMutationFenceStore: {
        read: async () => ({ rejectedTurnIds: [] }),
        write: async () => undefined,
      },
      withExclusiveSessionLease: async (_sessionId, operation) => operation(),
    };
    const snapshot: OmnigentSessionSnapshot = {
      agentId: "agent-session-1",
      id: "session-1",
      title: "transport test",
      status: "idle",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      backend: "omnigent-http",
      activeResponseId: "response-1",
      backgroundTaskCount: 1,
      backgroundTasks: [
        {
          command: "sleep 120",
          description: "Wait for CI",
          futureDetail: "preserved",
          id: "shell-1",
          status: "running",
          type: "shell",
        },
      ],
      mcpStartup: {
        "safe-server": { error: null, status: "ready" },
      },
      parentSessionId: "session-parent",
      projectId: "project-1",
      modelOptions: [
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
      items: [
        {
          content: [{ text: "hello", type: "output_text" }],
          created_at: 1_780_000_000,
          id: "item-1",
          response_id: "response-1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      viewerLastSeen: 1_780_000_000,
      viewerUnread: false,
    };
    const harnessCatalog: OmnigentHarnessCatalogResponse = {
      local: [{ name: "codex", public_session_override: false }],
    };
    const childSummary: OmnigentChildSessionSummary = {
      created_at: 1_780_272_010,
      id: "child-v0-10",
      parent_session_id: "session-1",
      task_summary: "Inspect the tagged v0.10 transport contract.",
      updated_at: 1_780_272_011,
    };
    const modelOption: OmnigentNativeModelOption | undefined =
      snapshot.modelOptions?.[0];
    const camelSnapshot: OmnigentSessionSnapshot = {
      agentId: "agent-session-camel",
      backend: "omnigent-http",
      createdAt: "2026-06-30T00:00:00.000Z",
      id: "session-camel",
      items: [],
      modelOptions: snapshot.modelOptions,
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
    const elicitationResolvedEvent: OmnigentRawEvent = {
      action: "decline",
      elicitation_id: "elicit-v0-12",
      id: "elicitation-resolved-1",
      occurredAt: "2026-09-03T05:15:39.000Z",
      sessionId: "session-1",
      type: "response.elicitation_resolved",
    };

    expect(httpOptions.baseUrl).toContain("127.0.0.1");
    expect(httpOptions.allowQueuedTurns).toBe(true);
    expect(httpOptions.sessionMutationFenceStore).toBeTypeOf("object");
    expect(httpOptions.withExclusiveSessionLease).toBeTypeOf("function");
    expect(omnigentProviderModes).toEqual(["http", "cli", "hybrid"]);
    expect(omnigentCapabilityStatuses).toContain("emulated");
    expect(omnigentSessionStatuses).toEqual([
      "idle",
      "running",
      "waiting",
      "failed",
    ]);
    expect(omnigentSessionEventStatuses).toEqual([
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
    expect(omnigentStreamEventTypes).toEqual([
      "browser.action_request",
      "session.created",
      "session.status",
      "session.input.consumed",
      "session.interrupted",
      "session.child_session.updated",
      "session.usage",
      "session.model",
      "session.model_options",
      "session.reasoning_effort",
      "session.collaboration_mode",
      "session.permission_mode",
      "session.title",
      "session.agent_changed",
      "session.todos",
      "session.terminal_pending",
      "session.sandbox_status",
      "session.skills",
      "session.superseded",
      "session.presence",
      "session.resource.created",
      "session.resource.deleted",
      "session.changed_files.invalidated",
      "session.terminal.activity",
      "session.heartbeat",
      "session.mcp_startup",
      "response.created",
      "response.queued",
      "response.in_progress",
      "response.output_text.delta",
      "response.output_item.done",
      "response.output_file.done",
      "response.reasoning.started",
      "response.reasoning_text.delta",
      "response.reasoning_summary_text.delta",
      "response.retry",
      "response.error",
      "response.compaction.in_progress",
      "response.compaction.completed",
      "response.compaction.failed",
      "response.client_task.cancel",
      "response.heartbeat",
      "response.elicitation_request",
      "response.elicitation_resolved",
      "response.policy_denied",
      "response.function_call_output.delta",
      "response.completed",
      "response.failed",
      "response.incomplete",
      "response.cancelled",
      "turn.started",
      "turn.completed",
      "turn.failed",
      "turn.cancelled",
    ]);
    expect(childSummary.task_summary).toBe(
      "Inspect the tagged v0.10 transport contract.",
    );
    expect(snapshot.items[0]?.id).toBe("item-1");
    expect(snapshot.activeResponseId).toBe("response-1");
    expect(snapshot.backgroundTaskCount).toBe(1);
    expect(snapshot.backgroundTasks?.[0]?.futureDetail).toBe("preserved");
    expect(camelSnapshot.modelOptions?.[0]?.id).toBe("gpt-5.6-codex");
    expect(camelSnapshot.projectId).toBe("project-camel");
    expect(harnessCatalog.local?.[0]?.name).toBe("codex");
    expect(reasoningEvent.reasoning_effort).toBe("medium");
    expect(snapshot.mcpStartup?.["safe-server"]?.status).toBe("ready");
    expect(snapshot.parentSessionId).toBe("session-parent");
    expect(snapshot.projectId).toBe("project-1");
    expect(modelOption?.supportedReasoningEfforts?.[0]?.reasoningEffort).toBe(
      "medium",
    );
    expect(mcpStartupEvent.servers?.["safe-server"]?.status).toBe("starting");
    expect(policyDeniedEvent.phase).toBe("tool_call");
    expect(browserActionEvent.action_id).toBe("baction_metadata_only");
    expect(toolOutputDeltaEvent.call_id).toBe("call_metadata_only");
    expect(elicitationResolvedEvent.elicitation_id).toBe("elicit-v0-12");
    expect(elicitationResolvedEvent.action).toBe("decline");
  });
});
