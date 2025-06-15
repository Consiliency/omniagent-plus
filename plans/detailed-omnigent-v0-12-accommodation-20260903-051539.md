# Detailed plan: accommodate official Omnigent v0.12.0

## Task

Advance `@consiliency/omnigent-transport` from the frozen official Omnigent
`v0.11.0` contract to official `v0.12.0` at
`f04b0354fb5344c1ea8b92795ceb6760a9ad7595`. Refresh tagged authority and
conformance evidence, accept the optional elicitation-resolution verdict as
read-only transport metadata, prove the existing agent-based create and CLI
lifecycle remain compatible, and prepare a transport-only `0.7.0` release.

This is one bounded compatibility update, not a roadmap. It must not add
project/import/fork administration to `AgentRuntimeProvider`, reinterpret
generic request metadata as control input, or modify lease, lock, coordinator,
approval, routing, XG-1 authority, or canon behavior. Implementation, exact-head
review, merge, and npm publication remain separate gates.

## Starting state

- Repository: `/home/viperjuice/code/omniagent-plus`
- Branch: `main`
- Base: `origin/main` at
  `9b66d53623099dade90d0b7bf198f6a91cefbe6c`
- Working tree before planning: clean; no pre-existing untracked files
- Frozen current contract: Omnigent `v0.11.0` at
  `496b7b13f6af3ed5330b957df408fc91290b6307`
- Target contract: Omnigent `v0.12.0` at
  `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`
- Published package: `@consiliency/omnigent-transport@0.6.0`
- Planned package: `@consiliency/omnigent-transport@0.7.0`
- Sibling packages remain `@consiliency/runtime-provider@0.2.0` and
  `@consiliency/pipeline-provider-adapter@0.2.0`.

## Research summary

Live GitHub release and PyPI metadata observed on 2026-09-03 identify official
Omnigent `v0.12.0`, published 2026-09-01, with Python `>=3.12`. Upstream `main`
has already advanced into v0.13 development, so only the stable v0.12 tag is
authority for this update.

The direct v0.11-to-v0.12 OpenAPI comparison grows from 100 to 101 operations,
72 to 73 paths, and 143 to 146 schemas. It adds only
`POST /v1/imports/local` and schemas `ImportedSessionRef`,
`LocalImportRequest`, and `LocalImportResponse`; it removes no operation, path,
schema, or event. The stream union remains exactly 54 events. After excluding
documentation and generator-only `format` annotations, the existing schemas
with structural additions are `AutomaticSessionRenameRequest`,
`ElicitationResolvedEvent`, `ImportSessionRequest`, `SessionForkRequest`,
`SessionGitOptions`, and `UpdateSessionRequest`. The two title-bound changes are
upstream administration surfaces unused by the neutral provider.

Tagged source additionally makes JSON session creation project-aware through an
optional `project_id`, while preserving the legacy `SessionCreateRequest` with
required `agent_id`. The current adapter always uses that still-supported legacy
shape in `OmnigentHttpClient.createSession`; it already reads `project_id` from
responses. The canonical process-manager commands `omnigent server
--background`, `omnigent server status --json`, and `omnigent server stop`
remain supported. The release's bare-`omni` behavior change does not affect the
transport.

## Advisor-board amendment

The first four-vendor review delivered four usable independent seats. Grok and
Sol independently rejected the original metadata-only design because the
normalizer could still inherit or accept a forged response identity before the
no-op mapper, the mapper could poison its item-dedup set, and the provider could
perform raw-event lifecycle work even when no runtime event was emitted. Fable
and Gemini agreed with the original plan but did not identify that path. This
amendment resolves the material dissent by making elicitation resolution
identity-free before all three stateful boundaries and adding adversarial tests
for each one. On resubmission, Sol identified a second tagged-contract gap:
v0.12 permits both an absent action and explicit `action: null`. The final
amendment accepts both forms, normalizes each to `undefined`, and proves the
nullable/default-null schema in fixtures, tests, and drift checks.

## Frozen decisions

1. Freeze only official `v0.12.0`. Immediately before implementation edits,
   confirm the latest GitHub release, exact tag commit, PyPI metadata, npm
   package state, tagged OpenAPI/source delta, and isolated CLI help. If a newer
   stable release or `@consiliency/omnigent-transport@0.7.0` appears, stop and
   amend this plan.
