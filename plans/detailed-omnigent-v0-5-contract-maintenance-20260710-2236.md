# Detailed plan: adapt the Omnigent transport contract to official v0.5.1

## Task

Refresh `omniagent-plus` from its frozen Omnigent `v0.4.0` contract to the
official `v0.5.1` GitHub/PyPI release. Preserve the existing neutral provider
boundary, accept the newly stable stream and HTTP snapshot metadata, and document
the release's optional surfaces without adopting unrelated UI, administration,
worktree lifecycle, child-resource transfer, or harness features.

## Research summary

The plan is based on current `origin/main` at `c734aac`, where the public seam
packages have already moved to `@consiliency/*`. Official Omnigent `v0.5.1`
was published on 2026-07-10 at tag commit
`08285468e098244ac0b0bf98cb470d5c1a1a7070`; PyPI also reports `0.5.1`
with Python `>=3.12`, and upstream `main` was observed at
`7a519e49b53749105e09ce41409e7e813ac473eb`.

The tagged `v0.4.0...v0.5.1` OpenAPI comparison adds three paths
(`/v1/hosts/{host_id}/worktrees`,
`/v1/sessions/{session_id}/resources/files:copy`, and `/v1/sharing`), two
stream discriminators (`session.mcp_startup` and `response.policy_denied`),
optional `SessionResponse.mcp_startup`, optional
`SessionListItem.search_snippet`, and `SessionGitOptions.existing_worktree`.
It removes only `SessionForkRequest.model_override`; this repo does not send
that field. Existing provider-consumed paths, methods, status enums, reconnect
semantics, and terminal events are unchanged.

`v0.5.1` is a two-commit patch over `v0.5.0`: a desktop-browser UI fix plus
the version release. Its tagged OpenAPI has no path, schema, or event changes
from `v0.5.0`, so the provider delta below remains the same while the authority
pin moves to the latest official patch release.

Current code already fails open safely for transport continuity by skipping
unknown stream events, but that means it silently loses the two new stable
events. The smallest coherent adaptation is to admit both discriminators as
known metadata-only no-ops, preserve `mcp_startup` in neutral session metadata,
refresh the release authority and fixtures, and retain all current
blocked/emulated capability decisions. No roadmap amendment or cross-repo
dependency is required.

Three-agent amendment (2026-07-11): Sol (`gpt-5.6-sol`), Grok (`grok-4.5`),
and Gemini (`Gemini 3.1 Pro`) all returned `DISAGREE` on the first draft. This
amendment accepts the shared `model_override` verification contradiction and
Sol's fixture-loader, HTTP-scope, list-item ownership, and exact-status-proof
findings. It rejects Gemini's proposed `event-mapper.ts` / `sse-stream.ts`
implementation edits because the current mapper already no-ops known unmapped
events in its default branch and the parser already derives known types from
`omnigentStreamEventTypes`. It also rejects a stale local fork-request type
concern: no such type or `model_override` field exists in current transport
source.

Execution blocker addendum (2026-07-11): the prescribed `pnpm build` followed
by `pnpm lint` exposed a repository lint configuration defect. ESLint scanned
generated `**/dist/**` output and did not apply Node globals to the unchanged
Node `.mjs` smoke script. Completing the plan therefore also owns the minimal
`eslint.config.mjs` correction: ignore generated `dist` trees and apply
`globals.node` to JavaScript module/config files. No production behavior or
package surface changes.

Later review rounds found and corrected two further plan defects: the typed
event fixture must include `servers` / `phase`, and its event `type` must be
`OmnigentRawEvent["type"]` so existing `[DONE]` fixtures remain valid. Live
release revalidation during that review also moved the freeze from `v0.5.0` to
transport-compatible patch release `v0.5.1`.

## Frozen contract and vocabulary

`docs/omnigent-contract.md:1-14` currently freezes the protocol as:

> This document defines `IF-0-CONTRACT-1` for
> `agent-runtime-provider-omnigent`.
>
> - Freeze target: `omnigent` release `v0.4.0`
> - Authoritative downstream gate: `IF-0-CONTRACT-1`

Implementation must update only the release facts and upstream literals. It
must retain `IF-0-CONTRACT-1`, the existing neutral runtime event vocabulary,
and the `supported` / `emulated` / `blocked` capability vocabulary. The only
new upstream protocol literals are the official OpenAPI names
`session.mcp_startup`, `response.policy_denied`, and `mcp_startup`; do not
invent a new neutral runtime event, lease state, or capability status.

