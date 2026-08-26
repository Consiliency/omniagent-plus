# Detailed plan: accommodate official Omnigent v0.11.0

## Task

Advance `@consiliency/omnigent-transport` from the frozen official Omnigent
`v0.10.0` contract to official `v0.11.0`. Accept the two additive session
metadata events, preserve newly exposed background-task detail, and handle the
official pre-allocation `response.failed` shape without weakening terminal
failure handling. Refresh tagged authority evidence and prepare the already
reserved transport-only `0.6.0` release.

This is a bounded compatibility release. It does not add a neutral permission,
approval, lease, lock, routing, child-creation, or policy API. Implementation,
merge, and npm publication are separate gates; this gate may implement and open
an exact-head reviewed PR, but it must not merge or publish without later
authorization.

## Starting state

- Planning worktree:
  `/mnt/workspace/worktrees/omniagent-plus-plan-omnigent-v0-11`
- Branch: `codex/plan-omnigent-v0-11`
- Base: `origin/main` at
  `4f48f7212d90d5c5d4819ef437554ad449ed89c0`
- Frozen current contract: Omnigent `v0.10.0` at
  `40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`
- Target contract: Omnigent `v0.11.0` at
  `496b7b13f6af3ed5330b957df408fc91290b6307`
- Published package: `@consiliency/omnigent-transport@0.5.0`
- Prepared but unpublished package version: `0.6.0`
- Sibling packages remain `@consiliency/runtime-provider@0.2.0` and
  `@consiliency/pipeline-provider-adapter@0.2.0`.
- The planning worktree was clean before this artifact was written. There were
  no pre-existing untracked files.

## Research summary

Live GitHub release metadata on 2026-08-26 identifies official Omnigent
`v0.11.0`, published 2026-08-25, at tag commit
`496b7b13f6af3ed5330b957df408fc91290b6307`. PyPI publishes
`omnigent==0.11.0` with Python `>=3.12`; npm still publishes only
`@consiliency/omnigent-transport@0.5.0`.

The direct v0.10-to-v0.11 OpenAPI comparison preserves 100 operations and 72
paths, and grows schemas from 139 to 143. It adds
`BackgroundTaskInfo`, `FailedResponseObject`, `SessionPermissionModeEvent`, and
`SessionTitleEvent`; removes no schema; and changes `FailedEvent`,
`ServerStreamEvent`, `SessionModelEvent`, `SessionProjectSummary`,
`SessionResponse`, `SessionStatusEvent`, `SessionUsage`, and
`UpdateSessionRequest`. The stable event union grows from 52 to 54 with exactly
`session.permission_mode` and `session.title`.

`FailedResponseObject` permits a `response.failed` payload whose only required
field is `status`; allocation metadata such as `id`, timestamps, model, and
conversation may be absent or null. The current parser requires nested
`response.id`, so it rejects a legitimate v0.11 setup/transport failure before
the existing synthetic event identity and provisional-turn correlation can run.

The transport already consumes session snapshots and `session.status`, so the
new nullable `background_tasks` detail belongs in its read-only wire and
normalized types. `SessionProjectSummary.icon` and
`SessionUsage.other_harnesses` are reporting/project surfaces the provider does
not consume. `UpdateSessionRequest.permission_mode` mutates a live Claude TUI
and remains outside the neutral provider contract.

## Frozen decisions

1. Freeze only official `v0.11.0`. Immediately before authority edits, confirm
   GitHub latest release, exact tag SHA, PyPI version/Python requirement, npm
   package state, OpenAPI counts, and CLI surface. If a newer stable upstream
   release exists, stop and amend this plan. Also stop if npm reports anything
   other than transport `0.5.0`; the planned changelog/version treatment assumes
   `0.6.0` has never been published.
2. Expand `omnigentStreamEventTypes` from 52 to exactly 54 literals by adding
   only `session.permission_mode` and `session.title`. Preserve all existing
   spellings and order except for placing the two new session literals with the
   other session events.
