import { readFileSync } from "node:fs";

import type { OmnigentCapabilityStatus } from "./types.js";

export interface OmnigentSourceMetadataFixture {
  readonly freeze_target: {
    readonly commit: string;
    readonly package_version: string;
    readonly published_at: string;
    readonly requires_python: string;
    readonly tag: string;
  };
}

export interface OmnigentHttpSurfaceFixture {
  readonly harness_endpoints?: Array<{
    readonly method: string;
    readonly path: string;
    readonly purpose: string;
  }>;
  readonly session_endpoints: Array<{
    readonly method: string;
    readonly path: string;
    readonly purpose: string;
  }>;
  readonly stream_contract: {
    readonly done_sentinel: string;
    readonly mode: string;
    readonly reconnect_steps: string[];
    readonly replay: boolean;
    readonly event_families?: string[];
    readonly official_v0_4_event_count?: number;
  };
}

export interface OmnigentCliSurfaceFixture {
  readonly documented_commands: string[];
  readonly entrypoints: Array<{
    readonly name: string;
    readonly target: string;
  }>;
  readonly exit_code_contract: {
    readonly nonzero_codes_are_stable_abi: boolean;
    readonly success_code: number;
  };
}

export interface OmnigentCapabilityProbeFixture {
  readonly capabilities: Array<{
    readonly name: string;
    readonly status: OmnigentCapabilityStatus;
    readonly evidence: string[];
  }>;
}

export interface OmnigentEventFixture {
  readonly ack?: {
    readonly queued: boolean;
  };
  readonly events?: Array<{
    readonly reason?: string;
    readonly semantic_terminal?: boolean;
    readonly status?: string;
    readonly terminal?: boolean;
    readonly type: string;
  }>;
  readonly expected_provider_behavior?: string;
  readonly fixture: string;
  readonly frames?: Array<{
    readonly client_action: string;
    readonly shape?: string;
    readonly type?: string;
  }>;
}

export interface OmnigentErrorFixture {
  readonly fixture: string;
  readonly note?: string;
  readonly provider_status?: OmnigentCapabilityStatus;
  readonly response?: {
    readonly class: string;
    readonly status_code: number;
  };
}

export interface OmnigentFakeServerScenarioCatalog {
  readonly scenarios: Array<{
    readonly capabilities: string[];
    readonly fixtures: string[];
    readonly name: string;
  }>;
}

const omnigentFixtureRoot = new URL("../../../fixtures/omnigent/", import.meta.url);

export function readOmnigentFixture<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(new URL(relativePath, omnigentFixtureRoot), "utf8"),
  ) as T;
}

export function loadOmnigentSourceMetadata(): OmnigentSourceMetadataFixture {
  return readOmnigentFixture<OmnigentSourceMetadataFixture>(
    "discovery/source-metadata.json",
  );
}

export function loadOmnigentHttpSurface(): OmnigentHttpSurfaceFixture {
  return readOmnigentFixture<OmnigentHttpSurfaceFixture>(
    "discovery/http-surface.json",
  );
}

export function loadOmnigentCliSurface(): OmnigentCliSurfaceFixture {
  return readOmnigentFixture<OmnigentCliSurfaceFixture>(
    "discovery/cli-surface.json",
  );
}

export function loadOmnigentCapabilityMatrix(): OmnigentCapabilityProbeFixture {
  return readOmnigentFixture<OmnigentCapabilityProbeFixture>(
    "discovery/capability-probes.json",
  );
}

export function loadOmnigentEventFixture(name: string): OmnigentEventFixture {
  return readOmnigentFixture<OmnigentEventFixture>(`events/${name}.json`);
}

export function loadOmnigentErrorFixture(name: string): OmnigentErrorFixture {
  return readOmnigentFixture<OmnigentErrorFixture>(`errors/${name}.json`);
}

export function loadOmnigentFakeServerScenarios(): OmnigentFakeServerScenarioCatalog {
  return readOmnigentFixture<OmnigentFakeServerScenarioCatalog>(
    "fake-server/scenarios.json",
  );
}
