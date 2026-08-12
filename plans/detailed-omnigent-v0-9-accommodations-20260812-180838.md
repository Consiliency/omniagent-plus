# Detailed plan: accommodate official Omnigent v0.9.0 and repair the tagged HTTP wire boundary

## Task

Adapt `@consiliency/omnigent-transport` from the frozen official Omnigent
`v0.7.0` contract to official `v0.9.0`, while preserving the neutral
runtime-provider, lease/lock, authority, and event-mapping boundaries. Refresh
the checked-in authority evidence, accept the six additive v0.9 schema deltas,
correct the restored deprecated CLI alias classification, and make the HTTP
adapter consume the official tagged request, paginated response, and SSE shapes
instead of the repo-local fake shape. Prepare a transport-only `0.5.0` release,
but do not publish until the atomic compatibility PR is merged and its exact-head
gates pass.

This is a bounded compatibility release, not a roadmap. Deliver the authority
refresh, wire repair, fixtures, tests, and truthful documentation in one atomic
PR. The v0.9 fixtures make existing v0.7-pinned tests fail, while the code repair
makes v0.7 authority claims false; no independently valid intermediate main
state exists.

## Starting state

- Planning worktree:
  `/mnt/workspace/worktrees/omniagent-plus-plan-omnigent-v0-9-accommodations`
- Branch: `codex/plan-omnigent-v0-9-accommodations`
- Base: `origin/main` at `faf84b749f21c3c6e03e67ec6f267880ba0a5431`
- Frozen upstream contract: Omnigent `v0.7.0` at
  `35519fb04743f66b30cac8a40695d5d72fa163ea`
- Published package: `@consiliency/omnigent-transport@0.4.1`
- The planning worktree was clean before this artifact was written.
- The primary checkout has a pre-existing untracked `mcp_server.log`; it is not
  an artifact of this plan and must not be committed during implementation.

## Research summary

Live release metadata on 2026-08-12 identifies official Omnigent `v0.9.0`,
published 2026-08-11, at tag commit
`cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`; PyPI reports `omnigent==0.9.0`
with Python `>=3.12`. Direct `v0.7.0` to `v0.9.0` OpenAPI comparison retains
exactly 97 operations, the same path and schema sets, and all 52 stream event
discriminators. Six schemas changed additively: `ChildSessionSummary`,
`ImportSessionRequest`, `RoutingDecisionData`, `SessionResponse`,
`SessionStatusEvent`, and `UpdateSessionRequest`.

The production CLI command remains `omnigent server --background`; v0.9 restores
`omnigent server start` only as a hidden deprecated alias. Production code must
not switch back to the alias, but current evidence and conformance checks must
stop claiming the alias is absent.

The tagged API review also exposed pre-existing false conformance hidden by the
fake server. Official session timestamps are snake-case Unix epoch fields;
`GET /v1/sessions` and the child-session endpoint return list envelopes;
`/items` and snapshot `items` contain `ConversationItem` rows rather than
`{id,event}` SSE wrappers, and the items route is a cursor-paginated envelope
with a default page size of 100; JSON session creation requires an upstream
`agent_id` and `initial_items`; and the upstream create route has no durable
idempotency-key field. The current client sends repo-local camel-case fields and
casts all official responses directly to normalized internal types. The v0.9
release must repair that boundary before publication.

Tagged SSE payloads are also upstream wire objects, not `OmnigentRawEvent`.
Response lifecycle frames carry a nested `response` object; session and turn
frames use `conversation_id` or `session_id`; output deltas may contain neither
a response id nor a timestamp; and `session.created` means a child was spawned
on the parent stream. The current parser casts these frames to a normalized type
that requires `id`, `sessionId`, and `occurredAt`, so the live HTTP path is not
conformant even though fake-server tests pass. Finally, `streamSession()` is an
async generator: calling it does not issue the HTTP request, so the current
provider takes the snapshot before the stream is actually open and violates the
tagged reconnect sequence.

Unreleased upstream `main` is `0.10.0.dev0` at
`0bea9873e6b697290e0a2d172eb879151839a2a6`, 144 commits ahead of v0.9. It adds
two paths but no stream events and contains a post-v0.9 security fix that roots
sub-agent sessions at their own bundle directory instead of inheriting parent
skills/tools. Development `main` is informational only. Do not freeze it, and
do not claim v0.9 runtime security parity with that fix.

## Frozen decisions

1. Freeze only official `v0.9.0`; rerun the release preflight immediately before
   implementation. If a newer stable release exists, stop and amend this plan.
2. Preserve the exact 52-event wire allowlist and neutral event vocabulary. Add
   `SessionStatusEvent.blocked_on` as raw metadata only; do not add a neutral
   event or capability. Correct mapper behavior where tagged semantics demand
   it: `session.created` is child metadata and must not synthesize
   `runtime.session.created`; provider create/snapshot remains the session
   creation authority.