## Changes

### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` - modify - pin tag `v0.5.1`, commit
  `08285468e098244ac0b0bf98cb470d5c1a1a7070`, release timestamp
  `2026-07-10T23:26:54Z`, package version `0.5.1`, and Python `>=3.12`.
- `head_probe` - modify - record the observed post-release `main` commit
  `7a519e49b53749105e09ce41409e7e813ac473eb` as non-authoritative.
- `previous_probe` - modify - retain `v0.5.0` and commit
  `1d1b3a8605c48df10618ce481e974f565771326b` as historical prior-release
  evidence, replacing the obsolete `v0.4.0dev0` entry.
- `preflight_confirmation` and `provenance` - modify - record the three added
  paths, two new stream discriminators, optional snapshot metadata, and
  GitHub/PyPI/tagged-source evidence at `v0.5.1`, including that its OpenAPI is
  unchanged from `v0.5.0`.

### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `session_snapshot_fields` - modify - add optional `mcp_startup` metadata
  while preserving existing reconnect fields.
- `session_list_item_fields` - add - record optional `search_snippet` under the
  list response that owns it; do not describe it as a session snapshot field.
- `session_status_contract` and `stream_contract` - modify - keep the status,
  live-tail, reconnect, malformed-frame, and terminal-uniqueness semantics
  unchanged; update the release label/count and include the two v0.5 event
  literals.
- `optional_release_surfaces` - add - record host worktree listing,
  lineage-bounded file copy, sharing administration, and
  `existing_worktree` as stable upstream surfaces that are not required by
  `AgentRuntimeProvider` and are not implemented by this PR.
- `fork_request` - add - record the removal of `model_override` and assert the
  local transport never sends it.

### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- `documented_commands` - modify - record stable v0.5 discovery for
  `omni session export --id`, `omnigent debug logs`, and generic ACP harness
  selection, marking them non-required for the provider CLI fallback.
- `exit_code_contract` and `provenance` - modify - move current authority to
  `v0.5.1`; retain semantic stderr/body classification because upstream still
  publishes no stable non-zero exit-code ABI used by this provider.

### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- `capabilities` - modify - refresh v0.5 provenance without changing the
  existing provider capability statuses.
- `stream_events` evidence - modify - identify `session.mcp_startup` and
  `response.policy_denied` as supported parse/no-op metadata, not new neutral
  dispatch capabilities.
- blocked capability evidence - modify - keep public spawn-under-parent and
  harness override blocked; explicitly state that generic ACP and file copy do
  not promote those capabilities.

### `fixtures/omnigent/events/v0-5-noop-events.json` (create)

- `v0_5_noop_events` - add - provide tagged v0.5 fixture events for
  `session.mcp_startup` with bounded per-server status metadata and
  `response.policy_denied` with reason/phase metadata.
- `expected_provider_behavior` - add - require both events to parse as known,
  produce no neutral terminal event, and preserve existing malformed/unknown
  event handling.

### `fixtures/omnigent/fake-server/README.md` (modify)

- freeze description - modify - name `v0.5.1` as the current fixture authority
  and identify `v0.4.0` as historical fixture provenance where retained.

### `packages/omnigent-transport/src/contract-fixtures.ts` (modify)

- `OmnigentHttpSurfaceFixture` - modify - replace the release-specific
  `official_v0_4_event_count` property with
  `official_release_event_count`, and type the new
  `session_snapshot_fields`, `session_list_item_fields`,
  `optional_release_surfaces`, and `fork_request` fixture structures used by
  conformance tests.
- `OmnigentEventFixture.events` - modify - type `type` as
  `OmnigentRawEvent["type"]` so official event discriminators and the existing
  `[DONE]` sentinel remain valid; add optional `phase` and optional `servers`
  as a read-only record of `OmnigentMcpServerStartup`. Import those types from
  `types.ts` so the tagged fixture and runtime event shape cannot drift.
- fixture compatibility - preserve - keep existing endpoint, reconnect, and
  capability loader shapes intact; do not weaken capability status typing.

### `packages/omnigent-transport/src/types.ts` (modify)

- `omnigentStreamEventTypes` (`types.ts:41-90`) - modify - add exactly
  `session.mcp_startup` and `response.policy_denied` to the official allowlist.
