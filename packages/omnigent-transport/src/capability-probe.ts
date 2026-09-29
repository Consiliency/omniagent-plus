import type {
  AgentRuntimeProvider,
  HarnessId,
  OmnigentCapabilitySnapshot,
  ProviderHealth,
} from "@consiliency/runtime-provider";

import {
  loadOmnigentCapabilityMatrix,
} from "./contract-fixtures.js";

export interface OmnigentCapabilityProbeOptions {
  readonly capturedAt?: string;
  readonly endpoint?: string;
  readonly supportedHarnesses?: HarnessId[];
}

function mapCapabilities() {
  const matrix = loadOmnigentCapabilityMatrix();
  const statuses = new Map(
    matrix.capabilities.map((capability) => [capability.name, capability.status]),
  );

  const enabled = (name: string) => {
    const status = statuses.get(name);
    return status === "supported" || status === "emulated";
  };

  return {
    canCancel: enabled("cancel_turn"),
    canClose: enabled("close_session"),
    canCreateSession: enabled("create_session"),
    canListSessions: enabled("list_sessions"),
    canReadHistory: enabled("read_history"),
    canSendTurn: enabled("send_turn"),
    canSpawnChildSessions: enabled("child_session"),
    canStreamEvents: enabled("stream_events"),
    canUseHarnessOverride: enabled("harness_override"),
  };
}

function buildSnapshot(
  health: ProviderHealth,
  options: OmnigentCapabilityProbeOptions = {},
): OmnigentCapabilitySnapshot {
  return {
    capabilities: mapCapabilities(),
    capturedAt: options.capturedAt ?? new Date().toISOString(),
    endpoint: options.endpoint,
    runtime: health.runtime,
    schema: "omnigent_capability_snapshot.v0.1",
    supportedHarnesses:
      options.supportedHarnesses ?? ["claude-code", "codex", "opencode", "pi"],
  };
}

export async function probeOmnigentCapabilities(
  provider: Pick<AgentRuntimeProvider, "health">,
  options: OmnigentCapabilityProbeOptions = {},
): Promise<OmnigentCapabilitySnapshot> {
  return buildSnapshot(await provider.health(), options);
}

export function snapshotFromHealth(
  health: ProviderHealth,
  options: OmnigentCapabilityProbeOptions = {},
): OmnigentCapabilitySnapshot {
  return buildSnapshot(health, options);
}