2. Preserve the exact 54-entry event vocabulary currently frozen at
   `packages/omnigent-transport/src/types.ts:68-123`. Add no event literal,
   remove none, and retain all spellings and order.
3. Treat `response.elicitation_resolved` as identity-free transport metadata,
   in the same safety class as `session.permission_mode` and `session.title`.
   Require the existing non-empty `elicitation_id`; accept `action` when it is
   absent, `null`, `accept`, `decline`, or `cancel`; malformed variants follow
   the existing observable `invalid_event_shape` skip path. Normalize absent
   and explicit-null action to `undefined`.
4. Preserve only the validated `elicitation_id` and optional verdict in the
   corresponding `OmnigentRawEvent` metadata fields. Ignore nested, top-level,
   data, and item response/turn/message/item/call/action identity supplied on
   the frame. Use only a synthetic event ID, do not read or update normalizer
   response/alias/quarantine state, return from the mapper before either dedup
   set, and bypass provider pending-item, cancellation, rejection,
   reconciliation, lifecycle, and mutation-fence handling. The event emits no
   runtime event and cannot mutate session, turn, approval, fence, lease, or
   authority state.
5. Keep the neutral `CreateSessionRequest` contract at
   `packages/core-contracts/src/types.ts:84-98` unchanged. Continue sending
   `agent_id`, `initial_items`, required title, and optional workspace. Do not
   serialize `project_id` from `request.metadata` or add an untyped convention.
6. Record project-aware creation, local imports, configurable forks, and
   existing-branch worktrees as observed upstream administration surfaces.
   They do not become provider methods or capabilities in this release.
7. Preserve current project identity on session responses and lists as
   read-only metadata. Do not add project mutation or project selection.
8. Preserve all v0.9, v0.10, and v0.11 fixtures and loaders unchanged as
   historical regression evidence. Add a distinct v0.12 fixture and loader.
9. Keep the tagged API guide and route source authoritative for
   `POST /v1/sessions/{session_id}/events` if generated OpenAPI still omits it.
10. Advance only `@consiliency/omnigent-transport` from `0.6.0` to `0.7.0`.
    Leave sibling versions and `.github/workflows/publish.yml` unchanged.
11. Deliver one atomic PR because authority metadata, fixture bytes, tests,
    documentation, package version, and packed-consumer proof must agree at
    every reviewable commit boundary.
12. Do not merge or publish as part of plan execution unless the user later
    authorizes those release gates explicitly.

## Changes

### Tagged authority and evidence

#### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` - modify - advance tag, exact commit, publication timestamp,
  PyPI version, and Python requirement to v0.12.
- `previous_probe` - modify - retain v0.11 as the immediate historical release.
- `head_probe` - modify - record the implementation-time upstream development
  head as observational and non-authoritative.
- `preflight_confirmation` - modify - record 101 operations, 73 paths, 146
  schemas, 54 events, one added path, three added schemas, no removals, and the
  six-schema structural-versus-generator annotation classification.
- `approval_posture`, `security_posture`, and `provenance` - modify only for
  current tagged references; preserve every forbidden capability boundary.

#### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `openapi_delta` - modify - freeze the v0.11-to-v0.12 counts, additions,
  removals, and structural schema changes.
- `optional_release_surfaces` - add entries - classify local imports, project-aware
  create, configurable forks, existing-branch worktrees, and elicitation
  verdict metadata without exposing provider control methods. Record the
  automatic-rename and update-title length bounds as unused administration
  surfaces.
- `fork_request` - modify - record v0.12's additive fields as observed but
  continue asserting that the provider sends none of them.
- `endpoint_provenance` and `provenance` - modify - advance exact tagged refs
  while retaining API-guide authority for the send-events route.

#### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- `release`, probe commands, and provenance - modify - advance to v0.12.
- `compatibility_notes` - add entries - record the bare-`omni` breaking change as
  irrelevant to this package and confirm the three production server lifecycle
  commands remain supported.
- Command allowlists - preserve - do not replace the process-manager command
  with `omni`, `omnigent start`, or `omnigent host`.

#### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- Release evidence - modify - advance to v0.12.
- Existing capability evidence - modify only where the tagged version changes.
- `observed_non_capabilities` - add - project-aware create/import, fork model and
  permission choices, existing-branch checkout, and elicitation verdict remain
  non-capabilities with no Consiliency authority.

#### `fixtures/omnigent/http/v0-12-wire-contract.json` (create)

- Authority block - add - bind the evidence to v0.12 and exact tag commit.
- Legacy create sample - add - retain the provider's required `agent_id` shape.
- Observed project create/import/fork samples - add - represent official v0.12
  fields as explicitly non-provider fixtures.
- Elicitation-resolution samples - add - include `accept`, `decline`, `cancel`,
  absent action, explicit-null action, and malformed action/identity cases.
- Current session, history, acknowledgement, and terminal samples - retain -
  prove v0.11 runtime behavior remains valid under the v0.12 authority.

#### `fixtures/omnigent/fake-server/scenarios.json` and
`fixtures/omnigent/fake-server/README.md` (modify)

- Current tagged-wire scenario - modify - point to v0.12.
- Historical description - modify - retain v0.11, v0.10, and v0.9 as immutable
  regression evidence.

### Transport boundary

#### `packages/omnigent-transport/src/sse-stream.ts` (modify)

- `hasValidEventShape` - modify - validate
  `response.elicitation_resolved` against the tagged required
  `elicitation_id` and nullable optional action enum; accept absent or null
  action and normalize both to `undefined`.
- `OmnigentSseNormalizer.normalize` - modify - classify the event as identity
  free before response/alias/quarantine bookkeeping. Preserve only validated
  `elicitation_id` and `action` metadata plus the normal synthetic event ID;
  ignore supplied response, turn, message, item, call, and action identifiers,
  and neither read nor update current-response, alias, fallback, quarantine,
  known-response, or unbound-turn state.

#### `packages/omnigent-transport/src/types.ts` (verify only)

- `omnigentStreamEventTypes` - verify byte-for-byte unchanged at 54 literals.
- `OmnigentRawEvent.action` - verify it remains sufficient for the optional
  verdict without introducing a new public event or approval type.

#### `packages/omnigent-transport/src/http-client.ts` (verify only)

- `createSession` - verify the legacy agent-based v0.12 request remains exactly
  the current serialized shape and ignores generic `metadata`.
- Session normalization - verify current read-only `project_id` handling remains
  compatible.

#### `packages/omnigent-transport/src/event-mapper.ts` (modify)

- `OmnigentEventMapper.map` - modify - return immediately for
  `response.elicitation_resolved` alongside the existing passive metadata
  events, before historical-item lookup and before reading or writing
  `seenItemIds`. Reusing an elicitation identifier from a request must not
  suppress a later runtime-bearing item.

#### `packages/omnigent-transport/src/http-provider.ts` (modify)

- Provider stream loop - modify - recognize `response.elicitation_resolved` as
  passive transport metadata and continue before `recordConsumedPendingItem`,
  cancelled-turn quarantine/fence handling, rejected-identity checks, mapper
  dispatch, turn reconciliation, and lifecycle state mutation. This explicit
  guard is defense in depth even though normalized turn and item identities are
  absent.
- `stateMutationRequiresRuntimeEvent` - retain - do not rely on adding the event
  to this allowlist as the sole guard; the earlier provider `continue` is
  stronger because it also blocks reconciliation and fence work outside the
  runtime-event-dependent lifecycle block.

#### `packages/omnigent-transport/src/contract-fixtures.ts` and
`packages/omnigent-transport/src/index.ts` (modify)

- `OmnigentV012WireFixture` and `loadOmnigentV012WireContract` - add - expose
  the current tagged fixture.
- Historical loader exports - preserve - retain v0.11, v0.10, and v0.9.

### Tests and packaged-consumer proof

#### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- v0.12 fixture normalization - add - prove `accept`, `decline`, `cancel`,
  absent action, and explicit-null action normalize without skips, preserve the
  `elicitation_id`, preserve enum actions, and normalize absent/null to
  `undefined`.
- Malformed resolution cases - add - prove missing/empty identity and invalid
  action values are skipped as `invalid_event_shape`.