- `OmnigentMcpServerStartup` - add - represent upstream statuses `starting`,
  `ready`, `failed`, and `cancelled` plus optional error text.
- `OmnigentSessionSnapshot` (`types.ts:120-138`) - modify - add optional raw
  `mcp_startup` metadata keyed by server name.
- `OmnigentRawEvent` (`types.ts:148-179`) - modify - add optional `servers` and
  `phase` fields needed by the two new event shapes; reuse existing
  `conversation_id`, `reason`, and `sequence_number` fields.

### `packages/omnigent-transport/src/http-provider.ts` (modify)

- `toSessionInfo` (`http-provider.ts:41-79`) - modify - merge an upstream
  `snapshot.mcp_startup` value into `AgentSessionInfo.metadata` under the exact
  key `mcp_startup`, preserving all existing `snapshot.metadata` entries.
- metadata omission - preserve - when `mcp_startup` is absent, retain the
  current metadata shape and avoid introducing an empty object.
- scope - preserve - this is specifically the tagged HTTP
  `SessionResponse.mcp_startup` contract. Do not modify `cli-client.ts`: the
  tagged v0.5 CLI does not publish this JSON field as a stable CLI transport
  contract, and CLI adapters already carry provider-neutral metadata through
  `snapshot.metadata`.

### `packages/omnigent-transport/src/types.test.ts` (modify)

- transport freeze test - modify - assert both v0.5 event literals, all four
  MCP startup statuses, snapshot `mcp_startup`, and raw policy-denied/MCP event
  payload typing.
- status freeze - modify - import `omnigentResponseStatuses` and assert the
  exact session array `idle`, `launching`, `running`, `waiting`, `failed` and
  exact response array `queued`, `in_progress`, `completed`, `failed`,
  `incomplete`, `cancelled` rather than checking selected members.

### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- official release event test - modify - load `v0-5-noop-events` and prove both
  new discriminators parse without `unknown_event_type` skips; assert the
  parsed MCP server status/error map and policy-denial phase/reason metadata.
- malformed/unknown test - preserve - keep truly unknown events, invalid JSON,
  and non-object payloads fail-soft exactly as before.

### `packages/omnigent-transport/src/event-mapper.test.ts` (modify)

- v0.5 no-op mapping test - add - prove both new observational events emit no
  neutral runtime event and cannot create or terminate a turn.
- terminal uniqueness tests - preserve - retain duplicate response/turn
  terminal collapse coverage.
- fixture construction - modify - ensure `response.policy_denied` is built
  without a synthetic turn id, matching the tagged observational event, and
  carry the fixture's `servers` and `phase` fields into raw events before
  asserting they still map to no neutral runtime event.

### `packages/omnigent-transport/src/event-mapper.ts` and `packages/omnigent-transport/src/sse-stream.ts` (no change)

- mapping behavior - preserve - `event-mapper.ts` already returns `[]` from its
  default branch for known unmapped events, so both new observational events
  no-op without a production mapper edit.
- parser behavior - preserve - `sse-stream.ts` already derives known events
  from `omnigentStreamEventTypes`; updating that allowlist is sufficient.

### `packages/omnigent-transport/src/http-provider.test.ts` (modify)

- session metadata test - add - use a focused injected `fetch` response with
  `mcp_startup` to prove `AgentSessionInfo.metadata.mcp_startup` is preserved.
- metadata compatibility test - add or extend - prove existing metadata is
  retained and an absent `mcp_startup` does not synthesize metadata.

### `packages/omnigent-transport/src/conformance.test.ts` (modify)

- release authority assertions - modify - require tag/version/commit `v0.5.1`,
  `0.5.1`, and `08285468e098244ac0b0bf98cb470d5c1a1a7070`.
- boundary assertions - add - require the two event literals and optional
  upstream surfaces to be present in fixtures while provider capability states
  remain unchanged.
- fork compatibility assertion - add - prove no provider request fixture or
  production request constructor sends removed `model_override`. The test may
  name and document the field; inspect request-body objects rather than banning
  the literal from all source and fixtures.

### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- snapshot version assertion - modify - expect capability snapshots to report
  version `0.5.1` and the v0.5.1 tag SHA from refreshed source metadata.

### `docs/omnigent-contract.md` (modify)