3. Preserve `omnigent server --background` as the only command production code
   invokes. Record `server start` as a hidden deprecated compatibility alias.
4. Preserve child-session creation and public harness override as blocked.
   Smart routing, projects, imports, hosts, credentials, model discovery, and
   `omnigent run --profile` remain upstream operator/admin surfaces.
5. Do not add approval delegation/authority. v0.9 reverted the v0.8 delegated
   approval experiment, and direct v0.7-to-v0.9 authority shows no final
   permission-contract addition.
6. HTTP JSON create supports an existing upstream agent. By default,
   `agentSpec.kind === "named_agent"` supplies the durable upstream `agent_id`;
   callers that use human names may provide an additive `resolveAgentId`
   callback. Missing, inline, or bundle-path agent specs fail closed with the
   existing typed capability-missing failure until a separately reviewed
   multipart bundle flow exists.
7. Map `initialMessage` to one official `initial_items` message event, or send
   `initial_items: []` when it is absent; map
   `worktree.path ?? repoRoot` to `workspace`; send `title`; do not send neutral
   `targetHarness`, `targetProvider`, identity, correlation, handoff, or lease
   fields as invented upstream JSON keys.
8. Emulate create idempotency within one provider process using an in-flight and
   completed promise map keyed by `idempotencyKey`. Do not claim durable
   cross-process idempotency because upstream exposes no key for it. Apply the
   same process-local rule to send-turn, keyed by session plus idempotency key;
   evict rejected promises so a failed operation can be retried.
9. Normalize official session epochs to ISO strings at the HTTP boundary.
   `updatedAt` uses `updated_at` when present and otherwise `created_at`.
   Preserve raw additive snake-case metadata where consumers need it; never pass
   an undefined date into the neutral provider.
10. Consume official pagination rather than merely unwrapping page one. For
    sessions, child sessions, and history, request ascending pages with the
    largest tagged limit, follow `has_more` via `last_id`, and fail with a typed
    malformed-response error if a page claims more data without a new cursor.
    Return typed list rows and child summaries, not full session snapshots.
    Preserve v0.9 child `routed_model` and `routing_decision_id` as read-only
    metadata.
11. Map persisted `ConversationItem` history independently from live SSE:
    group by `response_id`; emit one turn start per group; map user/assistant
    text blocks, function calls, function outputs, and error rows to existing
    neutral events; leave reasoning, compaction, `native_tool`, resource,
    routing-decision, slash-command, terminal-command, and meta-message rows as
    typed metadata-only no-ops. An error row ends a group as failed; an
    interrupted assistant message ends it as cancelled. Never infer successful
    completion from persisted items or snapshot `idle`: v0.9 can persist input
    before publishing `running`, so idle is not affirmative terminal evidence.
    Successful terminal events come only from tagged response lifecycle SSE;
    reconnect history may omit a past completion rather than manufacture one.
12. Keep routing-decision fields typed and round-trippable, but do not map them
    to `RouteDecision`, mutate XG-1 authority, or broaden coordinator routing.
13. Release only `@consiliency/omnigent-transport`, from `0.4.1` to `0.5.0`.
    Leave sibling package versions and the trusted-publish workflow unchanged.
14. Open the HTTP stream eagerly before fetching the snapshot. The client returns
    a closeable stream handle only after the SSE response and body are available;
    the provider then fetches and maps the snapshot before consuming buffered
    frames. Close/abort the stream if snapshot acquisition fails or iteration
    exits. A lazy async generator does not satisfy this contract.
15. Normalize tagged SSE frames in a stateful boundary adapter before invoking
    `OmnigentEventMapper`. Derive session identity from the route plus official
    `conversation_id`/`session_id`; derive response identity from nested
    `response.id`, `session.status.response_id`, or the current response context;
    derive stable item keys from official item/message/call IDs. Use an injected
    clock for receipt timestamps when upstream supplies none and a deterministic
    frame ordinal/sequence component for event IDs. Uncorrelated `turn.*` frames
    remain metadata-only rather than inventing a turn identity.
16. Preserve CLI and hybrid behavior explicitly. Keep the existing
    `{id,event: OmnigentRawEvent}` mapper as the legacy CLI path and add a
    separate HTTP ConversationItem mapper; do not overload one function with two
    structurally unrelated wire contracts. Hybrid continues to route history to
    HTTP and lifecycle fallback to CLI under its existing policy.
