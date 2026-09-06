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
| SL-2 | R / A | `withFilesystemLock` times out on an abandoned file. Recovery must prove ownership/liveness and avoid deleting a replacement lock; age alone is insufficient. | DATA |
| SL-3 | C / A | Ledger append and `schema.ts:writeJsonAtomic` lack sync calls. Specify supported crash/durability guarantees and directory-sync behavior; test fault ordering. | DATA |
| SL-4 | R / A | Restoring a pre-append manifest then reopening produces duplicate sequences. Recover monotonic allocation across crash, compaction, and concurrent writers. | DATA |
| SL-5 | R / A | A complete newline-terminated, schema-invalid tail is truncated. Separate incomplete syntax from invalid complete records; preserve rejected bytes and report corruption. Repair before content validation tightens. | DATA |
| SL-6 | C / B | `initialize` writes indexes/manifest for read commands. Add an explicit read path; verify file contents and timestamps remain unchanged. | DATA |
| SL-7 | N / B | Audit identifies first-versus-latest session selection and unscoped route replay. Prove with repeated sessions and unrelated tasks before changing ordering. | DATA |
| SL-8 | Q / B | `CoordinationStore` still exports a separate API and returns empty maps on schema mismatch. Inventory external consumers and migrate/deprecate explicitly; no blind deletion or lease-contract merger. | COORD |
| SL-9 | N / B | Retention is reported to orphan dependent records. Test active sessions/leases and document reference protection before optimizing. | DATA |
| SL-10 | C / A | `EvidenceStore.save` passes label/path through; artifact-ref validation returns early. Use the common content boundary and positive/negative path corpus. | DATA |
| SL-11 | C / A | SQL acquire/renew/query trusts request time; fast clients can change expiry. Use server-owned time and test skew against real local PostgreSQL. Pagination, acknowledgement semantics, and retention are separate B-priority acceptance items. | COORD |
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
| TR-1 | R / A | Text events are labeled `metadata_only`. DATA freezes content/posture policy; WIRE applies it to stream and history. Metadata projection must not acquire raw content. | WIRE |
| TR-2 | R / A | `/gateway/` is discarded by URL construction. Test root/prefixed bases, query, escaping, and trailing slashes through the client. | WIRE |
| TR-3 | C / A | HTTP fetch receives no abort signal from the client. Add bounded request/body-read deadlines and cancellation; retries require idempotency-aware policy, not automatic mutation replay. | WIRE |
| TR-4 | C / B | Provider and mapper maps retain session/turn state. Bound caches while preserving late acknowledgements, reconnect, cancellation quarantine, and successful idempotency semantics. | WIRE |
| TR-5 | C / B | Parser frame buffer has no cap and frame splitting omits bare CR. Use chunk-boundary/UTF-8/abort/oversize tests; retain valid stream semantics. | WIRE |
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
| WL-2 | C / A | CLI reads both token and expected token from the same registry. Require independent holder proof or a separately documented operator action with the same path/liveness checks. | COORD |
| WL-3 | N / B | Missing directories reportedly block cleanup forever. Add a non-deleting metadata-reconciliation path with explicit absence proof. | COORD |
| WL-4 | C / A | Release omits a ledger transition; multiple files can diverge. DATA freezes event/replay recovery; COORD implements crash-consistent acquire/renew/release projection. | COORD |
| WL-5 | Q / B | An expired lease need not prove a live writer has stopped. Reconcile collisions with holder liveness and recovery policy; do not authorize cleanup solely from TTL. | COORD |
| WL-6 | Q / A | Malformed JSON already throws (reproduced). Wrong schema can yield empty state, and valid-schema structure is insufficiently checked. Test those exact paths; retain missing-file initialization. | COORD |
| WL-7 | Q / B | Split log growth, read locks, reacquire semantics, PID reuse, and diff accounting. A reused PID blocking deletion is safe uncertainty; child-process coverage percentages alone are not failures. | COORD |

## Identity and distribution

| ID | Status / priority | Current evidence and disposition | Phase |
| --- | --- | --- | --- |
| ID-1 | C / B | Relative imports cross into transport source. Use a supported public type export and independent package resolution; keep identity dependency direction intact. | PREP |
| ID-2 | Q / B | Allowlist already exists. Validate dangerous inherited settings in context; do not globally prohibit required PATH/GIT configuration. Remove secret-value samples from diagnostics. Profile validation tests own duplicates/malformed input. | DATA |
| HY-1 | C / A | Only release/dispatch CI exists; lint/typecheck are absent there. Share one full gate between PR and publication, including real failure propagation. Reconcile fleet offload conventions before selecting expensive runner topology. | GUARD |
| HY-2 | C / A | License metadata/file absent; two repository URLs are historical. No license is inferred from dependencies. Record a maintainer choice and update affected distributions before shipping; missing optional metadata alone is not a P0. | PREP |
| HY-3 | Q / C | Separate disposable logs from retained handoffs, plans, and conformance evidence. Sanitize deliberate sample paths as needed; never blanket-delete governance history. | PREP |
| HY-4 | Q / B | `0.6.0` expectation is S (now `0.7.0`); hardcoding remains. Keep `tsx` for source CLI and declaration dependencies until isolated consumer checks prove a replacement. Do not delete canonical conformance copies without ownership analysis. | PREP |
| HY-5 | Q / C | Audit covers explicit config gaps, not absence of Vitest defaults. Add risk-driven coverage/timeouts and targeted type-aware rules; measure before changing pools/build architecture. | GUARD |
| HY-6 | Q / C | Some source/doc checks enforce real boundaries. Replace only with equivalent assertions and keep conformance; dependency rules must catch relative escapes. | GUARD |

## Cross-cutting ownership

| Source section | Disposition | Required outcome | Phase |
| --- | --- | --- | --- |
| 3.1 | C / A for claimed end-to-end behavior | Explicit recorder above the provider, durable session/turn/event path, metadata-only CLI replay after restart, failure/idempotency recovery. Existing transport remains independently consumable. | INTEG |
| 3.2 | Q / B | Identify timer/counter owner and consumer obligations; an injected primitive is legitimate, an unimplemented claim is not. Either implement the scoped consumer loop or document unsupported behavior with tests. | INTEG |
| 3.3 | Q / B | Consolidate proven duplicate mechanics after caller inventory; retain distinct public lease semantics and sole store authority. No broad rewrite solely to reduce file count. | DATA, COORD, PREP |
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
