# Detailed plan: accommodate official Omnigent v0.10.0

## Task

Advance `@consiliency/omnigent-transport` from the frozen official Omnigent
`v0.9.0` contract to official `v0.10.0`, preserving the neutral runtime-provider,
coordinator lease/lock, approval, authority, and event-mapping boundaries. Refresh
the checked-in authority evidence, accept the additive v0.10 HTTP/schema and CLI
surface, type and validate the one new transport-consumed child-summary field,
prove existing v0.9 HTTP/SSE behavior remains lossless, and prepare a
transport-only `0.6.0` release.

This is one bounded compatibility release, not a roadmap. Keep authority
fixtures, implementation, conformance tests, operator documentation, package
metadata, and release notes in one atomic PR so `main` never claims v0.10 support
without the evidence and code that prove it. Implementation does not authorize
merge or publication; those remain explicit coordinator gates after exact-head
review.

## Starting state

- Planning worktree:
  `/mnt/workspace/worktrees/omniagent-plus-plan-omnigent-v0-10`
- Branch: `codex/plan-omnigent-v0-10`
- Base: `origin/main` at
  `500a8ce882996c5e4020c823fad9f1679ce88f05`
- Frozen upstream contract: Omnigent `v0.9.0` at
  `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`
- Published package: `@consiliency/omnigent-transport@0.5.0`
- Target upstream contract: Omnigent `v0.10.0` at
  `40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`
- Target package: `@consiliency/omnigent-transport@0.6.0`
- The planning worktree was clean before this artifact was written. There were
  no pre-existing untracked files in this worktree.

## Research summary

Live GitHub release metadata on 2026-08-24 identifies official Omnigent
`v0.10.0`, published 2026-08-19, at tag commit
`40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`. PyPI publishes
`omnigent==0.10.0` with Python `>=3.12`; npm still publishes
`@consiliency/omnigent-transport@0.5.0` as `latest`.

The direct v0.9-to-v0.10 OpenAPI comparison is additive: operations increase
from 97 to 100, paths from 69 to 72, and schemas from 134 to 139. The three new
paths are `/.well-known/omnigent.json`, `/v1/branding/logo/{variant}`, and
`/v1/sessions/{session_id}/resources/environments/{environment_id}/search/{path}`.
The five new schemas are `BrandingInfo`, `BrandingLogosInfo`, `DailyCost`,
`ServerInfoResponse`, and `SmartRoutingSourcesInfo`. No path or schema is
removed. Six existing schemas differ: `AgentObject`, `ChildSessionSummary`,
`ErrorDetail`, `OutputTextDeltaEvent`, `SessionUsage`, and `UsageReport`.

Only `ChildSessionSummary.task_summary` enters a transport-consumed response
shape. `ErrorDetail` adds nullable `title`, `cause`, and `remediation`, but the
HTTP client intentionally preserves error bodies as `unknown`; it must prove
those fields round-trip rather than reinterpret them as neutral authority or
failure policy. Usage/reporting, branding, server discovery, smart-routing
source, and environment-search additions are operator/admin surfaces outside
the runtime-provider contract. The three `OutputTextDeltaEvent` differences are
descriptions only; required fields and wire shape are unchanged.

The stable stream union remains exactly 52 event discriminators. The frozen
allowlist is the literal array in
`packages/omnigent-transport/src/types.ts:68-121` (with its type alias at
lines 122-123); v0.10 introduces no new
vocabulary and this plan must not modify that array. Development `main` is
already `v0.11.0.dev0` at `9303cc1cd12e2e5788f4e2b9dcde9308b474017a`
and adds `session.permission_mode` and `session.title` through two new event
schemas. Those development-only events are watch-list evidence, not accepted
input for this release.

An isolated v0.10 CLI probe confirms `omnigent server --background` remains
supported. v0.10 also documents `omnigent start` and `omnigent host
--background`; they are non-provider operator commands and do not replace the
existing process-manager command. The previously main-only fix that roots
sub-agent sessions at their own bundle directory is included in v0.10. Release
notes also revert shared-session approval attribution: any shared editor can
approve again. That rollback must be documented as upstream collaboration
behavior, never as Consiliency approval, lease, lock, or authority.

## Frozen decisions

