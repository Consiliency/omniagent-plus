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
    expect(snapshot.version).toBe("0.4.0");
  });
});