3. Validate both new events at the SSE boundary: each requires a non-empty
   `conversation_id`; permission-mode requires non-empty `permission_mode`; title
   requires non-empty `title`. Malformed frames remain observable through the
   existing `invalid_event_shape` skip path.
4. Normalize `permission_mode` and `title` as read-only raw metadata. Both map
   to zero `AgentRuntimeProvider` events and trigger no session-state mutation.
   Do not interpret a permission-mode string as approval or authority.
5. Accept native `response.failed` when `response` is an object whose `status`
   is exactly `failed`, even when `response.id` is absent or null. Preserve the
   stricter ID requirement for created/completed/incomplete/cancelled native
   response frames and preserve the legacy normalized compatibility shape.
6. For an identity-free pre-allocation failure, use the normalizer's existing
   synthetic event ID and provisional/fallback turn correlation. Never invent
   an upstream response ID. If no unambiguous turn exists, retain the event as
   terminal failure metadata and emit no falsely attributed neutral turn event.
7. Preserve `response.error` losslessly and derive the same
   `backend_unavailable` runtime failure message used today. The v0.11 parser
   accommodation must not alter XG authority, retry policy, approval policy, or
   failure vocabulary.
8. Add a read-only `OmnigentBackgroundTaskInfo` with optional nullable
   `id`, `type`, `status`, `description`, and `command`. Preserve nullable
   `background_tasks` on session snapshots and status events without adding task
   control methods or using the detail as lifecycle authority. Snapshot and SSE
   normalization are availability-preserving: retain object entries and unknown
   fields, preserve known absent/null/string fields, omit malformed known fields,
   and ignore non-object entries. Decorative detail must never make a session
   unusable or suppress a `session.status` lifecycle/terminal edge.
9. Record `SessionProjectSummary.icon`, `SessionUsage.other_harnesses`, model
   description/vocabulary updates, scheduled-task cost/permission additions,
   reconnect fixes, and operator/UI changes as observed non-provider surfaces.
10. Do not expose a typed or public
    `PATCH UpdateSessionRequest.permission_mode`, collaboration
    mode, schedule mutation, title mutation, or any TUI-control method through
    `AgentRuntimeProvider`, `OmnigentHttpClient`, or the coordinator.
11. Preserve the API-guide authority for
    `POST /v1/sessions/{session_id}/events` if the generated OpenAPI continues
    to omit that required route.
12. Keep v0.9 and v0.10 wire fixtures and loaders immutable as historical
    regression evidence. Add a separate v0.11 fixture and loader.
13. Keep `@consiliency/omnigent-transport` at the already prepared but
    unpublished `0.6.0`; amend its changelog entry from v0.10 to v0.11. Leave
    sibling versions and `.github/workflows/publish.yml` unchanged.
14. Open one atomic PR after implementation. Review its exact head with the
    four-vendor advisor board, using the required Claude/Fable subscription TUI
    adapter. Any material repair requires full verification and a fresh
    exact-head board receipt. Do not merge or publish at this gate.

## Changes

### Authority and tagged evidence

#### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- Advance frozen release, exact SHA, publication/PyPI metadata, OpenAPI counts,
  stable-event count, changed schemas, and provenance to v0.11.
- Preserve v0.10 and v0.9 as historical releases.
- Retain `security_posture.v0_10_bundle_root_isolation` as historical typed
  evidence unless its fixture type and both conformance assertions are migrated
  deliberately in the same change.
- Replace the former development watch-list language with stable v0.11
  classifications and record the neutral authority boundary.

#### `fixtures/omnigent/discovery/http-surface.json` (modify)

- Record the 100-operation/72-path/143-schema v0.11 surface, four additions,
  eight changed schemas, and no removals.
- Describe `FailedResponseObject`, background-task detail, the two new session
  events, and observed non-provider schema changes.
- Retain the tagged API-guide provenance for the send-events route.

#### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- Advance probe commands and exact tagged-source references to v0.11.
- Record model/permission/scheduled-task/operator changes without changing the
  production process-manager command contract.

#### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- Advance release evidence and classify permission mode, title, background
  tasks, scheduled-task controls, and reporting additions.
- Keep approval, lease, lock, route decision, child creation, harness override,
  and permission mutation outside the neutral provider capability set.

#### `fixtures/omnigent/http/v0-11-wire-contract.json` (create)

- Bind representative bytes to tag `v0.11.0` and commit
  `496b7b13f6af3ed5330b957df408fc91290b6307`.
- Include a snapshot and status event with nullable background-task details.
- Include valid and malformed `session.permission_mode` and `session.title`
  frames.
- Include an allocated failure and a pre-allocation `response.failed` carrying
  `status` and structured error but no `id`.
- Retain unchanged create, child page, send acknowledgement, output delta, and
  terminal samples needed for historical regression.

#### `fixtures/omnigent/fake-server/scenarios.json` and
`fixtures/omnigent/fake-server/README.md` (modify)

- Make v0.11 the current tagged-wire scenario and describe v0.10/v0.9 as
  immutable historical fixtures.

### Transport implementation

#### `packages/omnigent-transport/src/types.ts` (modify)

- `omnigentStreamEventTypes` - add exactly the two v0.11 literals.
- `OmnigentBackgroundTaskInfo` - add the optional nullable read-only detail.
- `OmnigentWireSessionResponse.background_tasks` and
  `OmnigentSessionSnapshot.backgroundTasks` - add nullable task arrays.
- `OmnigentRawEvent.background_tasks`, `permission_mode`, and `title` - add
  normalized metadata fields.

#### `packages/omnigent-transport/src/sse-stream.ts` (modify)

- `hasValidEventShape` - add exact validation for both new session events and
  permit only the official v0.11 `status: "failed"` identity-free response
  shape.
- `OmnigentSseNormalizer.normalize` - preserve valid new metadata/background-task
  fields best-effort, reuse synthetic event identity, and retain conservative
  turn correlation for pre-allocation failures. Ignore malformed decorative
  `background_tasks` rather than dropping the containing status frame.

#### `packages/omnigent-transport/src/http-client.ts` (modify)

- `normalizeSession` - read `background_tasks` only when null or an array;
  ignore other top-level values rather than failing the session. For array
  entries, preserve valid known fields and unknown fields, omit malformed known
  fields, and ignore non-object entries.

#### `packages/omnigent-transport/src/event-mapper.ts` and
`packages/omnigent-transport/src/http-provider.ts` (verify; modify only if a
focused regression proves necessary)

- Assert the new session metadata events map to no neutral events and perform no
  provider state mutation.
- Preserve existing failure mapping and conservative no-turn behavior for
  ambiguous identity-free terminal failures.

#### `packages/omnigent-transport/src/contract-fixtures.ts` and
`packages/omnigent-transport/src/index.ts` (modify)

- Add `OmnigentV011WireFixture` and `loadOmnigentV011WireContract`.
- Export the v0.11 loader while retaining v0.10 and v0.9 loaders.

### Tests and packed-consumer proof

#### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- Replace the v0.11 watch-list rejection test with acceptance, normalization,
  malformed-shape, and metadata-only behavior tests.
- Prove an ID-bearing failed response remains unchanged.
- Prove a status-bearing failure without response ID parses, preserves error,
  receives only synthetic event identity, correlates only when unambiguous, and
  never aliases an unrelated turn.
- Cover the id-less failure while `currentResponseId` is set and prove it binds
  only to that in-flight response, not a provisional or historical turn.

#### `packages/omnigent-transport/src/event-mapper.test.ts` and
`packages/omnigent-transport/src/http-provider.test.ts` (modify)

- Prove the two new events emit no runtime events or state/authority changes.
- Stream both events while an active provisional turn and fence state exist;
  assert active turn, session state, and fence state remain unchanged.
- Prove an unambiguous pre-allocation failure emits the existing typed terminal
  failure and an ambiguous one is not falsely attributed.

