import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AuditLedger } from "@omniagent-plus/state-ledger";
import type {
  LimitClassification,
  RouteDecision,
} from "@consiliency/runtime-provider";

import { classifyLimitSignal } from "@omniagent-plus/rate-limit-catalog";
import { buildIdentityPool, planRoute, explainRouteDecision, replayTaskRouting } from "./index.js";

interface ReplayFixture {
  readonly decision: RouteDecision;
  readonly classification: LimitClassification;
}

function readReplayFixture(): ReplayFixture {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../fixtures/coordinator/replay/task-route-replay.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as ReplayFixture;
}

describe("route replay", () => {
  it.each(["provider", "harness", "identity"])("replays the resolved original profile after a %s-only fallback preference", async (preference) => {
    const classification = { ...classifyLimitSignal({ provider: "openai", harness: "codex", statusCode: 429, bodyText: "quota exceeded until reset" }), identityProfileId: "original" };
    const identityPool = buildIdentityPool({ profiles: [
      { id: "original", provider: "openai", harness: "codex", authMode: "local_subscription", isolation: "host_env", maxOpenSessions: 2, maxActiveTurns: 2 },
      { id: "fallback", provider: "google", harness: "gemini-antigravity", authMode: "local_subscription", isolation: "host_env", maxOpenSessions: 2, maxActiveTurns: 2 },
    ], classificationByProfileId: { original: classification }, now: "2026-06-30T00:00:00Z" });
    const decision = planRoute({ taskId: "task", identityPool, latestClassification: classification,
      ...(preference === "provider" ? { preferredProvider: "openai" } : preference === "harness" ? { preferredHarness: "codex" } : { preferredIdentityProfileId: "original" }),
      portability: { level: "high", score: 1, migrateAcrossProviders: true, reasons: [] } }).decision;
    expect(decision.selectedIdentityProfileId).toBe("fallback");
    expect(decision.preferredTarget).toEqual({ provider: "openai", harness: "codex", identityProfileId: "original" });
    const unrelated = classifyLimitSignal({ provider: "openai", harness: "codex", statusCode: 401, bodyText: "invalid api key" });
    const reader = { listTaskRecords: async () => [
      { kind: "limit_classification", payload: unrelated },
      { kind: "limit_classification", payload: classification },
      { kind: "route_decision", payload: decision },
    ] };
    expect((await replayTaskRouting(reader, "task"))[0]?.explanation).toContain("limit evidence fixed_window_usage_cap");
    expect((await replayTaskRouting(reader, "task"))[0]?.explanation).not.toContain("limit evidence auth_or_billing_problem");
    const partial = { ...decision, preferredTarget: { provider: "openai" } };
    expect((await replayTaskRouting({ listTaskRecords: async () => [{ kind: "limit_classification", payload: classification }, { kind: "route_decision", payload: partial }] }, "task"))[0]?.explanation).not.toContain("limit evidence");
  });
  it("uses only preceding matching classifications and rejects malformed history", async () => {
    const fixture = readReplayFixture();
    const records = [
      { kind: "route_decision", payload: fixture.decision },
      { kind: "limit_classification", payload: fixture.classification },
      { kind: "route_decision", payload: fixture.decision },
      { kind: "limit_classification", payload: { ...fixture.classification, provider: "anthropic", type: "unknown_limit" } },
      { kind: "route_decision", payload: fixture.decision },
    ];
    const reader = { listTaskRecords: async () => records };
    const replay = await replayTaskRouting(reader, fixture.decision.taskId);
    expect(replay[0]?.explanation).not.toContain("limit evidence");
    expect(replay[1]?.explanation).toContain("limit evidence fixed_window_usage_cap");
    expect(replay[2]?.explanation).not.toContain("unknown_limit");
    await expect(replayTaskRouting({ listTaskRecords: async () => [{ kind: "limit_classification", payload: {} }] }, fixture.decision.taskId)).rejects.toThrow();
  });
  it("replays a task with provider, cooldown, portability, and evidence rationale", async () => {
    const fixture = readReplayFixture();
    const ledger = await AuditLedger.open({
      rootDir: await mkdtemp(join(tmpdir(), "coordinator-replay-")),
    });

    await ledger.appendLimitClassification(fixture.classification, {
      taskId: fixture.decision.taskId,
    });
    await ledger.appendRouteDecision(fixture.decision);

    const replay = await replayTaskRouting(ledger, fixture.decision.taskId);

    expect(replay).toHaveLength(1);
    expect(replay[0]?.selectedProvider).toBe("google");
    expect(replay[0]?.fallbackReason).toBe("fixed_window_usage_cap");
    expect(replay[0]?.explanation).toContain("selected provider google");
    expect(replay[0]?.explanation).toContain("selected harness codex");
    expect(replay[0]?.explanation).toContain(
      "selected identity profile-google-primary",
    );
    expect(replay[0]?.explanation).toContain("active-turn target 2");
    expect(replay[0]?.explanation).toContain(
      "limit evidence fixed_window_usage_cap",
    );
  });

  it("formats replay-safe route explanations", () => {
    const fixture = readReplayFixture();
    const explanation = explainRouteDecision(
      fixture.decision,
      fixture.classification,
    );

    expect(explanation).toContain("selected provider google");
    expect(explanation).toContain("fallback reason fixed_window_usage_cap");
    expect(explanation).toContain("portability score 0.90");
    expect(explanation).toContain("evidence refs route-proof");
  });
});