- `Supported Version` - modify - make official `v0.5.1` the
  `IF-0-CONTRACT-1` freeze and retain v0.4 only as prior history.
- `HTTP API Surface` - modify - document the three added stable paths as
  observed optional surfaces; do not add them to the provider-consumed table.
- `Event Stream` - modify - add the two official literals and define both as
  known metadata-only no-ops at the neutral boundary.
- snapshot/fork/capability sections - modify - document optional
  `mcp_startup`, the removed fork `model_override`, unchanged status/reconnect
  behavior, and unchanged blocked/emulated decisions.

### `docs/omnigent-upstream-readiness.md` (modify)

- `Current Decision` - modify - record the v0.5 GitHub/PyPI release and the
  post-release `main` probe.
- stable delta - modify - replace the stale unreleased worktree/file-copy note
  with the exact v0.5 provider-relevant delta and non-goals.
- `Maintenance Plan` - preserve - keep the next-release process and move its
  baseline to v0.5.

### `docs/omnigent-transport.md` (modify)

- HTTP and event mapping - modify - describe v0.5 metadata acceptance, limit
  snapshot `mcp_startup` preservation to the tagged HTTP response surface, and
  state that policy denial remains observational/non-terminal.
- non-goals - modify - state that sharing administration, server-owned
  worktree lifecycle, resource copying, queue/steer UI, and generic ACP
  dispatch are not added to `AgentRuntimeProvider` by this change.

### `docs/lifecycle-and-events.md` (modify)

- upstream drift - modify - add v0.5's two known no-op event families while
  preserving `launching` normalization, unknown/malformed skip behavior,
  reconnect dedupe, and one-terminal-event semantics.

### `docs/coordination-backend.md` (modify)

- `Upstream Omnigent State` - modify - replace the stale v0.4/current-main
  statement with v0.5 and explicitly reconfirm that the upstream worktree API
  is read-only discovery, not a lease/lock/coordination/inbox backend.

### `eslint.config.mjs` (modify)

- generated output - modify - ignore `**/dist/**` so `pnpm build` cannot make
  the subsequent lint gate fail on compiler output.
- Node scripts - modify - apply Node globals to `.js`, `.mjs`, and `.cjs`
  repository scripts while retaining the existing TypeScript rules.

## Documentation impact

Documentation changes are required because `docs/omnigent-contract.md` is the
authoritative `IF-0-CONTRACT-1` freeze and the readiness, transport, lifecycle,
and coordination documents currently make stale v0.4 claims. Do not modify the
fleet roadmap, public Consiliency schemas, release workflow, package versions,
or `CHANGELOG.md`; this is an upstream contract-maintenance PR and does not
change any published `@consiliency/*` API.

## Dependencies & order

1. Reconfirm official release metadata from GitHub, PyPI, the v0.5 tag, tagged
   `openapi.json`, `omnigent/server/API.md`, `omnigent/server/schemas.py`,
   `omnigent/cli.py`, and the Python session client. If the tag or OpenAPI facts
   differ from this plan, stop and amend the plan before editing fixtures.
2. Update discovery fixtures and `contract-fixtures.ts` together so source,
   tests, and docs consume one typed authoritative v0.5 fact set.
3. Add the focused v0.5 event fixture, then update TypeScript types and neutral
   metadata preservation.
4. Update targeted parser, mapper, provider, conformance, and capability tests.
5. Update contract/readiness/transport/lifecycle/coordination documentation to
   match the fixture and code decisions.
6. Run targeted transport tests, JSON validation, and contract drift checks;
   then run the whole repository build, lint, typecheck, and test suite.
7. If implementation discovers a public lease, lock, coordination, inbox, or
   stable spawn-under-parent API in the v0.5 tag, stop and amend the plan. Do not
   silently change CS-2.2 ownership or neutral provider capabilities.

## Verification

Do not run these commands during planning. The implementation runner should
run the narrow checks first:

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run \
  packages/omnigent-transport/src/types.test.ts \
  packages/omnigent-transport/src/sse-stream.test.ts \
  packages/omnigent-transport/src/event-mapper.test.ts \
  packages/omnigent-transport/src/http-provider.test.ts \
  packages/omnigent-transport/src/conformance.test.ts \
  packages/omnigent-transport/src/capability-probe.test.ts
