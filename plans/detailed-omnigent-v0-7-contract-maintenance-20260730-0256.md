# Detailed Plan: Omnigent v0.7.0 Contract Maintenance

## Task

Adapt `@consiliency/omnigent-transport` from the frozen official Omnigent
`v0.6.0` contract to the official `v0.7.0` release without broadening the
neutral runtime-provider boundary. Fix the one tagged CLI incompatibility,
represent the additive session response fields needed by transport consumers,
refresh the checked-in authority evidence, and prepare a transport-only
`0.4.0` release.

This is a bounded compatibility update, not a roadmap. It has three tightly
coupled implementation concepts: server lifecycle CLI compatibility, additive
transport response typing, and the contract/release evidence that proves both.

## Starting State

- Planning worktree: `/mnt/workspace/worktrees/omniagent-plus-plan-omnigent-v0-7-adaptation`
- Branch: `codex/plan-omnigent-v0-7-adaptation`
- Base: `origin/main` at `d5a3aad08726089302dfdcfef056756871d25c84`
- Published transport: `@consiliency/omnigent-transport@0.3.0`
- Frozen upstream contract: Omnigent `v0.6.0`
- Planning worktree was clean before this plan was written.
- The primary checkout has pre-existing `mcp_server.log`; it is not an artifact
  of this plan and must not be committed during implementation.

## Authority And Research Findings

The implementation must freeze the following release authority, after a final
preflight confirms that no newer official Omnigent release supersedes it:

| Surface | Frozen value |
| --- | --- |
| GitHub release | `v0.7.0`, published 2026-07-27 |
| Tag commit | `35519fb04743f66b30cac8a40695d5d72fa163ea` |
| PyPI | `omnigent==0.7.0`, Python `>=3.12` |
| Informational upstream `main` probe | `bdd9d5e6587bdcfe299230f2a1c00e14e9bc40d9` |
| OpenAPI operations | 97, up from 87, with no removals |
| Stream event literals | 52, unchanged |

Tagged `v0.7.0` makes one breaking CLI change relevant to this package:
`omnigent server start` was removed and replaced by
`omnigent server --background`. The `server status` and `server stop` commands
remain available. Both `omni` and `omnigent` remain valid entrypoints, so retain
the package's existing `omnigent` spelling. The background-start command emits
human-readable text, not JSON. Machine-readable status requires
`omnigent server status --json` and is emitted as a direct status object with
`running`, `pid`, `url`, `port`, `log_path`, `live_sessions`, and
`daemon_attached`, not the package's legacy `{ server: ... }` envelope. The
tagged implementation returns that JSON with `running: false` and a successful
exit when no background server exists, so hybrid auto-start remains reachable.

Tagged response-contract additions relevant to existing session reads are:

- optional `project_id` on session list/detail/update schemas;
- optional `model_options` on `SessionResponse`, refined to
  `NativeModelOption[]`;
- optional MCP server `headers` and a broader import-source enum;
- additive projects, usage, detected-credential, credential-store,
  harness-install, and harness-model-option endpoints.

No stream event was added or removed. Upstream `main` has later optional
`can_approve` and `kind` fields, but those are not part of the tagged authority
and must remain an informational readiness note only.

`POST /v1/sessions/{session_id}/events` remains documented and implemented in
the tagged source/API guide but is still absent from generated OpenAPI. Record
that provenance accurately; do not claim that every required endpoint is
mechanically present in OpenAPI.

The tagged `NativeModelOption` and `NativeReasoningEffortOption` schemas use
camelCase property names on the wire (`defaultReasoningEffort`, `displayName`,
`isDefault`, `supportedReasoningEfforts`, and `reasoningEffort`). Only the
enclosing session properties are snake_case (`project_id`, `model_options`), so
the local snapshot receives dual aliases while the nested types preserve the
tagged camelCase spellings exactly.

## Scope Decisions

1. Preserve all 52 event literals and the current parser/mapper behavior.
   `browser.action_request` and `response.function_call_output.delta` remain
   metadata-only neutral no-ops.