17. Serialize send-turn as the tagged message event:
    `{type:"message",data:{role:"user",content:[{type:"input_text",text}]}}`.
    Model accepted official acks as `queued` plus optional `item_id`/`pending_id`;
    they do not return session or response identity. Also model the HTTP-202
    synchronous denial `{queued:false,denied:true,reason}`. A denial becomes a
    typed non-retryable `policy_denied` failure and never an active handle. Cache
    that deterministic same-key outcome locally so retries do not repost denied
    input; evict only transport/server failures. For accepted input, return a
    provisional neutral turn handle using `item_id`, then `pending_id`, then a
    namespaced session/idempotency fallback. Replace it with the official active
    response id when snapshot/lifecycle evidence supplies one; never claim the
    provisional id is an upstream response id.

## Changes

### Atomic PR: tagged authority, official wire conformance, and transport 0.5.0

#### `fixtures/omnigent/discovery/source-metadata.json` (modify)

- `freeze_target` - modify - record v0.9.0, tag SHA, publication timestamp,
  PyPI version, and Python requirement.
- `previous_probe` and `head_probe` - modify - retain v0.7 as historical and
  record dated v0.10-dev main metadata as explicitly non-authoritative.
- `preflight_confirmation` - modify - record 97 operations, no path/schema/event
  set changes, the six changed schemas, the restored deprecated CLI alias, and
  the v0.8 config cautions.
- `security_posture` - add - record the post-v0.9 sub-agent bundle-isolation fix
  as an unreleased operational risk, not part of the frozen contract.

#### `fixtures/omnigent/discovery/http-surface.json` (modify)

- `openapi_delta` - modify - represent the direct v0.7-to-v0.9 delta: 97
  operations, no set additions/removals, and the six changed schemas.
- `session_snapshot_fields` - modify - add `kind`, `updated_at`, and
  `subagent_routing_override` with official epoch and metadata semantics.
- `child_session_public_surface` - modify - add `routed_model` and
  `routing_decision_id` as read-only summary metadata.
- `conversation_item_contract` - add - freeze official item, message,
  function-call, function-output, error, and routing-decision shapes.
- `optional_release_surfaces` - modify - record import `force`, update routing
  override, smart-routing/admin fields, and unchanged API-guide provenance for
  the send-events route omitted from OpenAPI.

#### `fixtures/omnigent/discovery/cli-surface.json` (modify)

- `documented_commands` - modify - retain canonical background/status/stop and
  add `omnigent run --profile` only to non-provider-required commands.
- `deprecated_aliases` - add - record hidden `omnigent server start` as a
  compatibility alias with canonical replacement and warning behavior.
- `compatibility_notes` - modify - record v0.8 `extra_args`, explicit
  `env_passthrough`, and recursive dotfile-scan changes as unused locally.

#### `fixtures/omnigent/discovery/capability-probes.json` (modify)

- `capabilities` - modify - advance evidence to v0.9 without changing capability
  names or statuses; state that smart routing and new child metadata do not
  grant child creation, harness override, lease, lock, or authority.
- `create_session` evidence - modify - distinguish official existing-agent JSON
  create from provider-local idempotency emulation and unsupported bundle/inline
  specs.

#### `fixtures/omnigent/fake-server/README.md` (modify)

- Freeze and scope notes - modify - name v0.9 as authority and state that the
  fake server must emit official wire shapes rather than normalized internals.

#### `docs/omnigent-contract.md` (modify)

- Supported version and provenance - modify - freeze v0.9 and quote the exact
  97-operation/52-event/no-set-delta result.
- HTTP/session/history contract - modify - document official create, envelope,
  timestamp, child-summary, and conversation-item shapes plus provider-local
  idempotency limits.
- Capability matrix - modify - retain blocked authority boundaries and describe
  conditional existing-agent create support.

#### `docs/omnigent-upstream-readiness.md` (modify)

- Current decision - modify - replace v0.7 readiness with v0.9 authority.
- Unreleased main - modify - record the two main-only paths and the bundle-root
  security fix without treating either as a stable provider requirement.
- Next release gate - modify - require amendment when a stable release contains
  the security fix or otherwise supersedes v0.9.

#### `docs/omnigent-transport.md` (modify)

- HTTP mode - modify - document existing-agent resolution, wire normalization,
  list unwrapping, persisted-item mapping, and process-local idempotency.
- CLI mode - modify - retain canonical background start and classify the restored
  alias accurately.
- Event mapping - modify - preserve exactly 52 live event types and distinguish
  persisted conversation-item mapping from SSE mapping.

#### `docs/lifecycle-and-events.md` (modify)

- CLI lifecycle - modify - remove the claim that `server start` is absent while
  preserving canonical `--background` usage.
- Reconnect/history - modify - describe active-response-aware persisted history
  without synthetic successful completion, plus SSE item-ID dedupe.

#### `docs/architecture.md` (modify)

- Omnigent lifecycle summary - modify - correct the hidden deprecated alias
  classification and retain the canonical command.

#### `docs/coordination-backend.md` (modify)

- Supported Omnigent target - modify - advance v0.7 to v0.9 while explicitly
  excluding smart routing from CS-2.2 lease/lock authority.