1. Freeze only official `v0.10.0`. Immediately before implementation, rerun the
   GitHub release, tag, PyPI, OpenAPI, CLI, and npm preflight. If a newer stable
   release exists, stop and amend this plan before editing authority fixtures.
2. Preserve all 52 stable event literals exactly as quoted from
   `packages/omnigent-transport/src/types.ts:68-121`. Do not add v0.11
   `session.permission_mode` or `session.title`, and do not broaden neutral
   event vocabulary.
3. Preserve the v0.9 text/reconnect rules. Identity-free equal text remains
   undecidable and lossless; deduplicate only with item/message identity or
   process-local cursor evidence. v0.10 description edits do not justify an
   event-mapper or SSE-normalizer behavior change.
4. Add `task_summary?: string | null` to `OmnigentChildSessionSummary` and
   validate a present non-null value as a string in
   `normalizeChildSessionSummary`. Preserve it as read-only upstream metadata;
   it does not enable child creation or routing authority.
5. Keep `OmnigentHttpError.body` lossless and typed as `unknown`. Narrow HTTP
   failure classification to canonical machine fields (`code`, `message`, and
   legacy `error`, including the same fields under a FastAPI `detail` envelope)
   plus a plain-string body. Never include v0.10 descriptive `title`, `cause`,
   `remediation`, or unknown additive fields in retryability, policy, approval,
   billing/auth, or neutral failure classification.
6. Record `SessionUsage.agent_name`, `harness`, `llm_model`,
   `UsageReport.daily_costs`, branding, server discovery, smart-routing source,
   and environment-search additions as observed non-provider surfaces. Do not
   add endpoints or package APIs for surfaces the transport does not consume.
7. Retain `omnigent server --background` as the only production lifecycle
   command. Record `omnigent start` and `omnigent host --background` as
   non-provider operator commands; do not alter `CliClient`, `HybridProvider`,
   or `OmnigentProcessManager` command selection.
8. Update the bundle-root posture from unreleased caveat to stable v0.10
   capability. Do not claim that the transport itself enforces upstream bundle
   isolation; it only records the runtime guarantee at the frozen tag.
9. Treat v0.10 shared-editor approvals as upstream session behavior only.
   `omniagent-plus` remains the lease/lock coordinator, and no Omnigent
   approval, smart-routing, or collaboration field grants neutral authority.
10. Preserve the API-guide authority for
    `POST /v1/sessions/{session_id}/events`; generated v0.10 OpenAPI still omits
    that required route.
11. Keep the v0.9 wire fixture as historical regression evidence and add a
    separate v0.10 fixture. Do not overwrite historical tagged bytes or
    provenance.
12. Release only `@consiliency/omnigent-transport`, from `0.5.0` to `0.6.0`.
    Leave `@consiliency/runtime-provider` and
    `@consiliency/pipeline-provider-adapter` versions unchanged. Reuse the
    existing npm OIDC workflow without modifying it.
13. Open one atomic PR after implementation. Panel-review its exact head; after
    any repair commit, rerun the complete suite and review receipt. Merge and
    publish only after separate current authorization.

## Changes

### Authority and tagged evidence

#### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` - modify - record v0.10.0, tag SHA, publication timestamp,
  PyPI version, and Python requirement.
- `previous_probe` - modify - retain v0.9 as explicitly historical authority.
- `head_probe` - modify - record the dated v0.11 development head, divergence,
  and two development-only stream schemas as non-authoritative evidence.
- `preflight_confirmation` - modify - record 100 operations, three added paths,
  five added schemas, six changed schemas, no removals, and exactly 52 stable
  stream events.
- `security_posture` and approval metadata - modify - record bundle-root
  isolation as present in v0.10 and shared-editor approval attribution as an
  upstream behavior that grants no Consiliency authority.
- `provenance` - modify - point release, PyPI, OpenAPI, API guide, schemas, and
  CLI evidence at the exact v0.10 tag while retaining v0.9 history.

#### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `openapi_delta` - modify - represent the direct v0.9-to-v0.10 counts and
  exact path/schema additions and six changed schemas.
- `child_session_public_surface` - modify - add `task_summary` as nullable,
  read-only descriptive metadata.
- `structured_error_contract` - add - record required `code`/`message` and
  optional nullable `title`/`cause`/`remediation`, with lossless pass-through
  semantics.