2. Change the default background-start command in both production construction
   paths to `omnigent server --background`. Make health/status use
   `omnigent server status --json`, parse its direct object, and have
   `serverStart()` ignore successful prose output before querying JSON status.
   Preserve stop and caller-provided command overrides.
3. Add transport typings for `project_id` and native model options because they
   arrive on the existing session response surface. Preserve upstream
   snake-case and local camel-case aliases on the enclosing snapshot fields;
   retain the tagged camelCase wire spelling inside native model options.
4. Export the new named model-option types and `OmnigentSessionSnapshot` from
   the package root so consumers can use the additive response contract without
   importing an unpublished subpath.
5. Treat projects, usage, host credential management, harness installation, and
   model-option lookup as optional upstream/admin surfaces. Document and probe
   them, but do not add HTTP client methods or neutral runtime capabilities.
6. Do not change runtime-provider, pipeline-provider-adapter, lease/lock,
   telemetry mutation, authority, coordination, or browser execution semantics.
7. Version only `@consiliency/omnigent-transport`, from `0.3.0` to `0.4.0`.
   Leave sibling package versions and the publish workflow unchanged.

## Implementation Steps

### Change inventory

| File | Entity | Action | Reason |
| --- | --- | --- | --- |
| `fixtures/omnigent/discovery/source-metadata.json` | release authority | modify | Freeze tagged v0.7 and retain a dated non-authoritative main probe. |
| `fixtures/omnigent/discovery/http-surface.json` | HTTP/schema inventory | modify | Record the additive tagged operation and response-schema delta. |
| `fixtures/omnigent/discovery/cli-surface.json` | CLI inventory | modify | Replace the removed start command and record expanded imports. |
| `fixtures/omnigent/discovery/capability-probes.json` | capability evidence | modify | Advance evidence without inventing provider capability. |
| `fixtures/omnigent/fake-server/README.md` | freeze provenance | modify | Identify v0.7 as current authority while retaining historical fixtures. |
| `packages/omnigent-transport/src/contract-fixtures.ts` | HTTP/CLI fixture interfaces | modify | Type the v0.7 OpenAPI delta/provenance fields used by conformance gates. |
| `packages/omnigent-transport/src/cli-client.ts` | lifecycle command parsing | modify | Invoke background start, then parse direct JSON status from the tagged CLI. |
| `packages/omnigent-transport/src/hybrid-provider.ts` | default `startCommand` | modify | Keep hybrid auto-start compatible with v0.7. |
| `packages/omnigent-transport/src/types.ts` | session/model-option types | modify | Represent additive tagged response fields. |
| `packages/omnigent-transport/src/index.ts` | public type exports | modify | Make the response types available from the published root. |
| `packages/omnigent-transport/src/cli-client.test.ts` | command-backed lifecycle test | modify | Assert exact start/status/stop command behavior. |
| `packages/omnigent-transport/src/hybrid-provider.test.ts` | hybrid start expectation | modify | Guard the production default command. |
| `packages/omnigent-transport/src/process-manager.test.ts` | command examples | modify | Remove stale lifecycle invocations from tests. |
| `packages/omnigent-transport/src/types.test.ts` | additive shape test | modify | Type-check project/model response additions and preserve 52 events. |
| `packages/omnigent-transport/src/conformance.test.ts` | frozen contract gates | modify | Prove the tagged delta, exclusions, and evidence provenance. |
| `packages/omnigent-transport/src/capability-probe.test.ts` | authority assertions | modify | Advance the capability snapshot to v0.7 without status changes. |
| `scripts/smoke-packed-omnigent-transport.mjs` | packed authority smoke | modify | Prove v0.7 and root-export installability from the tarball. |
| `packages/omnigent-transport/package.json` | package version | modify | Prepare transport-only `0.4.0`. |
| `CHANGELOG.md` | `0.4.0` entry | modify | Record the compatibility and typing changes. |
| `docs/omnigent-contract.md` | frozen contract/CLI | modify | Document authoritative v0.7 behavior and evidence limits. |
| `docs/omnigent-upstream-readiness.md` | release delta/readiness | modify | Separate tagged authority from newer main-only optional fields. |
| `docs/omnigent-transport.md` | operator lifecycle | modify | Replace the removed start command and describe additive typing. |
| `docs/lifecycle-and-events.md` | lifecycle/event posture | modify | Update start syntax while confirming the event vocabulary is unchanged. |
| `docs/architecture.md` | CLI fallback summary | modify | Remove the stale lifecycle shorthand. |
| `docs/coordination-backend.md` | supported Omnigent target | modify | Advance the explicit v0.6 support claim to v0.7 without changing lease/lock boundaries. |
| `docs/security-and-secrets.md` | telemetry release posture | modify | Confirm the tagged v0.7 telemetry defaults/opt-outs and retain the no-mutation rule. |

