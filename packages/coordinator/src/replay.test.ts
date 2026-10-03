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

import { explainRouteDecision, replayTaskRouting } from "./index.js";

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