#### `docs/security-and-secrets.md` (modify)

- Upstream security posture - add - record the post-v0.9 sub-agent bundle-root
  fix as an operational deployment warning and avoid claiming tagged parity.
- v0.8 config cautions - add - record credential passthrough and dotfile-scan
  changes; note that the repo has no local usage requiring code changes.

#### `fixtures/omnigent/http/v0-9-wire-contract.json` (create)

- Tagged wire samples - add - include metadata-only samples for existing-agent
  JSON create, full session response, session-list envelope, child-list envelope,
  paginated list/history responses, and persisted conversation items covering
  message, tool, error, interrupted, routing-decision, null-active-running, and
  active-response cases.
- Send-event samples - add - include exact message content blocks and the tagged
  ack variants `{queued}`, `{queued,item_id}`, `{queued,pending_id}`, and
  `{queued:false,denied:true,reason}`.
- Tagged SSE samples - add - include flat session/turn frames, nested response
  lifecycle frames, identifier-free output deltas, output-item frames, a child
  `session.created`, missing timestamps, and reconnect buffering cases.
- Provenance - add - identify v0.9 tagged `API.md`, `schemas.py`, and
  `openapi.json`; this is conformance evidence, not a new source of truth.

#### `fixtures/omnigent/fake-server/scenarios.json` (modify)

- `v0_9_official_wire` - add - bind create, snapshot, list, child-list, history,
  and reconnect scenarios to the tagged wire fixture.

#### `packages/omnigent-transport/src/types.ts` (modify)

- Session wire/normalized types - modify - keep wire and normalized types
  distinct; allow nullable upstream titles; add
  epoch wire fields, v0.9 `kind`, `updated_at`, and
  `subagent_routing_override`; retain required normalized ISO dates.
- Generic tagged page envelope, `OmnigentSessionListItem`, and
  `OmnigentChildSessionSummary` - add - model `data`, `has_more`, `first_id`, and
  `last_id` plus endpoint-specific rows and routing metadata.
- `OmnigentConversationItem` and typed data unions - add - model message,
  function call/output, error, routing decision, `native_tool`, and other
  metadata-only item variants.
- Tagged SSE unions - add - type all fixture-covered v0.9 wire fields separately
  from normalized `OmnigentRawEvent`; include nested response and heterogeneous
  output-item shapes without unsafe casts.
- `OmnigentRawEvent` - modify - add optional `blocked_on` metadata and normalized
  item/message identifiers needed for dedupe only.
- `OmnigentEventAck` - modify - model official accepted fields (`queued`, optional
  `item_id`/`pending_id`) and the discriminated synchronous policy-denial fields;
  remove invented session/turn response fields.
- `OmnigentHttpClientOptions` - modify - add optional `resolveAgentId`; the
  default accepts `named_agent.value` as the durable upstream agent id.

#### `packages/omnigent-transport/src/http-client.ts` (modify)

- `createSession` - modify - validate/resolve an upstream agent id, serialize
  official snake-case JSON, and normalize the returned full session response.
  Fail closed for unsupported agent spec kinds before making a request.
- `listSessions` - modify - follow every tagged page and return typed list rows.
- `getSession` and `patchSession` - modify - normalize epochs, nullable title,
  aliases, items, and v0.9 fields at the HTTP boundary.
- `getHistory` - modify - follow every item page in ascending order and return
  official `ConversationItem[]`.
- `listChildSessions` - modify - follow every child page and return child
  summaries rather than full session snapshots.
- `openSessionStream` - add - eagerly await the tagged SSE response and return a
  closeable parsed-stream handle; include route session id and injected clock in
  normalization context. Retire the lazy-fetch behavior of `streamSession`.
- Pagination helper - add - advance only on a non-empty changed `last_id`; reject
  malformed/no-progress envelopes rather than loop or silently truncate.
- `sendTurn` - modify - serialize the exact tagged user-message role/content
  blocks and return the official accepted-or-denied ack union. Do not read a turn
  or session id from the response.
- Internal normalization helpers - add - reject malformed required IDs/status/
  epochs as typed transport failures; use `updated_at ?? created_at`; retain
  unknown additive metadata without trusting it as neutral capability.

#### `packages/omnigent-transport/src/history-mapper.ts` (modify)

- `mapOmnigentHistory` - retain - keep the legacy `{id,event}` mapper used by CLI
  resume history behaviorally unchanged.
- `mapOmnigentConversationHistory` - add - consume persisted conversation items, group by
  response id, extract visible text blocks, map tool/error/interruption rows,
  emit only explicit failed/cancelled terminals, and no-op the frozen
  metadata-only item kinds including `native_tool`. Never synthesize successful
  completion from idle status, group age/order, or absence of an active response.
- Dedupe/cursor state - modify - continue using stable item IDs and deterministic
  item order so reconnect with live SSE cannot duplicate text/tool events.