#### `packages/omnigent-transport/src/http-client.test.ts` and
`packages/omnigent-transport/src/types.test.ts` (modify)

- Cover valid, null, absent, and malformed background-task detail.
- Assert exactly 54 stable event literals and the new read-only metadata types.

#### `packages/omnigent-transport/src/conformance.test.ts` and
`packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- Advance exact authority to v0.11 and assert all OpenAPI/event counts and
  additions/changes/removals.
- Load v0.11 current evidence while retaining v0.10/v0.9 historical gates.
- Assert metadata-only mapping, pre-allocation failure behavior, and all neutral
  capability exclusions.

#### `scripts/smoke-packed-omnigent-transport.mjs` (modify)

- Exercise the exported v0.11 fixture/types from a clean tarball install and
  retain v0.10/v0.9 historical loader checks.

#### `scripts/check-omnigent-openapi-delta.mjs` (create)

- Fetch the exact tagged v0.10/v0.11 OpenAPI documents with built-in Node APIs.
- Fail closed unless operation/path/schema/event counts, named additions,
  changes, removals, and the four load-bearing v0.11 property/required sets
  match this plan. Emit only the verified summary and source URLs.

### Documentation and release metadata

#### `docs/omnigent-contract.md`, `docs/omnigent-transport.md`,
`docs/omnigent-upstream-readiness.md`, `docs/lifecycle-and-events.md`,
`docs/omnigent-live-smoke.md`, and `docs/coordination-backend.md` (modify)

- Advance frozen authority and operator probes to v0.11.
- Document the 54-event vocabulary, metadata-only permission/title events,
  background-task detail, and pre-allocation failure shape.
- State that permission-mode mutation and upstream approval behavior grant no
  Consiliency authority and that runtime-provider/coordinator contracts remain
  unchanged.
- Preserve the live-smoke contract phrases `skip by default`, `metadata_only`,
  and `no credentials required`.

#### `CHANGELOG.md` (modify)

- Amend the unpublished `0.6.0` entry to v0.11 compatibility, including the
  v0.10 work already present on `main`; do not add a second unreleased version.

## Dependencies and order

1. Run the live release/tag/PyPI/npm/OpenAPI/CLI preflight and stop on a newer
   stable release, an npm transport version other than `0.5.0`, or a
   contradictory contract.
2. Freeze v0.11 discovery and wire evidence while preserving historical files.
3. Add types/fixture loader, parser validation, normalizer support, and snapshot
   background-task preservation.
4. Add focused parser, mapper, provider, HTTP-client, type, conformance, and
   capability regressions.
5. Update docs, changelog, and packed-consumer proof.
6. Run focused checks, then the full suite, build, pack smoke, dry-run publish,
   and clean-worktree checks.
7. Commit/push the implementation branch, open one PR, and panel the exact head.
   Reconcile material findings and rerun all affected gates before reporting.

## Verification

### Live authority preflight

```bash
test "$(gh release view --repo omnigent-ai/omnigent --json tagName --jq .tagName)" = "v0.11.0"
test "$(gh api repos/omnigent-ai/omnigent/commits/v0.11.0 --jq .sha)" = \
  "496b7b13f6af3ed5330b957df408fc91290b6307"
curl -fsSL https://pypi.org/pypi/omnigent/json | \
  jq -e '.info.version == "0.11.0" and .info.requires_python == ">=3.12"'
test "$(npm view @consiliency/omnigent-transport version)" = "0.5.0"
if output=$(npm view @consiliency/omnigent-transport@0.6.0 version 2>&1); then
  echo "0.6.0 is already published: $output" >&2
  exit 1
else
  printf '%s\n' "$output" | rg -q 'E404'
