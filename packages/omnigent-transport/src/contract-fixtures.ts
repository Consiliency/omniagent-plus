import { existsSync, readFileSync } from "node:fs";

import type {
  OmnigentCapabilityStatus,
  OmnigentMcpServerStartup,
  OmnigentRawEvent,
} from "./types.js";

export interface OmnigentSourceMetadataFixture {
  readonly approval_posture?: {
    readonly authority: string;
    readonly consiliency_authority_granted: boolean;
    readonly forbidden_capability_expansion: string[];
    readonly shared_editors_can_approve: boolean;
  };
  readonly freeze_target: {
    readonly commit: string;
    readonly package_version: string;
    readonly published_at: string;
    readonly requires_python: string;
    readonly tag: string;
  };
  readonly preflight_confirmation?: {
    readonly added_paths: string[];
    readonly added_schemas: string[];
    readonly added_stream_events: string[];
    readonly changed_schemas: string[];
    readonly newer_stable_release: boolean;
    readonly official_release_event_count: number;
    readonly openapi_operation_count: number;
    readonly openapi_path_count: number;
    readonly openapi_schema_count: number;
    readonly removed_paths: string[];
    readonly removed_schemas: string[];
    readonly removed_stream_events: string[];
    readonly server_background_command: string;
  };
  readonly security_posture?: {
    readonly stable_guarantee: string;
    readonly transport_enforces_bundle_isolation: boolean;
    readonly v0_10_bundle_root_isolation: boolean;
  };
}

export interface OmnigentHttpSurfaceFixture {
  readonly openapi_delta?: {
    readonly operation_count: number;
    readonly path_count?: number;
    readonly schema_count?: number;
    readonly added_paths: string[];
    readonly removed_paths: string[];
    readonly added_schemas: string[];
    readonly removed_schemas: string[];
    readonly changed_schemas?: string[];
  };
  readonly child_session_public_surface?: {
    readonly create_under_parent: boolean;
    readonly read_only_fields: string[];
    readonly task_summary: string;
  };
  readonly endpoint_provenance?: Array<{
    readonly method: string;
    readonly path: string;
    readonly source: string;
    readonly ref: string;
    readonly note?: string;
  }>;
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
  readonly session_list_item_fields?: Readonly<Record<string, string>>;
  readonly session_snapshot_fields?: Readonly<Record<string, string>>;
  readonly optional_release_surfaces?: Array<{
    readonly field?: string;
    readonly method?: string;
    readonly methods?: string[];
    readonly path?: string;
    readonly reason: string;
    readonly status: string;
  }>;
  readonly fork_request?: {
    readonly allowed_fields: string[];
    readonly removed_fields: string[];
    readonly provider_sends_removed_fields: boolean;
  };
  readonly stream_contract: {
    readonly done_sentinel: string;
    readonly mode: string;
    readonly reconnect_steps: string[];
    readonly replay: boolean;
    readonly event_families?: string[];
    readonly official_release_event_count?: number;
    readonly release_event_types?: string[];
  };
  readonly structured_error_contract?: {
    readonly body_type: string;
    readonly classification_fields: string[];
    readonly excluded_from_classification: string[];
    readonly pass_through: string;
  };
}

export interface OmnigentV09WireFixture {
  readonly acknowledgements: unknown[];
  readonly authority: {
    readonly commit: string;
    readonly tag: string;
  };
  readonly child_page: unknown;
  readonly conversation_items: unknown[];
  readonly create_request: unknown;
  readonly item_only_sse_frames: unknown[];
  readonly send_message: unknown;
  readonly session_pages: unknown[];
  readonly session_response: unknown;
  readonly sse_frames: unknown[];
}

interface OmnigentStructuredHttpErrorFixture {
  readonly body: Readonly<Record<string, unknown>>;
  readonly expected_failure: {
    readonly category: string;
    readonly limit_type: string;
    readonly retryable: boolean;
  };
  readonly headers: Readonly<Record<string, string>>;
  readonly status_code: number;
}

export interface OmnigentV010WireFixture extends OmnigentV09WireFixture {
  readonly child_page: {
    readonly data: Array<
      Readonly<
        Record<string, unknown> & {
          readonly task_summary?: string | null;
        }
      >
    >;
    readonly first_id: string | null;
    readonly has_more: boolean;
    readonly last_id: string | null;
  };
  readonly structured_error: OmnigentStructuredHttpErrorFixture;
  readonly structured_policy_error: OmnigentStructuredHttpErrorFixture;
}

export interface OmnigentCliSurfaceFixture {
  readonly deprecated_aliases?: Array<{
    readonly command: string;
    readonly production_usage: boolean;
    readonly replacement: string;
    readonly visibility: string;
    readonly warning: boolean;
  }>;
  readonly documented_commands: string[];
  readonly non_provider_required_commands?: string[];
  readonly entrypoints: Array<{
    readonly name: string;
    readonly target: string;
  }>;
  readonly exit_code_contract: {
    readonly nonzero_codes_are_stable_abi: boolean;
    readonly success_code: number;
  };
  readonly release?: {
    readonly commit: string;
    readonly tag: string;
    readonly version_output: string;
  };
}

export interface OmnigentCapabilityProbeFixture {
  readonly capabilities: Array<{
    readonly name: string;
    readonly status: OmnigentCapabilityStatus;
    readonly evidence: string[];
  }>;
  readonly observed_non_capabilities?: Array<{
    readonly name: string;
    readonly provider_capability: boolean;
    readonly [key: string]: unknown;
  }>;
  readonly release?: {
    readonly commit: string;
    readonly tag: string;
  };
}

export interface OmnigentEventFixture {
  readonly ack?: {
    readonly queued: boolean;
  };
  readonly events?: Array<{
    readonly action?: string;
    readonly action_id?: string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly call_id?: string;
    readonly delta?: string;
    readonly phase?: string;
    readonly reason?: string;
    readonly servers?: Readonly<Record<string, OmnigentMcpServerStartup>>;
    readonly semantic_terminal?: boolean;
    readonly status?: string;
    readonly terminal?: boolean;
    readonly type: OmnigentRawEvent["type"];
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

const omnigentFixtureRoots = [
  new URL("./fixtures/", import.meta.url),
  new URL("../../../fixtures/omnigent/", import.meta.url),
];

export function readOmnigentFixture<T>(relativePath: string): T {
  const fixtureUrl = omnigentFixtureRoots
    .map((root) => new URL(relativePath, root))
    .find((candidate) => existsSync(candidate));
  if (fixtureUrl === undefined) {
    throw new Error(`Omnigent fixture not found: ${relativePath}`);
  }
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as T;
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

export function loadOmnigentV09WireContract(): OmnigentV09WireFixture {
  return readOmnigentFixture<OmnigentV09WireFixture>(
    "http/v0-9-wire-contract.json",
  );
}

export function loadOmnigentV010WireContract(): OmnigentV010WireFixture {
  return readOmnigentFixture<OmnigentV010WireFixture>(
    "http/v0-10-wire-contract.json",
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