- `optional_release_surfaces` - modify - classify usage reporting, branding,
  server manifest, smart-routing sources, and environment search as observed
  but not provider-required.
- `endpoint_provenance` - modify - retain API-guide authority for the omitted
  send-events route at v0.10.

#### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- Capture/provenance metadata - modify - advance to the exact v0.10 release.
- `documented_commands` - modify - retain the canonical server commands and
  record `omnigent start` plus `omnigent host --background`.
- `non_provider_required_commands` - modify - include both new operator
  commands and retain `omnigent run --profile`.
- `deprecated_aliases` - verify/modify - preserve the historical hidden
  `omnigent server start` classification only if the tagged v0.10 source still
  exposes it; production code never invokes it.
- `exit_code_contract` - modify - state that v0.10 still publishes no stable
  nonzero exit-code ABI.

#### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- Existing capability evidence - modify - advance all release references to
  v0.10 without changing capability names or statuses.
- Child/error/approval evidence - modify - record nullable task summary,
  lossless structured errors, stable bundle-root isolation, and shared-editor
  approval rollback while retaining blocked child-create, harness-override,
  approval-authority, lease, lock, and route-decision boundaries.

#### `fixtures/omnigent/http/v0-10-wire-contract.json` (create)

- Tagged authority - add - bind representative v0.10 bytes to tag
  `v0.10.0` and commit `40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`.
- Child page - add - include `task_summary` as string and null cases while
  preserving the v0.9 envelope and required fields.
- Structured HTTP error - add - include canonical `code`/`message`, misleading
  billing/quota/auth words in descriptive optional fields, and an unknown
  additive field to prove lossless forward-compatible pass-through without
  policy contamination.
- Regression shapes - add - include unchanged create, page, send ack, output
  delta, and terminal SSE samples needed to prove no v0.10 wire regression.

#### `fixtures/omnigent/fake-server/scenarios.json` (modify)

- `v0_10_official_wire` - add - point conformance tests at the new tagged
  v0.10 fixture while retaining `v0_9_official_wire` as history/regression.

#### `fixtures/omnigent/fake-server/README.md` (modify)

- Freeze notes - modify - name v0.10 as current authority, v0.9 as historical,
  and require tagged wire shapes rather than normalized internals.

### Transport implementation and tests

#### `packages/omnigent-transport/src/types.ts` (modify)

- `OmnigentChildSessionSummary.task_summary` - add - expose the optional
  nullable v0.10 field as read-only upstream metadata.
- `omnigentStreamEventTypes` - retain byte-for-byte - no v0.10 event literal is
  added and no v0.11 development literal is accepted.

#### `packages/omnigent-transport/src/http-client.ts` (modify)

- `normalizeChildSessionSummary` - modify - accept absent/null/string
  `task_summary`, reject other types with the existing typed
  `malformed_response` failure, and preserve valid values.
- `toHttpError` / `OmnigentHttpError` - retain behavior - continue preserving
  arbitrary JSON bodies losslessly; no neutral interpretation is added.

#### `packages/omnigent-transport/src/failure-mapper.ts` (modify)

- `classifyHttpBody` - modify - classify only plain-string bodies and explicit
  machine fields `code`, `message`, and legacy `error`, including those fields
  under a `detail` object/string envelope. Exclude `title`, `cause`,
  `remediation`, and every unknown key from classification text.
- `mapHttpFailure` - retain status-based behavior - preserve existing 400,
  403, 429, retry-after, and limit-routing outcomes when canonical fields carry
  the trigger; descriptive fields alone cannot alter category or retryability.

#### `packages/omnigent-transport/src/contract-fixtures.ts` (modify)

- `OmnigentV010WireFixture` - add - type the v0.10 authority, child page,
  structured error, and unchanged regression samples.
- `loadOmnigentV010WireContract` - add - load the new fixture without changing
  the exported v0.9 loader.
- Discovery fixture types - modify - type new security, approval, error, and
  optional-surface evidence used by conformance tests.

#### `packages/omnigent-transport/src/index.ts` (modify)

- Public fixture exports - add - export `loadOmnigentV010WireContract`; retain
  the v0.9 loader for historical consumers.

#### `packages/omnigent-transport/src/http-client.test.ts` (modify)

