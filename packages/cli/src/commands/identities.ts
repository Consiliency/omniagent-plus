import {
  IdentityProfileStatusStore,
  listIdentityProfiles,
  preflightIdentityProfile,
  type LoadedIdentityProfile,
} from "@omniagent-plus/identity-isolation";

import { createCliError } from "../errors.js";
import type {
  ParsedCliRequest,
  ParsedIdentitiesPreflightRequest,
} from "../args.js";
import {
  identitiesListResultSchema,
  identitiesPreflightResultSchema,
  type CliContext,
} from "../types.js";

function summarizeProfile(entry: LoadedIdentityProfile) {
  return {
    id: entry.profile.id,
    provider: entry.profile.provider,
    harness: entry.profile.harness,
    kind: entry.kind,
    authMode: entry.profile.authMode,
    isolation: entry.profile.isolation,
    envAllowlist: [...(entry.profile.envAllowlist ?? [])].sort(),
    redactedEnv: { ...(entry.profile.env ?? {}) },
    secretRefCount: entry.profile.secretRefs?.length ?? 0,
    authVolumeConfigured: entry.profile.authVolumeRef !== undefined,
    homeDirConfigured: entry.profile.homeDir !== undefined,
    processOwnerConfigured: entry.profile.processOwner !== undefined,
    toolPolicyConfigured: entry.profile.toolPolicyRef !== undefined,
    networkPolicy: entry.profile.networkPolicy,
    maxOpenSessions: entry.profile.maxOpenSessions,
    maxActiveTurns: entry.profile.maxActiveTurns,
    tags: [...(entry.profile.tags ?? [])].sort(),
  };
}

function summarizeEnvironment(
  result: ReturnType<typeof preflightIdentityProfile>,
) {
  return {
    schema: "cli.identity.environment_summary.v0.1",
    profileId: result.environment.profileId,
    kind: result.environment.kind,
    isolation: result.environment.isolation,
    launchEnvKeys: [...result.environment.launchEnvKeys].sort(),
    envAllowlist: [...result.environment.envAllowlist].sort(),
    redactedEnv: { ...result.environment.redactedEnv },
    secretRefCount: result.environment.secretRefs.length,
    authVolumeConfigured: result.environment.authVolumeRef !== undefined,
    homeDirConfigured: result.environment.homeDirRef !== undefined,
    processOwnerConfigured: result.environment.processOwner !== undefined,
    toolPolicyConfigured: result.environment.toolPolicyRef !== undefined,
    networkPolicy: result.environment.networkPolicy,
  };
}

function inferMetadataOnlyAuthAvailability(entry: LoadedIdentityProfile): boolean | undefined {
  if (entry.profile.authMode === "none") {
    return true;
  }

  return (
    (entry.profile.secretRefs?.length ?? 0) > 0
    || entry.profile.authVolumeRef !== undefined
    || entry.profile.env !== undefined
  )
    ? true
    : undefined;
}

async function runIdentitiesList(request: ParsedCliRequest) {
  const profiles = await listIdentityProfiles(request.profilesDir);

  return identitiesListResultSchema.parse({
    schema: "cli.identities.list.result.v0.1",
    count: profiles.length,
    profiles: profiles.map(summarizeProfile),
  });
}

async function runIdentitiesPreflight(
  request: ParsedIdentitiesPreflightRequest,
  context?: CliContext,
) {
  const profiles = await listIdentityProfiles(request.profilesDir);
  const target = profiles.find((entry) => entry.profile.id === request.profileId);

  if (target === undefined) {
    throw createCliError(
      "missing_record",
      `Identity profile ${request.profileId} was not found.`,
      {
        profileId: request.profileId,
      },
    );
  }

  const store = await IdentityProfileStatusStore.open({
    rootDir: request.stateRoot,
  });
  const priorStatuses = await store.listByProfileId(target.profile.id);
  const latestStatus = [...priorStatuses].sort((left, right) =>
    left.checkedAt.localeCompare(right.checkedAt),
  ).at(-1);
  const authAvailable = request.authAvailable ?? inferMetadataOnlyAuthAvailability(target);
  const result = preflightIdentityProfile(target.profile, {
    hostEnv: context?.hostEnv === undefined ? {} : Object.fromEntries((target.profile.envAllowlist ?? []).flatMap((key) => context.hostEnv?.[key] === undefined ? [] : [[key, context.hostEnv[key]]])),
    activeSessions: request.activeSessions ?? latestStatus?.activeSessions ?? 0,
    activeTurns: request.activeTurns ?? latestStatus?.activeTurns ?? 0,
    authAvailable,
    blockedReason: request.blockedReason,
  });
  const persisted = await store.appendPreflight(result);
  const parsedResult = identitiesPreflightResultSchema.parse({
    schema: "cli.identities.preflight.result.v0.1",
    profileId: target.profile.id,
    readiness: result.readiness,
    allowed: result.allowed,
    diagnostics: {
      code: result.diagnostics.code,
      metadata: result.diagnostics.metadata,
    },
    environment: summarizeEnvironment(result),
    status: result.status,
    persistedRecord: {
      recordId: persisted.recordId,
      sequence: persisted.sequence,
    },
  });

  if (!result.allowed) {
    throw createCliError(
      "policy_block",
      `Identity profile ${target.profile.id} is ${result.readiness}.`,
      {
        result: parsedResult,
      },
    );
  }

  return parsedResult;
}

export async function runIdentitiesCommand(
  request: ParsedCliRequest,
  context?: CliContext,
) {
  switch (request.command) {
    case "identities list":
      return runIdentitiesList(request);
    case "identities preflight":
      return runIdentitiesPreflight(request, context);
    default:
      throw createCliError("internal_failure", "identities command dispatch received an unexpected request.");
  }
}
