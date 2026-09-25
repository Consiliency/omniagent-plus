# Detailed plan: Omnigent v0.14 transport accommodation

## Task and status

Prepare one bounded compatibility update from the supported v0.12.0 HTTP/CLI
contract to official v0.14.0. Correct informational history notices, correlate
durable messages with live previews, and reconcile the tagged wire contract.
This is a **draft for review**, not execution approval or a new phase roadmap.
Plan Mode was not active; this requested planning turn writes documentation only.

Track under omniagent-plus#19 with transport ownership coordinated through
omniagent-plus#25. No phase EC or IF gate is claimed by this standalone plan.
Implementation, reviewed merge, version preparation and publication are distinct
outcomes. No product dependency on Agent Harness is introduced.

## Research and authority

Planning checkout: `codex/v2-guard-20260912`, base HEAD
`160a770c5daf86ef384f9643e844ff47d68b4cea`. It contains staged GUARD material;
this plan does not authorize carrying that material into an accommodation PR.
The starting status is retained verbatim in the planning handoff. No pre-existing
untracked non-ignored files were reported. The primary checkout stays protected.

- Current supported tag: v0.12.0, `f04b0354fb5344c1ea8b92795ceb6760a9ad7595`.
- Target: v0.14.0, `fc89a3ba3c4698a7d742343b443a7b2bdc01120a`.
- Target OpenAPI SHA256:
  `222c468fe0a269e92aa6faae08ea7081b5144ae227a2bdbc799b3af9077adb9c`.
- Baseline OpenAPI SHA256:
  `2fad529777b266e54341cfa41934cb7fe211cad1d787afbacc4d16e6d38b7cdb`.
- Tagged comparison: 101 -> 113 operations, 73 -> 85 paths, 146 -> 159 schemas,
  54 -> 56 stream events; no removals; 15 structurally changed existing schemas.
- Repository transport version is 0.7.0. Candidate release version is 0.8.0,
  subject to registry preflight; no sibling package bump is planned.