- Child summary normalization - add - cover absent, null, valid string, and
  malformed non-string task summaries across paginated child pages.
- Structured error pass-through - add - prove all v0.10 fields and an unknown
  field survive in `OmnigentHttpError.body` without changing failure policy.

#### `packages/omnigent-transport/src/failure-mapper.test.ts` (modify)

- Canonical signal regression - add - retain existing classification from
  plain strings, `error`, `code`, `message`, and supported `detail` envelopes.
- Descriptive-field isolation - add - use v0.10 `title`, `cause`, and
  `remediation` values containing `billing`, `auth`, `quota`, `monthly`, and
  `usage cap`; prove those words cannot turn a retryable 429 into a hard cap or
  a policy 403 into auth/billing.
- Lossless boundary - add - assert the original `OmnigentHttpError.body` still
  contains every structured and unknown field after mapping.

#### `packages/omnigent-transport/src/types.test.ts` (modify)

- Child summary type - add - compile and inspect a v0.10 summary carrying
  `task_summary`.
- Stable vocabulary regression - retain/assert - exact length 52 and absence
  of development-only `session.permission_mode` and `session.title`.

#### `packages/omnigent-transport/src/conformance.test.ts` (modify)

- Suite authority - modify - rename to official v0.10 conformance and assert
  exact tag, SHA, PyPI version, 100 operations, 72 paths, 139 schemas, three
  path additions, five schema additions, six changed schemas, and no removals.
- Wire gates - modify - load the v0.10 fixture, assert child task summary and
  structured error bytes, assert descriptive fields cannot contaminate failure
  policy, and retain unchanged v0.9 create/ack/SSE behavior.
- Event gates - retain/assert - exactly 52 stable event literals and no v0.11
  development events.
- CLI gates - modify - keep `server --background` canonical and classify the
  new start/host commands as non-provider-required.
- Capability gates - modify - prove bundle isolation and approval rollback do
  not create approval, authority, lease, lock, child-create, harness-override,
  or route-decision capabilities.

#### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- Snapshot authority - modify - expect v0.10 release metadata while preserving
  all capability status values.
- Boundary assertions - add - verify stable bundle-root evidence and upstream
  shared-editor approval behavior remain metadata, not provider capabilities.

#### `packages/omnigent-transport/src/event-mapper.test.ts` (modify)

- v0.10 text regression - add - replay representative unchanged indexed and
  identity-free output deltas from the v0.10 fixture and assert the existing
  lossless/deduplication rules. Do not modify `event-mapper.ts` unless this
  regression exposes an actual tagged-wire mismatch; any such mismatch requires
  a plan amendment before changing semantics.

#### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- Stable union regression - add - normalize v0.10 fixture frames and prove no
  new event parser branch is needed; explicitly skip the two v0.11-only event
  types as unknown until a stable release supersedes this plan.

#### `scripts/smoke-packed-omnigent-transport.mjs` (modify)

- Packed version/authority - modify - require package `0.6.0`, snapshot v0.10
  version/SHA, and load both current v0.10 and historical v0.9 wire fixtures.
- Declaration smoke - modify - include `task_summary` in the isolated consumer
  while retaining `types: []`, `skipLibCheck: false`, and package-root-only
  imports.

### Documentation and release metadata

#### `docs/omnigent-contract.md` (modify)

- Supported authority - modify - freeze v0.10 and record exact OpenAPI/schema
  and 52-event results.
- Additive surfaces - add - describe child task summary, structured errors,
  usage/admin paths, and why only task summary enters transport code.
- Security/approval boundaries - modify - mark bundle-root isolation stable and
  shared-editor approvals non-authoritative.
- Development main - modify - record the two v0.11-only stream events as a
  watch list, not frozen vocabulary.

#### `docs/omnigent-upstream-readiness.md` (modify)

- Current decision - modify - replace v0.9 with v0.10 release/PyPI authority.
- Development main - modify - record dated v0.11 head and the two unreleased
  stream events.
- Next release gate - modify - require a fresh full probe for stable v0.11 or
  later and prohibit pinning daily development tags.

#### `docs/omnigent-transport.md` (modify)

- Version/support statement - modify - name v0.10 and nullable child task
  summary support.
