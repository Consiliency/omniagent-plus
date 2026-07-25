# Detailed plan: adapt the Omnigent transport contract to official v0.6.0

## Task

Refresh `omniagent-plus` from its frozen Omnigent `v0.5.1` contract to the
official `v0.6.0` GitHub/PyPI release. Preserve the neutral runtime-provider
boundary, admit the two additive upstream stream events without inventing new
runtime semantics, expose the optional session-list lineage field, refresh the
contract evidence, and release only `@consiliency/omnigent-transport` as
`0.3.0`.

This is contract maintenance, not an Omnigent feature expansion. Do not add
client methods for import or auto-title, browser-action execution, telemetry
collection, lease/lock behavior, or changes to the runtime-provider contract.

## Research summary

The plan is based on clean `origin/main` commit
`9bd2cd7517354d6f3fb5ee180be5479ed78082af`. Official Omnigent `v0.6.0` was
published on 2026-07-21 from tag commit
`375f540421baf3ad46fae0805b78063682f281de`; PyPI also reports `0.6.0` with
Python `>=3.12`. Upstream `main` was separately observed on 2026-07-24 at
`76281b9438578e472810879e18fc60acc64d3d6c`; it is non-authoritative and must
be refreshed only as a dated readiness probe during execution.

The tagged `v0.5.1...v0.6.0` OpenAPI delta is additive: `POST /v1/imports`,
`POST /v1/sessions/{session_id}/auto-title`, optional nullable
`SessionListItem.parent_session_id`, and stream discriminators
`browser.action_request` and `response.function_call_output.delta`. No path or
schema was removed. The release also defaults anonymous telemetry on, renames
the optional extra `memory` to `hindsight` with a compatibility alias, and
standardizes harness path variables to `OMNIGENT_<NAME>_PATH` while retaining
legacy variables until v0.8. This repository uses neither deprecated surface.

The parser derives its allowlist from `omnigentStreamEventTypes`, and the mapper
already returns an empty list for known events without a neutral mapping. The
smallest production change is therefore typed admission of the two events and
the optional list lineage field. The import and auto-title routes are UI/data
conveniences outside `AgentRuntimeProvider`; browser actions are not executable
by this headless transport; tool-output deltas have no neutral runtime event.
All remain observed metadata or documented optional surfaces.

The repository transfer to `Consiliency/omniagent-plus` is live, while the
transport package metadata and publish-workflow instructions still name
`ViperJuice/omniagent-plus`. The transport package metadata must move to the
canonical repository in this change, and npm's trusted publisher must be
reconfigured administratively before the `0.3.0` release. The code PR can be
reviewed and merged without that setting, but publication must fail closed
until the OIDC repository claim is confirmed.

Four-seat review amendment (2026-07-24): Grok (`grok-4.5`) returned
`DISAGREE`, Sol (`gpt-5.6-sol`) returned an out-of-scope implementation-state
`DISAGREE`, Gemini (`Gemini 3.1 Pro`) returned `AGREE`, and the native fallback
seat (`gpt-5.6-terra`) returned `PARTIALLY AGREE` after the Fable TUI leg
degraded. This amendment accepts the independently confirmed packed-smoke
version blocker, the unprefixed capability version correction, executable
fake-server coverage, precise parent-lineage wording, and a mechanical client
non-goal gate. Gemini's proposed `packages/runtime-provider/package.json`
check is rejected because that directory does not exist: the
`@consiliency/runtime-provider` package is `packages/core-contracts`, which the
verification already checks. Sol's verdict is non-actionable because it judged
the planning artifact as though it were a completed pre-merge implementation.

## Frozen contract and vocabulary

Implementation must retain `IF-0-CONTRACT-1`, the existing neutral runtime
event vocabulary, and the `supported` / `emulated` / `blocked` capability
vocabulary. The only new upstream protocol literals are
`browser.action_request`, `response.function_call_output.delta`,
`parent_session_id`, `/v1/imports`, and
`/v1/sessions/{session_id}/auto-title`. Do not add a neutral browser-action,
tool-output, import, auto-title, lease, or coordination concept.

## Changes

### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` - modify - pin `v0.6.0`, commit
  `375f540421baf3ad46fae0805b78063682f281de`, publication timestamp
  `2026-07-21T08:25:31Z`, package version `0.6.0`, and Python `>=3.12`.