#### `packages/omnigent-transport/src/http-provider.ts` (modify)

- `createSession` - modify - add provider-process in-flight/completed
  idempotency by request key and preserve request title when upstream title is
  null. Remove rejected entries so retries are not poisoned.
- `sendTurn` - modify - deduplicate in-flight/completed sends by session plus
  idempotency key, evict transport/server failures, cache synchronous policy
  denial without creating active state, and construct an accepted provisional
  handle from `item_id`, `pending_id`, or a namespaced local fallback. Reconcile
  local active state to the official response id on later snapshot/SSE evidence.
- `readHistory` - modify - fetch the snapshot status/active response alongside
  fully paginated history for context and dedupe, without inferring successful
  terminal state from the snapshot.
- `streamEvents` - modify - await the closeable stream handle before requesting
  the snapshot, map snapshot/history, then consume buffered/live frames. Seed the
  stateful SSE normalizer and mapper with snapshot response/item identities;
  suppress buffered deltas/items already represented by the snapshot; always
  close the handle on snapshot failure, cancellation, or iterator exit.
- `health` - modify - consume typed unwrapped list rows; do not add smart-routing
  or admin capability.

#### `packages/omnigent-transport/src/cli-client.ts` (verify; modify only if naming requires)

- Legacy history path - retain - continue mapping CLI transport
  `{id,event: OmnigentRawEvent}` history with `mapOmnigentHistory`; do not pass it
  through the new ConversationItem mapper.

#### `packages/omnigent-transport/src/hybrid-provider.ts` (verify)

- Delegation boundary - retain - history/turn operations continue through the
  HTTP provider while lifecycle fallback remains CLI-owned; no new translation
  or authority is added.

#### `packages/omnigent-transport/src/fake-omnigent-server.ts` (modify)

- Session routes - modify - accept official existing-agent create JSON and emit
  tagged snake-case epoch session responses.
- List/child/history routes - modify - emit official envelopes and conversation
  items across configurable multi-page responses, including v0.9 child routing
  metadata, `native_tool`, input-persisted-while-idle, active-response, and
  malformed-cursor cases.
- Event route - modify - emit every accepted ack variant plus synchronous policy
  denial and record whether a repeated same-key request reached the server.
- Stream route - modify - emit the tagged v0.9 frames verbatim and expose a test
  barrier proving the stream request is open before the snapshot response.
- Internal records - modify - keep server bookkeeping private; do not expose the
  normalized `OmnigentSessionSnapshot` as wire JSON.

#### `packages/omnigent-transport/src/contract-fixtures.ts` (modify)

- Discovery fixture interfaces - modify - type changed schemas, deprecated CLI
  aliases, and security posture metadata.
- `OmnigentV09WireFixture` and loader - add - type and load the single tagged
  HTTP wire fixture for fake-server, conformance, and packed tests.

#### `packages/omnigent-transport/src/sse-stream.ts` (modify)

- Frame parsing - modify - parse and validate tagged wire events without casting
  them directly to `OmnigentRawEvent`; retain skip reporting for malformed JSON,
  non-object payloads, and unknown event types.
- Stateful normalization - add - normalize official snake-case/flat/nested
  shapes with route session context, current response correlation, injected
  receipt clock, deterministic event identity, and stable item/message/call IDs.
- Child and uncorrelated events - modify - keep child `session.created` and
  uncorrelated `turn.*` frames as metadata-only no-ops instead of synthesizing
  false neutral lifecycle events.

#### `packages/omnigent-transport/src/event-mapper.ts` (modify)

- Tagged semantics - modify - stop mapping child `session.created` to
  `runtime.session.created`; preserve existing neutral event vocabulary,
  terminal uniqueness, and the exact 52-event allowlist.
- Correlation/dedupe - modify - consume only normalized response-correlated turn
  events and stable item keys; do not manufacture a turn id for bare turn frames.

#### `packages/omnigent-transport/src/index.ts` (modify)

- Public exports - modify - export endpoint-specific session-list, child-summary,
  and conversation-item read types; keep raw wire helper types internal.

#### `packages/omnigent-transport/src/types.test.ts` (modify)

- v0.9 additive shapes - add - prove session, status, child routing, and routing
  decision fields, tagged page envelopes, and tagged-vs-normalized SSE separation
  while retaining exactly 52 stream event literals.

#### `packages/omnigent-transport/src/http-client.test.ts` (modify)

- Official request/response wire - replace fake-shape expectations with exact
  existing-agent JSON, epoch normalization, envelope unwrapping, nullable-title,
  updated-at fallback, empty/multi-page session/history/child traversal,
  no-progress cursor rejection, child summary, absent-initial-message
  `initial_items: []`, exact message role/content blocks, all official ack
  variants including policy denial, and unsupported-agent-spec cases.