- Error and lifecycle posture - modify - document lossless structured errors,
  canonical-field-only failure classification, unchanged SSE behavior, and
  canonical `server --background` lifecycle.

#### `docs/omnigent-live-smoke.md` (modify)

- Tagged live target - modify - advance the live-smoke prerequisite and wording
  from v0.9 to v0.10 while preserving opt-in credentials, named-agent create,
  and no-secret evidence rules.

#### `docs/lifecycle-and-events.md` (modify)

- Stable event contract - modify - name v0.10 while retaining exactly 52
  accepted event types and the identity-aware reconnect rules.
- Development watch list - add - identify the two v0.11-only events without
  adding them to runtime vocabulary.

#### `docs/security-and-secrets.md` (modify)

- Omnigent deployment posture - modify - replace the v0.9 unreleased
  bundle-root warning with the stable v0.10 guarantee and retain explicit
  env/credential boundary cautions.
- Approval posture - add - state that upstream shared editors can approve but
  that behavior grants no Consiliency approval or coordinator authority.

#### `docs/coordination-backend.md` (modify)

- Upstream Omnigent state - modify - advance the supported release to v0.10 and
  explicitly keep approval, smart routing, and new admin surfaces outside the
  CS-2.2 lease/lock source of truth.

#### `CHANGELOG.md` (modify)

- `0.6.0` entry - add - record v0.10 authority, additive surface, task-summary
  typing/validation, structured-error pass-through, stable bundle isolation,
  approval boundary, unchanged 52-event vocabulary, and no v0.11 adoption.
- Historical v0.9 entry - retain - do not rewrite the fact that bundle-root
  isolation was not available in that release.

#### `packages/omnigent-transport/package.json` (modify)

- `version` - modify - bump only this package from `0.5.0` to `0.6.0` after
  implementation gates pass.
- Other metadata/dependencies - retain - no dependency or export topology
  change is required beyond the fixture-loader export.

#### `.github/workflows/publish.yml` (retain)

- Trusted publication - no change - continue tokenless npm OIDC publication and
  exact-version skip behavior. Verify the workflow diff is empty.

## Documentation impact

Documentation changes are mandatory because the repository treats the frozen
Omnigent contract, readiness record, lifecycle/event policy, security posture,
and coordination authority boundary as operator evidence. All documentation
lands atomically with fixtures, tests, the narrow code change, package metadata,
and changelog. Historical v0.9 evidence remains labeled and available. The
publish workflow and unrelated package documentation do not change.

## Dependencies and order

1. Recheck GitHub latest release, v0.10 tag SHA, PyPI metadata, current upstream
   `main`, and npm package versions. Stop and amend if stable is newer than
   v0.10.0 or if the tag SHA differs.
2. Recompute v0.9-to-v0.10 OpenAPI path/schema/operation/event deltas from the
   tagged files and capture the v0.10 CLI help. Stamp the evidence timestamp and
   exact refs before editing fixtures.
3. Add the v0.10 tagged wire fixture and typed loader while retaining v0.9
   history. Update discovery fixtures and conformance expectations against that
   one evidence source.
4. Add and validate `task_summary`; add lossless structured-error tests. Do not
   change text/SSE mapping unless tagged fixture tests prove a mismatch and the
   plan is amended.
5. Update capability, lifecycle, security, coordination, and readiness docs in
   the same branch. Keep v0.11 development events explicitly excluded.
6. Bump only the transport package and packed smoke to `0.6.0`; do not change
   sibling versions or `.github/workflows/publish.yml`.
7. Run targeted conformance/transport tests, then the complete automation suite,
   packed-consumer smoke, and tarball inspection. Record exact-head command
   results in the implementation handoff.
8. Push one implementation branch and open one PR. Run the requested
   cross-vendor panel against the exact PR head, reconcile every concrete
   finding, and rerun all gates after the final commit.
9. Merge only with current coordinator authorization, a green exact-head local
   automation suite, a usable exact-head panel, and a live PR head/mergeability
   check. This repository has no pull-request CI workflow; inventory that
   absence explicitly rather than describing a nonexistent CI check as green.
   Publish only after merge authorization through the existing release
   workflow, then verify registry metadata and a fresh consumer import.

## Verification

