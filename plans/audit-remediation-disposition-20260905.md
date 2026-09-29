# Code review disposition, 2026-09-05

Source: [Consiliency/omniagent-plus#18](https://github.com/Consiliency/omniagent-plus/pull/18),
`docs/code-review-2026-09-01.md`, and the
[current-source reconciliation](https://github.com/Consiliency/omniagent-plus/pull/18#issuecomment-5553575784).
The audit examined `9b66d53`; reconciliation examined the v0.12 implementation
and the audit merge `da9f6eb`. These are historical observations, not required
future checkout hashes. Recheck each implementation target when its plan starts.

This matrix accounts for all 55 named findings plus four cross-cutting sections.
No implementation finding is closed by writing this document. The roadmap is
`specs/phase-plans-v2.md`. The issue index below owns external status, while
this table owns disposition.

## Disposition and priority

- **R**: reproduced with synthetic data against current implementation during
  the merge review. The linked reconciliation records the method and limits.
- **C**: supported by current source inspection; behavioral regression still
  required before the fix.
- **Q**: partially valid, mixed scope, or dependent on a contract decision.
- **N**: retained from the historical audit; needs a current targeted check.
- **I**: intentional design to retain, with documentation or tests as needed.
- **S**: superseded historical detail, not evidence that the entire finding is fixed.

Priority is separate from disposition: **A** is correctness, data-loss, or
destructive-operation work to address before affected integration/release;
**B** is reliability and operational completeness; **C** is measured hygiene.
The audit's original P0/P1/P2 labels remain in the source document. A known
bounded slowdown is not automatically more urgent than record loss or deletion
of the wrong worktree. Unknown claims are not silently promoted to confirmed.

## Tracking issues

| Track | Primary scope | GitHub issue |
| --- | --- | --- |
| ROADMAP | Disposition, dependencies, decisions, final acceptance | [omniagent-plus#19](https://github.com/Consiliency/omniagent-plus/issues/19) |
| GATES | HY-1, HY-2, HY-5, HY-6 | [omniagent-plus#20](https://github.com/Consiliency/omniagent-plus/issues/20) |
| CONTENT | CC-1 through CC-7, SL-10, ID-2 | [omniagent-plus#21](https://github.com/Consiliency/omniagent-plus/issues/21) |
| LEDGER | SL-1 through SL-7, SL-9, SL-12 | [omniagent-plus#22](https://github.com/Consiliency/omniagent-plus/issues/22) |
| ROUTING | CO-1 through CO-8, CLI-1 through CLI-4 | [omniagent-plus#23](https://github.com/Consiliency/omniagent-plus/issues/23) |
| LEASES | SL-8, SL-11, WL-1 through WL-7 | [omniagent-plus#24](https://github.com/Consiliency/omniagent-plus/issues/24) |
| TRANSPORT | TR-1 through TR-9 | [omniagent-plus#25](https://github.com/Consiliency/omniagent-plus/issues/25) |
| INTEGRATION | Sections 3.1 through 3.4 | [omniagent-plus#26](https://github.com/Consiliency/omniagent-plus/issues/26) |
| PACKAGING | HY-3, HY-4, ID-1 | [omniagent-plus#27](https://github.com/Consiliency/omniagent-plus/issues/27) |

Related findings share an issue; each checklist preserves individual audit IDs.
Phase plans may split these into smaller PRs without duplicating ownership.
Cross-track references do not create a second owner for the same fix.

## State ledger

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| SL-1 | C / B | `append-only-store.ts:appendRecord` rescans and rebuilds indexes. Preserve multiprocess correctness when optimizing; benchmark append and replay separately. Do not trust a stale manifest as sole sequence authority. | DATA |
| SL-2 | R / A | `withFilesystemLock` times out on an abandoned file. Recovery must prove ownership/liveness and avoid deleting a replacement lock; age alone is insufficient. Legacy identity-less or otherwise unprovable locks remain blocked with a bounded diagnostic; manual removal and operator break-lock are unsupported by this roadmap. Retain the locked state and evidence. | DATA |
| SL-3 | C / A | Ledger append and `schema.ts:writeJsonAtomic` lack sync calls. Specify supported crash/durability guarantees and directory-sync behavior; test fault ordering. | DATA |
| SL-4 | R / A | Restoring a pre-append manifest then reopening produces duplicate sequences. Recover monotonic allocation across crash, compaction, and concurrent writers. | DATA |
| SL-5 | R / A | A complete newline-terminated, schema-invalid tail is truncated. Separate incomplete syntax from invalid complete records; preserve rejected bytes and report corruption. Repair before content validation tightens. | DATA |
| SL-6 | C / B | `initialize` writes indexes/manifest for read commands. Add an explicit read path; verify file contents and timestamps remain unchanged. | DATA |
| SL-7 | N / B | Audit identifies first-versus-latest session selection and unscoped route replay. Prove with repeated sessions and unrelated tasks before changing ordering. | DATA |
| SL-8 | Q / B | `CoordinationStore` still exports a separate API and returns empty maps on schema mismatch. Inventory external consumers and migrate/deprecate explicitly; no blind deletion or lease-contract merger. | COORD |
| SL-9 | N / B | Retention is reported to orphan dependent records. Test active sessions/leases and document reference protection before optimizing. | DATA |
| SL-10 | C / A | `EvidenceStore.save` passes label/path through; artifact-ref validation returns early. Use the common content boundary and positive/negative path corpus. | DATA |
| SL-11 | C / A | SQL acquire/renew/query trusts request time; fast clients can change expiry. Use server-owned time and test skew against real local PostgreSQL. Pagination, acknowledgement semantics, event lookup indexing, and retention are separate B-priority acceptance items. `createSupabaseCoordinationChannelFromEnv` must classify absent/empty/whitespace configuration without constructing an invalid client or disclosing values; a valid synthetic configuration is the positive control. | COORD |
| SL-12 | C / B | `migrateStoreManifest` accepts any schema version that shape-parses. Test newer-version rejection and legitimate historical migration. | DATA |

## Core contracts and content

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| CC-1 | R / A | Colon assignment, URL userinfo, and PKCS#8 header misses reproduced. Original 18/23 measurement is historical. One shared corpus must include safe lookalikes; no regex claims universal secret detection. | DATA |
| CC-2 | C / A | Builders scan while packet schemas validate shape. Guard untrusted construction, persistence, and rendering without modifying external canon. Invalid old records must not be silently deleted (SL-5). | DATA |
| CC-3 | Q / A | Core unknown payload fields lack a common recursive content boundary; identity-isolation already has a walker. Apply policy at explicitly owned boundaries, retaining content-enabled runtime data. | DATA |
| CC-4 | Q / B | Unknown-field and type/schema consistency policy needs an explicit decision. Blanket `.strict()` would change additive compatibility; scope rejection to owned inputs and prove external extension behavior. | DATA |
| CC-5 | Q / B | Workspace paths intentionally permit absolute values while evidence paths are stricter. Freeze the operational-versus-exported path policy; do not break worktree placement by globally relativizing. | DATA |
| CC-6 | N / B | Historical fake-provider lifecycle/sequence findings need concurrency and interior-gap tests; fix simulation behavior before integration relies on it. | DATA |
| CC-7 | Q / C | Mixed request bounds, truncation, export, and payload-detection proposals. Split required boundary fixes from optional API expansion; test JSON lookalikes and byte limits. | DATA |

## Transport

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| TR-1 | R / A | Text events are labeled `metadata_only`. DATA freezes content/posture policy; WIRE must make public stream/history labels truthful, proven through the independently packed transport: raw text is `content_allowed`, actually sanitized content may be `content_redacted`, and `metadata_only` omits raw content. Keep field-allowlisted projections; documentation alone cannot close this finding. | WIRE |
| TR-2 | R / A | `/gateway/` is discarded by URL construction. Test root/prefixed bases, query, escaping, and trailing slashes through the client. | WIRE |
| TR-3 | C / A | HTTP fetch receives no abort signal from the client. Add bounded request/body-read deadlines and cancellation; retries require idempotency-aware policy, not automatic mutation replay. | WIRE |
| TR-4 | C / B | Provider and mapper maps retain session/turn state. Bound caches while preserving late acknowledgements, reconnect, cancellation quarantine, and successful idempotency semantics. | WIRE |
| TR-5 | C / B | Parser frame buffer has no cap and frame splitting omits bare CR. Use chunk-boundary/UTF-8/abort/oversize tests. Preserve trailing spaces and additional leading spaces in SSE `data:` values, removing only one optional space immediately after the colon; prove identical results when the field is split across chunks. | WIRE |
| TR-6 | Q / B | Ignoring upstream operator/approval events is intentional. Document a complete mapping/drop table and bounded diagnostics; no generic public event or authority capability without an owned contract decision. | WIRE |
| TR-7 | Q / B | Cold-start memoization and lifecycle wiring need tests. Exclusive lease/fence requirements for destructive session mutations are intentional safeguards; preserve them. INTEG owns supervision. | WIRE |
| TR-8 | N / B | Historical CLI parse/exit error differences need malformed-output and nonzero-exit probes; preserve bounded, sanitized typed failures. | WIRE |
| TR-9 | Q / B | Split nested-field precedence, error-body bounds, fake-server handling, and maintainability. Static capability declaration is not live certification. WIRE owns correctness; PREP owns distribution cleanup. | WIRE |

## Routing and CLI

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| CO-1 | R / A | Past `resetAt` still blocks. Evaluate with an injected clock, specify missing/invalid reset and hard-stop behavior, and persist transition evidence at the runtime owner. | COORD |
| CO-2 | R / A | Missing preferred identity becomes an `explicit_override` with no fallback. Reject or explicitly report substitution under the existing fallback policy. | COORD |
| CO-3 | Q / A | Send-turn lacks create-time target fields. Compare the decision with the established session's identity/provider/harness; copying the create assertion would be ineffective. | COORD |
| CO-4 | C / B | Retry helpers expose budget decisions but no maintained runtime counter/backoff owner. Freeze one bounded policy here; INTEG owns lifecycle scheduling and settlement. | COORD |
| CO-5 | N / B | Historical Retry-After integer/date/negative cases need targeted parsing tests with a deterministic clock. | COORD |
| CO-6 | C / A | Library classification excerpts are raw, while CLI sanitizes again. Enforce CONTENT policy at publication/persistence boundaries; anchor the header allowlist. | COORD |
| CO-7 | Q / B | `incrementActiveTurns` clamps negative deltas. Its name permits increment-only intent; supply explicit settlement/decrement behavior and prove balanced counts rather than silently changing undocumented semantics. | COORD |
| CO-8 | Q / B | Replay applies one latest classification to every decision; other scoring/confidence/error claims need individual cases. Do not replace parse with silent skipping of corrupt records. | COORD |
| CLI-1 | Q / B | `--record` can acquire a coordination lease. It still does not launch a provider. Freeze dry-run/record/arbitrate semantics and expose actual side effects in command help/docs. | COORD |
| CLI-2 | C / B | Backend failures collapse into availability categories. Preserve bounded categorical causes without exposing credential or response payloads. | COORD |
| CLI-3 | N / B | Preflight supplies empty host env. Establish intended allowlist source and read/write semantics before changing injection behavior. | COORD |
| CLI-4 | Q / B | Separate enum validation and accurate command/state-root errors from phase-label compatibility and active-turn integration. Avoid renaming existing wire literals as hygiene. | COORD |

## Worktree leases

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| WL-1 | C / A | Cleanup accepts an override path and recursive fallback. Validate managed-root containment, symlinks, actual registered worktree, and ownership immediately before deletion; never delete arbitrary test/host paths. | COORD |
| WL-2 | C / A | CLI reads both token and expected token from the same registry. Decision 3 governs every destructive path: independent holder proof is required, including for a documented operator action, together with the same path/liveness checks. No operator path bypasses holder evidence. | COORD |
| WL-3 | N / B | Missing directories reportedly block cleanup forever. Add a non-deleting metadata-reconciliation path with explicit absence proof. | COORD |
| WL-4 | C / A | Release omits a ledger transition; multiple files can diverge. DATA freezes event/replay recovery; COORD implements crash-consistent acquire/renew/release projection. | COORD |
| WL-5 | Q / B | An expired lease need not prove a live writer has stopped. Reconcile collisions with holder liveness and recovery policy; do not authorize cleanup solely from TTL. | COORD |
| WL-6 | Q / A | Malformed JSON already throws (reproduced). Wrong schema can yield empty state, and valid-schema structure is insufficiently checked. Test those exact paths; retain missing-file initialization. | COORD |
| WL-7 | Q / B | Split log growth, read locks, reacquire semantics, PID reuse, and diff accounting. A reused PID blocking deletion is safe uncertainty; child-process coverage percentages alone are not failures. | COORD |

## Identity and distribution

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| ID-1 | C / B | Relative imports cross into transport source. Use a supported public type export and independent package resolution; keep identity dependency direction intact. GUARD defaults to the three exact existing type-only edges specified by CASE-HY-6; no forward source edit is authorized. PREP owns the source fix, independent packaging proof and removal of the baseline under omniagent-plus#27. | PREP |
| ID-2 | Q / B | Allowlist already exists. Validate dangerous inherited settings in context; do not globally prohibit required PATH/GIT configuration. Remove secret-value samples from diagnostics. Profile validation tests own duplicates/malformed input. | DATA |
| HY-1 | C / A | Only release/dispatch CI exists; lint/typecheck are absent there. Share one full gate between PR and publication, including real failure propagation. Reconcile fleet offload conventions before selecting expensive runner topology. | GUARD |
| HY-2 | C / A | License metadata/file absent; two repository URLs are historical. No license is inferred from dependencies. Record a maintainer choice and update affected distributions before shipping; missing optional metadata alone is not a P0. | PREP |
| HY-3 | Q / C | Separate disposable logs from retained handoffs, plans, and conformance evidence. Sanitize deliberate sample paths as needed; never blanket-delete governance history. | PREP |
| HY-4 | Q / B | `0.6.0` expectation is S (now `0.7.0`); hardcoding remains. Keep `tsx` for source CLI and declaration dependencies until isolated consumer checks prove a replacement. Do not delete canonical conformance copies without ownership analysis. | PREP |
| HY-5 | Q / C | Audit covers explicit config gaps, not absence of Vitest defaults. Add risk-driven coverage/timeouts and targeted type-aware rules; measure before changing pools/build architecture. | GUARD |
| HY-6 | Q / C | Some source/doc checks enforce real boundaries. Replace only with equivalent assertions and keep conformance; dependency rules must catch new relative escapes. GUARD records only the three exact existing ID-1 edges in CASE-HY-6 with positive/negative controls; PREP fixes them and removes the baseline. No broad exemption or failing full gate is deferred until PREP. | GUARD |

## Cross-cutting ownership

| Source section | Disposition | Required outcome | Phase |
| --- | --- | --- | --- |
| 3.1 | C / A for claimed end-to-end behavior | Explicit recorder above the provider, durable session/turn/event path, metadata-only CLI replay after restart, failure/idempotency recovery. Existing transport remains independently consumable. | INTEG |
| 3.2 | Q / B | Identify timer/counter owner and consumer obligations; an injected primitive is legitimate, an unimplemented claim is not. Either implement the scoped consumer loop or document unsupported behavior with tests. | INTEG |
| 3.3 | Q / B | CASE-3.3 assigns shared-scanner work and explicitly defers broader helper consolidation by owner; correctness fixes and public-import repair remain required. Retain distinct lease semantics and sole store authority; no file-count-only rewrite. | DATA, COORD, WIRE, PREP |
| 3.4 | I with integration gap | Keep injection and library boundaries. Add an explicit reference/operator composition instead of importing ledger or harness internals into transport. | INTEG |

## Decisions to close in TRIAGE

1. Confirm every N/Q item's actionable subclaims with named acceptance cases.
2. Freeze content versus metadata export, corruption/recovery ordering, session
   identity checks, and worktree versus off-device lease ownership.
3. Document the license decision owner; this gates PREP/SHIP, not unrelated fixes.
4. Confirm the narrow operator composition and its supervision duties; approvals
   remain governed by existing authority contracts.
5. Assign CI execution topology from the fleet plan hub and current repo support;
   no guessed external dependency or silent skip may produce a green gate.

## Evidence limits

Merge-review repros used synthetic strings, fake HTTP fetch, and temporary
ledger roots. No real secrets, destructive worktrees, live providers, or live
Supabase were involved. Performance numbers and full-suite counts in the
historical audit were not rerun. This roadmap-authoring run executes only
document/coverage validation; phase plans must supply the behavioral tests.

## TRIAGE candidate, 2026-09-09

Status: proposed for review, not an accepted interface freeze. This section
extends the existing disposition authority; it does not replace the historical
audit or create a second finding tracker. R/C/N/Q statuses above retain their
original evidence meaning. The cases below are requirements, not test results.
No runtime remediation has landed after the audit merge. Draft
[omniagent-plus#28](https://github.com/Consiliency/omniagent-plus/pull/28)
published the roadmap; earlier tracker comments saying it had no PR are stale.

### Proposed compatibility decisions

1. **Content and paths (DATA, WIRE).** Keep the existing `metadata_only`,
   `content_allowed`, and `content_redacted` literals. Runtime prompts and text
   events may contain authorized content; do not apply metadata-only rejection
   globally. Enforce metadata policy at handoff rendering, evidence saves,
   metadata-only persistence, diagnostics, and CLI/UI projection. Project by
   field allowlist, not by trusting an event's redaction label. Public transport
   stream/history labels must nevertheless match their payload before another
   transport release: raw text is `content_allowed`, actually sanitized content
   may be `content_redacted`, and `metadata_only` must omit raw content. WIRE
   proves this using an independently packed consumer, not consumer warnings.
   The shared pure scanner/content policy belongs in the existing
   `packages/core-contracts/src/redaction.ts`; identity-isolation and
   state-ledger consume it without reverse imports. A synthetic positive/negative
   corpus supports these boundaries but is not a universal secret detector.
   Operational `repoRoot`/worktree paths remain
   absolute where required; exported evidence paths are repo-relative or opaque
   refs with no user-home, credential-file, or URL-userinfo disclosure. This
   includes CLI health/profile/state/ledger paths, CLI envelopes, human output,
   and UI projection; any required export-version change must be frozen in DATA
   without silently changing operational path semantics. Projection
   must not rewrite the local deletion target or change external canon.

2. **Recovery before validation (DATA).** Reject complete schema-invalid or
   unsupported-version records with a bounded typed corruption error; preserve
   their bytes. Read paths never repair, truncate, or rewrite indexes. Writer
   recovery may repair only a demonstrably incomplete final write, retaining
   rejected bytes as restricted local recovery evidence, never exported payloads.
   First repair SL-5, then tighten CC-2/CC-3. Freeze migration/recovery policy for
   older shape-valid content violations before scanning persisted records; do
   not silently drop them. Allocate sequences from committed ledger/recovery
   state, including after retention, not a stale manifest alone. A live or
   uncertain lock holder blocks recovery; neither elapsed TTL nor PID absence
   alone authorizes deleting a replacement lock. Use durable event/projection
   ordering and interruption tests; benchmark only after correctness holds.
   Legacy identity-less locks are unsupported for automatic or manual
   break-lock under this roadmap: keep the state blocked, retain its bytes
   and report a bounded diagnostic. No new force-recovery authority is added.
   New-format acquisition must atomically publish initialized holder identity;
   a crash between lock creation and identity publication must not leave an
   unrecoverable lock at the contested path. DATA owns fault tests at each
   acquisition boundary. SL-6 reads do not acquire the writer lock: inspect a
   bounded stable snapshot, report an incomplete final tail as incomplete or
   writer-in-progress (not complete success or schema corruption), and never
   repair it. Complete invalid records still fail explicitly; concurrent append
   or replacement must not produce a mixed snapshot. The DATA plan freezes the
   exact snapshot and diagnostic API before implementation. A blocked legacy
   writer lock must not prevent nonmutating inspection of valid committed data.

3. **Lease authority (COORD).** `WorktreeLeaseManager` protects local Git paths,
   dirty work, and processes. The published Consiliency `LeaseStore` arbitrates
   fleet `soft`/`hard` scope ownership. These are distinct contracts. Inbox
   messages never mutate locks. Keep exported `CoordinationStore` until a caller
   inventory supports explicit deprecation/migration; do not assume no external
   consumer from an in-repo search. Supabase owns expiry time and atomic hard
   acquisition; local projections cannot grant fleet authority. Destructive
   cleanup requires independent holder evidence, managed-root/realpath and Git
   registration checks, plus live-process/dirty-state checks immediately before
   mutation. Missing-path reconciliation changes metadata only and must not
   delete another path. No new force-cleanup or publication-override capability.
   Proved-dead-holder recovery is metadata-only under CASE-WL-3 absence and
   registration checks; it grants neither filesystem deletion nor conflicting
   takeover. Existing paths without independent holder evidence stay blocked.
   COORD owns equivalent SL-2/SL-3 correctness for worktree-leasing's locks.ts
   and lease-manager.ts atomic writer under EC-COORD-3/4: initialized identity,
   blocked unprovable locks, replacement-safe recovery and DATA's supported
   sync ordering. It may adopt DATA's primitive or retain its own implementation,
   but must run the same fault/ownership cases; helper deduplication is optional,
   these semantics are not. The COORD plan freezes that implementation choice.
   Successful missing-path reconciliation records status released and releasedAt,
   removes the active-map entry and durably records the transition under WL-4.
   It clears this lease's registry collision only; future acquisition still
   passes all normal Git, path, holder and fleet checks. No Git worktree metadata
   pruning or deletion is performed; a stale Git registration can still block
   later acquisition and must be reported explicitly.

4. **Established identity and policy (COORD).** Before sending a turn, compare
   the persisted route target with the established session's provider, harness,
   and identity, not absent create-session fields in `SendTurnRequest`. Reject
   mismatches and unknown session identity before the provider call; record
   allowed fallback explicitly. Keep provider-family hard-stop and default
   same-provider account-switch restrictions. Dotfiles subscription switching
   is a separate initiative: live CHAR and credential-store-wide cohort/account
   attribution must be accepted before it can mutate an active session here.
   This roadmap introduces no credential switching, secret lookup, or new quota
   bypass policy; it need not wait for dotfiles CHAR to fix existing routing.

5. **Composition and supervision (INTEG).** Keep transport independently
   consumable. A repo-owned operator composition above the provider owns route
   admission, a metadata-only recorder, retry attempts/backoff, balanced turn
   accounting, lease renewals, and owned-process cleanup. Persist admission
   before launch and outcomes before completion is reported. Give one owner
   explicit start/stop and restart semantics; no background fleet daemon. Lost
   leases stop new admissions and follow existing fenced cancellation policy,
   not arbitrary process deletion. External consumers retain documented duties
   when using primitives directly. Do not fabricate approval events or promote
   intentionally dropped upstream operator events into authority. INTEG tests
   the actual operator/provider/ledger/CLI path, not fixture seeding alone.

6. **CI topology (GUARD).** Begin with one reusable full gate on GitHub-hosted
   Ubuntu for PRs, main pushes, and release verification: frozen install, build,
   lint, typecheck, root test suite, and packed-package smoke. Full mode runs
   once; focused/integration selectors cannot substitute for it. Use read-only
   permissions and no deploy secrets/OIDC in PR verification. Publication stays
   a separate release-authorized job. Untrusted PR code never reaches fleet
   hosts or protected credentials. The fleet's current
   [dagger-offload action](https://github.com/Consiliency/ci-actions/blob/main/dagger-offload/action.yml)
   uses hosted orchestration and explicit caller eligibility; ineligible calls
   skip all its steps. Therefore its success alone is not verification. This
   repo has no Dagger gate yet; GUARD may add offload later only with an approved
   trust predicate, pinned action, actual container gate and parity/failure
   proof. Ineligible runs must execute the full hosted gate, while eligible
   remote failure fails the gate. No other repo needs implementation first.
   The hosted full gate provisions a version-pinned disposable PostgreSQL
   service for the COORD integration probes. Missing service/setup is a gate
   failure, never a skipped-test success; no production database is contacted.
   GUARD creates the migration's anon, authenticated and service_role roles in
   that disposable database, applies the existing migration unmodified with
   SQL error-stop enabled, and verifies an installed coordination function as
   its connect-and-migrate positive control. Unreachable service or failed
   migration must fail the gate before COORD adds behavioral probes. COORD's
   plan separately freezes the Supabase RPC wrapper harness and positive/error
   cases for LeaseStore, channel and CLI-2. Direct SQL probes prove SQL only;
   mocked RPC mapping proves mapping only, never hosted Supabase acceptance.

7. **License and publication (PREP/SHIP).** `.github/CODEOWNERS` identifies
   `@ViperJuice` as maintainer and proposed license-decision owner; record their
   actual choice in omniagent-plus#20 before PREP exits. That issue is the sole
   HY-2 decision owner and stays open until the decision is recorded;
   omniagent-plus#27 consumes it for package implementation and verification.
   Do not infer MIT from
   the contract dependency or choose a license on their behalf. No version or
   registry mutation is required for TRIAGE. On 2026-09-09 the existing FABPUB
   partition was blocked under agent-harness#789; the 2026-09-10 execution
   receipt records generation-1 recovery, not first-publish acceptance.
   Recheck the live receipt before landing. The exact-candidate exception used
   to publish omniagent-plus#28 did not authorize new direct pushes or evidence
   repair. Local planning/review may proceed; landing requires supported
   recovery or a separately authorized, candidate-bound route.

### N/Q acceptance inventory

Each row names the implementation-phase test family to add or extend. R/C
findings retain their acceptance requirements in the main matrix. A phase plan
must bind each case to a real construction/read/mutation boundary and include
positive controls; merely checking a receipt or docs text cannot close it.

| Finding | Case family | Required observations / bounded disposition |
| --- | --- | --- |
| SL-7 | CASE-SL-7 | Replay repeated session updates by ledger order and return the latest state; exclude another session/task's routes. Keep chronological route history. Exercise both session replay and UI projection. |
| SL-8 | CASE-SL-8 | Inventory exports/callers; preserve missing-file initialization but fail wrong-version/structure reads closed. If retained, test cross-mode conflicts, non-exclusive overwrite prevention, expired active-list entries, and explicit renew/release behavior or documented unsupported operations. If removed, prove consumer migration and removal of the export. No local/fleet API merger. |
| SL-9 | CASE-SL-9 | Retention with active sessions, pending approvals, live leases, and cross-kind refs preserves needed history; expired terminal history can prune. Reopen and append without sequence reuse. |
| CC-3 | CASE-CC-3 | Nested metadata arrays/objects, coordination bodies, and redacted tool fields cannot smuggle prohibited content through owned persistence/projection paths; authorized prompt content remains usable. |
| CC-4 | CASE-CC-4 | DATA owns schema/type agreement for changed core symbols and preservation of current unknown-field behavior of public `buildHandoffPacket`/`HandoffPacketInput`, request/event/route/handoff schemas, persisted ledger/manifest/registry schemas and upstream wire inputs. Stricter field acceptance requires a reviewed versioned contract or migration; existing version, structure and content checks are not weakened. COORD owns CLI argv regression controls through CASE-CLI-4 in omniagent-plus#23; no DATA-owned CLI edit or blanket strictness rewrite. |
| CC-5 | CASE-CC-5 | Absolute operational roots continue to work; evidence/handoff and every CLI/UI projection hide home and credential locations, reject traversal, and preserve opaque refs. Exercise health profile/state/ledger/manifest/coordination paths in JSON and human output plus CLI envelopes and UI snapshots. Internal roots and cleanup targets remain unchanged. |
| CC-6 | CASE-CC-6 | Fake stream rejects an interior sequence gap and accepts contiguous windows; simultaneous/repeated close emits one terminal result. Drive lifecycle transitions where supported; document unmodeled states instead of claiming coverage. |
| CC-7 | CASE-CC-7 | DATA preserves current `sendTurnRequestSchema.message` string acceptance: empty, whitespace-only, normal and multibyte strings exceeding metadata-text limits parse; missing/non-string messages reject. A metadata excerpt limit is not a provider request limit, and no common request-size cap is established here, so a new minimum/maximum requires a separately reviewed versioned contract change. Schema acceptance is not provider admission. Separately test redacted-text byte boundaries, truncation/schema agreement and safe `messages` JSON lookalikes; retain fail-on-oversize redacted text unless versioned and defer unused convenience exports. |
| TR-6 | CASE-TR-6 | Mapping/drop table covers supported upstream event families, including unknown extensions. Diagnostics are bounded metadata; operator/approval drops remain intentional, with no neutral authority added. |
| TR-7 | CASE-TR-7 | Concurrent cold start/readiness shares one in-flight operation; failure permits a later retry. Missing exclusive lease or mutation fence still rejects cancel/close. Consumer timers belong to INTEG. |
| TR-8 | CASE-TR-8 | Public CLI transport operations turn malformed JSON, wrong result shapes, and nonzero exits into bounded typed failures without stderr/credential disclosure; valid output and successful exits still work. |
| TR-9 | CASE-TR-9 | Conflicting nested identity/status/type cannot override the wire envelope; bound body reads and normalize auth/parse errors. Cover direct stream-owner cleanup and fake-server rejection. Preserve mapper/normalizer edge fixtures before refactoring; static capabilities are not live proof. PREP owns fixture shipping. |
| CO-3 | CASE-CO-3 | Send through a session established under identity A using a route for B, or a different provider/harness: zero provider sends. Matching session succeeds; unknown session identity fails closed. |
| CO-5 | CASE-CO-5 | With an injected clock, parse integer and HTTP-date Retry-After, past dates, negative/junk/overflow values, and fallback text. Never schedule a negative, nonfinite, or unbounded delay. |
| CO-7 | CASE-CO-7 | Settlement across completion, cancellation, failure, retry, and duplicate terminal signals returns accounting to baseline exactly once. Preserve increment-only API semantics; add explicit settlement if needed. |
| CO-8 | CASE-CO-8 | Earlier decisions do not inherit later classifications. Corruption fails visibly, not via silent skipping. Cover empty pools, billing/status precedence, finite concurrency bounds, retry boundaries and confidence documentation; defer hysteresis until measured. PREP checks fixture packaging. |
| CLI-1 | CASE-CLI-1 | Default routing neither writes records nor acquires leases/sends inbox messages/launches providers. `--record` may arbitrate when scope is supplied; help and result describe those effects. No new launch command hidden behind record. |
| CLI-3 | CASE-CLI-3 | Preflight uses an explicitly injected environment and declared allowlist, reports keys/presence only, and never reads hidden credentials. Preserve and document its existing status write; read-only inventory stays nonmutating. |
| CLI-4 | CASE-CLI-4 | COORD's CLI lane owns unknown-option rejection at `packages/cli/src/args.ts:parseCliArgs`, including route-task, as an existing-behavior regression control referenced by CASE-CC-4; known options pass. Invalid provider/harness enum fails before routing; command/state-root parse errors identify known context safely. Health JSON/human results and outer envelopes follow CASE-CC-5 with no home/credential-path disclosure. Keep phase wire literals; version incompatible export changes. Label operator-supplied counts as estimates until INTEG supplies observed accounting. |
| WL-3 | CASE-WL-3 | Absent managed directory can reconcile stale metadata without deletion, after holder and Git registration checks; inaccessible or replaced paths remain blocked. Never treat permission errors as absence. Decision 3 defines the post-state: released/releasedAt, removed active-map entry, durable WL-4 transition and cleared registry collision. No Git metadata pruning; stale Git registration can still block later acquisition. |
| WL-5 | CASE-WL-5 | Expired live/uncertain holder still blocks. Proved-dead-holder recovery is metadata-only under CASE-WL-3 absence/registration checks; it grants no filesystem deletion or conflicting takeover. Existing paths without independent holder evidence stay blocked. Expiry alone authorizes neither recovery nor deletion. |
| WL-6 | CASE-WL-6 | Missing file initializes; malformed JSON, wrong schema, and malformed matching-schema structures fail closed. Existing corrupt bytes survive and no conflicting acquisition is granted. |
| WL-7 | CASE-WL-7 | Bound event retention without forgetting active leases; read-only query does not mutate. Reacquire follows published contract semantics. Keep EPERM/PID-reuse uncertainty blocked; compare staged/unstaged/untracked diff accounting. Child-process coverage is not deletion proof. |
| ID-2 | CASE-ID-2 | Exercise allowlisted benign PATH/GIT needs and dangerous inherited settings per profile, duplicate IDs, malformed profiles and diagnostics. Emit no matched secret sample or environment value. Preserve development-only host-env and isolation requirements. |
| HY-3 | CASE-HY-3 | Classify tracked outputs by ownership; remove only proven disposable outputs, keep audit/handoff/conformance evidence, and sanitize samples. `git check-ignore` must match a disposable log probe but not `plans/evidence/v2/TRIAGE.json` or retained conformance artifacts. |
| HY-4 | CASE-HY-4 | Isolated tarball consumer derives expected version from candidate manifest, finds required fixtures/declarations, and excludes test-only server code. Keep runtime tsx and declaration dependencies until independent consumer proof supports removal; no unowned conformance deletion. |
| HY-5 | CASE-HY-5 | Full tests retain meaningful defaults; a synthetic floating promise fails the selected type-aware rule while an awaited call passes, and an intentionally stalled process test exits nonzero within its bound without leaking a child. Measure before pool/project-reference/coverage-threshold changes; defer those without evidence, not claim absent defaults. |
| HY-6 | CASE-HY-6 | New/altered relative source edges fail; public imports pass. GUARD baselines only the existing `OmnigentProviderMode` type imports from `packages/identity-isolation/src/process-profile.ts`, `packages/identity-isolation/src/omnigent-isolation-policy.ts`, and `packages/identity-isolation/src/types.ts` to `../../omnigent-transport/src/types.js`, with positive/negative controls. PREP/omniagent-plus#27 fixes all three and removes the baseline; moving the fix earlier requires a separately reviewed ownership amendment. The third edge was omitted from the prior inventory and is explicitly corrected by the 2026-09-12 amendment, not silently exempted. No broad exemption or failed full gate. Keep equivalent boundary assertions, conformance and separate network monitoring. |

### Cross-cutting acceptance inventory

| Source section | Case family | Required observations / bounded disposition |
| --- | --- | --- |
| 3.1 | CASE-3.1 | Actual operator composition drives fake HTTP provider to durable session/turn/event records, then CLI replay after process restart; projection stays metadata-only and transport remains independently consumable. |
| 3.2 | CASE-3.2 | Inject clock/failures through the owner loop: bounded retries, expiry, renewal loss, process ownership and stop/restart cleanup. Assert no surviving timer or double settlement; document direct-consumer duties. |
| 3.3 | CASE-3.3 | DATA must share the scanner under decision 1/EC-DATA-1. Broader lock/JSONL/atomic-writer consolidation (DATA), RPC-wrapper consolidation (COORD), transport-helper consolidation (WIRE) and copied-enum consolidation (PREP) are explicitly deferred until caller inventory and measured complexity justify them; merging distinct failure/authority semantics is not an audit fix. Their owned correctness cases and PREP's ID-1 public-import repair remain mandatory. Retained helpers must pass those cases and conformance; no file-count-only refactor is an exit requirement. |
| 3.4 | CASE-3.4 | Composition wires explicit adapters without reversing dependency direction, importing harness runtime, or changing external canon/approval authority. Exercise the construction entrypoint, not just mocks of its components. |

### Current source and operational observations

Read-only inspection on 2026-09-09 confirms that `replaySession` still selects
the first session record and calls unscoped `replayRouteDecisions`, retention
protects only the newest records per kind, CLI preflight passes an empty host
environment, `parseRetryAfterValue` uses `parseInt`, and the CLI transport still
uses unguarded `JSON.parse`. These are source observations, not fresh behavioral
reproductions or performance measurements.

GitHub reports the repo public, no detected license, no repo runner registrations,
and no repository Actions secret names. This does not prove organization or
environment secrets are absent; no offload eligibility is inferred. The checkout
has only release verification and no Dagger gate. The plan-hub offload README is
historical adoption context; the current action interface controls any new
integration. No infrastructure, secrets, runtime code, or shared state changed
during this inspection. `plans/evidence/v2/TRIAGE.json` is the designated
reconciliation receipt; TRIAGE cannot close until it records actual acceptance.
The planning validator is the agent-harness-owned installed phase-loop CLI
entrypoint, not a repo-bundled tool or a required public-package CI dependency.
No finding issue may close on this document.
