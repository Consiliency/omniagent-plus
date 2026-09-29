# Detailed plan: Omnigent v0.15 transport accommodation

## Task and disposition

Refresh the proposed v0.14 accommodation to the latest published stable package,
Omnigent v0.15.0, without losing the predecessor's findings. This is a
**planning-only draft awaiting review and ownership gates**, not compatibility
certification, execution approval, a panel vote, or release authority. Plan Mode
was not active. No product changes, builds, tests, runtime installs, credential
access, live sessions, commits, pushes, merges, or publication occurred.

Planning base: `8d6b7c177f8ce10164b89375e37d927b0a28ad83`, branch
`codex/omnigent-v015-plan-20260922`, worktree
`/mnt/workspace/worktrees/omniagent-plus-v015-plan-20260922`.
Starting `git status --short --untracked-files=all` was empty.
The existing transport package and public npm `latest` are both 0.7.0; checked-in
support remains v0.12.0. No v0.15 compatibility claim is made here.

Predecessor provenance: read-only file
`/mnt/workspace/worktrees/omniagent-plus-v2-guard-20260912/plans/detailed-omnigent-v0-14-accommodation-20260921-1133.md`,
SHA256 `17da104104c8b788c7136a96c2426a8fa26696773bf60ba2a3a8ed11a055296d`.
It is not present on this branch and is not an implementation prerequisite.
All retained decisions and acceptance cases appear below; no relative link into
that protected GUARD worktree is required. That file was not changed.

Track the accommodation under omniagent-plus#19 and transport ownership under
omniagent-plus#25. Account switching and CLIProxyAPI evaluation belong to the
separate parent-owned lane and are explicitly excluded.

## Release authority and evidence

Research capture: 2026-09-22, completed at `2026-09-22T16:23:07.486Z`.
The companion [evidence record](evidence/omnigent-v0-15-upstream-20260922.json)
contains fetch URLs, byte digests, all added/removed names, property-level schema
and operation changes, local input hashes, and complete compare pagination.
Its SHA256 is `5493c223497c3db81fbbf4bb4ff4339df69bfca894a7d87d8483c88dfa2a3fe6`.
It is research evidence, not executor acceptance evidence.

