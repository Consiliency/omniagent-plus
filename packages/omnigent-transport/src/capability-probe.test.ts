import { describe, expect, it } from "vitest";

import {
  loadOmnigentCapabilityMatrix,
  loadOmnigentSourceMetadata,
} from "./contract-fixtures.js";
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
    expect(snapshot.gitSha).toBe("f04b0354fb5344c1ea8b92795ceb6760a9ad7595");
    expect(snapshot.version).toBe("0.12.0");
  });

  it("keeps v0.12 metadata and administration behavior non-capabilities", () => {
    const source = loadOmnigentSourceMetadata();
    const matrix = loadOmnigentCapabilityMatrix();

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
    expect(matrix.observed_non_capabilities).toEqual(
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
          name: "session_metadata_events",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "permission_mode_mutation",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "project_aware_create_and_import",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "configurable_fork",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "existing_branch_checkout",
          provider_capability: false,
        }),
        expect.objectContaining({
          name: "elicitation_resolution_verdict",
          provider_capability: false,
        }),
      ]),
    );
  });
});