Sources: [official release](https://github.com/omnigent-ai/omnigent/releases/tag/v0.14.0),
[tagged OpenAPI](https://github.com/omnigent-ai/omnigent/blob/fc89a3ba3c4698a7d742343b443a7b2bdc01120a/openapi.json),
[conversation entities](https://github.com/omnigent-ai/omnigent/blob/fc89a3ba3c4698a7d742343b443a7b2bdc01120a/omnigent/entities/conversation.py),
and `plans/evidence/v2/upstream-check-20260920.md`. Target schema fields were
read again during planning; the September 20 behavioral reproduction was NOT
rerun. Unreleased main is not authority, even if it advances during execution.

Current `mapOmnigentConversationHistory` treats every persisted error as a
terminal failure. Its text maps key only on durable item ID. The live mapper
uses exact IDs plus text-overlap fallbacks, and the HTTP provider separately
trims delivered replay. Fixes must cover those paths together. The existing
normalizer/mapper/provider early exits for elicitation resolution establish
the local pattern for identity-free passive events.

## Deconfliction and prerequisites

`specs/phase-plans-v2.md:37` states: "A newer official upstream release is a
separate accommodation decision." Its WIRE scope owns mapper/provider lifecycle,
requires DATA first, and forbids silent edits to DATA's public schemas. This plan
is that separate proposed decision, not permission to bypass those boundaries.

1. Finish GUARD acceptance and DATA's interface/content-policy freeze before
   accommodation source edits. Planning and plan review can occur beforehand.
2. Schedule this accommodation **after DATA, before WIRE source execution**.
   The coordinator must record exclusive transport ownership in omniagent-plus#25.
   If WIRE has already begun, defer this work until its owner releases the files;
   rebase and amend/review this plan rather than run competing mapper writers.
3. Once reviewed, use a new isolated worktree from the accepted integration base,
   not this dirty GUARD branch. Probe `/etc/consiliency/team-host` and then
   `/mnt/workspace` and follow the repository's worktree placement instructions.
   Record the actual base, source hashes, owner and worktree before edits.
4. Read the then-current DATA decisions and transport files. If they change the
   behavior assumed here, stop for a narrow plan amendment and review. Keep
   public RuntimeEvent/SessionHistory schemas and content-policy ownership intact.
5. Recheck release/tag/PyPI, npm package/dist-tags, open accommodation PRs and
   tagged source before implementation. A changed tag hash, newer stable target,
   published 0.8.0 or overlapping owner requires reconciliation, not silent retargeting.
6. Agent-harness#926 startup recovery is tracked separately. No automatic Fable
   retry, model substitution, new diagnostic or Harness runtime edit is authorized
   here. Require the requested panel and reconcile findings before implementation.

Excluded: spec/gp/portal/harness runtime edits, canon or XG-1 changes, leases,
locks, coordinator routing, provider administration, account/subscription swapping,
approval delegation, cache/resource redesign, deadline repair, process supervision,
unreleased upstream adoption, and full v2 audit closure. Existing WIRE findings
remain open unless their own acceptance is independently proved.

## Frozen behavior decisions

### 1. Informational notices and actual failures

- Add `harness` to `OmnigentPersistedErrorData.source` and optional nullable
  `level: "error" | "info" | null`. Only exact `level === "info"` selects the
  informational path; absent/null/error retain existing real-error behavior.
- An informational persisted item emits no neutral runtime event, creates no
  synthetic started turn, marks no terminal turn and sets no provider lastError.
  It may remain in seen-item bookkeeping so replay cannot reprocess the same item.
  This is explicit omission, not a new public notice event or a content export.
- A later real failure or completion in that turn must still be delivered once;
  a prior informational notice cannot release an active-turn admission lock.
- Do not apply the persisted `level` rule to arbitrary live `response.error`
  fields. Tagged live ErrorEvent has no `level`; genuine error handling and
  `response.failed` with `source: "harness"` retain existing semantics.
- Unknown/malformed levels must never become informational by coercion. Preserve
  the existing error path rather than introduce broad strict-history validation.

### 2. Explicit durable/preview identity

- Add optional nullable `stream_message_id` to `OmnigentMessageData` and an
  optional stream-ID field to the mapper's historical message record. Keep
  durable item IDs, public runtime event IDs and sequence numbers unchanged.
- For a nonempty valid stream ID, use the durable/stream pair from the same
  session and response as one logical message. Carry the association through
  history seeds, output-item reconciliation and provider delivered-text trimming.
  Do not seed two independently consumable text budgets for the same message.
- Explicit stream identity takes precedence over text similarity. A distinct
  explicit ID with identical text is a distinct message; do not consume another
  message's replay credit. Never bind identities across session/response scope.
- Both orderings must work: preview then persisted item emits only any new
  authoritative suffix; snapshot/item then delayed preview emits no duplicate
  preview content, including chunked or repeated delayed chunks. Keep finalized
  identity suppression scoped to the existing mapper/subscription lifecycle;
  do not introduce a global cache or silently extend retention policy.
- When the field is absent/null/empty/non-string, add no alias. Preserve existing
  legacy behavior and its tests. Content without usable identity must remain
  lossless; do not invent a new equality-based global deduplication rule.
- One conflicting stream ID attributed to multiple durable items is not evidence
  for content suppression: discard the ambiguous association and preserve content.
  Test this fallback explicitly. If the existing lifecycle cannot meet this
  without a broader replay redesign, stop and split a reviewed follow-up; do not
  claim v0.14 replay acceptance with the behavior unresolved.

### 3. Tagged contract additions without new authority

The raw upstream vocabulary intentionally grows from 54 to 56 by adding only
`session.btw_sidechat` and `session.codex_approval_mode`. Preserve every old literal;
the neutral runtime event vocabulary, approval semantics and authority bytes do
not change. This explicitly supersedes the old v0.12-only 54-event freeze for
the new candidate; historical fixtures/loaders stay unchanged.

- Validate sidechat's required conversation_id/question/answer as strings and
  optional truncated as boolean; empty content strings are valid. Validate
  approval-mode's required conversation_id/approval_mode as strings, without
  inventing a closed enum. Use existing invalid_event_shape reporting for bad frames.
- Both new events normalize through an early identity-free path with synthetic
  event identity and the configured session ID. Do not retain question/answer
  content or upstream identity/control extras in the neutral mapping. Return
  before mapper dedup and provider pending-item/cancellation/fence bookkeeping.
  Neither event is an approval request, decision, turn completion or lease grant.
- Extend elicitation resolution's existing validation to optional absent/null/
  `unanswered` reason. Preserve the valid reason as optional raw metadata only;
  retain its early exits and reject malformed reason values with the existing
  skip diagnostic. No unanswered-to-cancel or authority inference.
- Compaction integer/string/null window IDs and repeated in-progress frames
  remain non-content/nonterminal no-ops. Add tests proving they do not turn a
  running turn idle, complete it, poison replay, or export summary content.
- Account for all 15 changed schemas. Behavioral cases: MessageData, ErrorData,
  ErrorEvent, FailedEvent, ElicitationResolvedEvent, CompactionData,
  CompactionInProgressEvent, ServerStreamEvent. Read-only compatibility cases:
  SessionResponse additive share_workspace_files/skills_status and ServerInfoResponse
  enabled_connections/sandbox_provider_capabilities. Administration-only cases:
  AutomaticSessionRenameResponse, ImportSessionRequest, LocalImportRequest,
  SessionForkRequest, UpdateSessionRequest. No new create/fork/import/approval
  methods or control fields from generic request metadata.
- Inventory all 12 added operations and 13 added schemas in the target fixture;
  extension, credentials, PR-resource and import surfaces are observed non-capabilities.
  Verify existing required-agent create/send shapes against the tagged server
  source. Preserve canonical CLI server lifecycle; document tmux/upgrade terminology
  only where tagged CLI source establishes it, without adding provisioning.

## Changes

Seven transport modules plus the two existing acceptance scripts form three
behavioral groups above. Tests/fixtures/docs support those groups; no generic
replay framework or parallel source lanes are proposed.

| File | Entity and action | Reason |
| --- | --- | --- |
| `packages/omnigent-transport/src/types.ts` | Modify upstream event list, message/error/raw metadata types | Represent only pinned additions |
| `packages/omnigent-transport/src/history-mapper.ts` | Modify mapOmnigentConversationHistory and historical message seeds | Skip info notices before lifecycle; retain stream association |
| `packages/omnigent-transport/src/event-mapper.ts` | Modify OmnigentHistoricalMessage, map, mapTextDelta, mapOutputItem | Explicit identity reconciliation and early passive-event drop |
| `packages/omnigent-transport/src/sse-stream.ts` | Modify hasValidEventShape and OmnigentSseNormalizer.normalize | Validate new fields before stateful identity handling |
| `packages/omnigent-transport/src/http-provider.ts` | Modify subscription early exits and delivered-text/history trimming | Preserve aliases across reconnect without changing public IDs |
| `packages/omnigent-transport/src/contract-fixtures.ts` | Add typed v0.14 fixture/loader | Follow existing versioned fixture pattern |
| `packages/omnigent-transport/src/index.ts` | Export new versioned loader, retain old exports | Packed-consumer access |
| `scripts/check-omnigent-openapi-delta.mjs` | Add explicit v0.12->v0.14 dispatch; retain old pair | Fixed-pair structural/semantic drift proof, not count-only checking |
| `scripts/smoke-packed-omnigent-transport.mjs` | Update candidate version/authority and exercise v0.14 provider behavior | Verify installed tarball without workspace source fallback |

Modify existing `history-mapper.test.ts`, `event-mapper.test.ts`,
`sse-stream.test.ts`, `http-provider.test.ts`, `types.test.ts`, and
`conformance.test.ts` under the same source directory. Reuse current test fetch
fixtures and FakeOmnigentServer hooks; do not refactor that server. Rerun existing
http-client, failure-mapper, CLI, hybrid and process-manager tests unchanged.

Create `fixtures/omnigent/http/v0-14-wire-contract.json`: source-derived sanitized
wire objects plus clearly labeled adversarial cases, explicit event disposition
table, schema/operation delta and commit/hashes. Keep v0.9/10/11/12 fixtures and
loaders intact. Update the four discovery JSON files (source-metadata, http-surface,
cli-surface, capability-probes) and fake-server/scenarios.json to point at the
new current authority without claiming newly supported capabilities. Existing
copy-omnigent-fixtures.mjs already copies fixtures; do not change its mechanism.

Update `docs/omnigent-contract.md`, `docs/omnigent-transport.md`,
`docs/omnigent-upstream-readiness.md` with tested scope, explicit drops and risks.
Update only `packages/omnigent-transport/package.json` to candidate 0.8.0 after
registry preflight; keep sibling versions, dependencies, workflows and lockfile
unchanged unless a demonstrated package-manager requirement is reviewed.
Do not overwrite historical v2 authority records; record the accepted new input
in WIRE's later reviewed handoff. No source authority changes during planning.

## Implementation sequence

1. Record prerequisites/ownership/base and frozen source authority; capture the
   unchanged candidate baseline. Any baseline failures get exact nodes/causes,
   not a green-suite claim. Produce failing v0.14 notice and explicit-identity
   cases before repair; record cases already passing as such.
2. Repair history notices, then identity propagation/reconciliation across the
   mapper/provider paths. Complete both sets before updating supported-version docs.
3. Add passive-event and schema cases, the complete disposition/delta fixture,
   drift assertions and the new loader/export. Keep behavior changes in one
   serialized implementation thread/worktree.
4. Refresh discovery/docs and candidate version; run focused, regression, full
   gate and installed-tarball verification. Assemble evidence tied to exact head
   and tarball SHA256; inspect the diff for scope and content-policy leakage.
5. Obtain the requested exact-candidate panel and reconcile all blocking findings.
   No unavailable seat or synthetic startup marker counts as review. Merge and
   trusted publication require their own accepted gates; this plan authorizes
   neither action. Report local/tested/committed/pushed/merged/published separately.

## Verification contract

These commands are for later execution, not this planning turn. New tests use
`v0.14` in their titles so the focused command selects real cases; zero selected
tests or skipped-only results fail acceptance. Optional live tests remain opt-in
and cannot be cited as live acceptance when skipped. Run from the isolated root.

```sh
# V0: baseline/toolchain after prerequisites; no live credentials required
pnpm install --frozen-lockfile
pnpm build

# V1: focused new behavior; record per-case red/green, not just totals
pnpm exec vitest run packages/omnigent-transport/src/history-mapper.test.ts packages/omnigent-transport/src/event-mapper.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/http-provider.test.ts -t 'v0.14'

# V2: whole transport regression, including previous tagged versions
pnpm exec vitest run packages/omnigent-transport/src
pnpm --filter @consiliency/omnigent-transport typecheck

# V3: explicit frozen authority checks (old default must stay valid)
node scripts/check-omnigent-openapi-delta.mjs
node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.14.0

# V4: accepted GUARD full gate, then installed-consumer and release dry run
pnpm verify
pnpm --filter @consiliency/omnigent-transport test:pack
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
```

The new drift-check branch binds commit/content digests, all additions/removals,
and changed field requiredness/nullability/enums, not only the schema counts.
Preserve property names such as `title` when stripping schema annotations.
Network/source failures are not successful drift checks. Unknown tag pairs fail.

V1 matrix: info versus absent/null/error/malformed level; info followed by
completion/failure/text; source=harness; active admission after info; snapshot
before delayed preview; preview before durable item; chunked/repeated delayed
preview; identical text under distinct explicit IDs; cross-turn/session isolation;
conflicting aliases; legacy absent/null/invalid stream field; reconnect with
afterSequence; cancellation/rejected/pending identity fencing; forged identities
inside passive frames; sidechat content omission; valid/invalid unanswered reason;
string/integer/null compaction IDs and repeated progress. Assert payload, event
count, order, sequence/cursor and provider state, not merely absence of exceptions.

V4 dry-run must actually reach `npm publish --dry-run`. If the helper exits zero
because 0.8.0 already exists, that is NOT dry-run proof: stop, reconcile the
registry/version decision and re-review any material amendment. No credentialed
publish, workflow dispatch, tag or automatic install of upstream Omnigent.

Evidence target: `plans/evidence/omnigent-v0-14-accommodation.json`, created by
the executor with exact plan/head/source hashes, commands, exit codes, selected
and skipped cases, baseline comparison, panel receipts/reconciliation, tarball
digest and dry-run outcome. Operational ownership and review records require a
dated linked plan/handoff amendment bound to the candidate before execution;
record manual evidence as manual, never invent a runner-stamped approval.

```yaml
automation:
  status: awaiting_review
  execution_authorized: false
  suite_command: pnpm verify && node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.14.0 && pnpm --filter @consiliency/omnigent-transport test:pack
  evidence_path: plans/evidence/omnigent-v0-14-accommodation.json
  prerequisites: accepted GUARD, accepted DATA freeze, exclusive transport ownership, reconciled plan panel
  publication_authorized: false
```

## Acceptance criteria

- [ ] Informational history never causes lifecycle failure/admission release; real
  errors still terminate once, including source=harness. Proven by V1 and V2.
- [ ] Explicit stream/durable identity prevents replay loss/duplication in both
  orderings while preserving distinct repeated text and legacy behavior. V1/V2.
- [ ] New passive events and unanswered resolution cannot alter identity,
  cancellation, fences or approval; sidechat content is not exported. V1/V2.
- [ ] Compaction, additive session/info fields and failure envelopes preserve
  existing lifecycle/capability semantics. V1/V2 and conformance tests in V2.
- [ ] Exact 56-event target, all delta dispositions and old tagged fixtures pass
  fixed-pair drift/conformance checks with no neutral vocabulary change. V2/V3.
- [ ] Full accepted gate, typecheck and independent packed-consumer behavioral
  checks pass; candidate dry-run really executes without publication. V0/V2/V4.
- [ ] Exact-head review, exclusive ownership and scope decisions are recorded in
  the evidence artifact; no GUARD/WIRE acceptance, merge or release is inferred
  from this plan or incomplete review. Evidence review after V4 is mandatory.