fi
node scripts/check-omnigent-openapi-delta.mjs v0.10.0 v0.11.0
uvx --from omnigent==0.11.0 omnigent --version
uvx --from omnigent==0.11.0 omnigent --help
uvx --from omnigent==0.11.0 omnigent server --help
uvx --from omnigent==0.11.0 omnigent host --help
```

The OpenAPI checker fetches tagged v0.10/v0.11 `openapi.json` files and asserts
100 operations, 72 paths, 143 schemas, 54 event discriminators, exactly
the four named schema additions, exactly the eight named schema changes, the two
named event additions, and no path/schema/event removals. It also asserts the tagged
required/property sets for `SessionPermissionModeEvent`, `SessionTitleEvent`,
`FailedResponseObject`, and `BackgroundTaskInfo` before freezing fixture bytes.
This comparison must exit nonzero on any mismatch; conformance tests over the
checked-in fixture are downstream evidence, not a substitute for this live gate.

### Focused transport gates

```bash
pnpm exec vitest --config vitest.config.ts --run \
  packages/omnigent-transport/src/types.test.ts \
  packages/omnigent-transport/src/sse-stream.test.ts \
  packages/omnigent-transport/src/event-mapper.test.ts \
  packages/omnigent-transport/src/http-client.test.ts \
  packages/omnigent-transport/src/http-provider.test.ts \
  packages/omnigent-transport/src/conformance.test.ts \
  packages/omnigent-transport/src/capability-probe.test.ts
```

### Effective suite and package proof

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build && \
pnpm --filter @consiliency/omnigent-transport test:pack
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh \
  packages/omnigent-transport
git diff --check
git status --short --branch
```

`NPM_PUBLISH_DRY_RUN=1` is mandatory. Do not pass a trailing `--dry-run`; the
publish helper does not consume it and that form could publish.

### Exact-head review

```bash
git rev-parse HEAD
gh pr view --repo Consiliency/omniagent-plus --json number,url,headRefOid,statusCheckRollup
phase-loop advisor-board <exact-head-review-bundle> --json
```

The review receipt must identify the PR head OID and include usable verdicts
from at least three seats. The Claude/Fable seat must use the first-party
subscription TUI adapter; `DEGRADED`, `EMPTY`, `TIMEOUT`, `ERROR`, and
`UNAVAILABLE` are evidence, not approvals.

## Acceptance criteria

- [ ] GitHub, PyPI, npm, tagged OpenAPI, and CLI evidence all identify official
  Omnigent v0.11.0 at commit
  `496b7b13f6af3ed5330b957df408fc91290b6307`, proven by the live preflight and
  conformance suite.
- [ ] The transport accepts exactly 54 stable event types, including only the
  two v0.11 additions, proven by `types.test.ts` and `conformance.test.ts`.
- [ ] Valid permission/title events normalize as read-only metadata, malformed
  variants are skipped, and neither emits neutral events or mutates provider
  authority/state even during an active provisional turn, proven by
  SSE/mapper/provider tests.
- [ ] Official status-bearing pre-allocation failures without response IDs are
  accepted and retain typed terminal failure semantics without inventing an
  upstream ID or misattributing an ambiguous turn, proven by SSE/mapper/provider
  tests.
- [ ] Background-task detail is losslessly preserved from snapshots and status
  frames; malformed decorative detail cannot make snapshots unusable or suppress
  a status/terminal edge, proven by HTTP/SSE/type tests.
- [ ] v0.10 and v0.9 fixture loaders remain exported and pass historical
  regression gates, proven by conformance and packed-consumer tests.
- [ ] No permission mutation, approval, lease, lock, routing, child-create,
  harness-override, schedule-control, or policy capability enters the neutral
  provider surface, proven by capability/conformance tests and public API diff.
- [ ] Only the unpublished transport `0.6.0` release entry is amended; sibling
  versions and publish workflow are unchanged, proven by git diff and package
  metadata checks.
- [ ] The full test, typecheck, lint, build, pack, and credential-free dry-run
  publish suite passes on a clean implementation head.
- [ ] One PR is open at the verified implementation OID with a reconciled
  exact-head advisor-board receipt; it remains unmerged and unpublished.