- Identity safety - add - while a provisional turn and official response are
  active, inject top-level, nested-response, data, and item response IDs plus
  message/item/call/action IDs. Prove all supplied identities are ignored, only
  a synthetic event ID is produced, and normalizer current-response, alias,
  quarantine, fallback, and unbound-turn behavior is unchanged for the next
  runtime-bearing event.

#### `packages/omnigent-transport/src/event-mapper.test.ts` and
`packages/omnigent-transport/src/http-provider.test.ts` (modify)

- Mapper dedup isolation - add - prove valid v0.12 resolution events return
  before `seenItemIds`, including a resolution whose `elicitation_id` equals a
  later request/item ID; the later runtime-bearing event must still map.
- Provider metadata-only behavior - add - during an in-flight provisional turn,
  inject a resolution with a forged `response_id` and colliding
  `elicitation_id`. Prove it emits no neutral event and leaves the provisional
  handle/alias, `activeTurnId`, session state, `updatedAt`, approval state,
  cancellation quarantine/fence, close fence, and shared mutation-fence calls
  unchanged; the next legitimate response event must reconcile normally.

#### `packages/omnigent-transport/src/http-client.test.ts` (modify)

- Legacy create compatibility - add - assert the v0.12 server still accepts the
  exact existing agent-based request.
- Control-input boundary - add - place project-like keys in generic request
  metadata and prove they are not serialized to upstream JSON.
- Project response metadata - retain - keep existing read-only normalization
  evidence.

#### `packages/omnigent-transport/src/types.test.ts` (modify)

- Frozen vocabulary assertion - strengthen - compare the exact 54-value event
  list, not only its length and selected members.
- v0.12 metadata sample - add - prove `action` is transport metadata without a
  new neutral/public approval type.