#### `packages/omnigent-transport/src/sse-stream.test.ts` (modify)

- Tagged frame normalization - add - exercise nested response objects, flat
  session/turn frames, missing IDs/timestamps, injected clock, stable ordinals,
  output-item/message/call dedupe keys, child creation, and unknown/malformed
  frame skips using verbatim v0.9 fixture samples.

#### `packages/omnigent-transport/src/history-mapper.test.ts` (modify)

- Persisted item mapping - replace synthetic SSE wrappers with tagged
  conversation items; cover text/tool/error/interrupted/routing/no-op groups,
  input-persisted-while-idle, `native_tool` no-op, no synthetic successful
  completion, item-ID dedupe, and deterministic cursors.
- Legacy history regression - retain - prove `{id,event}` CLI input still emits
  the existing neutral events independently of ConversationItem tests.

#### `packages/omnigent-transport/src/http-provider.test.ts` (modify)

- Provider behavior - add concurrent and repeated create idempotency tests,
  null-title fallback, official epoch conversion, history plus live-stream
  dedupe, active-response terminal suppression, stream-open-before-snapshot
  ordering, buffered-overlap suppression, and stream cleanup after snapshot
  failure/cancellation. Add send-turn dedupe, rejected-send retry, official ack
  variants, cached policy-denied failure without repost/active state, provisional
  identity fallback, and official response-id reconciliation.

#### `packages/omnigent-transport/src/cli-client.test.ts` (modify)

- CLI regression - retain the legacy history-resume lifecycle assertions after
  the mapper split and prove CLI does not consume ConversationItem types.

#### `packages/omnigent-transport/src/hybrid-provider.test.ts` (modify)

- Hybrid regression - prove HTTP turn/history delegation and CLI lifecycle
  fallback remain unchanged under the split mapper contracts.

#### `packages/omnigent-transport/src/conformance.test.ts` (modify)

- Frozen contract gates - advance to v0.9 tag/SHA, assert 97 operations, 52
  events, no set changes, and exactly the six changed schemas.
- CLI gates - require canonical `--background`; require the old spelling to be
  classified under `deprecated_aliases`, not under documented production
  commands.
- Wire gates - drive the fake server through exact tagged create, list, child,
  snapshot, pagination, send/ack/policy-denial, SSE normalization, reconnect, and
  failure shapes; prove no routing/approval/lease/lock capability is introduced.

#### `packages/omnigent-transport/src/capability-probe.test.ts` (modify)

- Freeze assertions - advance to v0.9 and retain existing capability statuses.
- Conditional create evidence - assert upstream-agent resolution and
  process-local idempotency limitations are explicit. Update v0.9 authority in
  the same atomic PR as the discovery fixtures.

#### `packages/omnigent-transport/src/live-omnigent-smoke.test.ts` (modify)

- Live create configuration - modify - require `OMNIGENT_AGENT_ID` for create
  coverage, build a named-agent request, and report a clear skip when the tagged
  live prerequisite is absent. Cover an omitted initial message without
  inventing an agent resolver.

#### `scripts/smoke-packed-omnigent-transport.mjs` (modify)

- Packed consumer smoke - install the tarball in an isolated consumer, import
  only the package root, exercise v0.9 exported read types, run official-wire
  fixture loading, assert the v0.9 tag/SHA and package `0.5.0`, and retain
  restricted declaration compilation with
  `types: []` and `skipLibCheck: false`.

#### `packages/omnigent-transport/package.json` (modify)

- `version` - modify - bump only this package from `0.4.1` to `0.5.0` after all
  atomic PR gates pass.

#### `CHANGELOG.md` (modify)

- `0.5.0` entry - add - record v0.9 authority, official-wire correction,
  restored alias classification, conditional create/idempotency behavior,
  provisional send-turn identity, no event/capability expansion, and the
  unreleased security-fix caveat.
- Historical entries - retain - do not rewrite the v0.7-era statement that the
  alias was removed at that time.

## Documentation impact

Documentation changes are mandatory because the repo treats its Omnigent
contract, readiness record, lifecycle description, coordination boundary, and
security notes as operator authority. They land atomically with the fixtures,
tests, code, changelog, and final public type names so merged documentation never
claims behavior absent from the same commit. The publish workflow does not
change.

## Dependencies and order

1. Recheck GitHub latest release, tag SHA, PyPI version, and npm package version.
   If Omnigent stable is newer than v0.9.0, stop and amend.
2. Recompute tagged v0.7-to-target OpenAPI path, schema, operation, and stream
   event deltas, plus extract representative v0.9 SSE and pagination payloads.
   Do not reuse counts or hand-transcribe samples without a fresh evidence
   receipt tied to the tag SHA.
3. Add the single tagged wire fixture and typed loader first so implementation,
   fake-server, conformance, and packed tests share one evidence surface.