Do not run these commands during planning. The implementation runner executes
the narrowest checks first, then the effective automation suite.

### Release and authority preflight

```bash
gh api repos/omnigent-ai/omnigent/releases/latest --jq '{tag_name,published_at,html_url}'
gh api repos/omnigent-ai/omnigent/git/ref/tags/v0.10.0 --jq '.object.sha'
gh api repos/omnigent-ai/omnigent/commits/main --jq '{sha:.sha,date:.commit.committer.date,message:.commit.message}'
curl -fsSL https://pypi.org/pypi/omnigent/json | jq '{version:.info.version,requires_python:.info.requires_python}'
npm view @consiliency/omnigent-transport version versions dist-tags --json
uvx --from 'omnigent==0.10.0' omnigent --version
uvx --from 'omnigent==0.10.0' omnigent server --help
uvx --from 'omnigent==0.10.0' omnigent host --help
```

### Targeted authority verification

```bash
find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 python3 -m json.tool >/dev/null
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts packages/omnigent-transport/src/types.test.ts
rg -n 'v0\.9\.0|cc4720a|0\.10\.0\.dev0|3f9d0a3|bundle-root.*unreleased|unreleased.*bundle-root' docs fixtures/omnigent packages/omnigent-transport/src scripts CHANGELOG.md
git diff --check
```

Remaining v0.9 matches are allowed only in explicitly labeled historical
fixtures, loaders, changelog entries, and regression tests. Add a focused
conformance assertion for current-authority fields instead of treating raw
`rg` exit status as the gate.

### Targeted transport verification

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src/types.test.ts packages/omnigent-transport/src/http-client.test.ts packages/omnigent-transport/src/failure-mapper.test.ts packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts
pnpm --filter @consiliency/omnigent-transport build
pnpm --filter @consiliency/omnigent-transport test:pack
mkdir -p /tmp/omnigent-transport-v010-pack
pnpm --filter @consiliency/omnigent-transport pack --pack-destination /tmp/omnigent-transport-v010-pack
tar -tf /tmp/omnigent-transport-v010-pack/consiliency-omnigent-transport-0.6.0.tgz
git diff --check
```

### Effective automation suite

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @consiliency/omnigent-transport test:pack && find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md
```

### Release dry-run and post-merge proof

```bash
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
npm view @consiliency/runtime-provider version --json
npm view @consiliency/pipeline-provider-adapter version --json
npm view @consiliency/omnigent-transport version dist-tags time --json
```

`publish-package-if-needed.sh` accepts only the package directory as an
argument; dry-run is enabled exclusively by `NPM_PUBLISH_DRY_RUN=1`. Never pass
`--dry-run` as an ignored trailing argument. If the script contract changes or
the environment-gated dry-run fails, use `pnpm pack` plus
`npm publish --dry-run <tarball>` and record the exact fallback command in the
implementation handoff. Do not alter the publish script solely to add a
planning convenience.

### Edge cases

- A newer stable upstream release appears before implementation or release;
  stop and amend rather than combining stable versions silently.
- Child summaries omit `task_summary`, set it to null, provide a valid string,
  or provide an invalid scalar/object; only the invalid forms fail typed.
- Structured error bodies contain all v0.10 fields, null optional fields, or
  unknown additive fields; every byte of parsed JSON remains available to the
  caller. Misleading billing/auth/quota words in `title`, `cause`,
  `remediation`, or unknown fields cannot change retry, policy, auth, or billing
  classification, while the same words in canonical machine fields retain
  existing behavior.
- Identity-free output deltas repeat equal text; lossless output is preserved.
  Indexed/message-identified replay still deduplicates only on identity/cursor
  evidence.
- Stable v0.10 sends an unknown event; existing unknown-frame behavior applies.
  Development-only `session.permission_mode` and `session.title` are not added
  to the allowlist or mapped to neutral events.
- `omnigent start` and `host --background` exist, but production hybrid/process
  code continues invoking only `omnigent server --background`.
- Bundle isolation is present upstream, but transport tests do not claim to
  implement or re-enforce it locally.
- Any shared editor can approve upstream, but no approval result mutates a
  Consiliency lease, lock, route decision, or authority record.
- New usage, branding, server-manifest, routing-source, or environment-search
  fields appear; they remain forward-compatible metadata/admin surfaces and do
  not expand the public runtime-provider interface.