#### `packages/omnigent-transport/src/conformance.test.ts` and
`packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- Current authority - modify - load v0.12 and assert exact tag, commit, counts,
  additions, structural changes, and no removals.
- Historical gates - modify - retain v0.11, v0.10, and v0.9 loader assertions.
- Non-capability gates - add - assert project/import/fork/branch/verdict fields
  grant no approval, authority, lease, lock, child-create, harness-override, or
  route-decision capability.

#### `scripts/check-omnigent-openapi-delta.mjs` (modify)

- Frozen tags and counts - modify - compare v0.11 directly to v0.12 and assert
  101 operations, 73 paths, 146 schemas, and 54 events.
- Delta classification - modify - assert exactly the one path and three schema
  additions, no removals, and no event additions/removals.
- Structural schema comparison - add - ignore only schema documentation fields
  and generator `format` annotations while preserving keys inside every
  `properties` map, then require exactly `AutomaticSessionRenameRequest`,
  `ElicitationResolvedEvent`, `ImportSessionRequest`, `SessionForkRequest`,
  `SessionGitOptions`, and `UpdateSessionRequest` to differ.
- Load-bearing property checks - add - assert the optional verdict enum and the
  action property's null branch and default-null behavior plus the
  project/import/fork/existing-branch property shapes.
- Tagged source checks - add - verify project-aware create preserves the legacy
  required-agent request and that canonical server lifecycle commands remain
  present at v0.12.

#### `scripts/smoke-packed-omnigent-transport.mjs` (modify)

- Expected package and authority - modify - require transport `0.7.0` and
  v0.12 tag/commit from a clean tarball install.
- Public loaders - modify - exercise v0.12 as current and v0.11/v0.10/v0.9 as
  historical exports.
- Boundary proof - add - assert the v0.12 verdict fixture is metadata-only.

### Documentation and release metadata

#### `docs/omnigent-contract.md`, `docs/omnigent-transport.md`,
`docs/omnigent-upstream-readiness.md`, `docs/lifecycle-and-events.md`,
`docs/omnigent-live-smoke.md`, and `docs/coordination-backend.md` (modify)

- Stable authority - modify - advance v0.11 to v0.12 with exact commit and
  observed counts.
- Compatibility statement - add - document unchanged event vocabulary,
  legacy create support, preserved server lifecycle, and the metadata-only
  elicitation verdict.
- Exclusions - add - classify project-aware creation/import, advanced forks,
  existing-branch worktrees, and bare-CLI behavior as upstream operator/admin
  surfaces with no Consiliency authority.
- Development watch - modify - record v0.13 development as observation only.
- Live smoke - modify - target v0.12 while preserving `skip by default`,
  `metadata_only`, and `no credentials required` posture.

#### `packages/omnigent-transport/package.json` (modify)

- `version` - modify - advance only this package from `0.6.0` to `0.7.0`.

#### `CHANGELOG.md` (modify)

- `0.7.0` entry - add - summarize v0.12 authority, additive metadata handling,
  preserved runtime behavior, historical fixtures, and non-capability posture.
- Prior release entries - preserve - do not rewrite published history.

#### `.github/workflows/publish.yml` and `pnpm-lock.yaml` (verify only)

- Publish workflow - verify unchanged; the existing release-triggered npm OIDC
  job remains the publisher.
- Lockfile - verify unchanged because the workspace importer does not encode the
  package's own version and no dependency changes are planned.

## Documentation impact

Documentation changes are required because these files are the operator-facing
statement of tagged authority and capability exclusions. The six documents
listed above must land atomically with fixtures, tests, package version, and
changelog. No spec, roadmap, public runtime-provider contract, coordinator
documentation outside the existing upstream-state paragraph, or canon document
changes are allowed.

## Dependencies and order

1. Create an isolated implementation worktree from the refreshed
   `origin/main`; record its exact base SHA and complete starting status.
2. Run the live release/tag/PyPI/npm/CLI preflight and inspect the tagged
   OpenAPI/source before repository edits. Stop and amend on any newer stable
   release, mismatched SHA, unexpected tagged shape, or occupied `0.7.0`.
3. As the first repository edit, advance the fail-closed OpenAPI checker from
   v0.11 to v0.12 and run it successfully before changing fixtures, runtime
   behavior, documentation, or release metadata.
4. Freeze v0.12 discovery and wire evidence while retaining every historical
   fixture unchanged.
5. Add the v0.12 fixture loader/export and strict elicitation-resolution shape
   validation plus identity-free normalizer, pre-dedup mapper, and passive
   provider guards.
6. Add focused SSE, mapper, provider, HTTP-client, type, conformance, and
   capability tests, including forged-identity, dedup-collision, in-flight
   provisional-turn, and zero-mutation-fence adversarial cases.
7. Update documentation, package version, changelog, and packed-consumer smoke.
8. Run focused verification, then the full suite, build, pack smoke, npm dry
   run, JSON validation, off-limit diff, and cleanliness checks.
9. Commit and push one implementation branch and open one PR. Review the exact
   PR head before any merge; rerun affected gates after every material repair.
10. Stop with the PR open unless explicit merge and publication authorization is
   given later.

## Verification

### Live authority preflight

```bash
test "$(gh release view --repo omnigent-ai/omnigent --json tagName --jq .tagName)" = "v0.12.0"
test "$(gh api repos/omnigent-ai/omnigent/commits/v0.12.0 --jq .sha)" = \
  "f04b0354fb5344c1ea8b92795ceb6760a9ad7595"
curl -fsSL https://pypi.org/pypi/omnigent/json | \
  jq -e '.info.version == "0.12.0" and .info.requires_python == ">=3.12"'
test "$(npm view @consiliency/omnigent-transport version)" = "0.6.0"
if output=$(npm view @consiliency/omnigent-transport@0.7.0 version 2>&1); then
  printf '0.7.0 is already published: %s\n' "$output" >&2
  exit 1
else
  printf '%s\n' "$output" | rg -q 'E404'
fi
uvx --from omnigent==0.12.0 omnigent --version
uvx --from omnigent==0.12.0 omnigent --help
uvx --from omnigent==0.12.0 omnigent server --help
uvx --from omnigent==0.12.0 omnigent host --help
```

These network and isolated-CLI checks run before repository edits. The existing
checker is still frozen to the prior release, so updating it is the first
repository edit. Before any fixture, runtime, documentation, or release-metadata
change, run:

```bash
node scripts/check-omnigent-openapi-delta.mjs v0.11.0 v0.12.0
```

The updated checker must fail closed unless the target has 101 operations, 73 paths,
146 schemas, exactly 54 event discriminators, exactly the named additions and
structural changes, and no removals. It must distinguish generator-only
`format` annotations from structural wire changes while asserting the exact
load-bearing v0.12 properties against tagged sources.

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
find fixtures/omnigent -name '*.json' -print0 | sort -z | \
  xargs -0 -n1 node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))'
git diff --check
git status --short --branch
```

