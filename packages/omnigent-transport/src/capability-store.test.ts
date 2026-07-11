import { describe, expect, it } from "vitest";

import {
  OmnigentCapabilityStore,
  type OmnigentCapabilityLedger,
} from "./capability-store.js";
import { snapshotFromHealth } from "./capability-probe.js";

describe("capability store", () => {
  it("persists capability snapshots through a structural ledger contract", async () => {
    const ledger: OmnigentCapabilityLedger = {
      async appendCapabilitySnapshot(snapshot) {
        return {
          kind: "capability_snapshot",
          payload: snapshot,
          recordedAt: "2026-06-30T00:00:00.000Z",
          recordId: "capability-1",
          schema: "state_ledger_record.v0.1",
          schemaVersion: 1,
          sequence: 1,
        };
      },
    };
    const store = new OmnigentCapabilityStore(ledger);
    const snapshot = snapshotFromHealth({
      activeSessions: 0,
      available: true,
      backend: "omnigent-http",
      runtime: "omnigent",
      sessionStateDrift: [],
    });

    const record = await store.append(snapshot);

    expect(record.kind).toBe("capability_snapshot");
    expect(record.payload.capabilities.canClose).toBe(true);
  });
});