4. Implement official create/send serialization, accepted/policy-denied ack and
   response normalization, and
   complete pagination. Then add the HTTP-only persisted history mapper with
   explicit-only terminal mapping, preserving the CLI legacy mapper. Implement tagged
   SSE normalization, eager closeable stream opening, provider idempotency and
   provisional-turn reconciliation, and fake-server parity in that order.
5. Update every v0.7-pinned test/script and all operator documentation in the
   same branch. Keep historical v0.7 changelog/provenance entries explicitly
   labeled rather than deleting them.
6. Run targeted tests, the full suite, packed-consumer tests, and `pnpm pack`
   dry-run inspection. Confirm the tarball contains only intended `dist` and
   fixture files and resolves `workspace:*` dependencies.
7. Panel-review the atomic PR at its exact head. After any review-driven commit, rerun
   exact-head CI and packed tests before merge consideration.
8. Only after the PR is merged and the coordinator authorizes release, tag
   package/repo `v0.5.0`, publish through the existing trusted workflow, and
   verify npm registry install plus restricted declaration smoke. Planning or PR
   implementation alone does not authorize merge or publication.

## Verification

Do not run these commands during planning. The implementation runners should
run the narrowest commands first, then the effective automation suite.

### Release and authority preflight

```bash
gh api repos/omnigent-ai/omnigent/releases/latest --jq '{tag_name,published_at,html_url}'
gh api repos/omnigent-ai/omnigent/git/ref/tags/v0.9.0 --jq '.object.sha'
curl -fsSL https://pypi.org/pypi/omnigent/json | jq '{version:.info.version,requires_python:.info.requires_python}'
npm view @consiliency/omnigent-transport version versions --json
```

### Targeted authority verification

```bash
find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 python3 -m json.tool >/dev/null
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts
rg -n 'v0\.7\.0|35519fb|server_start_subcommand_removed|server start.*removed|removed.*server start' docs fixtures/omnigent packages/omnigent-transport/src scripts
git diff --check
```

Remaining v0.7 matches are allowed only in explicitly labeled historical
fields or changelog entries. The implementation must add a focused conformance
assertion for that rule instead of relying on `rg` exit status alone.