- Historical v0.9 fixtures and loaders still package and import after v0.10 is
  current.
- The tarball contains current and historical fixtures, emitted declarations,
  and no workspace-only source, secret, token, or unpublished private package.

## Acceptance criteria

- [ ] Live preflight confirms official Omnigent v0.10.0 at
  `40755dd8dddb07e1eb6e4055d1d9936e184ceb9b`, PyPI 0.10.0 with Python
  `>=3.12`, and no newer stable release; proven by the release and authority
  preflight commands.
- [ ] Authority fixtures assert 100 operations, 72 paths, 139 schemas, exactly
  three added paths, five added schemas, six changed schemas, no removals, and
  exactly 52 stable stream events; proven by targeted conformance tests.
- [ ] The v0.10 wire fixture is bound to the exact tag/SHA while the v0.9 fixture
  and loader remain available as historical regression evidence; proven by
  conformance and packed-consumer tests.
- [ ] Child `task_summary` accepts absent/null/string values, rejects malformed
  values, and remains read-only metadata with no child-create or routing
  capability; proven by HTTP client, type, capability, and conformance tests.
- [ ] Structured v0.10 error fields and unknown additive fields round-trip in
  `OmnigentHttpError.body`; classification consumes only plain-string or
  canonical `code`/`message`/legacy `error` signals (including supported
  `detail` envelopes), so descriptive fields cannot change retryability,
  policy, auth/billing, approval, or authority outcomes; proven by HTTP client,
  failure mapper, and conformance tests.
- [ ] `OutputTextDeltaEvent` handling is behaviorally unchanged: identity-free
  text remains lossless and replay deduplication still requires identity/cursor
  evidence; proven by mapper, SSE, and fixture-driven regression tests.
- [ ] The accepted event allowlist remains the exact 52 literals in
  `types.ts:68-121`; v0.11-only `session.permission_mode` and `session.title`
  remain excluded; proven by types, SSE, and conformance tests.
- [ ] Production lifecycle continues to invoke only
  `omnigent server --background`; new start/host commands are recorded as
  non-provider operator surfaces and do not alter process behavior; proven by
  conformance plus existing CLI/hybrid/process tests.
- [ ] Bundle-root isolation is documented as stable in v0.10, while upstream
  shared-editor approval behavior is explicitly non-authoritative for
  Consiliency; proven by source metadata, security, coordination, and capability
  assertions.
- [ ] Usage/reporting, branding, server discovery, smart-routing sources, and
  environment search introduce no new runtime-provider endpoint or capability;
  proven by HTTP-surface and capability conformance tests.
- [ ] Only `@consiliency/omnigent-transport` advances to `0.6.0`; sibling package
  versions and `.github/workflows/publish.yml` remain unchanged; proven by git
  diff, package metadata checks, and release dry-run.
- [ ] The isolated packed consumer imports package-root exports, loads v0.10 and
  v0.9 fixtures, and compiles declarations with `types: []` and
  `skipLibCheck: false`; proven by `test:pack`.
- [ ] Full build, lint, typecheck, tests, JSON validation, diff check, and roadmap
  validation pass at the exact reviewed PR head; proven by the effective local
  automation suite, the live GitHub PR head/mergeability check, and an explicit
  workflow inventory confirming that this repository has no pull-request CI
  workflow. Do not substitute a skipped external check for CI evidence.
- [ ] The PR receives the required exact-head cross-vendor review, all concrete
  findings are reconciled, and any repair commit triggers a fresh suite/review
  receipt before merge consideration; proven by the implementation handoff and
  PR review artifacts.
- [ ] After separately authorized merge/publication, npm reports transport
  `0.6.0` as `latest` and a fresh consumer imports it while sibling versions
  remain unchanged; proven by successful publish workflow, registry metadata,
  and fresh-install smoke evidence.

## Automation

```yaml
automation:
  suite_command: >-
    pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src
    && pnpm build
    && pnpm lint
    && pnpm typecheck
    && pnpm test
    && pnpm --filter @consiliency/omnigent-transport test:pack
    && find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 python3 -m json.tool >/dev/null
    && git diff --check
    && phase-loop validate-roadmap specs/phase-plans-v1.md
```