pnpm --filter @consiliency/omnigent-transport typecheck
find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null
```

Then run repository-wide verification:

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
test "$(jq -r '.freeze_target.tag' fixtures/omnigent/discovery/source-metadata.json)" = "v0.5.1"
test "$(jq -r '.freeze_target.commit' fixtures/omnigent/discovery/source-metadata.json)" = "08285468e098244ac0b0bf98cb470d5c1a1a7070"
rg -n 'session\.mcp_startup|response\.policy_denied|mcp_startup' \
  docs/omnigent-contract.md fixtures/omnigent packages/omnigent-transport/src
! rg -n 'model_override\s*[:,]' packages/omnigent-transport/src --glob '!*.test.ts'
git diff --check
phase-loop validate-roadmap specs/phase-plans-v1.md
```

Effective automation suite:

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src/types.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/http-provider.test.ts packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts && pnpm --filter @consiliency/omnigent-transport typecheck && find fixtures/omnigent -name '*.json' -print | sort | xargs -r -n1 python3 -m json.tool >/dev/null && pnpm build && pnpm lint && pnpm typecheck && pnpm test && test "$(jq -r '.freeze_target.tag' fixtures/omnigent/discovery/source-metadata.json)" = "v0.5.1" && test "$(jq -r '.freeze_target.commit' fixtures/omnigent/discovery/source-metadata.json)" = "08285468e098244ac0b0bf98cb470d5c1a1a7070" && rg -n 'session\.mcp_startup|response\.policy_denied|mcp_startup' docs/omnigent-contract.md fixtures/omnigent packages/omnigent-transport/src && ! rg -n 'model_override\s*[:,]' packages/omnigent-transport/src --glob '!*.test.ts' && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md
```

Edge cases:

- `response.policy_denied` has no turn correlation id and must never synthesize
  a terminal `runtime.turn.failed` event.
- `session.mcp_startup` and HTTP snapshot `mcp_startup` may contain
  failed/cancelled server states; preserve bounded metadata without treating
  provider health as globally failed.
- Existing snapshot metadata must survive the `mcp_startup` merge.
- Truly unknown and malformed events must continue to skip without poisoning
  the stream.
- The removed fork `model_override` field may appear in documentation,
  discovery evidence, and tests, but must not appear as a property in any
  production outgoing request constructor.
- The upstream worktree listing must not be mistaken for the durable CS-2.2
  lease store.

## Acceptance criteria

- [ ] `docs/omnigent-contract.md` and source metadata freeze
  `IF-0-CONTRACT-1` at Omnigent `v0.5.1`, package `0.5.1`, and tag commit
  `08285468e098244ac0b0bf98cb470d5c1a1a7070`.
- [ ] The tagged-source preflight confirms the three added paths, two added
  stream discriminators, optional `mcp_startup`, and removed fork
  `model_override` exactly as recorded in the plan.
- [ ] `session.mcp_startup` and `response.policy_denied` fixture payloads are
  typed through `contract-fixtures.ts`, parse with their server/phase metadata
  intact, and safely no-op at the neutral runtime event boundary.
- [ ] HTTP snapshot `mcp_startup` is preserved under
  `AgentSessionInfo.metadata.mcp_startup` without dropping existing metadata or
  creating metadata when the field is absent; CLI behavior remains explicitly
  outside this tagged HTTP snapshot adaptation.
- [ ] Tests assert the exact unchanged session and response status arrays, plus
  unchanged reconnect dedupe, malformed-frame skipping, and terminal-event
  uniqueness.
- [ ] No production outgoing request constructor sends the removed
  `SessionForkRequest.model_override` field; discovery fixtures and tests may
  name it as evidence.
- [ ] Host worktree listing, lineage file copy, sharing, existing-worktree
  binding, generic ACP, queue/steer, and new CLI conveniences are documented as
  optional/non-provider surfaces and do not expand `AgentRuntimeProvider`.
- [ ] Public spawn-under-parent and harness override remain blocked; logical
  close, malformed-event handling, and terminal uniqueness retain their current
  emulated posture.
- [ ] `docs/coordination-backend.md` reconfirms that v0.5 provides no lease,
  lock, coordination, or inbox API and does not change CS-2.2 ownership.
- [ ] All Omnigent JSON fixtures parse, and targeted transport tests and
  typechecking pass.
- [ ] The effective automation suite passes with no unrelated file changes.