### Targeted transport verification

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src/types.test.ts packages/omnigent-transport/src/http-client.test.ts packages/omnigent-transport/src/sse-stream.test.ts packages/omnigent-transport/src/history-mapper.test.ts packages/omnigent-transport/src/http-provider.test.ts packages/omnigent-transport/src/cli-client.test.ts packages/omnigent-transport/src/hybrid-provider.test.ts packages/omnigent-transport/src/conformance.test.ts packages/omnigent-transport/src/capability-probe.test.ts
pnpm --filter @consiliency/omnigent-transport build
pnpm --filter @consiliency/omnigent-transport test:pack
pnpm --filter @consiliency/omnigent-transport pack --pack-destination /tmp/omnigent-transport-pack
tar -tf /tmp/omnigent-transport-pack/consiliency-omnigent-transport-0.5.0.tgz
git diff --check
```

### Effective automation suite

```bash
pnpm --filter @consiliency/omnigent-transport test -- --run packages/omnigent-transport/src && pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @consiliency/omnigent-transport test:pack && find fixtures/omnigent -name '*.json' -print0 | sort -z | xargs -0 -n1 python3 -m json.tool >/dev/null && git diff --check && phase-loop validate-roadmap specs/phase-plans-v1.md
```

### Edge cases

- A newer stable upstream release appears between planning and execution.
- `named_agent.value` is absent/empty or a resolver rejects it; no HTTP request
  is sent and the failure is typed.
- Two concurrent creates use the same idempotency key; exactly one upstream
  create occurs and both callers receive the same session.
- Two concurrent sends use the same session/idempotency key; exactly one tagged
  message is queued and both callers receive the same provisional handle. A
  transport/server-failed send is evicted and can be retried.
- Send acknowledgements omit response/session ids or supply only `item_id` or
  `pending_id`; every variant yields a stable provisional handle that is later
  reconciled to an official response id without false upstream attribution.
- A send returns HTTP 202 policy denial; it produces a typed non-retryable
  `policy_denied` failure, never marks the session active, and a repeated same-key
  call reuses the cached denial without reposting.
- The upstream title is null, `updated_at` is null/missing, or an epoch is
  malformed; title/date fallback is deterministic and malformed required epochs
  fail closed.
- Session and child lists are empty envelopes or have pagination metadata; the
  client follows every page and returns empty arrays without treating the
  envelope as a row. A repeated/missing cursor with `has_more: true` fails typed
  instead of truncating or looping.
- A user input item is persisted while the snapshot still reports idle; history
  emits no successful terminal. Completed history likewise does not synthesize a
  successful terminal without tagged lifecycle evidence.
- `native_tool` history is accepted as a typed metadata-only item and neither
  fails the page nor creates a neutral tool event.
- Calling the client stream opener has completed the HTTP handshake before the
  snapshot request starts; buffered frames that overlap snapshot history dedupe
  by stable item/message/response identity, and teardown closes the stream.
- Tagged frames omit normalized IDs/timestamps, nest response lifecycle data,
  or carry child `session.created`; normalization is deterministic and does not
  manufacture a parent-session creation or uncorrelated neutral turn.
- CLI resume history still uses `{id,event}` while HTTP history uses paginated
  ConversationItems; each mapper rejects/avoids the other's input contract and
  hybrid delegation remains unchanged.
- Routing-decision and child routing metadata round-trip but do not create
  neutral route decisions, child launches, approval authority, or lease claims.
- The hidden deprecated CLI alias remains accepted as evidence but is never
  invoked by production lifecycle code.
- Upstream v0.9 lacks the post-release bundle-root security fix; docs and release
  notes do not claim otherwise.

## Acceptance criteria

- [ ] Live preflight confirms official Omnigent v0.9.0 at
  `cc4720a79fbdf9ccee56724bf571e7d48e1d9ac2`, PyPI 0.9.0, and no newer stable
  release; proven by the release and authority preflight commands.
- [ ] Authority fixtures assert 97 operations, 52 stream events, no
  path/schema/event set additions or removals, and exactly the six changed
  schemas; proven by targeted authority conformance tests.
- [ ] Canonical lifecycle remains `omnigent server --background`, while
  `omnigent server start` is classified only as a hidden deprecated alias;
  proven by `conformance.test.ts` and stale-claim scan.
- [ ] Smart routing, import force, session routing override, child routing
  metadata, and `blocked_on` introduce no neutral provider, approval, XG-1,
  lease, or lock capability; proven by conformance and capability tests.
- [ ] Official existing-agent create JSON is emitted, unsupported agent spec
  kinds fail before network I/O, and provider-local duplicate keys produce one
  upstream create; proven by HTTP client/provider tests.
- [ ] Official send-turn role/content JSON and all tagged ack variants are
  consumed without invented response fields; process-local duplicate sends
  queue once, transport failures can retry, synchronous policy denial is a
  cached typed non-retryable failure with no active handle, and provisional
  accepted handles reconcile to official response ids; proven by
  client/provider/conformance tests.
- [ ] Official session epochs and nullable fields normalize deterministically,
  session/history/child pagination reaches every page with no-progress guards,
  and child routing metadata remains read-only; proven by tagged wire fixture and
  HTTP client tests.
- [ ] Persisted `ConversationItem` rows map deterministically to neutral history,
  metadata-only kinds including `native_tool` remain no-ops, explicit failure or
  interruption map terminally, and no successful completion is synthesized from
  idle/ordering/active-response absence; proven by history mapper tests.
- [ ] CLI `{id,event}` resume history and hybrid delegation remain behaviorally
  unchanged under a separate legacy mapper; proven by CLI, hybrid, history, and
  full-suite regression tests.
- [ ] Tagged SSE frames normalize into internal events without unsafe casts:
  nested response ids, route/session ids, missing timestamps, item/message/call
  identities, and bare turn frames are handled by the documented deterministic
  rules; proven by verbatim fixture-driven SSE tests.
- [ ] The SSE HTTP handshake completes before snapshot acquisition, stream
  resources close on every exit path, and snapshot/history plus buffered/live
  SSE emits no duplicate item, text, or terminal events; proven by HTTP provider
  ordering, cleanup, and conformance tests.
- [ ] The fake server emits the tagged v0.9 wire shape rather than the internal
  normalized shape; proven by exact request/response assertions in HTTP and
  conformance tests.
- [ ] The wire allowlist retains exactly 52 accepted live event types and neutral
  vocabulary remains unchanged; child `session.created` and uncorrelated bare
  turns do not synthesize false lifecycle events; proven by types, mapper, SSE,
  and conformance tests.
- [ ] The post-v0.9 bundle-root fix is documented as unreleased operational risk
  and development `main` is not frozen; proven by source metadata and security
  documentation assertions.
- [ ] Only `@consiliency/omnigent-transport` advances to `0.5.0`; sibling package
  versions and `.github/workflows/publish.yml` remain unchanged; proven by git
  diff and package metadata assertions.
- [ ] The isolated packed consumer compiles with `types: []` and
  `skipLibCheck: false`, loads v0.9 fixtures, and imports only package-root
  exports; proven by `pnpm --filter @consiliency/omnigent-transport test:pack`.
- [ ] Full build, lint, typecheck, test, JSON validation, diff check, and roadmap
  validation pass at the exact reviewed atomic PR head; proven by the effective
  automation suite and exact-head CI receipt.

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