`NPM_PUBLISH_DRY_RUN=1` is mandatory. Do not append a raw `--dry-run` argument
to the helper because it does not consume that argument.

### Boundary and release-scope proof

```bash
git diff --exit-code "$BASE_SHA"...HEAD -- \
  packages/core-contracts \
  packages/governed-pipeline-adapter \
  packages/coordinator \
  packages/worktree-leasing \
  packages/state-ledger \
  .github/workflows/publish.yml \
  pnpm-lock.yaml
test "$(node -p 'require("./packages/omnigent-transport/package.json").version')" = "0.7.0"
test "$(node -p 'require("./packages/core-contracts/package.json").version')" = "0.2.0"
test "$(node -p 'require("./packages/governed-pipeline-adapter/package.json").version')" = "0.2.0"
```

### Exact-head review and release separation

```bash
git rev-parse HEAD
gh pr view --repo Consiliency/omniagent-plus --json \
  number,url,headRefOid,mergeStateStatus,statusCheckRollup
```

Any advisor-board review must name the exact PR head OID. A usable receipt
requires at least three independent non-degraded verdicts; if a Claude/Fable
seat is requested, it must use the canonical subscription TUI adapter. A
material repair invalidates the old receipt and requires rerunning affected
verification plus exact-head review. Green review and CI do not authorize merge
or publication.

## Acceptance criteria

- [ ] GitHub, PyPI, tagged source, and CLI evidence identify official Omnigent
  v0.12.0 at `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`, proven by the live
  authority preflight.
- [ ] The drift checker proves 101 operations, 73 paths, 146 schemas, exactly
  one added path, exactly three added schemas, six structural schema changes,
  and no operation/path/schema/event removal.
- [ ] The event vocabulary remains the exact existing 54 literals from
  `types.ts:68-123`, proven by the drift checker and exact-list type test.
- [ ] Valid v0.12 elicitation-resolution events preserve only validated
  `elicitation_id`, an enum `action` when present, and a synthetic event ID;
  absent and explicit-null action both normalize to `undefined`, while malformed
  verdict/identity shapes are skipped. Forged response/item identities and
  identifier collisions cannot alter normalizer identity state, poison mapper
  dedup, reconcile a provisional turn, change `activeTurnId`, session state or
  `updatedAt`, touch cancellation/close/shared mutation fences, emit runtime
  lifecycle, or create approval authority, proven by SSE, mapper, and provider
  adversarial tests.
- [ ] The legacy agent-based create request remains byte-shape compatible and
  project-like generic metadata is not serialized, proven by HTTP-client tests.
- [ ] Project-aware create/import, configurable forks, and existing-branch
  worktrees remain observed non-capabilities, proven by conformance and
  capability-matrix tests plus the off-limit diff.
- [ ] v0.11, v0.10, and v0.9 fixture loaders remain exported and pass
  historical conformance and packed-consumer checks.
- [ ] Only `@consiliency/omnigent-transport` in
  `packages/omnigent-transport` advances to `0.7.0`; the npm package
  `@consiliency/pipeline-provider-adapter` remains in the workspace directory
  `packages/governed-pipeline-adapter` at `0.2.0`, and sibling versions,
  lockfile, publish workflow, runtime-provider, coordinator, lease, lock,
  state-ledger, XG-1, and canon surfaces remain unchanged.
- [ ] Focused tests, full tests, typecheck, lint, build, pack smoke, JSON
  validation, npm dry-run, and `git diff --check` all pass on the implementation
  head.
- [ ] One exact-head reviewed PR contains the atomic update and remains
  unmerged/unpublished until a later explicit release authorization.

automation.suite_command: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm --filter @consiliency/omnigent-transport test:pack && NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport && find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' && git diff --check`