| Authority | Observed result |
| --- | --- |
| [PyPI package metadata](https://pypi.org/pypi/omnigent/json) | Latest stable 0.15.0, Python >=3.12, wheel and sdist not yanked |
| v0.15 wheel publication | `2026-09-22T15:10:55.683969Z`; registry SHA256 `0881c9251dd753ebec140a0db00e5c2b24f7ee711c7e01b9e73e4b9d40ce1f15` |
| v0.15 sdist publication | `2026-09-22T15:11:02.411893Z`; registry SHA256 `23614c8b006c5f0ea4fdc218f73b8dafd8f0858ea278da6666f9b3329eed988a` |
| [v0.15 tag ref](https://api.github.com/repos/omnigent-ai/omnigent/git/ref/tags/v0.15.0) | Commit `c8b9b85f822f2c9203ff995c10f3cc49d064bbe5`; tagged pyproject version is 0.15.0 |
| [GitHub releases/latest](https://api.github.com/repos/omnigent-ai/omnigent/releases/latest) | Still v0.14.0, published `2026-09-15T13:06:10Z` |
| [GitHub target release](https://api.github.com/repos/omnigent-ai/omnigent/releases/tags/v0.15.0) | HTTP 404; tagged CHANGELOG's first release section is also v0.14.0 |
| [npm transport metadata](https://registry.npmjs.org/@consiliency%2Fomnigent-transport) | `latest=0.7.0`; candidate 0.8.0 unoccupied at capture, not reserved |

At the September 22 capture, package publication plus the matching stable
source tag established the proposed target despite absent GitHub release notes.
The table preserves that dated observation rather than rewriting its evidence.
Distribution hashes above are registry-reported;
wheel/sdist bytes were not downloaded or executed and wheel-to-tag equivalence
was not established. Unreleased `main` is neither target nor evidence of release.

Release-status addendum, checked 2026-09-28: the [formal v0.15.0 GitHub
release](https://github.com/omnigent-ai/omnigent/releases/tag/v0.15.0) was
published on 2026-09-24 and points to the same `c8b9b85f822f2c9203ff995c10f3cc49d064bbe5`
tag commit used for the contract inventory. GitHub now marks it latest; PyPI
still lists 0.15.0 as the stable release. The release notes describe upstream
product behavior, but do not replace tagged OpenAPI/source or local behavioral
tests as transport compatibility evidence. This addendum changes release
authority only: the target tag, contract delta, ownership prerequisites,
acceptance cases and current v0.12 support claim remain unchanged. Recheck
release and registry state at execution as prerequisite 3 requires.

| Tagged OpenAPI | Commit | SHA256 | Paths / operations / schemas / events |
| --- | --- | --- | --- |
| [v0.12.0][oas12] | `f04b0354fb5344c1ea8b92795ceb6760a9ad7595` | `2fad529777b266e54341cfa41934cb7fe211cad1d787afbacc4d16e6d38b7cdb` | 73 / 101 / 146 / 54 |
| [v0.14.0][oas14] | `fc89a3ba3c4698a7d742343b443a7b2bdc01120a` | `222c468fe0a269e92aa6faae08ea7081b5144ae227a2bdbc799b3af9077adb9c` | 85 / 113 / 159 / 56 |
| [v0.15.0][oas15] | `c8b9b85f822f2c9203ff995c10f3cc49d064bbe5` | `282eba5f5b253f399e8cef04e36ba798c348e7ddd23317ceff9847da8a95f48a` | 88 / 117 / 163 / 55 |

All three tag refs were rechecked. JSON was parsed structurally, object keys
sorted, and documentation annotations omitted only outside property-name maps;
actual properties named `title` remain visible. `format`, defaults, requiredness,
nullability, enums and discriminator changes are retained. Presence flags
distinguish missing keys from explicit null. Arrays are order-sensitive; union
membership is additionally inventoried by exact event literal.

Direct v0.12->v0.14: +12 operations, +12 paths, +13 schemas, +2 events,
no removals, 15 changed existing schemas. Direct v0.14->v0.15: +4 operations,
+3 paths, +5/-1 schemas, no added events, -1 event, 6 changed existing schemas.
Net v0.12->v0.15: +16 operations, +15 paths, +18/-1 schemas, +2/-1 events,
18 changed existing schemas; no operation or path removals.

The immutable v0.14/v0.15 GitHub compare reports divergence: 286 ahead, 2 behind.
All three commit pages were read (100 + 100 + 86; 286 unique SHAs), not just page
one. Its file list is capped at 300 and is **not** a complete source-diff audit.
The contract comparison is directly between tagged bytes, not merge-base output.
Only contract-affecting source paths were inspected; no exhaustive commit audit
or claim that every upstream behavioral change has been assessed is intended.

## Prerequisites and ownership

`specs/phase-plans-v2.md:37` says: "A newer official upstream release is a
separate accommodation decision." Lines 261-264 require freezing shared
`types.ts`, serialized exports, and no silent edits to DATA's public schemas.
This proposal changes only the raw upstream contract; neutral RuntimeEvent,
SessionHistory, capability, approval, lease and authority vocabulary is unchanged.

1. Obtain accepted GUARD and DATA interface/content-policy freezes before source
   edits. Parent rechecked [omniagent-plus#25](https://github.com/Consiliency/omniagent-plus/issues/25)
   on 2026-09-22: it remains open, with no accommodation ownership/freeze exception.
   Its [latest disposition](https://github.com/Consiliency/omniagent-plus/issues/25#issuecomment-5632408602)
   retains WIRE's DATA dependency and separates documentation from runtime fixes.
2. Schedule after DATA and before WIRE source execution, with explicit exclusive
   transport ownership recorded in omniagent-plus#25. If WIRE has begun, wait for
   its owner's release, rebase and amend/review assumptions. No competing writers.
3. Recheck accepted integration base, source hashes, public registries, tag refs,
   open accommodation work and owner state. Record exact owner/worktree/base.
   Probe `/etc/consiliency/team-host`, then `/mnt/workspace`, before creating the
   executor's isolated worktree; never execute in the primary or GUARD checkout.
4. Require a reconciled plan review before implementation. The user authorized
   Opus instead of exhausted Fable and a three-seat Opus/Astra/Grok board with
   Gemini recorded ABSENT. Preserve heartbeat-only monitoring. Use small file
   pointers only for seats with file-read tools; stage the full digest-bound plan
   for a no-tools seat. Bind new review evidence to this refreshed plan, not the
   predecessor.
   Current reader blockers are agent-harness#848 and agent-harness#934/#941;
   the old agent-harness#926 startup failure is not the active refusal reason.
   No further seat substitution, broker bypass, synthetic verdict or automatic
   diagnostic retry is authorized. Research workers are not panel reviewers.
5. Re-read DATA decisions. A changed public content/sequence contract, target
   hash, latest stable release, occupied npm version, or overlapping owner requires
   a narrow reviewed amendment, not silent retargeting or a new scope exception.

No account/auth policy, CLIProxyAPI, provider administration, canon/spec/gp/Portal,
harness runtime, coordinator, lease/lock, cache-retention redesign, resource
deadline repair, process supervision or automatic mutation-retry work is included.
Existing WIRE and broader v2 audit findings remain open under their own gates.
Parent alone registers manifest/handoff metadata; this lane writes only this plan,
its research evidence and ignored `.phase-loop` research scratch.

## Contract delta disposition

### Events and consumed schemas

| Delta | Disposition and acceptance group |
| --- | --- |
| `ErrorData.level` optional nullable error/info; source adds harness | Repair exact info omission; retain real-error behavior (A) |
| `MessageData.stream_message_id` optional nullable string | Add scoped durable/preview association through mapper/provider (B) |
| `ErrorEvent.source` adds harness; `FailedEvent.source` added, default execution | Preserve genuine failure/pre-allocation semantics; no live level inference (A/C) |
| `SessionBtwSidechatEvent`, `SessionCodexApprovalModeEvent`, union additions | Validate then identity-free passive drops, no control authority (C) |
| `ElicitationResolvedEvent.reason` absent/null/unanswered | Validate and preserve only optional raw metadata; no approval/cancel inference (C) |
| `CompactionData.window_id` adds string to integer/null; progress `started_at` optional nullable integer | Repeated progress remains non-content/nonterminal; no summary export (C) |
| `SessionSkillsEvent` and `session.skills` removed in v0.15 | Exact target inventory 55; retain old literal in backward-compatible 56-type accepted union as passive legacy input (C/E) |
| `SessionResponse.share_workspace_files` added in v0.14 | Ignore for neutral behavior; never grant filesystem sharing (E) |
| `SessionResponse.skills_status` added in v0.14, removed in v0.15 with `skills` | Preserve intermediate finding; final target has neither. Local normalizer does not require these fields; cover omission (E) |
| `SessionResponse.inference_configured=false`, nullable `inference_error`, `usage_included=true` added | Tolerate without lifecycle, credential or capability inference. No new public snapshot fields required (E) |
| GET/PATCH session add `include_usage=true` query option | Do not opt out or add public option. Existing requests retain default behavior; null usage is unknown, never zero (E) |
| `ErrorResponse` added; `ErrorDetail` removes null defaults from title/cause/remediation | Required code/message unchanged; preserve lossless unknown error body. Recovery keys only exact canonical nested code, not descriptive text (D/E) |
| Three consumed paginated GETs add 400 `ErrorResponse` | Bounded fresh-enumeration recovery for stale cursor only (D) |
| `RoutingDecisionData.task_description` optional nullable string | Existing extensible raw type tolerates it; omit from neutral events and route authority (E) |

### Other changed schemas and operations

| Delta | Disposition |
| --- | --- |
| `AutomaticSessionRenameResponse.reason` adds generation_failed | Administration only; fixture inventory, no rename capability |
| `ImportSessionRequest.host_id`, `LocalImportRequest.session_id` | Optional administrative inputs; never copied from generic create/send metadata |
| `LocalImportResponse.failures`, new `ImportFailureRef` | Import diagnostics only; no import/stream-import client |
| `SessionForkRequest.host_type`, sandbox_provider, workspace; v0.15 side_chat=false | No fork/side-chat creation method or harness override |
| `UpdateSessionRequest.approval_mode`, share_workspace_files | No new provider control serialization or inferred approval grant |
| `ServerInfoResponse.enabled_connections` newly required; sandbox_provider_capabilities additive | Server-info response inventory only; current transport does not consume that endpoint. No inferred supported capabilities |
| GET sessions `visibility=all` added in v0.14 | Keep existing query shape; default unchanged; include in drift checks |
| GET host harness model-options changes response to `HostModelOptionsResponse` | Observed discovery surface, not transport method |
| GET filesystem resource adds `download=false` and octet-stream response | Observed resource surface, no file-transfer adoption |

All 18 net changed schema names are represented above, including
`ServerStreamEvent`. The evidence retains both adjacent comparisons so the
intermediate `skills_status` addition is not lost in the net result.

### Added HTTP operations and schemas

All 16 operations below are **observed non-capabilities**, not implementation
work. No new endpoint method, credentials access or generic metadata passthrough.

| Introduced | Exact added operations |
| --- | --- |
| v0.14 extensions | GET `/v1/extensions`; GET `/v1/extensions/diagnostics`; GET `/v1/extensions/{extension_id}`; GET `/v1/extensions/{extension_id}/assets/{digest}/{asset_name}` |
| v0.14 credentials | GET `/v1/hosts/{host_id}/credentials/{provider}` |
| v0.14 imports/title/model | POST `/v1/imports/local/stream`; POST `/v1/sessions/{session_id}/agent-title`; POST `/v1/sessions/{session_id}/model-override/reset` |
| v0.14 GitHub resources | GET `/v1/sessions/{session_id}/resources/github`; GET `/v1/sessions/{session_id}/resources/github/changes`; POST `/v1/sessions/{session_id}/resources/github/preferences`; POST `/v1/sessions/{session_id}/resources/github/prs` |
| v0.15 | GET and PUT `/v1/projects/order`; GET `/v1/sandbox-providers/{provider}/harnesses/{harness}/model-options`; GET `/v1/skills` |

Added schema inventory: eight `Extension*` schemas (`ExtensionAssetErrorResponse`,
`ExtensionBrowserBundleResponse`, `ExtensionDiagnosticsResponse`,
`ExtensionListResponse`, `ExtensionLoadErrorResponse`, `ExtensionPageResponse`,
`ExtensionPrimaryNavigationResponse`, `ExtensionResponse`),
`HostModelOptionsResponse`, `ResetSessionModelOverrideRequest`,
`ResetSessionModelOverrideResponse`, the two passive event schemas above,
`ErrorResponse`, `ImportFailureRef`, `ProjectOrderRequest`, `ProjectOrderResponse`,
and `SkillsResponse`. Only passive events and cursor error envelopes require
transport behavior. Removed schema: `SessionSkillsEvent` (legacy fixture retained).

## Ordered implementation subplans

More than three behavioral concepts are involved, so execute the following as
separate bounded checkpoints in **one serialized transport ownership lane**.
Each checkpoint's tests must be accepted before the next. None independently
permits version-support docs or publication. All paths below are repo-relative;
`src/` in these tables means `packages/omnigent-transport/src/`.

### A. Informational history notices

Modify `src/types.ts` (`OmnigentPersistedErrorData`) and
`src/history-mapper.ts` (`mapOmnigentConversationHistory`). Add optional nullable
`level: "error" | "info" | null` and source `harness`. Before error lifecycle
handling, exact `level === "info"` emits nothing, starts no turn, marks no terminal
turn and cannot set provider lastError or release admission. Seen-item bookkeeping
may retain its durable ID. Missing/null/error/malformed levels keep the prior
real-error path; do not coerce or add broad history strictness.

Do not apply this rule to live `response.error`: its tagged schema has no level.
A later real failure/completion/text in the same turn must remain observable once.
Add tests in `src/history-mapper.test.ts` and `src/http-provider.test.ts` for
standalone info, info before content/real failure/completion, harness source,
and active leased admission remaining blocked after info-only history.
The predecessor's prior reproduction is retained as historical evidence only;
this run reconfirmed the source defect but did not rerun it.

### B. Explicit durable and preview message identity

Modify `src/types.ts` (`OmnigentMessageData.stream_message_id`),
`src/history-mapper.ts` (historical message seeds), `src/event-mapper.ts`
(`OmnigentHistoricalMessage`, `map`, `mapTextDelta`, `mapOutputItem`) and
`src/http-provider.ts` (`matchDeliveredTextGroups`, delivered-text bookkeeping,
`trimDeliveredHistoryText`, history/stream mapper seeding).

One nonempty string stream ID and its durable item ID identify one logical
message **within the same session and response**. Preserve public event IDs,
durable IDs and sequence contracts. Carry association into the provider's second
deduplication layer, not only the mapper. Use one consumable replay credit per
logical message; never seed independent credits under both IDs. Learn alias
metadata before dropping an already-seen durable output item where needed.

Explicit identity outranks text equality/prefix matching. Different explicit
IDs with identical text must remain distinct. Preview first then durable output
emits only the authoritative new suffix; snapshot/item first then delayed
preview suppresses duplicate chunks, including repeated/chunked late previews.
Keep finalized suppression in the existing mapper/subscription lifecycle; no
global cache or retention-policy change. New authoritative item content remains
eligible for reconciliation; arbitrary equal identity-free text stays lossless.
Absent/null/empty/non-string stream fields create no alias. Legacy replay
suppression remains for an exact message ID or validated alias, and for
identity-free text. An alias-free historical durable ID and a different,
nonempty preview message ID are **not** enough to suppress by text alone:
emit the preview in order, accepting a possible duplicate until an alias is
known. This is the reviewed lossless exception to the former cross-namespace
text fallback. Because SSE is live-tail and runtime events are append-only,
buffering or retrospectively refunding guessed matches cannot guarantee both
immediate output and ordered, lossless delivery across subscriptions.
Conflicting aliases (one stream ID, multiple durable items) invalidate
that association and preserve content instead of suppressing by guesswork.

Add cases to `src/history-mapper.test.ts`, `src/event-mapper.test.ts`, and
`src/http-provider.test.ts`: both orderings, repeated/chunked previews, identity
collision, cross-session/response isolation, repeated equal text under different
IDs, authoritative suffix, all invalid/legacy field variants, afterSequence
reconnect, pending identities, rejected turns and cancellation quarantine.
Assert text, counts, order, cursor/sequence and state. If conflict-safe behavior
requires a general replay redesign, stop for a separately reviewed split;
unresolved identity cases block v0.15 acceptance, not just a follow-up note.

### C. Passive events and target versus historical vocabulary

Modify `src/types.ts`, `src/sse-stream.ts` (`hasValidEventShape`,
`OmnigentSseNormalizer.normalize`), `src/event-mapper.ts` (early drop), and
`src/http-provider.ts` (subscription early exit).

Keep every old accepted literal, including `session.skills`; add only
`session.btw_sidechat` and `session.codex_approval_mode`. The accepted raw union
is consequently 56, while the exact v0.15 fixture inventory is 55. Do not claim
the union count is the target count or delete old fixture inputs to make them equal.

Validate sidechat's required conversation_id/question/answer as strings and
optional truncated as boolean; empty content strings are valid. Approval-mode
requires conversation_id/approval_mode strings; no closed approval-mode enum.
Malformed frames use existing `invalid_event_shape` reporting. Both normalize
to synthetic identity and configured session ID before any stateful identity
handling. Drop question/answer and upstream identity/control extras. Return
before mapper dedup, pending-item/cancellation/fence bookkeeping. Neither event
is a grant, request for approval, response completion, lease, or mode command.
Retained `session.skills` likewise remains a passive legacy no-op; give it the
early drop path without inventing new legacy shape requirements.

Extend elicitation resolution validation to absent/null/`unanswered` reason;
malformed reasons skip, valid non-null reason stays optional raw metadata only.
Preserve existing action validation and early exits. Compaction integer/string/
null window IDs and repeated progress remain non-content/nonterminal no-ops;
no summary export or active-turn release. Genuine harness failures and
pre-allocation failures keep current conservative identity attribution.

Modify `src/sse-stream.test.ts`, `src/event-mapper.test.ts`,
`src/http-provider.test.ts`, `src/history-mapper.test.ts` and `src/types.test.ts`.
Include forged response/item/turn/control identities, malformed shapes, no
dedup poisoning, no fence writes, sidechat content omission, legacy skills, all
reason variants, repeated compaction, and a genuine failure after passive input.

### D. Deleted pagination cursor recovery

Modify only `src/http-client.ts` (`requestAllPages`) for the production repair;
add cases to `src/http-client.test.ts`, `src/http-provider.test.ts` and
`src/failure-mapper.test.ts`. Do not add a general retry abstraction or public
retry option. Use the existing injected fetch test pattern, not a fake-server
refactor. `failure-mapper.ts` itself is unchanged by this subplan.

The [SQL store][store15] resolves item and conversation cursor rows and raises
`StaleCursorError` when absent. [Error mapping][errors15], [route metadata][routeerrors15]
and [app exception handler][app15] establish HTTP 400 with
`{"error":{"code":"stale_cursor","message":"..."}}`.
The [items/children routes][items15] and [session-list route][core15] use it.
The [tagged regression test][cursor-test15] demonstrates delete-between-pages
recovery in source; it was read, not executed. The generic in-memory pagination
helper ignores unknown IDs and must not be substituted for this SQL evidence.

Freeze the following local policy: **one restart, at most two complete walk
attempts per invocation**, independent per concurrent call. This is a conservative
adapter decision, not a claim about upstream's separate retry budgets.
Only recover inside `requestAllPages`, after a request carrying a nonempty `after`
cursor, for an `OmnigentHttpError` with status 400 and a non-array object body
whose non-array `error` object has exact string code `stale_cursor`.
Discard all accumulated normalized rows, `after` and seen-cursor state; restart
at page one with the same path/limit=1000/order=asc. Never reissue the dead cursor
as the recovery action, merge old/new partial lists, or mutate shared provider
state from an abandoned walk. Preserve existing malformed-page/stagnant-cursor
checks. On budget exhaustion or any other error, propagate the encountered error
with its lossless body; return neither partial rows nor successful empty history.

Do not recover based on message text, title/cause/remediation, lookalike codes,
string/null/array bodies, FastAPI detail variants, arbitrary HTTP 400, wrong_replica,
first-page errors without a cursor, 404, 422, 429 or 5xx. No create/send/PATCH/
DELETE/control retry is added. Existing `mapHttpFailure` maps exhausted 400 to
nonretryable validation when explicitly invoked; no new category, account switch,
route decision, or approval authority. Broad nested-error classification repair
is not necessary for this exact-code pagination branch and is not included.

All three consumers need cases: `listSessions` (including provider list/health),
`getHistory` (readHistory and stream bootstrap/reconnect), and `listChildSessions`.
Test stale on a later page then success, repeated stale with exact bounded request
counts, first-page error, nonmatching envelopes, legitimate empty final page,
stagnant/empty continuing pages, concurrent independent walks, and preserved body.

The [SSE route][events15] is live-tail, not paginated cursor replay. Local
`streamEventsUntilCancelled` opens SSE then fetches complete history, maps/seeds
only after successful reads, and closes in `finally`. `afterSequence` is a local
neutral sequence, not an upstream `after` or Last-Event-ID. Keep that ordering.
Provider tests must prove: successful restart seeds exactly once; exhausted read
yields no partial events, invents no failure/completion/admission release, leaves
existing replay/turn/fence state unchanged except legitimate shared-fence reads,
and closes/removes the opened stream. A later explicit subscription can succeed
with monotonic sequences and no duplicate finalized previews. This does not add
automatic whole-stream reconnection or claim an atomic database snapshot.

### E. Contract artifacts and qualification

This final checkpoint changes contract evidence, docs and packaging, not a fifth
runtime feature. Start only after A-D behavior and retained regressions pass.

| Exact file | Entity/action and reason |
| --- | --- |
| `packages/omnigent-transport/src/contract-fixtures.ts` | Add `OmnigentV015WireFixture` and `loadOmnigentV015WireContract`; retain every existing loader/type |
| `packages/omnigent-transport/src/index.ts` | Export new loader; preserve old exports |
| `packages/omnigent-transport/src/conformance.test.ts` | Separate latest authority assertions from historical fixture assertions; test target inventory and all dispositions |
| `fixtures/omnigent/http/v0-15-wire-contract.json` | Create sanitized source-derived samples, explicitly labeled adversarial vectors, target 55-event list, schema/operation deltas, commits/hashes and cursor envelopes |
| `fixtures/omnigent/discovery/source-metadata.json` | Refresh current target to the v0.15.0 package, tag and formal GitHub release; retain the September 22 missing-release observation only as dated historical evidence |
| `fixtures/omnigent/discovery/http-surface.json` | Refresh inventories, removed skills surface, precise restart/replay semantics and non-capabilities |
| `fixtures/omnigent/discovery/cli-surface.json` | Refresh tagged authority only; preserve canonical server lifecycle |
| `fixtures/omnigent/discovery/capability-probes.json` | Record observed additions without supported capability expansion |
| `fixtures/omnigent/fake-server/scenarios.json` | Add v0.15 scenario references; retain historical scenarios |
| `scripts/check-omnigent-openapi-delta.mjs` | Add fixed v0.12->v0.14, v0.14->v0.15, v0.12->v0.15 dispatch, immutable SHA/digest and exact semantic assertions; keep old default v0.11->v0.12 valid |
| `scripts/smoke-packed-omnigent-transport.mjs` | Test new loader and real provider behavior from installed tarball; preserve old loader/fixture JS and TS consumer checks |
| `docs/omnigent-contract.md` | Explain current versus historical vocabulary, info omission, identity, restart bounds, authority and non-capabilities |
| `docs/omnigent-transport.md` | Document tested behavior and remaining WIRE/consumer obligations, without claiming v2 closure |
| `docs/omnigent-upstream-readiness.md` | Replace stale target/watchlist with exact published target and explicit tested/unrun limits |
| `packages/omnigent-transport/package.json` | Candidate 0.8.0 only after fresh registry preflight and successful qualification; no sibling bump |

Do not create a v0.14 package/loader merely because the predecessor planned one:
none exists at this base. Preserve its findings in the intermediate delta evidence
and v0.15 behavioral corpus. Leave v0.9/10/11/12 fixture bytes and loader exports
intact. Move only latest-global authority assertions; do not erase old behavior
tests when `conformance.test.ts` is updated. Check all 55 target events have a
mapping/drop disposition, with legacy `session.skills` recorded separately.

Existing copy-omnigent-fixtures.mjs already packages fixtures; do not alter its
mechanism. No source maps, full upstream checkout, whole OpenAPI documents or
third-party implementation files are added to Git. No lockfile, dependency,
workflow or root-script edits unless a demonstrated requirement receives a
reviewed ownership amendment. Keep historical v2 authority records intact;
parent/WIRE owner records the accepted new input through their own handoff.

Additive/removed field tests must cover absent skills, absent/null descriptive
errors, usage omitted as unknown, and routing task_description staying out of
neutral exports. Keep required-agent JSON creation and exact message body; tagged
source still distinguishes project-aware create from legacy required agent_id.
Canonical CLI stays `omnigent server --background`, `server status --json`,
`server stop`; hidden server-start alias is not adopted. Tagged tmux/native-wrapper
and upgrade behavior may be documented as operator requirements, never new
provisioning or transport execution. No upstream runtime installation is required
for fake-server/packed-consumer qualification.

## Verification and acceptance

**Performed now:** read-only repository/source inspection, public metadata fetches,
tag checks, SHA256 computation, parsed tagged OpenAPI comparison and complete
compare commit pagination. **Not run:** any repository/upstream tests or builds,
behavioral reproduction, live provider smoke, installed tarball checks or dry-run
publication. Source inspection predicts gaps; it is not a test pass.

Later executor commands below run from its isolated accepted integration base.
Use existing Node >=22 and pnpm 11.1.1 toolchain; do not install/run upstream.
Capture an unchanged baseline first. Record exact failing nodes/causes and
baseline comparison, not "green" for matching failures. Add `v0.15 A`, `v0.15 B`,
`v0.15 C`, `v0.15 D`, or `v0.15 E` to new test titles; zero-selected or skipped-only
results fail acceptance. Establish expected red tests before repair; separately
record cases already passing, such as tolerating unused additive response fields.

```sh
# V0: implementation-time baseline and compiled workspace dependencies
pnpm install --frozen-lockfile
pnpm build

# V1: run after each subplan, replacing the final filter with its literal group
pnpm exec vitest run packages/omnigent-transport/src -t 'v0.15 A'
pnpm exec vitest run packages/omnigent-transport/src -t 'v0.15 B'
pnpm exec vitest run packages/omnigent-transport/src -t 'v0.15 C'
pnpm exec vitest run packages/omnigent-transport/src -t 'v0.15 D'
pnpm exec vitest run packages/omnigent-transport/src -t 'v0.15 E'

# V2: all transport regressions, including unchanged CLI/hybrid/process tests
pnpm exec vitest run packages/omnigent-transport/src
pnpm --filter @consiliency/omnigent-transport typecheck

# V3: only after fixed-pair branches are implemented
node scripts/check-omnigent-openapi-delta.mjs
node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.14.0
node scripts/check-omnigent-openapi-delta.mjs v0.14.0 v0.15.0
node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.15.0

# V4: accepted GUARD full gate, built installed consumer, real publication dry run
pnpm verify
pnpm --filter @consiliency/omnigent-transport test:pack
NPM_PUBLISH_DRY_RUN=1 bash scripts/publish-package-if-needed.sh packages/omnigent-transport
```

`pnpm verify` does **not** exist at planning base 8d6b7c1. It is conditional on
accepted GUARD providing that non-skipping full gate, including required service
setup. If GUARD chooses another command, amend this plan's V4 and suite_command
with its accepted exact command before any automation starts. Do not synthesize
a reduced fallback suite or edit GUARD's root scripts from this lane.
Likewise the three new V3 pairs currently fail the script's fixed v0.11/v0.12
assertions; their implementation is E, not a claimed current capability.

V3 must compare full names and changed requiredness/nullability/enums/defaults,
including removed property keys, against immutable commit bytes and digests.
Retain actual property names when stripping annotations; preserve format as
meaningful in the new pair checks. Unknown pairs and fetch/hash failures fail.
Old default's existing behavior remains a separately preserved regression.

V4 packed smoke must exercise info/no-error state, explicit identity in both
orders, passive input isolation and cursor restart/exhaustion through the
installed package, with no workspace source fallback. Capture tarball SHA256
and independent JS/TypeScript imports. The dry-run helper can exit zero when a
version is already published; that is **not** proof `npm publish --dry-run` ran.
If 0.8.0 becomes occupied, stop and reconcile version choice, then re-review
material changes. No publication, tag, workflow dispatch or credentialed smoke
is authorized by these acceptance commands.

Executor evidence path (not created during planning):
`plans/evidence/omnigent-v0-15-accommodation.json`. Record exact plan/source/head
hashes, per-command exit codes and selected/skipped cases, red/green results,
baseline exceptions, owner/freeze receipts, reviewer receipts/reconciliation,
tarball digest and whether publish dry-run actually executed. Operational manual
evidence stays labeled manual; a runner-stamped plan amendment is required before
automation relies on any approved operational proxy. No fabricated stamp or vote.

```yaml
automation:
  status: awaiting_review_and_freezes
  execution_authorized: false
  suite_command: pnpm verify && node scripts/check-omnigent-openapi-delta.mjs && node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.14.0 && node scripts/check-omnigent-openapi-delta.mjs v0.14.0 v0.15.0 && node scripts/check-omnigent-openapi-delta.mjs v0.12.0 v0.15.0 && pnpm --filter @consiliency/omnigent-transport test:pack
  suite_available_at_planning_base: false
  prerequisites: accepted GUARD gate command, accepted DATA freeze, exclusive transport ownership, reconciled plan review
  evidence_path: plans/evidence/omnigent-v0-15-accommodation.json
  publication_authorized: false
```

- [ ] A: Info history emits no lifecycle failure/admission release/lastError;
  true errors still terminate once, including harness source. V1-A and V2.
- [ ] B: Scoped explicit identity is lossless and duplicate-free in both orders;
  collisions, repeated equal text, legacy fields and fences retain behavior. V1-B/V2.
- [ ] C: Passive events/reasons and compaction cannot poison identity, dedup,
  cancellation, approval or content export. V1-C/V2.
- [ ] D: Exact stale-cursor recovery is bounded and restarts fresh for all three
  GET consumers; exhaustion closes bootstrap SSE without partial output/state
  corruption; mutations and unrelated errors never retry. V1-D/V2.
- [ ] E: Exact 55-event target and 56-type accepted historical union are distinct;
  every schema/HTTP delta has a disposition and old fixture bytes/loaders remain.
  Current discovery metadata identifies the formal v0.15.0 GitHub release and
  does not present the September 22 absence as current. V1-E/V2/V3 plus diff
  inspection against the recorded fixture baseline.
- [ ] Required-agent create/send, CLI lifecycle and capability/content boundaries
  are unchanged; removed/additive fields need no new public authority. V2/V3/V4.
- [ ] Accepted full gate, installed-consumer behavior and actually executed dry
  run pass for the exact candidate; no skipped live test is called live proof. V4.
- [ ] Parent records exact-head plan/implementation review, owner/freeze receipts
  and reviewed amendments. Manual evidence review is mandatory; research, green
  tests or an unavailable panel seat never substitutes for approval.

## Parent briefing

New required work beyond v0.14: deleted-cursor recovery, target-versus-legacy
event inventory, removed snapshot skills fields, and the additive response/error
contract regressions. Preserve notice/identity/passive-event fixes in full.
The formal GitHub release now confirms the v0.15.0 target; it remains
unsupported locally until implementation and qualification. GUARD/DATA/WIRE
ownership and review gates are outstanding, not waived by this refresh.

Deliverables are this plan and its companion research JSON only. Ignored scratch
scripts/downloads under `.phase-loop` are research aids, not Git artifacts.
No manifest, handoff, predecessor, product source, fixture or other lane was
edited. Parent owns integration/registration and the independent CLIProxyAPI
result. Report planned, implemented, tested, reviewed, committed, merged and
published as separate states; only planning/research is complete here.

[oas12]: https://raw.githubusercontent.com/omnigent-ai/omnigent/f04b0354fb5344c1ea8b92795ceb6760a9ad7595/openapi.json
[oas14]: https://raw.githubusercontent.com/omnigent-ai/omnigent/fc89a3ba3c4698a7d742343b443a7b2bdc01120a/openapi.json
[oas15]: https://raw.githubusercontent.com/omnigent-ai/omnigent/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/openapi.json
[store15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/stores/conversation_store/sqlalchemy_store.py
[errors15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/errors.py
[routeerrors15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/server/routes/_errors.py
[app15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/server/app.py
[items15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/server/routes/sessions/routes_items.py
[core15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/server/routes/sessions/routes_core.py
[events15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/omnigent/server/routes/sessions/routes_events.py
[cursor-test15]: https://github.com/omnigent-ai/omnigent/blob/c8b9b85f822f2c9203ff995c10f3cc49d064bbe5/tests/server/integration/test_sessions_deleted_cursor_truncation_e2e.py