- `previous_probe` - modify - retain `v0.5.1` and commit
  `08285468e098244ac0b0bf98cb470d5c1a1a7070` as historical release evidence.
- `head_probe` - modify - record a freshly observed execution-time upstream
  `main` SHA and timestamp as explicitly non-authoritative.
- `preflight_confirmation` and `provenance` - modify - record the exact tagged
  OpenAPI additions, no removals, telemetry default/opt-outs, deprecated-extra
  and harness-environment compatibility findings, and GitHub/PyPI evidence.

### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `stream_contract` - modify - set the official tagged event count to `52` and
  identify exactly the two v0.6 additions as `release_event_types`; retain all
  prior event literals in the accepted event allowlist and add `browser` to the
  evidence-only `event_families` list.
- `session_list_item_fields` - modify - add optional nullable
  `parent_session_id`; do not describe it as a full session-snapshot guarantee.
- `optional_release_surfaces` - modify - add the import and auto-title POST
  routes as observed, stable, and not provider-required. Keep the required
  provider endpoint table unchanged.
- `/v1/info` evidence - modify - note the additive `single_user` capability
  description without introducing a typed provider dependency on it.

### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- release provenance - modify - move tagged authority to `v0.6.0`.
- `non_provider_required_commands` - modify - record the stable import command
  surface as optional operator tooling, not a provider CLI fallback command.
- compatibility notes - modify - document the `hindsight` extra and harness
  environment rename; confirm no local command or dependency uses the
  deprecated names.

### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- `capabilities` - modify - refresh tagged evidence without changing any
  existing `supported`, `emulated`, or `blocked` verdict.
- `stream_events` evidence - modify - classify both v0.6 events as accepted
  metadata-only no-ops at the neutral boundary.
- lineage and coordination evidence - modify - state that
  `parent_session_id`, import, and auto-title do not provide public child
  creation, distributed lease, lock, or inbox semantics.

### `fixtures/omnigent/events/v0-6-noop-events.json` (create)

- `v0_6_noop_events` - add - capture one tagged-shape
  `browser.action_request` event with `action_id`, `action`, and bounded `args`,
  plus one `response.function_call_output.delta` event with `call_id` and
  `delta`.
- `expected_provider_behavior` - add - require both events to parse as known,
  preserve their raw metadata, emit no neutral runtime event, and leave terminal
  uniqueness unchanged.

### `fixtures/omnigent/fake-server/README.md` (modify)

- freeze description - modify - name `v0.6.0` as current fixture authority and
  retain v0.4/v0.5 fixture files as historical compatibility evidence.

### `fixtures/omnigent/fake-server/scenarios.json` (modify)

- `v0_6_metadata_events` - add - register the v0.6 fixture as a stream-events
  conformance scenario backed by the fake server's normal stream path, without
  adding fake HTTP endpoints for import, auto-title, or browser execution.

### `packages/omnigent-transport/src/contract-fixtures.ts` (modify)

- `OmnigentEventFixture.events` - modify - add optional `action_id`, `action`,
  `args`, `call_id`, and `delta` fields matching the tagged fixture while
  retaining `OmnigentRawEvent["type"]` as the discriminator authority.
- existing fixture interfaces - preserve - use the current generic optional
  HTTP-surface structures for the two routes and list field; do not create a
  second fixture schema.

### `packages/omnigent-transport/src/types.ts` (modify)

- `omnigentStreamEventTypes` - modify - add exactly
  `browser.action_request` and `response.function_call_output.delta`.
- `OmnigentRawEvent` - modify - add optional raw `actionId`/`action_id`,
  `action`, `args`, `callId`/`call_id`, and reuse the existing `delta` field.
  Preserve snake-case wire names and camel-case compatibility conventions used
  elsewhere in this type.
- `OmnigentSessionSnapshot` - modify - add optional nullable
  `parentSessionId` and `parent_session_id`; do not project either into
  `AgentSessionInfo.rootSessionId`. The v0.6 delta makes the field newly
  available on `SessionListItem`; existing upstream session-response/event
  lineage does not make it provider-owned root-session authority.

### `packages/omnigent-transport/src/types.test.ts` (modify)

- release type freeze - modify - assert the 52-entry event allowlist includes
  both v0.6 literals and accepts tagged raw payload shapes.
- session list compatibility - add - prove snake-case and camel-case optional
  parent IDs type-check as nullable without altering required snapshot fields.

### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- v0.6 parser case - add - load `v0-6-noop-events`, assert both event shapes
  parse without `unknown_event_type` skips, and verify their raw metadata.
- fail-soft behavior - preserve - retain existing coverage for malformed JSON,
  non-object payloads, `[DONE]`, and truly unknown event types.

### `packages/omnigent-transport/src/event-mapper.test.ts` (modify)

- fixture conversion - modify - carry browser/tool metadata into raw events and
  avoid synthesizing a turn ID for the metadata-only tool-output delta.
- v0.6 no-op case - add - prove neither event emits, creates, or terminates a
  neutral runtime turn.
- production mapper - preserve - do not change `event-mapper.ts`; its existing
  default `[]` branch is the intended behavior for known observational events.

### `packages/omnigent-transport/src/fake-omnigent-server.ts` (modify)

- `buildV06NoopEvents` - add - load the tagged v0.6 fixture and construct both
  raw event shapes with their action/tool metadata.
- normal message stream assembly - modify - append the v0.6 events to the
  existing successful turn stream so HTTP-client and provider integration tests
  exercise the real SSE parser/mapper path.
- HTTP surface - preserve - do not add import, auto-title, or browser-action
  endpoints and do not make the observational events terminal.

### `packages/omnigent-transport/src/http-client.test.ts` (modify)

- v0.6 stream integration - modify - retain the collected raw stream, assert it
  contains both tagged v0.6 event types and metadata, and prove neither is
  skipped by the real fake-server SSE path.
- optional-route non-goal - add - mechanically assert the public client has no
  `importSession` or `autoTitleSession` method.

### `packages/omnigent-transport/src/http-provider.test.ts` (modify)

- neutral stream integration - modify - run the existing full provider stream
  against the fake server after it injects the two v0.6 events and assert the
  mapped event counts/types remain unchanged, proving both additions are
  metadata-only no-ops end to end.

### `packages/omnigent-transport/src/conformance.test.ts` (modify)

- release authority assertions - modify - require tag/version/commit
  `v0.6.0`, `0.6.0`, and
  `375f540421baf3ad46fae0805b78063682f281de`.
- boundary assertions - modify - require 52 official events, the two additive
  routes, optional list parent ID, and the v0.6 fake-server scenario while
  asserting existing capability verdicts are unchanged.
- non-goal assertions - add - prove import/auto-title remain outside the
  required endpoint table and no lease/lock capability is inferred.

### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- snapshot version assertion - modify - expect capability snapshots to report
  package version `0.6.0` (without the tag's `v` prefix) and its tagged commit
  from source metadata.

### `scripts/smoke-packed-omnigent-transport.mjs` (modify)

- packed fixture authority - modify - replace the hard-coded `0.5.1` assertion
  with package version `0.6.0` and assert the tagged commit
  `375f540421baf3ad46fae0805b78063682f281de` from the installed package's
  bundled fixture snapshot.
- consumer boundary - preserve - continue packing and installing in a clean
  scratch consumer with only the published transport package.

### `packages/omnigent-transport/package.json` (modify)

- `version` - modify - bump only `@consiliency/omnigent-transport` from `0.2.0`
  to additive minor `0.3.0`.
- `repository.url` - modify - use
  `git+https://github.com/Consiliency/omniagent-plus.git`; retain the existing
  package directory and public export surface.
- dependency versions - preserve - leave `@consiliency/runtime-provider` at
  its existing workspace-resolved `0.2.0`; do not bump the unchanged runtime or
  pipeline-adapter packages.

### `.github/workflows/publish.yml` (modify)

- trusted-publisher instructions - modify - name
  `Consiliency/omniagent-plus` as the canonical repository and explicitly state
  that npm trusted-publisher configuration must match the current repository
  claim.
- workflow mechanics - preserve - retain tokenless OIDC, verification, packed
  consumer smoke, topological package order, and exact-version skip behavior.

### `CHANGELOG.md` (modify)

- `0.3.0` entry - add - record v0.6.0 contract authority, additive event and
  parent-ID typing, optional route documentation, fixture/conformance updates,
  unchanged runtime mapping/capabilities, and canonical repository metadata.
- existing history - preserve - keep the v0.4/v0.5 and pre-publication scope
  history intact.

### `docs/omnigent-contract.md` (modify)

- `Supported Version` - modify - move `IF-0-CONTRACT-1` to official `v0.6.0`.
- HTTP and stream sections - modify - document the two optional routes, parent
  list field, two known metadata-only events, and unchanged provider endpoint,
  reconnect, and terminal contracts.
- boundary section - modify - state that browser actions are not executed and
  tool-output deltas do not become assistant text or terminal events.

### `docs/omnigent-upstream-readiness.md` (modify)

- current decision - modify - record the v0.6.0 release and a dated,
  non-authoritative current-main probe.
- compatibility findings - modify - record telemetry, `hindsight`, and harness
  environment changes; retain the next-release comparison process.

### `docs/omnigent-transport.md` (modify)

- event mapping - modify - describe v0.6 raw acceptance/no-op behavior and the
  optional list parent ID.
- non-goals - modify - state that imports, auto-title, and browser action
  execution are not transport-provider methods.

### `docs/lifecycle-and-events.md` (modify)

- observational events - modify - add the two v0.6 literals to the known no-op
  category and preserve the one-neutral-terminal-event invariant.

### `docs/coordination-backend.md` (modify)

- upstream compatibility note - modify - move the supported Omnigent release
  to v0.6.0 and state that its additions do not replace CS-2.2 lease/lock
  arbitration.

### `docs/security-and-secrets.md` (modify)

- telemetry posture - add - document that upstream v0.6 enables anonymous
  telemetry by default and list the official opt-outs
  (`OMNIGENT_ANALYTICS=0`, `DO_NOT_TRACK=1`, or `telemetry: false`). Treat the
  choice as explicit operator configuration; do not persist telemetry payloads
  or silently mutate process-manager environments.

### `pnpm-lock.yaml` (conditional modify)

- workspace package metadata - regenerate with the pinned pnpm version and
  commit only if the transport version/repository metadata produces a lockfile
  change. Do not hand-edit the lockfile.

## Explicit no-change files

- `packages/omnigent-transport/src/sse-stream.ts` - the parser already derives
  known types from `omnigentStreamEventTypes`.
- `packages/omnigent-transport/src/event-mapper.ts` - known unmapped events
  already return `[]`.
- `packages/omnigent-transport/src/http-client.ts` - do not add import or
  auto-title methods; optional parent IDs survive the existing typed JSON path.
- `packages/omnigent-transport/src/http-provider.ts` - do not reinterpret an
  optional list parent as runtime root-session authority.
- `packages/core-contracts/package.json` and
  `packages/governed-pipeline-adapter/package.json` - their versions remain
  `0.2.0` and their stale former-repository metadata is explicitly deferred to
  a separate all-package metadata maintenance change; this transport-only
  release must not imply those already-published package records were updated.
- process-manager and identity-isolation source - do not inject telemetry or
  renamed harness variables; no deprecated local usages exist.
- CS-2.2 coordinator, lease store, spec, GP, portal, harness runtime, and XG-1
  authority code - this release maintenance does not own those surfaces.

## Dependencies & order

1. Revalidate the official v0.6.0 tag, PyPI version, tagged OpenAPI hash/delta,
   and current-main probe before editing. Stop and amend this plan if the tagged
   OpenAPI differs from the frozen facts above; a newer unreleased `main` does
   not change the authority pin.
2. Update discovery fixtures and add the v0.6 event fixture first. Treat these
   files as the single checked-in evidence set consumed by tests and packaged
   under `dist/fixtures`; do not create generated copies elsewhere.
3. Add the minimal transport types and focused parser/mapper/conformance tests.
   Extend the fake server and HTTP client/provider integration tests so the new
   events traverse SSE end to end, but do not add neutral runtime behavior.
4. Update docs, changelog, package version/repository metadata, and publish
   workflow instructions. Regenerate the lockfile only if pnpm changes it.
5. Run targeted checks, then the full workspace suite, packed-consumer smoke,
   and npm dry-run. Inspect the tarball to confirm the v0.6 fixture and refreshed
   discovery evidence are present exactly once.
6. Before publication, an npm package owner must replace the old
   `ViperJuice/omniagent-plus` trusted-publisher repository claim with
   `Consiliency/omniagent-plus` for `@consiliency/omnigent-transport`. Record
   redacted evidence in
   `.dev-skills/handoffs/codex-execute-detailed/<run-id>-npm-trust-preflight.md`
   and stamp the plan-manifest lifecycle metadata with
   `npm_trust_repository=Consiliency/omniagent-plus`. Do not record tokens or
   credential payloads. This gates release publication, not PR review.
7. Open the implementation PR and do not merge or publish unless separately
   authorized. The implementation commit must include the requested trailer if
   that instruction remains active at execution time.

## Verification

Run these after implementation, not during planning:

```bash
git diff --check
find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null
pnpm exec vitest --config vitest.config.ts --run \
  packages/omnigent-transport/src/types.test.ts \
  packages/omnigent-transport/src/sse-stream.test.ts \
  packages/omnigent-transport/src/event-mapper.test.ts \
  packages/omnigent-transport/src/http-client.test.ts \
  packages/omnigent-transport/src/http-provider.test.ts \
  packages/omnigent-transport/src/conformance.test.ts \
  packages/omnigent-transport/src/capability-probe.test.ts
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @consiliency/omnigent-transport test:pack
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
node -e "const fs=require('node:fs'); const p=JSON.parse(fs.readFileSync('packages/omnigent-transport/package.json')); if(p.version!=='0.3.0'||p.repository.url!=='git+https://github.com/Consiliency/omniagent-plus.git') process.exit(1)"
node -e "const fs=require('node:fs'); for (const f of ['packages/core-contracts/package.json','packages/governed-pipeline-adapter/package.json']) { if(JSON.parse(fs.readFileSync(f)).version!=='0.2.0') process.exit(1) }"
```

`automation.suite_command`:

```bash
git diff --check && find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && pnpm exec vitest --config vitest.config.ts --run packages/omnigent-transport/src/types.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/http-client.test.ts packages/omnigent-transport/src/http-provider.test.ts packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @consiliency/omnigent-transport test:pack && NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
```

Manual evidence checks:

- Compare official tagged `v0.5.1` and `v0.6.0` OpenAPI documents and attach the
  added/removed path, schema, and stream-discriminator summary to the PR.
- Inspect the packed tarball manifest and contents: only transport is `0.3.0`,
  runtime-provider/pipeline-adapter remain `0.2.0`, and the refreshed fixture
  tree appears once under `dist/fixtures`.
- Review remaining `v0.5.1`/old-SHA matches. They are allowed only in explicit
  historical evidence, the v0.5 fixture, and changelog/history sections;
  `scripts/smoke-packed-omnigent-transport.mjs` must not retain the old version.
- Verify the npm trusted-publisher repository claim from package-owner metadata
  before release; dry-run packaging alone is not OIDC proof.

## Acceptance criteria

- [ ] Authority fixtures and docs pin official Omnigent `v0.6.0` at commit
  `375f540421baf3ad46fae0805b78063682f281de`, with current `main` clearly
  non-authoritative.
- [ ] The transport allowlist contains all 52 tagged event discriminators,
  including both v0.6 additions, while malformed and truly unknown events retain
  existing fail-soft behavior.
- [ ] Tagged-shape browser-action and function-output-delta fixtures parse with
  their metadata intact through direct parser tests and the fake-server SSE
  path, then map to zero neutral runtime events through the provider.
- [ ] Optional nullable `parent_session_id` is typed and evidenced only as
  session-list lineage; it does not alter runtime root-session semantics.
- [ ] Import and auto-title are documented optional upstream surfaces and are
  absent from the required provider endpoint table and HTTP client methods, with
  the client-surface absence mechanically asserted.
- [ ] Existing capability verdicts, reconnect behavior, and terminal-event
  uniqueness remain unchanged; no lease/lock or child-creation capability is
  inferred from v0.6.
- [ ] Telemetry, `hindsight`, and harness-environment release changes are
  documented accurately, with no hidden process-environment mutation and no
  deprecated local usage.
- [ ] Only `@consiliency/omnigent-transport` advances to `0.3.0`; its repository
  metadata names `Consiliency/omniagent-plus`, and unchanged public packages
  remain `0.2.0`.
- [ ] Targeted tests, full build/lint/typecheck/test, packed-consumer smoke, JSON
  validation, npm dry-run, and `git diff --check` pass.
- [ ] The packed artifact contains the refreshed v0.6 contract fixtures exactly
  once and remains installable outside the monorepo.
- [ ] Before actual publication, redacted operational evidence confirms npm OIDC
  trust targets `Consiliency/omniagent-plus` and the release workflow file;
  otherwise publication remains blocked without blocking code review.
- [ ] The implementation PR is opened for review and is neither merged nor
  published without explicit follow-on authorization.
