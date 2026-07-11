import { describe, expect, it } from "vitest";

import { snapshotFromHealth } from "./capability-probe.js";

describe("capability probe", () => {
  it("builds a capability snapshot from provider health and frozen contract fixtures", () => {
    const snapshot = snapshotFromHealth(
      {
        activeSessions: 1,
        available: true,
        backend: "omnigent-http",
        runtime: "omnigent",
        sessionStateDrift: [],
      },
      {
        capturedAt: "2026-06-30T00:00:00.000Z",
        endpoint: "http://127.0.0.1:4010",
      },
    );

    expect(snapshot.capabilities.canClose).toBe(true);
    expect(snapshot.capabilities.canSpawnChildSessions).toBe(false);
    expect(snapshot.endpoint).toBe("http://127.0.0.1:4010");
    expect(snapshot.gitSha).toBe("08285468e098244ac0b0bf98cb470d5c1a1a7070");
    expect(snapshot.version).toBe("0.5.1");
  });
});