### 1. Revalidate the official freeze before editing runtime code

Use the GitHub release/tag API and PyPI JSON to confirm `v0.7.0`, tag commit
`35519fb04743f66b30cac8a40695d5d72fa163ea`, and PyPI `0.7.0`. Fetch the tagged
OpenAPI and API guide again and compare them with the checked-in v0.6 evidence.
If a newer official release exists, stop and amend this plan before adapting;
never silently freeze an obsolete release. Treat upstream `main` only as a
non-authoritative forward-compatibility probe.

### 2. Refresh checked-in discovery authority

Update these authoritative repo-root fixtures under
`fixtures/omnigent/discovery/` (the build copies this tree into the published
package's `dist/fixtures/`; do not create a package-local source fixture tree):

- `source-metadata.json`: freeze the v0.7 release, tag SHA, PyPI version, previous
  v0.6 authority, informational main probe, exact OpenAPI delta, and CLI removal.
- `http-surface.json`: record 97 operations, the seven added path keys, eight
  added schemas, no removals, the session project/model additions, and tagged
  API-guide provenance for the send-events endpoint omitted from OpenAPI.
- `cli-surface.json`: replace the start command with
  `omnigent server --background`, retain status/stop, and record the expanded
  import harness choices.
- `capability-probes.json`: advance evidence to v0.7 while leaving capability
  statuses unchanged. State explicitly that projects, usage, credential
  storage, installation, and model catalogs do not establish runtime, lease, or
  child-session capability.

Update the fake-server fixture README's freeze authority to v0.7. Do not add
fake-server scenarios or event fixtures: the protocol event vocabulary did not
change, and `v0-6-noop-events.json` remains historical evidence for the prior
additions.

### 3. Fix the tagged CLI lifecycle incompatibility

In `packages/omnigent-transport/src/cli-client.ts`, add one internal tagged
status-output type and one shared status reader. The reader must invoke exactly:

```text
omnigent server status --json
```

It must reject nonzero exits through the existing failure mapping, parse the
direct JSON status object, and map `url` to `OmnigentServerStatus.baseUrl` while
preserving `running` and `pid`. Use that reader from `health()` and
`serverStatus()`; do not parse an envelope for lifecycle status.

Change `createCommandBackedCliTransport().serverStart()` to invoke exactly:

```text
omnigent server --background
```

Treat a zero exit as successful regardless of the command's prose stdout, then
call the shared JSON status reader and return that status. A nonzero start or
status command must retain the existing typed failure mapping.

In `packages/omnigent-transport/src/hybrid-provider.ts`, change the default
`startCommand` to the same background token array. Preserve the current
process-manager plus idempotent CLI-start orchestration: tagged Omnigent reuses a
healthy background server, so the second start is safe and supplies the
authoritative post-start status. Do not redesign ownership, caller-provided
overrides, stop behavior, retry policy, or process-manager semantics in this
compatibility change.

In `cli-client.test.ts`, add direct coverage of
`createCommandBackedCliTransport()` using tagged-output-shaped mocks. Assert
that health/status run `omnigent server status --json`, parse the direct object,
and map `url` to `baseUrl`; assert that start first receives prose from
`omnigent server --background`, does not JSON-parse that prose, then returns the
following JSON status. Also assert that a successful direct status object with
`running: false` remains a normal non-throwing result so hybrid can proceed to
auto-start. In `hybrid-provider.test.ts`, update the default-start
expectation. In `process-manager.test.ts`, update stale generic command examples
so the test suite contains no obsolete invocation.

### 4. Represent additive session response fields

In `packages/omnigent-transport/src/types.ts`:

- add `OmnigentNativeReasoningEffortOption` with required
  `reasoningEffort: string` and optional nullable `description`;
- add `OmnigentNativeModelOption` with required `id`, optional nullable
  `defaultReasoningEffort`, `displayName`, `isDefault`, and `model`, plus optional
  `supportedReasoningEfforts`;
- allow unknown additional fields on both model-option shapes in the same
  read-only transport spirit as upstream's `additionalProperties: true`;
- add optional nullable `projectId`/`project_id` and optional
  `modelOptions`/`model_options` to `OmnigentSessionSnapshot`.

Do not add snake_case aliases inside the nested model-option types: tagged v0.7
OpenAPI defines those wire properties in camelCase. The snake/camel dual aliases
apply only to the enclosing session fields.

In `packages/omnigent-transport/src/index.ts`, export the two new named types
and `OmnigentSessionSnapshot` from the public package root. Do not map project
identity or model catalogs into neutral runtime-provider fields.

Extend `types.test.ts` with a compile-time/runtime construction of the tagged
model-option shape and session aliases, while retaining the exact 52-event
assertion.

### 5. Strengthen conformance and packed-consumer proof

In `contract-fixtures.ts`, add typed optional fields for the v0.7 OpenAPI delta
(operation count, added/removed paths, and added/removed schemas) and endpoint
provenance. Keep the fixture schema additive.

In `conformance.test.ts`:

- advance the frozen release/version/SHA assertions to v0.7;
- assert exactly 52 stream event literals and no v0.7 event additions/removals;
- assert the new optional paths are recorded but absent from the required
  endpoint table;
- assert the project/model response fields and tagged API-guide provenance;
- load the CLI surface and assert `documented_commands` contains
  `omnigent server --background`, `omnigent server status --json`, and
  `omnigent server stop`, while independently rejecting the removed invocation.
  Construct that negative expectation from command tokens so the conformance
  source does not itself reintroduce the contiguous stale string rejected by
  the repository scan;
- replace negative `not.arrayContaining(...)` checks for optional routes and
  lease/lock paths with per-item `not.toContain(...)` assertions, preventing one
  leaked route from hiding another.

Advance `capability-probe.test.ts` and
`scripts/smoke-packed-omnigent-transport.mjs` to the v0.7 version/SHA. The packed
consumer must import only the package root and prove the new exported types via
the generated declarations/build rather than a workspace-internal subpath.

Do not type additive evidence-only keys that conformance does not read.

### 6. Update operator and contract documentation

Update exact stale release and lifecycle references in:

- `docs/omnigent-contract.md`
- `docs/omnigent-upstream-readiness.md`
- `docs/omnigent-transport.md`
- `docs/lifecycle-and-events.md`
- `docs/architecture.md`
- `docs/coordination-backend.md`
- `docs/security-and-secrets.md`

Document the v0.7 authority, exact background-start command, unchanged event
vocabulary, additive session fields, optional upstream/admin routes, and the
OpenAPI/API-guide evidence split. In coordination docs, update only the explicit
supported-release sentence and preserve the statement that optional upstream
surfaces do not provide lease/lock semantics. In security docs, advance the
telemetry statement only after tagged v0.7 source confirms the default and
opt-outs remain unchanged; preserve the rule that the transport must not mutate
operator telemetry configuration.

### 7. Prepare the transport-only release

Set `packages/omnigent-transport/package.json` to `0.4.0` and add a `0.4.0`
entry to `CHANGELOG.md` describing the v0.7 freeze, CLI correction, and additive
types. Do not edit `pnpm-lock.yaml`: no dependency changes are planned, and the
frozen install must fail rather than rewrite the dependency graph.

Do not change `.github/workflows/publish.yml`: it already uses the canonical
`Consiliency/omniagent-plus` OIDC trusted publisher and publishes only package
versions not already present. Before a later release, verify trusted-publisher
metadata and independently verify npm after the workflow; a green workflow is
not itself registry proof.

## Explicit No-Change Boundaries

- No changes to `@consiliency/runtime-provider` or
  `@consiliency/pipeline-provider-adapter` versions or behavior.
- No new projects, usage, credentials, installation, or model-catalog client.
- No event parser/mapper behavior changes and no new normalized runtime events.
- No lease/lock, Supabase coordinator, telemetry mutation, browser execution,
  authority, or crypto changes.
- No freeze of unreleased upstream-main-only `can_approve` or `kind` fields.
- No publish workflow change, merge, GitHub release, or npm publication as part
  of plan execution unless separately authorized after review.

## Verification

Run narrow verification after building once in the fresh worktree, because the
Vitest workspace resolves generated package exports from `dist`:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm exec vitest --config vitest.config.ts --run \
  packages/omnigent-transport/src/cli-client.test.ts \
  packages/omnigent-transport/src/hybrid-provider.test.ts \
  packages/omnigent-transport/src/process-manager.test.ts \
  packages/omnigent-transport/src/types.test.ts \
  packages/omnigent-transport/src/conformance.test.ts \
  packages/omnigent-transport/src/capability-probe.test.ts
```

Then run repository and packed-artifact gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @consiliency/omnigent-transport test:pack
cd packages/omnigent-transport && npm publish --dry-run
git diff --check
```

Run these stale-reference and release-scope checks:

```bash
bash -c 'if rg -n "omnigent server start|server start/status/stop" packages/omnigent-transport fixtures/omnigent docs; then exit 1; else test "$?" -eq 1; fi'
test "$(node -p "require('./packages/omnigent-transport/package.json').version")" = "0.4.0"
test "$(node -p "require('./packages/core-contracts/package.json').version")" = "0.2.0"
test "$(node -p "require('./packages/governed-pipeline-adapter/package.json').version")" = "0.2.0"
rg -n 'Official Omnigent `v0\.7\.0` is the supported release target' docs/coordination-backend.md
rg -n 'Omnigent v0\.7 enables anonymous telemetry by default' docs/security-and-secrets.md
```

### automation.suite_command

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm exec vitest --config vitest.config.ts --run packages/omnigent-transport/src/cli-client.test.ts packages/omnigent-transport/src/hybrid-provider.test.ts packages/omnigent-transport/src/process-manager.test.ts packages/omnigent-transport/src/types.test.ts packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @consiliency/omnigent-transport test:pack && (cd packages/omnigent-transport && npm publish --dry-run) && bash -c 'if rg -n "omnigent server start|server start/status/stop" packages/omnigent-transport fixtures/omnigent docs; then exit 1; else test "$?" -eq 1; fi' && test "$(node -p "require('./packages/omnigent-transport/package.json').version")" = "0.4.0" && test "$(node -p "require('./packages/core-contracts/package.json').version")" = "0.2.0" && test "$(node -p "require('./packages/governed-pipeline-adapter/package.json').version")" = "0.2.0" && rg -n 'Official Omnigent `v0\.7\.0` is the supported release target' docs/coordination-backend.md && rg -n 'Omnigent v0\.7 enables anonymous telemetry by default' docs/security-and-secrets.md && git diff --check
```

Operational release evidence, if separately authorized after PR review, must be
recorded in a runner-stamped verification handoff or plan-manifest amendment:
canonical npm trusted-publisher metadata, GitHub release URL/tag, publish run ID
and conclusion, `npm view` showing `0.4.0` as published, and an isolated exact-pin
consumer install/import. Keep planned, PR-open, merged, released, and published
states distinct.

## Acceptance Criteria

1. Checked-in authority freezes official Omnigent `v0.7.0`, tag commit
   `35519fb04743f66b30cac8a40695d5d72fa163ea`, and PyPI `0.7.0`, while labeling
   upstream `main` as non-authoritative; coordination and security docs no longer
   present v0.6 as the current supported/telemetry target.
2. Both production default start paths invoke exactly
   `omnigent server --background`; health/status invoke
   `omnigent server status --json` and parse its direct object; successful
   human-readable start output is never JSON-parsed; stop and caller overrides
   are preserved; and no stale removed invocation remains in package source,
   authoritative fixtures, or docs.
3. Conformance evidence records 97 tagged OpenAPI operations, all additive
   paths/schemas, no removals, and the API-guide provenance for the required
   send-events endpoint omitted from OpenAPI.
4. The stream event union remains exactly 52 literals with no parser/mapper or
   normalized-runtime semantic change.
5. Session snapshots accept project identity and model-option arrays through
   additive snake-case/camel-case enclosing-field aliases; nested model-option
   properties match the tagged camelCase wire schema; and the new named types
   are exported from the package root.
6. Projects, usage, credentials, installation, and model-catalog endpoints stay
   optional evidence-only surfaces and do not become neutral provider methods or
   capabilities.
7. Unreleased upstream-main-only `can_approve` and `kind` fields are documented
   only as a readiness probe and are not frozen into the tagged contract.
8. Negative conformance checks fail independently for every leaked optional or
   lease/lock route.
9. `@consiliency/omnigent-transport` is versioned `0.4.0`; sibling public
   packages remain `0.2.0`, and the existing publish workflow is unchanged.
10. Focused transport tests, full build, lint, typecheck, and full test suite all
    pass from a fresh install.
11. Packed-consumer smoke and `npm publish --dry-run` pass using only publishable
    package contents, and `git diff --check` is clean.
12. The final verification handoff distinguishes local validation, pushed PR,
    merge, GitHub release, workflow result, npm registry state, and exact-pin
    consumer proof; no merge or publication occurs without separate authority.

## Advisor Board Amendment

The original plan at SHA-256
`d92ec9c1373f3bba8a00b4dee899b4ebb94b8e25a819ddb7097ed1d95cc17f0b`
was reviewed by the availability-aware `code-review` board. Grok, Fable, and
Sol returned usable `DISAGREE` verdicts; Gemini returned `EMPTY`, which is
recorded as degraded evidence rather than approval.

The plan was amended for every blocking finding:

- corrected all source fixture targets from a nonexistent package-local tree to
  the authoritative `fixtures/omnigent/` tree copied into the tarball;
- extended the stale-reference gate to authoritative fixtures and made an `rg`
  execution error fail instead of masquerading as no matches;
- replaced the token-only lifecycle fix with tagged-output-compatible behavior:
  start prose is checked only for command success, machine status comes from
  `server status --json`, and the direct object maps `url` to `baseUrl`;
- added exact tagged-shape lifecycle tests and CLI-fixture conformance checks;
- made the fixture interface update explicit and removed speculative lockfile
  churn.

The board correctly noted that implementation acceptance remains unproven; this
is a plan review, and implementation/verification evidence belongs to the later
executor and pre-merge reviews.

The amended plan at SHA-256
`bf595256f98d82bba9ede4d41b7fcaf351f50c6b694d087c23da0d9bf186f4a9`
was resubmitted. Fable returned `AGREE`; Grok returned `PARTIALLY AGREE` with no
execution blocker; Sol returned `DISAGREE` solely because implementation had not
yet occurred, which is outside this plan-review acceptance scope; Gemini again
returned `EMPTY`. The board remained usable with three delivered independent
reviews, but the empty Gemini seat is retained as degraded evidence, not counted
as approval.

Grok's residual nested-field ambiguity and Fable's down-state caution were
resolved from tagged source in this final plan: nested model-option wire fields
are camelCase, session wrapper fields receive dual aliases, and a stopped server
returns successful JSON status with `running: false`. No implementation claim
was added.

Before execution, a final reconciliation pass added the two operator documents
whose explicit v0.6 current-target statements would otherwise contradict the
v0.7 freeze: `docs/coordination-backend.md` and
`docs/security-and-secrets.md`. This is documentation consistency within the
reviewed release scope, not a new runtime concept or a reopened roadmap.

## Execution Handoff

Implementation has not started. Execute this plan with `codex-execute-detailed`
from the dedicated branch/worktree, beginning with the live release preflight.
If `v0.7.0` is still authoritative, implement in the order above and attach the
machine-checkable and operational evidence to the executor handoff. If it is no
longer latest, amend and re-review the plan before changing the freeze.
